import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { db } from "@/lib/db";
import { decrypt, encrypt, sha256 } from "@/lib/crypto";
import {
  applyUnifiedDiff,
  commitWorktree,
  createIsolatedWorktree,
  installWorkspaceDependencies,
  parseShellCommand,
  pushBranch,
  runCommand,
  runGit,
} from "@/lib/ai-code-git";
import {
  githubAccessToken,
  githubBaseCommit,
  githubCloneUrl,
  githubCreatePullRequest,
  githubFastForwardBranch,
  githubMergePullRequest,
  githubTestConnection,
} from "@/lib/ai-code-github";
import { generateAiCodePlan, testAiProvider } from "@/lib/ai-code-provider";
import { aiChangeBranchName, isDisallowedAiInstruction, parseModelPlan } from "@/lib/ai-code-policy";

const API_KEY_CONTEXT = "ai-code:api-key";
const GITHUB_KEY_CONTEXT = "ai-code:github-app-key";
const GITHUB_TOKEN_CONTEXT = "ai-code:github-token";

export const DEFAULT_AI_TESTS = [
  "npm run lint",
  "npm run typecheck",
  "npm test",
  "NODE_ENV=production npm run build",
];

export async function getAiCodeSettingsRecord() {
  return db.aiCodeSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

export async function publicAiCodeSettings() {
  const settings = await getAiCodeSettingsRecord();
  return {
    providerBaseUrl: settings.providerBaseUrl,
    modelName: settings.modelName,
    apiKey: settings.apiKeyLastFour ? `Configured · …${settings.apiKeyLastFour}` : "Not configured",
    githubOwner: settings.githubOwner,
    githubRepository: settings.githubRepository,
    baseBranch: settings.baseBranch,
    githubAppId: settings.githubAppId,
    githubInstallationId: settings.githubInstallationId,
    githubAppPrivateKey: settings.encryptedGithubAppPrivateKey ? "Configured" : "Not configured",
    githubToken: settings.encryptedGithubToken ? "Configured" : "Not configured",
    localAgentId: settings.localAgentId,
    localAgentCallbackUrl: settings.localAgentCallbackUrl,
    localAgentToken: settings.localAgentTokenLastFour ? `Configured · …${settings.localAgentTokenLastFour}` : "Not configured",
    createPullRequestAutomatically: settings.createPullRequestAutomatically,
    deployAfterMerge: settings.deployAfterMerge,
    lastProviderTestStatus: settings.lastProviderTestStatus,
    lastGithubTestStatus: settings.lastGithubTestStatus,
  };
}

export async function saveAiCodeSettings(input: {
  providerBaseUrl?: string;
  modelName?: string;
  apiKey?: string;
  githubOwner?: string;
  githubRepository?: string;
  baseBranch?: string;
  githubAppId?: string;
  githubInstallationId?: string;
  githubAppPrivateKey?: string;
  githubToken?: string;
  localAgentId?: string;
  localAgentCallbackUrl?: string;
  generateLocalAgentToken?: boolean;
  createPullRequestAutomatically?: boolean;
  deployAfterMerge?: boolean;
}) {
  const current = await getAiCodeSettingsRecord();
  const generatedAgentToken = input.generateLocalAgentToken ? randomBytes(24).toString("base64url") : undefined;
  await db.aiCodeSettings.update({
    where: { id: "default" },
    data: {
      providerBaseUrl: input.providerBaseUrl ?? current.providerBaseUrl,
      modelName: input.modelName ?? current.modelName,
      githubOwner: input.githubOwner ?? current.githubOwner,
      githubRepository: input.githubRepository ?? current.githubRepository,
      baseBranch: input.baseBranch ?? current.baseBranch,
      githubAppId: input.githubAppId ?? current.githubAppId,
      githubInstallationId: input.githubInstallationId ?? current.githubInstallationId,
      localAgentId: input.localAgentId ?? current.localAgentId,
      localAgentCallbackUrl: input.localAgentCallbackUrl ?? current.localAgentCallbackUrl,
      createPullRequestAutomatically: input.createPullRequestAutomatically ?? current.createPullRequestAutomatically,
      deployAfterMerge: input.deployAfterMerge ?? current.deployAfterMerge,
      ...(input.apiKey ? {
        encryptedApiKey: encrypt(input.apiKey, API_KEY_CONTEXT),
        apiKeyLastFour: input.apiKey.slice(-4),
      } : {}),
      ...(input.githubAppPrivateKey ? {
        encryptedGithubAppPrivateKey: encrypt(input.githubAppPrivateKey, GITHUB_KEY_CONTEXT),
      } : {}),
      ...(input.githubToken ? {
        encryptedGithubToken: encrypt(input.githubToken, GITHUB_TOKEN_CONTEXT),
      } : {}),
      ...(generatedAgentToken ? {
        encryptedLocalAgentToken: encrypt(generatedAgentToken, "ai-code:local-agent-token"),
        localAgentTokenLastFour: generatedAgentToken.slice(-4),
      } : {}),
    },
  });
  return {
    ...await publicAiCodeSettings(),
    localAgentTokenOnce: generatedAgentToken ?? null,
  };
}

async function resolvedGithub() {
  const settings = await getAiCodeSettingsRecord();
  if (!settings.githubOwner || !settings.githubRepository) {
    throw new Error("Configure the GitHub owner and repository first");
  }
  return {
    owner: settings.githubOwner,
    repository: settings.githubRepository,
    baseBranch: settings.baseBranch,
    appId: settings.githubAppId,
    installationId: settings.githubInstallationId,
    appPrivateKey: settings.encryptedGithubAppPrivateKey
      ? decrypt(settings.encryptedGithubAppPrivateKey, GITHUB_KEY_CONTEXT)
      : null,
    token: settings.encryptedGithubToken
      ? decrypt(settings.encryptedGithubToken, GITHUB_TOKEN_CONTEXT)
      : null,
    createPullRequestAutomatically: settings.createPullRequestAutomatically,
    deployAfterMerge: settings.deployAfterMerge,
    localAgentId: settings.localAgentId,
    localAgentCallbackUrl: settings.localAgentCallbackUrl,
    providerBaseUrl: settings.providerBaseUrl,
    modelName: settings.modelName,
    apiKey: settings.encryptedApiKey ? decrypt(settings.encryptedApiKey, API_KEY_CONTEXT) : null,
  };
}

export async function testSavedAiProvider() {
  const settings = await resolvedGithub().catch(async () => {
    const record = await getAiCodeSettingsRecord();
    return {
      providerBaseUrl: record.providerBaseUrl,
      modelName: record.modelName,
      apiKey: record.encryptedApiKey ? decrypt(record.encryptedApiKey, API_KEY_CONTEXT) : null,
    };
  });
  if (!settings.apiKey) throw new Error("Save an AI API key first");
  const result = await testAiProvider(settings.providerBaseUrl, settings.apiKey, settings.modelName);
  await db.aiCodeSettings.update({
    where: { id: "default" },
    data: { lastProviderTestAt: new Date(), lastProviderTestStatus: result.ok ? "SUCCESS" : "FAIL" },
  });
  return result;
}

export async function testSavedGithub() {
  try {
    const settings = await resolvedGithub();
    const result = await githubTestConnection(settings);
    await db.aiCodeSettings.update({
      where: { id: "default" },
      data: { lastGithubTestAt: new Date(), lastGithubTestStatus: "SUCCESS" },
    });
    return result;
  } catch (error) {
    await db.aiCodeSettings.update({
      where: { id: "default" },
      data: { lastGithubTestAt: new Date(), lastGithubTestStatus: "FAIL" },
    });
    throw error;
  }
}

async function indexWorktree(worktree: string) {
  const listed = await runGit(worktree, ["ls-files"]);
  const files = listed.stdout.split("\n").map((path) => path.trim()).filter(Boolean)
    .filter((path) => !path.startsWith("src/generated/") && !path.endsWith(".lock") && path !== "prisma/dev.db");
  const excerpts = [];
  for (const path of files.slice(0, 80)) {
    if (!/\.(ts|tsx|js|css|md|sql|json)$/.test(path)) continue;
    const content = await readFile(join(worktree, path), "utf8").catch(() => "");
    excerpts.push({ path, excerpt: content.slice(0, 4000) });
    if (excerpts.length >= 24) break;
  }
  return { files, excerpts };
}

export async function createAiCodePlan(actorId: string, instruction: string, deployAfterTests = false) {
  if (isDisallowedAiInstruction(instruction)) {
    throw new Error("That request is not allowed. Describe an application code change instead.");
  }
  const settings = await resolvedGithub();
  if (!settings.apiKey) throw new Error("Save an AI API key first");
  const job = await db.aiCodeJob.create({
    data: {
      instruction,
      mode: "plan",
      status: "INSPECTING_REPOSITORY",
      createdById: actorId,
      deployAfterTests,
      tests: DEFAULT_AI_TESTS,
    },
  });
  let workspace: { root: string; worktree: string } | undefined;
  try {
    const token = await githubAccessToken(settings);
    const baseSha = await githubBaseCommit(settings, token);
    await db.aiCodeJob.update({
      where: { id: job.id },
      data: { githubBaseSha: baseSha, githubBranch: aiChangeBranchName(job.id), status: "GENERATING_CHANGES" },
    });
    workspace = await createIsolatedWorktree({
      jobId: job.id,
      cloneUrl: githubCloneUrl(settings, token),
      baseSha,
      branch: aiChangeBranchName(job.id),
      baseBranch: settings.baseBranch,
    });
    const index = await indexWorktree(workspace.worktree);
    const raw = await generateAiCodePlan({
      baseUrl: settings.providerBaseUrl,
      apiKey: settings.apiKey,
      model: settings.modelName,
      instruction,
      baseSha,
      files: index.excerpts,
    });
    const plan = parseModelPlan(raw);
    const updated = await db.aiCodeJob.update({
      where: { id: job.id },
      data: {
        status: "AWAITING_APPROVAL",
        explanation: plan.explanation,
        selectedFiles: plan.selectedFiles.length ? plan.selectedFiles : index.files.slice(0, 12),
        unifiedDiff: plan.unifiedDiff,
        warnings: plan.warnings,
        tests: plan.tests.length ? plan.tests : DEFAULT_AI_TESTS,
      },
    });
    return publicJob(updated);
  } catch (error) {
    await db.aiCodeJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: error instanceof Error ? error.message : "Planning failed" },
    });
    throw error;
  } finally {
    if (workspace) await rm(workspace.root, { recursive: true, force: true });
  }
}

