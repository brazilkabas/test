import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { localSyncDecision, normalizeGithubRemote } from "../src/lib/ai-code-git";

type AgentConfig = {
  agentId: string;
  repositoryPath: string;
  expectedRemote: string;
  apiBaseUrl: string;
  agentToken?: string;
};

function configPath() {
  return join(homedir(), ".company-control", "ai-code-agent.json");
}

function loadConfig(): AgentConfig {
  return JSON.parse(readFileSync(configPath(), "utf8")) as AgentConfig;
}

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function normalizeRemote(value: string) {
  return normalizeGithubRemote(value);
}

async function main() {
  const command = process.argv[2];
  if (command === "init") {
    mkdirSync(join(homedir(), ".company-control"), { recursive: true });
    writeFileSync(configPath(), JSON.stringify({
      agentId: process.argv[3] ?? "local-1",
      repositoryPath: process.argv[4] ?? process.cwd(),
      expectedRemote: process.argv[5] ?? "",
      apiBaseUrl: process.argv[6] ?? "http://localhost:3000/api/v1",
      agentToken: process.argv[7] ?? "",
    }, null, 2));
    console.log(`Stored local repository path only at ${configPath()}`);
    return;
  }
  const config = loadConfig();
  const remote = git(config.repositoryPath, ["remote", "get-url", "origin"]);
  const localHead = git(config.repositoryPath, ["rev-parse", "HEAD"]);
  const dirty = Boolean(git(config.repositoryPath, ["status", "--porcelain"]));
  const response = await fetch(`${config.apiBaseUrl}/ai-code/agents/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.agentToken ? { "X-AI-Code-Agent-Token": config.agentToken } : {}),
    },
    body: JSON.stringify({
      agentId: config.agentId,
      agentToken: config.agentToken,
      localHead,
      dirty,
      remote,
    }),
  });
  const result = await response.json() as {
    githubCommit?: string;
    githubBranch?: string | null;
    pullRequestUrl?: string | null;
    localSynchronization?: ReturnType<typeof localSyncDecision>;
    status?: string;
    error?: string;
  };
  if (!response.ok) {
    console.log(JSON.stringify({ status: "error", message: result.error ?? "Local sync request failed" }, null, 2));
    process.exit(1);
  }
  if (result.localSynchronization?.status === "local_sync_blocked" || result.status === "local_sync_blocked") {
    const blocked = result.localSynchronization ?? {
      status: "local_sync_blocked",
      reason: "local_changes_detected",
      githubCommit: result.githubCommit,
      localHead,
      message: "Commit, stash or discard the local changes manually before syncing.",
    };
    console.log(JSON.stringify(blocked, null, 2));
    process.exit(2);
  }
  if (!result.githubCommit) throw new Error("No approved GitHub commit was returned");
  const decision = localSyncDecision({
    githubCommit: result.githubCommit,
    localHead,
    dirty,
    expectedRemote: normalizeRemote(config.expectedRemote || remote),
    actualRemote: normalizeRemote(remote),
  });
  if (decision.status === "local_sync_blocked") {
    console.log(JSON.stringify(decision, null, 2));
    process.exit(2);
  }
  if (decision.status === "synced") {
    console.log(JSON.stringify({
      githubBranch: result.githubBranch,
      pullRequestUrl: result.pullRequestUrl,
      githubCommit: result.githubCommit,
      localSynchronization: { status: "synced", githubCommit: localHead, localHead },
    }, null, 2));
    return;
  }
  git(config.repositoryPath, ["fetch", "--prune", "origin"]);
  git(config.repositoryPath, ["merge", "--ff-only", result.githubCommit]);
  const head = git(config.repositoryPath, ["rev-parse", "HEAD"]);
  if (head !== result.githubCommit) throw new Error("Local HEAD does not equal the approved GitHub commit");
  console.log(JSON.stringify({
    githubBranch: result.githubBranch,
    pullRequestUrl: result.pullRequestUrl,
    githubCommit: head,
    localSynchronization: { status: "synced", githubCommit: head, localHead: head },
  }, null, 2));
}

void main();
