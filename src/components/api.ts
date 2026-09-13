"use client";

export function csrfToken(): string {
  const token = document.cookie
    .split("; ")
    .find((item) => item.startsWith("company_csrf="))
    ?.split("=")
    .slice(1)
    .join("=");
  return token ? decodeURIComponent(token) : "";
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(!["GET", "HEAD"].includes(init.method ?? "GET") ? { "X-CSRF-Token": csrfToken() } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? "Request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