export async function approveAiCodeJob(jobId: string) {
  const job = await db.aiCodeJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status !== "AWAITING_APPROVAL" && job.status !== "STALE") {
    throw new Error("This job is not waiting for approval");
  }
  if (!job.unifiedDiff || !job.githubBaseSha) throw new Error("The job does not contain a valid patch");
  const settings = await resolvedGithub();
  const token = await githubAccessToken(settings);
  const currentBase = await githubBaseCommit(settings, token);
  if (currentBase !== job.githubBaseSha) {
    await db.aiCodeJob.update({
      where: { id: job.id },
      data: { status: "STALE", error: "The GitHub base branch moved. Regenerate the plan from the new commit." },
    });
    throw new Error("The GitHub base branch changed. Regenerate the plan.");
  }
  await db.aiCodeJob.update({ where: { id: job.id }, data: { status: "APPLYING_PATCH" } });
  const workspace = await createIsolatedWorktree({
    jobId: job.id,
    cloneUrl: githubCloneUrl(settings, token),
    baseSha: job.githubBaseSha,
    branch: job.githubBranch ?? aiChangeBranchName(job.id),
    baseBranch: settings.baseBranch,
  });
  try {
    await applyUnifiedDiff(workspace.worktree, job.unifiedDiff);
    await db.aiCodeJob.update({ where: { id: job.id }, data: { status: "RUNNING_TESTS" } });
    await installWorkspaceDependencies(workspace.worktree);
    for (const command of job.tests.length ? job.tests : DEFAULT_AI_TESTS) {
      const parsed = parseShellCommand(command);
      const result = await runCommand(parsed.bin, parsed.args, workspace.worktree, parsed.env);
      if (result.code !== 0) throw new Error(result.stderr || result.stdout || `${command} failed`);
    }
    await db.aiCodeJob.update({ where: { id: job.id }, data: { status: "PUSHING" } });
    const commitSha = await commitWorktree(workspace.worktree, job.instruction.slice(0, 72));
    const branch = job.githubBranch ?? aiChangeBranchName(job.id);
    await pushBranch(workspace.worktree, branch);
    let pullRequestUrl = job.pullRequestUrl;
    let pullRequestNumber = job.pullRequestNumber;
    if (settings.createPullRequestAutomatically) {
      const pull = await githubCreatePullRequest(settings, token, {
        title: job.instruction.slice(0, 72),
        body: job.explanation ?? job.instruction,
        head: branch,
      });
      pullRequestUrl = pull.html_url;
      pullRequestNumber = pull.number;
    }
    await db.aiCodeRevision.create({ data: { jobId: job.id, commitSha, diff: job.unifiedDiff } });
    const updated = await db.aiCodeJob.update({
      where: { id: job.id },
      data: {
        status: "READY",
        githubCommitSha: commitSha,
        previousCommitSha: job.githubBaseSha,
        githubBranch: branch,
        pullRequestUrl,
        pullRequestNumber,
        error: null,
      },
    });
    return publicJob(updated);
  } catch (error) {
    await db.aiCodeJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: error instanceof Error ? error.message : "Apply failed" },
    });
    throw error;
  } finally {
    await rm(workspace.root, { recursive: true, force: true });
  }
}

