import { createHmac, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";

import type { AccessRole, User } from "@/generated/prisma/client";
import { config } from "@/lib/config";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";

const SESSION_COOKIE = "company_session";
const CSRF_COOKIE = "company_csrf";
const SESSION_SECONDS = 8 * 60 * 60;

export const rolePermissions: Record<AccessRole, string[]> = {
  SUPER_ADMIN: ["*"],
  MICROSOFT_ADMIN: ["microsoft:manage", "mail:read", "mail:write", "audit:read"],
  MAIL_OPERATOR: ["mail:read", "mail:write", "mail:send"],
  MAIL_VIEWER: ["mail:read"],
  DEPLOYMENT_ADMIN: ["deployment:*"],
  HTML_DESIGNER: ["html:*"],
  AUDITOR: ["audit:read"],
  SUPPORT_OPERATOR: ["microsoft:read", "system:read"],
};

export async function createSession(
  user: User,
  roleOverride?: AccessRole | null,
): Promise<{ csrfToken: string }> {
  const token = randomBytes(32).toString("base64url");
  const csrfNonce = randomBytes(24).toString("base64url");
  const csrfToken = signCsrf(csrfNonce);
  const requestHeaders = await headers();
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);

  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      roleOverride,
      expiresAt,
      ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: requestHeaders.get("user-agent"),
    },
  });

  const jar = await cookies();
  const secure = config().NODE_ENV === "production";
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  jar.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return { csrfToken };
}

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { roles: { include: { role: true } } } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  return { ...session.user, sessionRoleOverride: session.roleOverride };
}

export async function revokeCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
}

export async function requirePermission(permission: string) {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Authentication required");
  const permissions = user.sessionRoleOverride
    ? rolePermissions[user.sessionRoleOverride]
    : user.roles.flatMap(({ role }) => rolePermissions[role.role]);
  const allowed = permissions.some(
    (candidate) =>
      candidate === "*" ||
      candidate === permission ||
      (candidate.endsWith("*") && permission.startsWith(candidate.slice(0, -1))),
  );
  if (!allowed) throw new ApiError(403, `Missing permission: ${permission}`);
  return user;
}

export async function requireCsrf(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(config().APP_BASE_URL).origin) {
    throw new ApiError(403, "Invalid request origin");
  }
  const header = request.headers.get("x-csrf-token");
  const cookie = (await cookies()).get(CSRF_COOKIE)?.value;
  if (!header || !cookie || header !== cookie || !verifyCsrf(header)) {
    throw new ApiError(403, "Invalid CSRF token");
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function apiError(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message, details: error.details }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

function signCsrf(nonce: string): string {
  const signature = createHmac("sha256", config().SESSION_SECRET).update(nonce).digest("base64url");
  return `${nonce}.${signature}`;
}

function verifyCsrf(token: string): boolean {
  const nonce = token.split(".")[0];
  return Boolean(nonce) && signCsrf(nonce) === token;
}
