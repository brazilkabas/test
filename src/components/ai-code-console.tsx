"use client";

import { FormEvent, useEffect, useState } from "react";

import { api } from "@/components/api";
import { ConfirmDialog, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type Settings = {
  providerBaseUrl: string;
  modelName: string;
  apiKey: string;
  githubOwner: string | null;
  githubRepository: string | null;
  baseBranch: string;
  githubAppId: string | null;
  githubInstallationId: string | null;
  githubAppPrivateKey: string;
  githubToken: string;
  localAgentId: string | null;
  localAgentCallbackUrl: string | null;
  localAgentToken: string;
  localAgentTokenOnce?: string | null;
  createPullRequestAutomatically: boolean;
  deployAfterMerge: boolean;
  lastProviderTestStatus: string | null;
  lastGithubTestStatus: string | null;
};

type Job = {
  id: string;
  instruction: string;
  status: string;
  explanation: string | null;
  files: string[];
  unifiedDiff: string | null;
  warnings: string[];
  tests: string[];
  githubBaseSha: string | null;
  githubBranch: string | null;
  githubCommitSha: string | null;
  pullRequestUrl: string | null;
  localSyncStatus: {
    status?: string;
    reason?: string;
    message?: string;
    githubCommit?: string;
    localHead?: string;
  } | null;
  error: string | null;
  createdAt: string;
};

type MergeResult = {
  githubBranch: string | null;
  pullRequestUrl: string | null;
  githubCommit: string;
  localSynchronization: Job["localSyncStatus"];
  status: string;
};

export function AiCodeConsole() {
  const { notify } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState<"approve" | "merge" | "reject" | null>(null);
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);

  async function load() {
    const [nextSettings, nextJobs] = await Promise.all([
      api<Settings>("/ai-code/settings"),
      api<{ jobs: Job[] }>("/ai-code/jobs"),
    ]);
    setSettings(nextSettings);
    setJobs(nextJobs.jobs);
    setSelectedId((current) => current && nextJobs.jobs.some((job) => job.id === current) ? current : nextJobs.jobs[0]?.id ?? null);
  }

  useEffect(() => {
    void load().catch((error) => notify({ title: "AI Code is unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = jobs.find((job) => job.id === selectedId) ?? null;

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy("settings");
    try {
      const next = await api<Settings>("/ai-code/settings", {
        method: "POST",
        body: JSON.stringify({
          providerBaseUrl: String(data.get("providerBaseUrl") || ""),
          modelName: String(data.get("modelName") || ""),
          apiKey: String(data.get("apiKey") || "") || undefined,
          githubOwner: String(data.get("githubOwner") || "") || undefined,
          githubRepository: String(data.get("githubRepository") || "") || undefined,
          baseBranch: String(data.get("baseBranch") || "") || undefined,
          githubAppId: String(data.get("githubAppId") || "") || undefined,
          githubInstallationId: String(data.get("githubInstallationId") || "") || undefined,
          githubAppPrivateKey: String(data.get("githubAppPrivateKey") || "") || undefined,
          githubToken: String(data.get("githubToken") || "") || undefined,
          localAgentId: String(data.get("localAgentId") || "") || undefined,
          localAgentCallbackUrl: String(data.get("localAgentCallbackUrl") || ""),
          generateLocalAgentToken: data.get("generateLocalAgentToken") === "on",
          createPullRequestAutomatically: data.get("createPullRequestAutomatically") === "on",
          deployAfterMerge: data.get("deployAfterMerge") === "on",
        }),
      });
      setSettings(next);
      setOneTimeToken(next.localAgentTokenOnce ?? null);
      notify({ title: "AI Code settings encrypted and saved", tone: "success" });
      event.currentTarget.reset();
    } catch (error) {
      notify({ title: "Settings were not saved", message: error instanceof Error ? error.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  }

  async function test(kind: "provider" | "github") {
    setBusy(kind);
    try {
      await api(kind === "provider" ? "/ai-code/settings/test-provider" : "/ai-code/settings/test-github", { method: "POST", body: "{}" });
      await load();
      notify({ title: kind === "provider" ? "AI provider connection succeeded" : "GitHub connection succeeded", tone: "success" });
    } catch (error) {
      notify({ title: "Connection test failed", message: error instanceof Error ? error.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  }

  async function plan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("plan");
    try {
      const result = await api<{ job: Job }>("/ai-code/jobs", { method: "POST", body: JSON.stringify({ instruction }) });
      setInstruction("");
      await load();
      setSelectedId(result.job.id);
      notify({ title: "Change plan is ready for review", tone: "success" });
    } catch (error) {
      notify({ title: "The plan could not be created", message: error instanceof Error ? error.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  }

  async function runJob(action: "approve" | "reject" | "restore" | "regenerate" | "pull-request" | "merge") {
    if (!selected) return;
    setBusy(action);
    setConfirm(null);
    try {
      if (action === "merge") {
        const result = await api<MergeResult>(`/ai-code/jobs/${selected.id}/merge`, { method: "POST", body: "{}" });
        await load();
        notify({
          title: result.localSynchronization?.status === "local_sync_blocked" ? "Merged on GitHub, local sync blocked" : "Merged the approved GitHub commit",
          message: result.localSynchronization?.message ?? `Commit ${result.githubCommit.slice(0, 12)}`,
          tone: result.localSynchronization?.status === "local_sync_blocked" ? "error" : "success",
        });
      } else {
        const result = await api<{ job: Job }>(`/ai-code/jobs/${selected.id}/${action}`, { method: "POST", body: "{}" });
        await load();
        setSelectedId(result.job.id);
        notify({ title: actionLabel(action), tone: "success" });
      }
    } catch (error) {
      await load().catch(() => undefined);
      notify({ title: "The GitHub change was not completed", message: error instanceof Error ? error.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  }

  if (!settings) return <section className="panel panel-body"><Skeleton lines={10} /></section>;
  return <>
    <div className="page-header">
      <div>
        <div className="eyebrow">Administrator tools</div>
        <h1>AI Code</h1>
        <p className="muted">Describe an application change in English. GitHub is the source of truth. Approved commits are fast-forwarded to the local repository only when that worktree is clean.</p>
      </div>
    </div>

    <section className="panel" style={{ marginBottom: "1rem" }}>
      <header className="panel-header"><div><h2>Repository and model settings</h2><small>Secrets are encrypted at rest and never shown again. The local repository path stays on the local agent.</small></div></header>
      <form className="panel-body form-grid" onSubmit={saveSettings} key={`${settings.githubOwner}-${settings.githubRepository}-${settings.localAgentToken}-${settings.createPullRequestAutomatically}-${settings.deployAfterMerge}`}>
        <label>AI provider base URL<input name="providerBaseUrl" defaultValue={settings.providerBaseUrl} required /></label>
        <label>Model name<input name="modelName" defaultValue={settings.modelName} required /></label>
        <label className="full">AI API key<input name="apiKey" type="password" autoComplete="new-password" placeholder={settings.apiKey} /></label>
        <label>GitHub owner<input name="githubOwner" defaultValue={settings.githubOwner ?? ""} placeholder="organization-or-user" /></label>
        <label>GitHub repository<input name="githubRepository" defaultValue={settings.githubRepository ?? ""} placeholder="repository-name" /></label>
        <label>Base branch<input name="baseBranch" defaultValue={settings.baseBranch} /></label>
        <label>GitHub App ID<input name="githubAppId" defaultValue={settings.githubAppId ?? ""} /></label>
        <label>GitHub App installation ID<input name="githubInstallationId" defaultValue={settings.githubInstallationId ?? ""} /></label>
        <label className="full">GitHub App private key<textarea name="githubAppPrivateKey" rows={4} placeholder={settings.githubAppPrivateKey} /></label>
        <label className="full">GitHub token (optional fallback)<input name="githubToken" type="password" autoComplete="new-password" placeholder={settings.githubToken} /></label>
        <label>Local agent ID<input name="localAgentId" defaultValue={settings.localAgentId ?? ""} placeholder="admin-workstation" /></label>
        <label>Local agent callback URL<input name="localAgentCallbackUrl" defaultValue={settings.localAgentCallbackUrl ?? ""} placeholder="Optional. Leave blank to let the agent poll." /></label>
        <label className="checkbox-row"><input name="createPullRequestAutomatically" type="checkbox" defaultChecked={settings.createPullRequestAutomatically} /> Create pull request automatically</label>
        <label className="checkbox-row"><input name="deployAfterMerge" type="checkbox" defaultChecked={settings.deployAfterMerge} /> Deploy after merge</label>
        <label className="checkbox-row full"><input name="generateLocalAgentToken" type="checkbox" /> Generate a new local agent token</label>
        <div className="full muted">The local repository path is stored only by the local agent, never in this application. On the administrator machine run <code>npm run ai-code:agent -- init &lt;agent-id&gt; &lt;local-path&gt; github.com/owner/repo http://localhost:3000/api/v1 &lt;token&gt;</code></div>
        {oneTimeToken && <div className="success-callout full"><strong>Copy the local agent token now.</strong> It will not be shown again. Token: <code>{oneTimeToken}</code></div>}
        <div className="row full">
          <button disabled={Boolean(busy)}>{busy === "settings" ? "Saving…" : "Encrypt and save"}</button>
          <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void test("provider")}>{busy === "provider" ? "Testing…" : "Test AI provider"}</button>
          <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void test("github")}>{busy === "github" ? "Testing…" : "Test GitHub"}</button>
          <StatusBadge status={settings.lastProviderTestStatus ?? "AI untested"} />
          <StatusBadge status={settings.lastGithubTestStatus ?? "GitHub untested"} />
        </div>
      </form>
    </section>

    <section className="panel" style={{ marginBottom: "1rem" }}>
      <header className="panel-header"><div><h2>Describe a change</h2><small>Write what should change. Do not paste JSON, cookies, tokens, or Microsoft session material.</small></div></header>
      <form className="panel-body stack" onSubmit={plan}>
        <label>Change request<textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={5} required minLength={8} placeholder="Example: Add a status badge to the deployments table showing expiry date." /></label>
        <div className="row"><button disabled={Boolean(busy) || instruction.trim().length < 8}>{busy === "plan" ? "Inspecting GitHub and planning…" : "Generate plan from GitHub"}</button></div>
      </form>
    </section>

    <div className="ai-code-layout">
      <section className="panel">
        <header className="panel-header"><h2>Jobs</h2></header>
        {jobs.length === 0 ? <p className="compact-empty">No AI code jobs yet.</p> : <div className="activity-list">{jobs.map((job) => (
          <button key={job.id} className={`ai-code-job ${job.id === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(job.id)}>
            <strong>{job.instruction}</strong>
            <small>{new Date(job.createdAt).toLocaleString()}</small>
            <StatusBadge status={job.status} />
          </button>
        ))}</div>}
      </section>
      <section className="panel">
        <header className="panel-header"><div><h2>Review</h2><small>Approve applies the patch on a temporary worktree from the recorded GitHub commit, then pushes <code>ai/change-&lt;job-id&gt;</code>.</small></div>{selected && <StatusBadge status={selected.status} />}</header>
        {!selected ? <p className="compact-empty">Generate a plan to review files, explanation, and the Git patch.</p> : <div className="panel-body stack">
          {selected.error && <div className="inline-alert">{selected.error}</div>}
          {selected.localSyncStatus?.status === "local_sync_blocked" && <div className="inline-alert">{selected.localSyncStatus.message ?? "Local uncommitted changes blocked synchronization."}</div>}
          <div className="definition-grid">
            <div className="definition"><dt>GitHub base commit</dt><dd>{selected.githubBaseSha ?? "Not recorded"}</dd></div>
            <div className="definition"><dt>Change branch</dt><dd>{selected.githubBranch ?? "Not created"}</dd></div>
            <div className="definition"><dt>Approved commit</dt><dd>{selected.githubCommitSha ?? "Not created"}</dd></div>
            <div className="definition"><dt>Pull request</dt><dd>{selected.pullRequestUrl ? <a href={selected.pullRequestUrl} target="_blank" rel="noopener noreferrer">Open on GitHub</a> : "Not opened"}</dd></div>
            <div className="definition"><dt>Local sync</dt><dd>{selected.localSyncStatus?.status ?? "Not started"}</dd></div>
            <div className="definition"><dt>Tests</dt><dd>{selected.tests.join(", ") || "Default lint, typecheck, test, and production build"}</dd></div>
          </div>
          {selected.explanation && <div><h3>Explanation</h3><p>{selected.explanation}</p></div>}
          {selected.files.length > 0 && <div><h3>Files</h3><ul>{selected.files.map((file) => <li key={file}><code>{file}</code></li>)}</ul></div>}
          {selected.warnings.length > 0 && <div><h3>Warnings</h3><ul>{selected.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          {selected.unifiedDiff && <pre className="ai-code-diff">{selected.unifiedDiff}</pre>}
          <div className="row">
            {(selected.status === "AWAITING_APPROVAL" || selected.status === "STALE") && <button disabled={Boolean(busy)} onClick={() => setConfirm("approve")}>{busy === "approve" ? "Applying…" : "Approve and apply"}</button>}
            {selected.status === "STALE" && <button className="secondary" disabled={Boolean(busy)} onClick={() => void runJob("regenerate")}>Regenerate from current GitHub</button>}
            {selected.status === "READY" && !selected.pullRequestUrl && <button className="secondary" disabled={Boolean(busy)} onClick={() => void runJob("pull-request")}>Create pull request</button>}
            {(selected.status === "READY" || selected.status === "LOCAL_SYNC_BLOCKED") && <button disabled={Boolean(busy)} onClick={() => setConfirm("merge")}>{busy === "merge" ? "Merging…" : "Merge into base branch"}</button>}
            {["AWAITING_APPROVAL", "STALE", "FAILED"].includes(selected.status) && <button className="secondary" disabled={Boolean(busy)} onClick={() => void runJob("restore")}>Restore previous revision</button>}
            {["AWAITING_APPROVAL", "STALE", "FAILED"].includes(selected.status) && <button className="secondary" disabled={Boolean(busy)} onClick={() => void runJob("regenerate")}>Regenerate</button>}
            {selected.status === "AWAITING_APPROVAL" && <button className="danger-button" disabled={Boolean(busy)} onClick={() => setConfirm("reject")}>Reject</button>}
          </div>
        </div>}
      </section>
    </div>
    <ConfirmDialog
      open={confirm === "approve"}
      title="Approve this GitHub change?"
      description="The patch will be applied to a temporary worktree taken from the recorded GitHub commit, then tested, committed, and pushed to a new ai/change branch. Local files are never overwritten."
      confirmLabel="Approve and apply"
      onClose={() => setConfirm(null)}
      onConfirm={() => void runJob("approve")}
    />
    <ConfirmDialog
      open={confirm === "merge"}
      title="Merge the exact approved commit?"
      description="GitHub remains the source of truth. The base branch is updated with a fast-forward only when possible. The local agent will fetch and fast-forward only if that repository is clean."
      confirmLabel="Merge commit"
      onClose={() => setConfirm(null)}
      onConfirm={() => void runJob("merge")}
    />
    <ConfirmDialog
      open={confirm === "reject"}
      title="Reject this plan?"
      description="The job will be marked rejected. Nothing is pushed to GitHub."
      confirmLabel="Reject plan"
      destructive
      onClose={() => setConfirm(null)}
      onConfirm={() => void runJob("reject")}
    />
  </>;
}

function actionLabel(action: string) {
  if (action === "approve") return "Change applied and pushed to GitHub";
  if (action === "reject") return "Plan rejected";
  if (action === "restore") return "Previous revision restored for review";
  if (action === "regenerate") return "A new plan was generated from GitHub";
  if (action === "pull-request") return "Pull request opened";
  return "GitHub change updated";
}