export async function mergeAiCodeJob(jobId: string) {
  const job = await db.aiCodeJob.findUniqueOrThrow({ where: { id: jobId } });
  if (!job.githubCommitSha) throw new Error("Approve and push the change before merging");
  if (job.status !== "READY" && job.status !== "LOCAL_SYNC_BLOCKED") {
    throw new Error("This job is not ready to merge into the GitHub base branch");
  }
  const settings = await resolvedGithub();
  const token = await githubAccessToken(settings);
  const branch = job.githubBranch ?? aiChangeBranchName(job.id);
  let pullRequestUrl = job.pullRequestUrl;
  let pullRequestNumber = job.pullRequestNumber;
  let mergedSha = job.githubCommitSha;
  try {
    mergedSha = await githubFastForwardBranch(settings, token, settings.baseBranch, job.githubCommitSha);
  } catch {
    if (!pullRequestNumber) {
      const pull = await githubCreatePullRequest(settings, token, {
        title: job.instruction.slice(0, 72),
        body: job.explanation ?? job.instruction,
        head: branch,
      });
      pullRequestUrl = pull.html_url;
      pullRequestNumber = pull.number;
    }
    const merged = await githubMergePullRequest(settings, token, pullRequestNumber, job.githubCommitSha);
    mergedSha = merged.sha;
  }
  const localSyncStatus = await notifyLocalAgent({
    jobId: job.id,
    githubCommit: mergedSha,
    githubBranch: branch,
    pullRequestUrl,
  });
  await db.aiCodeJob.update({
    where: { id: job.id },
    data: {
      status: localSyncStatus.status === "local_sync_blocked" ? "LOCAL_SYNC_BLOCKED" : "MERGED",
      githubCommitSha: mergedSha,
      githubBranch: branch,
      pullRequestUrl,
      pullRequestNumber,
      localSyncStatus,
      error: null,
    },
  });
  return {
    githubBranch: branch,
    pullRequestUrl,
    githubCommit: mergedSha,
    localSynchronization: localSyncStatus,
    status: localSyncStatus.status,
    deployAfterMerge: settings.deployAfterMerge,
  };
}

