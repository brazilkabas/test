import { createSign } from "node:crypto";

export type GithubSettings = {
  owner: string;
  repository: string;
  baseBranch: string;
  appId?: string | null;
  installationId?: string | null;
  appPrivateKey?: string | null;
  token?: string | null;
};

function githubAppJwt(appId: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: now - 30, exp: now + 540, iss: appId })).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey, "base64url")}`;
}

async function githubRequest(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "company-control-ai-code",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.message === "string" ? body.message : "GitHub request failed");
  }
  return body;
}

export async function githubAccessToken(settings: GithubSettings) {
  if (settings.token) return settings.token;
  if (!settings.appId || !settings.installationId || !settings.appPrivateKey) {
    throw new Error("Connect a GitHub App or encrypted GitHub token first");
  }
  const jwt = githubAppJwt(settings.appId, settings.appPrivateKey);
  const installation = await githubRequest(
    jwt,
    `/app/installations/${encodeURIComponent(settings.installationId)}/access_tokens`,
    { method: "POST" },
  );
  if (typeof installation.token !== "string") throw new Error("GitHub App installation token was not issued");
  return installation.token as string;
}

export function githubCloneUrl(settings: GithubSettings, token: string) {
  return `https://x-access-token:${token}@github.com/${settings.owner}/${settings.repository}.git`;
}

export function githubRepoSlug(settings: GithubSettings) {
  return `${settings.owner}/${settings.repository}`;
}

export async function githubBaseCommit(settings: GithubSettings, token: string) {
  const ref = await githubRequest(
    token,
    `/repos/${settings.owner}/${settings.repository}/git/ref/heads/${encodeURIComponent(settings.baseBranch)}`,
  );
  const sha = ref?.object?.sha;
  if (typeof sha !== "string") throw new Error("GitHub did not return a base commit SHA");
  return sha;
}

export async function githubCreatePullRequest(
  settings: GithubSettings,
  token: string,
  input: { title: string; body: string; head: string },
) {
  return githubRequest(token, `/repos/${settings.owner}/${settings.repository}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.head,
      base: settings.baseBranch,
    }),
  }) as Promise<{ html_url: string; number: number }>;
}

export async function githubMergePullRequest(
  settings: GithubSettings,
  token: string,
  number: number,
  sha: string,
) {
  return githubRequest(
    token,
    `/repos/${settings.owner}/${settings.repository}/pulls/${number}/merge`,
    {
      method: "PUT",
      body: JSON.stringify({
        merge_method: "merge",
        sha,
      }),
    },
  ) as Promise<{ sha: string; merged: boolean }>;
}

export async function githubFastForwardBranch(
  settings: GithubSettings,
  token: string,
  branch: string,
  sha: string,
) {
  const result = await githubRequest(
    token,
    `/repos/${settings.owner}/${settings.repository}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ sha, force: false }),
    },
  ) as { object?: { sha?: string } };
  const updated = result.object?.sha;
  if (typeof updated !== "string") throw new Error("GitHub did not fast-forward the base branch");
  return updated;
}

export async function githubTestConnection(settings: GithubSettings) {
  const token = await githubAccessToken(settings);
  const repo = await githubRequest(token, `/repos/${settings.owner}/${settings.repository}`);
  const sha = await githubBaseCommit(settings, token);
  return {
    fullName: typeof repo.full_name === "string" ? repo.full_name : githubRepoSlug(settings),
    defaultBranch: typeof repo.default_branch === "string" ? repo.default_branch : settings.baseBranch,
    sha,
  };
}
