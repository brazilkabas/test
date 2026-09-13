import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";

const API = "https://api.cloudflare.com/client/v4";

type CloudflareCredentials = {
  authType: "API_TOKEN" | "GLOBAL_API_KEY";
  credential: string;
  email?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  zoneId?: string | null;
  zoneName?: string | null;
  baseDomain?: string | null;
};

async function cloudflareConfig(): Promise<CloudflareCredentials | null> {
  const stored = await db.cloudflareConfiguration.findUnique({ where: { id: "default" } });
  if (stored) {
    return {
      authType: stored.authType,
      credential: decrypt(stored.encryptedCredential, "cloudflare:default"),
      email: stored.email,
      accountId: stored.accountId,
      accountName: stored.accountName,
      zoneId: stored.zoneId,
      zoneName: stored.zoneName,
      baseDomain: stored.baseDomain,
    };
  }
  if (!process.env.CLOUDFLARE_API_TOKEN) return null;
  return {
    authType: "API_TOKEN",
    credential: process.env.CLOUDFLARE_API_TOKEN,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
    baseDomain: process.env.CLOUDFLARE_BASE_DOMAIN,
  };
}

export async function cloudflareStatus() {
  const value = await cloudflareConfig();
  return {
    configured: Boolean(value?.credential && value.accountId && value.zoneId && value.baseDomain),
    credentialsSaved: Boolean(value?.credential),
    authType: value?.authType ?? null,
    email: value?.email ? maskEmail(value.email) : null,
    accountId: value?.accountId ?? null,
    accountName: value?.accountName ?? null,
    zoneId: value?.zoneId ?? null,
    zoneName: value?.zoneName ?? null,
    baseDomain: value?.baseDomain ?? null,
    credential: value?.credential ? "••••••••••••" : "MISSING",
    apiToken: value?.credential ? "CONFIGURED" : "MISSING",
  };
}

export async function discoverCloudflare(
  credentials: Pick<CloudflareCredentials, "authType" | "credential" | "email">,
) {
  const accountsResponse = await cloudflareRequestWith<Array<{ id: string; name: string }>>("/accounts?per_page=100", credentials);
  const zonesResponse = await cloudflareRequestWith<Array<{ id: string; name: string; account: { id: string; name: string }; status: string }>>("/zones?per_page=100", credentials);
  return { accounts: accountsResponse, zones: zonesResponse };
}

export async function verifyCloudflare() {
  const cfg = await required();
  return cloudflareRequestWith<{ id: string; name: string }>(`/accounts/${cfg.accountId}`, cfg);
}

export async function publishDeployment(hostname: string, payload: Record<string, unknown>) {
  const cfg = await required();
  const namespaceId = await deploymentNamespaceId(cfg);
  await cloudflareRequestWith(`/accounts/${cfg.accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(hostname)}`, cfg, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteDeployment(hostname: string) {
  const cfg = await required();
  const namespaceId = await deploymentNamespaceId(cfg);
  await cloudflareRequestWith(`/accounts/${cfg.accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(hostname)}`, cfg, { method: "DELETE" });
}

async function deploymentNamespaceId(cfg: CloudflareCredentials & { accountId: string }): Promise<string> {
  if (process.env.CLOUDFLARE_KV_NAMESPACE_ID) return process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const list = await cloudflareRequestWith<Array<{ id: string; title: string }>>(`/accounts/${cfg.accountId}/storage/kv/namespaces?per_page=100`, cfg);
  const existing = list.find((item) => item.title === "company-control-deployments");
  if (existing) return existing.id;
  const created = await cloudflareRequestWith<{ id: string }>(`/accounts/${cfg.accountId}/storage/kv/namespaces`, cfg, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "company-control-deployments" }),
  });
  return created.id;
}

async function cloudflareRequestWith<T = unknown>(
  path: string,
  credentials: Pick<CloudflareCredentials, "authType" | "credential" | "email">,
  init: RequestInit = {},
): Promise<T> {
  const authentication: Record<string, string> =
    credentials.authType === "API_TOKEN"
      ? { Authorization: `Bearer ${credentials.credential}` }
      : { "X-Auth-Email": credentials.email ?? "", "X-Auth-Key": credentials.credential };
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  Object.entries(authentication).forEach(([name, value]) => headers.set(name, value));
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers,
  });
  const body = await response.json().catch(() => null) as { success?: boolean; result?: T; errors?: Array<{ code: number; message: string }> } | null;
  if (!response.ok || !body?.success) {
    const message = body?.errors?.map((error) => `${error.code}: ${error.message}`).join("; ") || `Cloudflare request failed (${response.status})`;
    throw new CloudflareError(response.status, message);
  }
  return body.result as T;
}

async function required() {
  const cfg = await cloudflareConfig();
  if (!cfg?.credential || !cfg.accountId || !cfg.zoneId || !cfg.baseDomain) {
    throw new CloudflareError(503, "Cloudflare credentials, account, zone, and base domain are not configured");
  }
  return cfg as CloudflareCredentials & { accountId: string; zoneId: string; baseDomain: string };
}

function maskEmail(value: string) {
  const [name, domain] = value.split("@");
  return `${name.slice(0, 2)}•••@${domain}`;
}

export class CloudflareError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}