export async function createPullRequestForJob(jobId: string) {
  const job = await db.aiCodeJob.findUniqueOrThrow({ where: { id: jobId } });
  if (!job.githubCommitSha) throw new Error("Approve the change before opening a pull request");
  if (job.pullRequestNumber && job.pullRequestUrl) {
    return publicJob(job);
  }
  const settings = await resolvedGithub();
  const token = await githubAccessToken(settings);
  const branch = job.githubBranch ?? aiChangeBranchName(job.id);
  const pull = await githubCreatePullRequest(settings, token, {
    title: job.instruction.slice(0, 72),
    body: job.explanation ?? job.instruction,
    head: branch,
  });
  const updated = await db.aiCodeJob.update({
    where: { id: job.id },
    data: { pullRequestUrl: pull.html_url, pullRequestNumber: pull.number, githubBranch: branch },
  });
  return publicJob(updated);
}

async function notifyLocalAgent(payload: {
  jobId: string;
  githubCommit: string;
  githubBranch: string;
  pullRequestUrl: string | null;
}) {
  const settings = await getAiCodeSettingsRecord();
  const body = {
    jobId: payload.jobId,
    agentId: settings.localAgentId,
    githubCommit: payload.githubCommit,
    githubBranch: payload.githubBranch,
    pullRequestUrl: payload.pullRequestUrl,
    repository: settings.githubOwner && settings.githubRepository
      ? `${settings.githubOwner}/${settings.githubRepository}`
      : null,
  };
  if (!settings.localAgentCallbackUrl) {
    return {
      status: "queued",
      message: "No local agent callback is registered. The agent can poll for this commit.",
      ...body,
    };
  }
  const response = await fetch(settings.localAgentCallbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (typeof result.status === "string") return result;
  return { status: response.ok ? "notified" : "notify_failed", ...body };
}

export function publicJob(job: {
  id: string;
  instruction: string;
  mode: string;
  status: string;
  explanation: string | null;
  selectedFiles: string[];
  unifiedDiff: string | null;
  warnings: string[];
  tests: string[];
  githubBaseSha: string | null;
  githubBranch: string | null;
  githubCommitSha: string | null;
  pullRequestUrl: string | null;
  localSyncStatus: unknown;
  error: string | null;
  deployAfterTests: boolean;
  createdAt: Date;
}) {
  return {
    id: job.id,
    instruction: job.instruction,
    mode: job.mode,
    status: job.status,
    explanation: job.explanation,
    files: job.selectedFiles,
    unifiedDiff: job.unifiedDiff,
    warnings: job.warnings,
    tests: job.tests,
    githubBaseSha: job.githubBaseSha,
    githubBranch: job.githubBranch,
    githubCommitSha: job.githubCommitSha,
    pullRequestUrl: job.pullRequestUrl,
    localSyncStatus: job.localSyncStatus,
    error: job.error,
    deployAfterTests: job.deployAfterTests,
    createdAt: job.createdAt,
  };
}

export async function restoreAiCodeJob(jobId: string) {
  const job = await db.aiCodeJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { revisions: { orderBy: { createdAt: "desc" }, take: 2 } },
  });
  const previous = job.revisions[1] ?? job.revisions[0];
  if (!previous) throw new Error("No previous revision is stored for this job");
  await db.aiCodeJob.update({
    where: { id: job.id },
    data: {
      status: "AWAITING_APPROVAL",
      unifiedDiff: previous.diff,
      warnings: ["Restored the previous stored revision. Approval will recreate it on a new branch from the current GitHub base."],
      error: null,
    },
  });
  return publicJob(await db.aiCodeJob.findUniqueOrThrow({ where: { id: job.id } }));
}

