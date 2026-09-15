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
  SUPER_ADMIN: ["*", "ai-code:*"],
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
  const jar = await cookies();
  const previousToken = jar.get(SESSION_COOKIE)?.value;

  await db.$transaction(async (transaction) => {
    if (previousToken) {
      await transaction.session.updateMany({
        where: { tokenHash: sha256(previousToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await transaction.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        roleOverride,
        expiresAt,
        ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim(),
        userAgent: requestHeaders.get("user-agent"),
      },
    });
  });

  setSessionCookies(jar, token, csrfToken, expiresAt);
  return { csrfToken };
}

export async function bindCurrentSessionToMicrosoftConnection(connectionId: string) {
  const current = await currentSessionRecord();
  if (!current) return false;
  if (current.microsoftConnectionId === connectionId) return true;

  const connection = await db.microsoftConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, tenantId: true, microsoftUserId: true },
  });
  if (!connection) return false;

  const token = randomBytes(32).toString("base64url");
  const csrfToken = signCsrf(randomBytes(24).toString("base64url"));
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  const requestHeaders = await headers();
  const rotated = await db.$transaction(async (transaction) => {
    const revoked = await transaction.session.updateMany({
      where: { id: current.id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) return false;
    await transaction.microsoftConnection.updateMany({
      where: { id: connection.id, ownerId: null },
      data: { ownerId: current.userId },
    });
    await transaction.session.create({
      data: {
        userId: current.userId,
        tokenHash: sha256(token),
        roleOverride: current.roleOverride,
        microsoftConnectionId: connection.id,
        microsoftTenantId: connection.tenantId,
        microsoftUserId: connection.microsoftUserId,
        expiresAt,
        ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim(),
        userAgent: requestHeaders.get("user-agent"),
      },
    });
    return true;
  });
  if (!rotated) return false;

  setSessionCookies(await cookies(), token, csrfToken, expiresAt);
  return true;
}

function setSessionCookies(
  jar: Awaited<ReturnType<typeof cookies>>,
  token: string,
  csrfToken: string,
  expiresAt: Date,
) {
  const secure = config().NODE_ENV === "production";
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  jar.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

async function currentSessionRecord() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: { include: { roles: { include: { role: true } } } },
      microsoftConnection: {
        select: {
          id: true,
          tenantId: true,
          microsoftUserId: true,
          displayName: true,
          userPrincipalName: true,
          email: true,
          authorizationStatus: true,
          grantedScopes: true,
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  return session;
}

export async function currentUser() {
  const session = await currentSessionRecord();
  return session
    ? { ...session.user, sessionRoleOverride: session.roleOverride }
    : null;
}

export async function currentMicrosoftConnection() {
  const session = await currentSessionRecord();
  return session?.microsoftConnection ?? null;
}

export async function requireSessionMicrosoftConnection(connectionId: string) {
  const session = await currentSessionRecord();
  if (!session) throw new ApiError(401, "Authentication required");
  if (
    session.microsoftConnectionId
    && session.microsoftConnectionId !== connectionId
  ) {
    throw new ApiError(403, "This website session is bound to a different Microsoft account");
  }
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
