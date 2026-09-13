const API = "https://api.cloudflare.com/client/v4";

function cloudflareConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const baseDomain = process.env.CLOUDFLARE_BASE_DOMAIN;
  return { accountId, token, zoneId, baseDomain, configured: Boolean(accountId && token && zoneId && baseDomain) };
}

export function cloudflareStatus() {
  const value = cloudflareConfig();
  return {
    configured: value.configured,
    accountId: value.accountId ?? null,
    zoneId: value.zoneId ?? null,
    baseDomain: value.baseDomain ?? null,
    apiToken: value.token ? "CONFIGURED" : "MISSING",
  };
}

export async function verifyCloudflare() {
  return cloudflareRequest<{ id: string; name: string }>(`/accounts/${required().accountId}`);
}

export async function publishDeployment(hostname: string, payload: Record<string, unknown>) {
  const cfg = required();
  const namespaceId = await deploymentNamespaceId();
  await cloudflareRequest(`/accounts/${cfg.accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(hostname)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteDeployment(hostname: string) {
  const cfg = required();
  const namespaceId = await deploymentNamespaceId();
  await cloudflareRequest(`/accounts/${cfg.accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(hostname)}`, { method: "DELETE" });
}

async function deploymentNamespaceId(): Promise<string> {
  const cfg = required();
  if (process.env.CLOUDFLARE_KV_NAMESPACE_ID) return process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const list = await cloudflareRequest<Array<{ id: string; title: string }>>(`/accounts/${cfg.accountId}/storage/kv/namespaces?per_page=100`);
  const existing = list.find((item) => item.title === "company-control-deployments");
  if (existing) return existing.id;
  const created = await cloudflareRequest<{ id: string }>(`/accounts/${cfg.accountId}/storage/kv/namespaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "company-control-deployments" }),
  });
  return created.id;
}

async function cloudflareRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = required();
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => null) as { success?: boolean; result?: T; errors?: Array<{ code: number; message: string }> } | null;
  if (!response.ok || !body?.success) {
    const message = body?.errors?.map((error) => `${error.code}: ${error.message}`).join("; ") || `Cloudflare request failed (${response.status})`;
    throw new CloudflareError(response.status, message);
  }
  return body.result as T;
}

function required() {
  const cfg = cloudflareConfig();
  if (!cfg.configured) throw new CloudflareError(503, "Cloudflare account, zone, base domain, and API token are not configured");
  return cfg as { accountId: string; token: string; zoneId: string; baseDomain: string; configured: true };
}

export class CloudflareError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}