export async function listAiCodeJobs() {
  const jobs = await db.aiCodeJob.findMany({ orderBy: { createdAt: "desc" }, take: 40 });
  return jobs.map(publicJob);
}

export async function getAiCodeJob(jobId: string) {
  return publicJob(await db.aiCodeJob.findUniqueOrThrow({ where: { id: jobId } }));
}

export async function rejectAiCodeJob(jobId: string) {
  const job = await db.aiCodeJob.update({
    where: { id: jobId },
    data: { status: "REJECTED" },
  });
  return publicJob(job);
}

export async function regenerateAiCodeJob(jobId: string, actorId: string) {
  const job = await db.aiCodeJob.findUniqueOrThrow({ where: { id: jobId } });
  return createAiCodePlan(actorId, job.instruction, job.deployAfterTests);
}

export async function reportLocalAgentSync(input: {
  agentId: string;
  agentToken?: string;
  localHead: string;
  dirty: boolean;
  remote: string;
  jobId?: string;
  githubCommit?: string;
}) {
  const settings = await getAiCodeSettingsRecord();
  if (settings.localAgentId && settings.localAgentId !== input.agentId) {
    throw new Error("This local agent is not registered");
  }
  if (settings.encryptedLocalAgentToken) {
    const expected = decrypt(settings.encryptedLocalAgentToken, "ai-code:local-agent-token");
    const left = Buffer.from(sha256(expected));
    const right = Buffer.from(sha256(input.agentToken ?? ""));
    if (!input.agentToken || left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new Error("Invalid local agent token");
    }
  }
  const job = input.jobId
    ? await db.aiCodeJob.findUniqueOrThrow({ where: { id: input.jobId } })
    : await db.aiCodeJob.findFirst({
        where: {
          githubCommitSha: input.githubCommit ?? { not: null },
          status: { in: ["MERGED", "LOCAL_SYNC_BLOCKED"] },
        },
        orderBy: { updatedAt: "desc" },
      });
  if (!job?.githubCommitSha) throw new Error("No approved GitHub commit is waiting for local sync");
  if (job.status !== "MERGED" && job.status !== "LOCAL_SYNC_BLOCKED") {
    throw new Error("The GitHub commit has not been merged into the base branch yet");
  }
  const expected = settings.githubOwner && settings.githubRepository
    ? `github.com/${settings.githubOwner}/${settings.githubRepository}`
    : input.remote;
  const { localSyncDecision, normalizeGithubRemote } = await import("@/lib/ai-code-git");
  const decision = localSyncDecision({
    githubCommit: job.githubCommitSha,
    localHead: input.localHead,
    dirty: input.dirty,
    expectedRemote: normalizeGithubRemote(expected),
    actualRemote: normalizeGithubRemote(input.remote),
  });
  await db.aiCodeJob.update({
    where: { id: job.id },
    data: {
      status: decision.status === "local_sync_blocked" ? "LOCAL_SYNC_BLOCKED" : "MERGED",
      localSyncStatus: decision,
    },
  });
  return {
    githubBranch: job.githubBranch,
    pullRequestUrl: job.pullRequestUrl,
    githubCommit: job.githubCommitSha,
    localSynchronization: decision,
    status: decision.status,
  };
}
