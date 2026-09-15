import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const SAFE_GIT_FLAGS = {
  fetch: ["fetch", "--prune", "origin"],
  fastForwardMerge: (commit: string) => ["merge", "--ff-only", commit],
  applyCheck: ["apply", "--check", "--recount"],
  apply: ["apply", "--recount", "--whitespace=nowarn"],
  statusPorcelain: ["status", "--porcelain"],
  revParseHead: ["rev-parse", "HEAD"],
} as const;

export function assertSafeGitArgs(args: string[]) {
  const joined = args.join(" ");
  if (/\s--force\b|\s-f\b|reset\s+--hard|clean\s+-fd/.test(` ${joined}`)) {
    throw new Error("Refusing a destructive Git command");
  }
}

export type LocalSyncInput = {
  githubCommit: string;
  localHead: string;
  dirty: boolean;
  expectedRemote: string;
  actualRemote: string;
};

export function normalizeGithubRemote(value: string) {
  return value.replace(/^https?:\/\//, "").replace(/\.git$/, "").replace(/^git@/, "").replace(":", "/");
}

export function localSyncDecision(input: LocalSyncInput) {
  if (input.expectedRemote !== input.actualRemote) {
    return {
      status: "local_sync_blocked" as const,
      reason: "repository_mismatch",
      githubCommit: input.githubCommit,
      localHead: input.localHead,
      message: "The local agent is not connected to the configured GitHub repository.",
    };
  }
  if (input.dirty) {
    return {
      status: "local_sync_blocked" as const,
      reason: "local_changes_detected",
      githubCommit: input.githubCommit,
      localHead: input.localHead,
      message: "Commit, stash or discard the local changes manually before syncing.",
    };
  }
  if (input.localHead === input.githubCommit) {
    return {
      status: "synced" as const,
      githubCommit: input.githubCommit,
      localHead: input.localHead,
    };
  }
  return {
    status: "ready" as const,
    commands: [
      SAFE_GIT_FLAGS.fetch,
      SAFE_GIT_FLAGS.fastForwardMerge(input.githubCommit),
      SAFE_GIT_FLAGS.revParseHead,
    ],
  };
}

export function parseShellCommand(command: string) {
  const env: Record<string, string> = {};
  const parts = command.split(" ").filter(Boolean);
  while (parts[0]?.includes("=")) {
    const [key, value] = parts.shift()!.split("=");
    env[key] = value;
  }
  return { bin: parts[0] ?? "true", args: parts.slice(1), env };
}

export async function runGit(cwd: string, args: string[], env: Record<string, string | undefined> = {}) {
  assertSafeGitArgs(args);
  return runCommand("git", args, cwd, env);
}

export async function runCommand(command: string, args: string[], cwd: string, env: Record<string, string | undefined> = {}) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export async function createIsolatedWorktree(options: {
  jobId: string;
  cloneUrl: string;
  baseSha: string;
  branch: string;
  baseBranch?: string;
}) {
  const root = await mkdtemp(join(tmpdir(), "ai-code-"));
  const worktree = join(root, options.jobId);
  await mkdir(worktree, { recursive: true });
  const clone = await runGit(root, options.baseBranch
    ? ["clone", "--depth=1", "--branch", options.baseBranch, options.cloneUrl, worktree]
    : ["clone", "--no-checkout", options.cloneUrl, worktree]);
  if (clone.code !== 0) {
    await rm(root, { recursive: true, force: true });
    throw new Error(clone.stderr || "Unable to clone the GitHub repository");
  }
  const head = options.baseBranch
    ? await runGit(worktree, [...SAFE_GIT_FLAGS.revParseHead])
    : { code: 1, stdout: "", stderr: "" };
  if (head.stdout.trim() !== options.baseSha) {
    const fetch = await runGit(worktree, ["fetch", "--depth=1", "origin", options.baseSha]);
    if (fetch.code !== 0) {
      await rm(root, { recursive: true, force: true });
      throw new Error(fetch.stderr || "Unable to fetch the recorded GitHub base commit");
    }
    const checkout = await runGit(worktree, ["checkout", "--detach", options.baseSha]);
    if (checkout.code !== 0) {
      await rm(root, { recursive: true, force: true });
      throw new Error(checkout.stderr || "Unable to check out the recorded GitHub base commit");
    }
  }
  const branch = await runGit(worktree, ["switch", "-c", options.branch]);
  if (branch.code !== 0) {
    await rm(root, { recursive: true, force: true });
    throw new Error(branch.stderr || "Unable to create the isolated AI branch");
  }
  return { root, worktree };
}

export async function applyUnifiedDiff(worktree: string, diff: string) {
  const patchFile = join(worktree, ".ai-code.patch");
  await writeFile(patchFile, diff.endsWith("\n") ? diff : `${diff}\n`);
  const check = await runGit(worktree, [...SAFE_GIT_FLAGS.applyCheck, patchFile]);
  if (check.code !== 0) {
    await rm(patchFile, { force: true });
    throw new Error(check.stderr || "The generated patch does not apply to the recorded GitHub commit");
  }
  const apply = await runGit(worktree, [...SAFE_GIT_FLAGS.apply, patchFile]);
  await rm(patchFile, { force: true });
  if (apply.code !== 0) throw new Error(apply.stderr || "The generated patch could not be applied");
}

export async function commitWorktree(worktree: string, message: string) {
  await runGit(worktree, ["add", "-A"]);
  const commit = await runGit(worktree, ["-c", "user.name=Company Control AI", "-c", "user.email=ai-code@localhost", "commit", "-m", message]);
  if (commit.code !== 0) throw new Error(commit.stderr || "Unable to create the AI change commit");
  const head = await runGit(worktree, SAFE_GIT_FLAGS.revParseHead as unknown as string[]);
  return head.stdout.trim();
}

export async function pushBranch(worktree: string, branch: string) {
  const push = await runGit(worktree, ["push", "-u", "origin", `HEAD:refs/heads/${branch}`]);
  if (push.code !== 0) throw new Error(push.stderr || "Unable to push the AI change branch");
}

export async function installWorkspaceDependencies(worktree: string) {
  const hasPackage = await access(join(worktree, "package.json")).then(() => true).catch(() => false);
  if (!hasPackage) return;
  const hasLock = await access(join(worktree, "package-lock.json")).then(() => true).catch(() => false);
  const result = await runCommand("npm", hasLock ? ["ci"] : ["install"], worktree);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Dependency installation failed");
}
