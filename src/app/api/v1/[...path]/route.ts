import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";

import { AccessRole } from "@/generated/prisma/client";
import { apiError, ApiError, bindCurrentSessionToMicrosoftConnection, createSession, currentUser, requireCsrf, requirePermission, revokeCurrentSession, rolePermissions } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { buildPageDesign, defaultBuilderConfiguration } from "@/lib/builder-designs";
import { CloudflareError, type CloudflareCredentials, cloudflareStatus, deleteDeployment, discoverCloudflare, publishDeployment, verifyCloudflare } from "@/lib/cloudflare";
import { config } from "@/lib/config";
import { encrypt, hashSecret, randomAccessCode, randomHostnameLabel, sha256, verifySecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { isSafeRedirectUrl, pageDocumentSchema, renderPageDocument, type PageDocument, type PageNode } from "@/lib/page-document";
import { getVisualTemplate, visualTemplates } from "@/lib/visual-templates";
import { changeMailboxPermission, exchangeConfiguration, ExchangeConfigurationError, ExchangeOperationError, getMailboxDelegation } from "@/lib/exchange";
import { authorizationStatus, GraphError, graphFetch, isOfficialMicrosoftVerificationUrl, MicrosoftConfigurationError, MicrosoftReauthenticationRequired, startDeviceAuthorization } from "@/lib/microsoft";
import { microsoftAuthority } from "@/lib/microsoft-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; resetAt: number }>();
const id = z.string().min(1).max(256);
const messageBody = z.object({
  subject: z.string().min(1).max(998),
  body: z.string().max(500_000),
  contentType: z.enum(["Text", "HTML"]).default("HTML"),
  toRecipients: z.array(z.string().email()).min(1).max(50),
  ccRecipients: z.array(z.string().email()).max(50).default([]),
  bccRecipients: z.array(z.string().email()).max(50).default([]),
  attachments: z.array(z.object({
    name: z.string().min(1).max(255),
    contentType: z.string().min(1).max(150),
    contentBytes: z.string().max(5_000_000),
  })).max(10).default([]),
});

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    return await route(request, (await context.params).path);
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const path = (await context.params).path;
    const publicDeviceRestart = path[0] === "microsoft" && path[1] === "device" && path[3] === "restart";
    const publicDeploymentSession = path[0] === "public" && path[1] === "deployments" && path[3] === "device" && path[4] === "start";
    if (!publicDeviceRestart && !publicDeploymentSession && !["auth/login", "outlook-launch/exchange"].includes(path.join("/"))) await requireCsrf(request);
    return await route(request, path);
  } catch (error) {
    return handle(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    await requireCsrf(request);
    return await route(request, (await context.params).path);
  } catch (error) {
    return handle(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    await requireCsrf(request);
    return await route(request, (await context.params).path);
  } catch (error) {
    return handle(error);
  }
}

async function route(request: NextRequest, path: string[]) {
  const key = `${request.method} /${path.join("/")}`;

  if (key === "POST /auth/login") return login(request);
  if (path[0] === "public" && path[1] === "deployments" && path[3] === "device" && path[4] === "start" && request.method === "POST") return publicDeploymentDeviceSession(request, path[2]);
  if (key === "GET /auth/me") {
    const user = await currentUser();
    return Response.json({ user: user ? safeUser(user) : null });
  }
  if (key === "POST /auth/logout") {
    const actor = await currentUser();
    await revokeCurrentSession();
    if (actor) await audit({ actorId: actor.id, action: "auth.logout", targetType: "Session", result: "SUCCESS" });
    return new Response(null, { status: 204 });
  }
  if (path[0] === "brand-assets") return brandAssetRoute(request, path);
  if (key === "GET /dashboard") return dashboard();
  if (key === "POST /microsoft/device/start") {
    const actor = await requirePermission("microsoft:manage");
    const { pageProjectId, deploymentId, replacementSessionId, purpose, connectionId } = z.object({
      pageProjectId: z.string().optional(),
      deploymentId: z.string().optional(),
      replacementSessionId: z.string().optional(),
      purpose: z.enum(["identity", "mailbox", "mailbox-settings"]).default("identity"),
      connectionId: z.string().optional(),
    }).parse(await request.json().catch(() => ({})));
    if (purpose !== "identity") {
      if (!connectionId) throw new ApiError(400, "A Microsoft connection is required for incremental consent");
      const connection = await db.microsoftConnection.findUnique({ where: { id: connectionId }, select: { id: true } });
      if (!connection) throw new ApiError(404, "Microsoft connection not found");
    }
    const { publicId, statusToken } = await startDeviceAuthorization(pageProjectId, purpose);
    const presentation = await authorizationStatus(publicId, statusToken);
    if (replacementSessionId && presentation?.userCode) {
      await db.microsoftAuthorizationSession.updateMany({ where: { publicId: replacementSessionId, status: "PENDING" }, data: { status: "EXPIRED", errorCode: "REPLACED" } });
    }
    await audit({
      actorId: actor.id,
      action: "microsoft.authorization.started",
      targetType: "MicrosoftAuthorizationSession",
      targetId: publicId,
      result: "SUCCESS",
      metadata: { purpose, ...(connectionId ? { connectionId } : {}) },
    });
    const connectUrl = `/connect/${publicId}?token=${encodeURIComponent(statusToken)}`;
    let publishedConnectUrl: string | undefined;
    let bridgeError: string | undefined;
    if (pageProjectId && deploymentId) {
      try {
        publishedConnectUrl = await publishMicrosoftSessionPage({ pageProjectId, deploymentId, publicId, statusToken });
        await audit({ actorId: actor.id, action: "microsoft.authorization.deployment_bound", targetType: "CloudflareDeployment", targetId: deploymentId, result: "SUCCESS", metadata: { authorizationSessionId: publicId } });
      } catch (error) {
        bridgeError = error instanceof Error ? error.message : "Cloudflare session binding failed";
        await audit({ actorId: actor.id, action: "microsoft.authorization.deployment_bound", targetType: "CloudflareDeployment", targetId: deploymentId, result: "FAILURE", metadata: { authorizationSessionId: publicId } });
      }
    }
    return Response.json({
      sessionId: publicId, statusToken, connectUrl, publishedConnectUrl, bridgeError,
      session: presentation ? { sessionId: publicId, userCode: presentation.userCode, verificationUri: presentation.verificationUri, expiresAt: presentation.expiresAt, status: presentation.status } : undefined,
    }, { status: 201 });
  }
  if (path[0] === "microsoft" && path[1] === "device" && path[3] === "status" && request.method === "GET") {
    const status = await authorizationStatus(id.parse(path[2]), z.string().min(40).parse(request.nextUrl.searchParams.get("token")));
    if (!status) throw new ApiError(404, "Authorization session not found");
    if (status.verificationUri && !isOfficialMicrosoftVerificationUrl(status.verificationUri)) throw new ApiError(502, "Microsoft verification URL was rejected");
    if (status.status === "CONNECTED" && status.connectionId) {
      await bindCurrentSessionToMicrosoftConnection(status.connectionId);
    }
    const headers: Record<string, string> = {};
    const origin = request.headers.get("origin");
    if (origin && status.pageProject?.id) {
      try {
        const hostname = new URL(origin).hostname;
        const deployment = await db.cloudflareDeployment.findFirst({ where: { hostname, projectId: status.pageProject.id, status: "ACTIVE" }, select: { id: true } });
        if (deployment) {
          headers["Access-Control-Allow-Origin"] = origin;
          headers.Vary = "Origin";
        }
      } catch { /* Invalid origins receive no CORS grant. */ }
    }
    return Response.json({ authorization: await hydrateAuthorizationBrandAssets(status) }, { headers });
  }
  if (path[0] === "microsoft" && path[1] === "device" && path[3] === "restart" && request.method === "POST") {
    enforceRateLimit(`device-restart:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"}`);
    const publicId = id.parse(path[2]);
    const oldToken = z.string().min(40).parse(request.nextUrl.searchParams.get("token"));
    const previous = await authorizationStatus(publicId, oldToken);
    if (!previous) throw new ApiError(404, "Authorization session not found");
    if (!["EXPIRED", "FAILED", "CANCELLED"].includes(previous.status)) throw new ApiError(409, "Authorization can only be restarted after it ends");
    const incrementalSettings = previous.requestedScopes.some((scope) => scope.toLowerCase().endsWith("/mailboxsettings.readwrite"))
      && !previous.requestedScopes.some((scope) => scope.toLowerCase().endsWith("/mail.readwrite"));
    const incrementalMailbox = previous.requestedScopes.some((scope) => scope.toLowerCase().endsWith("/mail.readwrite"));
    const pageProjectId = previous.pageProject?.id;
    if (!pageProjectId && !incrementalSettings && !incrementalMailbox) throw new ApiError(404, "Authorization session cannot be restarted");
    const { publicId: nextPublicId, statusToken } = await startDeviceAuthorization(
      pageProjectId,
      incrementalSettings ? "mailbox-settings" : incrementalMailbox ? "mailbox" : "identity",
    );
    const connectUrl = `/connect/${nextPublicId}?token=${encodeURIComponent(statusToken)}`;
    const origin = request.headers.get("origin");
    let publishedConnectUrl: string | undefined;
    const headers: Record<string, string> = {};
    if (origin && pageProjectId) {
      try {
        const hostname = new URL(origin).hostname;
        const deployment = await db.cloudflareDeployment.findFirst({ where: { hostname, projectId: pageProjectId, status: "ACTIVE" }, select: { id: true } });
        if (deployment) {
          publishedConnectUrl = await publishMicrosoftSessionPage({ pageProjectId, deploymentId: deployment.id, publicId: nextPublicId, statusToken });
          headers["Access-Control-Allow-Origin"] = origin;
          headers.Vary = "Origin";
        }
      } catch { /* Invalid or unavailable deployment origins fall back to the app page. */ }
    }
    await audit({ action: "microsoft.authorization.restarted", targetType: "MicrosoftAuthorizationSession", targetId: nextPublicId, result: "SUCCESS", metadata: { previousSessionId: publicId } });
    return Response.json({ connectUrl, publishedConnectUrl }, { status: 201, headers });
  }
  if (key === "GET /microsoft/accounts") {
    await requirePermission("microsoft:read");
    const accounts = await db.microsoftConnection.findMany({
      orderBy: { connectedAt: "desc" },
      select: {
        id: true,
        tenantId: true,
        microsoftUserId: true,
        displayName: true,
        userPrincipalName: true,
        email: true,
        authorizationStatus: true,
        grantedScopes: true,
        connectedAt: true,
        lastSuccessfulGraphAt: true,
      },
    });
    return Response.json({ accounts });
  }
  if (key === "GET /microsoft/users") return organizationUsers(request);
  if (path[0] === "microsoft" && path[1] === "accounts" && path[2]) {
    return microsoftAccountRoute(request, path[2]);
  }
  if (key === "GET /audit") {
    await requirePermission("audit:read");
    const query = request.nextUrl.searchParams;
    const page = Math.max(1, Number(query.get("page")) || 1);
    const where = {
      ...(query.get("action") ? { action: { contains: query.get("action")!, mode: "insensitive" as const } } : {}),
      ...(query.get("result") ? { result: query.get("result")! } : {}),
      ...(query.get("connectionId") ? { connectionId: query.get("connectionId")! } : {}),
      ...(query.get("actorId") ? { actorId: query.get("actorId")! } : {}),
    };
    const [events, total] = await Promise.all([
      db.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { actor: { select: { email: true, displayName: true } } } }),
      db.auditEvent.count({ where }),
    ]);
    return Response.json({ events, page, total, pages: Math.ceil(total / 50) });
  }
  if (key === "GET /system/status") {
    await requirePermission("system:read");
    await db.$queryRaw`SELECT 1`;
    return Response.json({
      database: "healthy",
      microsoft: {
        authority: microsoftAuthority(),
        clientId: config().MICROSOFT_CLIENT_ID,
        resourceAppId: config().MICROSOFT_RESOURCE_APP_ID,
        resourceScope: config().MICROSOFT_RESOURCE_SCOPE,
        redirectUri: config().MICROSOFT_REDIRECT_URI,
      },
      version: process.env.npm_package_version ?? "0.1.0",
    });
  }
  if (key === "GET /internal/users") {
    await requirePermission("*");
    const users = await db.user.findMany({ orderBy: { email: "asc" }, select: { id: true, email: true, displayName: true, status: true } });
    return Response.json({ users });
  }
  if (key === "GET /security") return securityOverview();
  if (path[0] === "sessions" && path[1] && request.method === "DELETE") return revokeSession(path[1]);
  if (path[0] === "internal" && path[1] === "users" && path[2] && path[3] === "roles" && request.method === "PATCH") return updateUserRoles(request, path[2]);
  if (key === "POST /access-codes") return createAccessCode(request);
  if (key === "GET /access-codes") return listAccessCodes();
  if (path[0] === "access-codes" && path[1] && request.method === "DELETE") return revokeAccessCode(path[1]);
  if (path[0] === "diagnostics" && path[1]) return microsoftDiagnostics(request, path[1]);
  if (path[0] === "html-projects") return htmlProjectRoute(request, path);
  if (path[0] === "cloudflare") return cloudflareRoute(request, path);
  if (path[0] === "outlook-launch") return outlookLaunchRoute(request, path);
  if (path[0] === "exchange") return exchangeRoute(request);

  if (path[0] === "mail" && path[1]) return mailRoute(request, path);
  throw new ApiError(404, "API route not found");
}

async function login(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  enforceRateLimit(ip);
  const { code } = z.object({ code: z.string().regex(/^[A-Za-z0-9]{15}$/) }).parse(await request.json());
  let user;
  let accessCodeId: string | undefined;
  let roleOverride: AccessRole | undefined;

  const userCount = await db.user.count();
  if (userCount === 0 && config().BOOTSTRAP_ACCESS_CODE && code === config().BOOTSTRAP_ACCESS_CODE) {
    user = await bootstrapAdmin();
  } else {
    const candidates = await db.accessCode.findMany({
      where: { purpose: "APPLICATION", revokedAt: null, expiresAt: { gt: new Date() } },
      include: { createdBy: true },
      take: 100,
    });
    const candidate = candidates.find(
      (item) =>
        item.usedCount < item.maximumUses &&
        verifySecret(code, item.codeHash) &&
        ipMatchesRange(ip, item.allowedIpRange),
    );
    if (!candidate) {
      await audit({
        action: "auth.access_code.failed",
        targetType: "Session",
        result: "DENIED",
        metadata: { ip },
      });
      throw new ApiError(401, "Invalid or expired access code");
    }
    user = candidate.allowedUserId
      ? await db.user.findUniqueOrThrow({ where: { id: candidate.allowedUserId } })
      : candidate.createdBy;
    accessCodeId = candidate.id;
    roleOverride = candidate.allowedRole ?? undefined;
    await db.accessCode.update({
      where: { id: candidate.id },
      data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  }

  attempts.delete(ip);
  const session = await createSession(user, roleOverride);
  await audit({
    actorId: user.id,
    action: "auth.login",
    targetType: "Session",
    targetId: accessCodeId,
    result: "SUCCESS",
  });
  return Response.json({ user: safeUser(user), csrfToken: session.csrfToken });
}

async function dashboard() {
  await requirePermission("microsoft:read");
  const now = new Date();
  const [connections, activeAccessCodes, htmlProjects, activeDeployments, recentEvents, recentDeployments, recentMailActivity] = await Promise.all([
    db.microsoftConnection.findMany({
      select: { id: true, authorizationStatus: true, displayName: true, userPrincipalName: true, lastSuccessfulGraphAt: true },
      orderBy: { connectedAt: "desc" },
    }),
    db.accessCode.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
    db.htmlProject.count({ where: { status: { not: "ARCHIVED" } } }),
    db.cloudflareDeployment.count({ where: { status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { actor: { select: { displayName: true, email: true } } } }),
    db.cloudflareDeployment.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { project: { select: { name: true } } } }),
    db.auditEvent.findMany({ where: { action: { startsWith: "mail." } }, orderBy: { createdAt: "desc" }, take: 5, include: { actor: { select: { displayName: true, email: true } } } }),
  ]);
  const mailboxStats = await Promise.all(
    connections
      .filter((connection) => connection.authorizationStatus === "CONNECTED")
      .map(async (connection) => {
        try {
          const inbox = await graphFetch<{ unreadItemCount: number }>(connection.id, "/me/mailFolders/inbox?$select=unreadItemCount");
          return { unread: inbox.unreadItemCount, healthy: true };
        } catch {
          return { unread: 0, healthy: false };
        }
      }),
  );
  const recentSends = await db.auditEvent.count({
    where: { action: "mail.message.sent", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  const cloudflare = await cloudflareStatus();
  return Response.json({
    metrics: {
      connectedAccounts: connections.length,
      healthyConnections: mailboxStats.filter((item) => item.healthy).length,
      reauthenticationRequired: connections.filter((item) => item.authorizationStatus === "REAUTHENTICATION_REQUIRED").length,
      unreadMail: mailboxStats.reduce((sum, item) => sum + item.unread, 0),
      sharedMailboxes: 0,
      recentSends,
      activeDeployments,
      htmlProjects,
      activeAccessCodes,
    },
    health: {
      database: "HEALTHY",
      microsoftGraph: mailboxStats.length === 0 ? "NOT_TESTED" : mailboxStats.some((item) => item.healthy) ? "HEALTHY" : "DEGRADED",
      encryption: process.env.ENCRYPTION_KEY ? "CONFIGURED" : "MISSING",
      cloudflare: cloudflare.configured ? "CONFIGURED" : "NOT_CONFIGURED",
    },
    connections: connections.slice(0, 5),
    recentEvents,
    recentDeployments,
    recentMailActivity,
  });
}

async function microsoftAccountRoute(request: NextRequest, rawConnectionId: string) {
  const connectionId = id.parse(rawConnectionId);
  if (request.method === "GET") {
    await requirePermission("microsoft:read");
    const account = await db.microsoftConnection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        tenantId: true,
        microsoftUserId: true,
        displayName: true,
        userPrincipalName: true,
        email: true,
        connectedAt: true,
        lastSuccessfulGraphAt: true,
        authorizationStatus: true,
        grantedScopes: true,
        tenantDisplayName: true,
        adminRoleSummary: true,
        owner: { select: { id: true, email: true, displayName: true } },
        mailboxes: { select: { id: true, address: true, displayName: true, isShared: true } },
        auditEvents: { orderBy: { createdAt: "desc" }, take: 30 },
      },
    });
    if (!account) throw new ApiError(404, "Microsoft account not found");
    return Response.json({
      account: {
        ...account,
        tokenCacheHealth: account.authorizationStatus === "CONNECTED" ? "HEALTHY" : "ATTENTION_REQUIRED",
        mailboxAvailability: account.authorizationStatus === "CONNECTED" ? "AVAILABLE" : "UNAVAILABLE",
        capabilities: capabilitiesFromScopes(account.grantedScopes),
      },
    });
  }
  if (request.method === "DELETE") {
    const actor = await requirePermission("microsoft:manage");
    const connection = await db.microsoftConnection.findUnique({ where: { id: connectionId } });
    if (!connection) throw new ApiError(404, "Microsoft account not found");
    await db.microsoftConnection.update({
      where: { id: connectionId },
      data: {
        authorizationStatus: "REVOKED",
        encryptedTokenCache: encrypt("{}", `msal:${connection.tenantId}:${connection.microsoftUserId}`),
      },
    });
    await audit({ actorId: actor.id, connectionId, action: "microsoft.connection.disconnected", targetType: "MicrosoftConnection", targetId: connectionId, result: "SUCCESS" });
    return new Response(null, { status: 204 });
  }
  throw new ApiError(405, "Method not allowed");
}

async function organizationUsers(request: NextRequest) {
  await requirePermission("microsoft:read");
  const requestedId = request.nextUrl.searchParams.get("connectionId");
  const connections = await db.microsoftConnection.findMany({ where: { authorizationStatus: "CONNECTED" } });
  const connection = requestedId ? connections.find((item) => item.id === requestedId) : connections.find((item) => item.grantedScopes.some((scope) => ["user.readbasic.all", "user.read.all"].includes(scope.toLowerCase())));
  if (!connection) throw new ApiError(403, "Directory listing requires a connected account with User.ReadBasic.All or User.Read.All");
  const broad = connection.grantedScopes.some((scope) => scope.toLowerCase() === "user.read.all");
  const nextLink = request.nextUrl.searchParams.get("nextLink");
  const search = request.nextUrl.searchParams.get("search")?.replaceAll('"', "").slice(0, 100);
  const params = new URLSearchParams({
    "$top": "50",
    "$select": `id,displayName,userPrincipalName,mail${broad ? ",accountEnabled" : ""}`,
    ...(search ? { "$filter": `startsWith(displayName,'${search.replaceAll("'", "''")}') or startsWith(userPrincipalName,'${search.replaceAll("'", "''")}')`, "$count": "true" } : {}),
  });
  const result = await graphFetch<GraphCollection<{ id: string; displayName?: string; userPrincipalName?: string; mail?: string; accountEnabled?: boolean }>>(connection.id, nextLink ?? `/users?${params}`);
  const local = await db.microsoftConnection.findMany({ where: { tenantId: connection.tenantId }, select: { id: true, microsoftUserId: true, authorizationStatus: true } });
  return Response.json({
    users: result.value.map((user) => {
      const connected = local.find((item) => item.microsoftUserId === user.id);
      return { ...user, connectionId: connected?.id ?? null, connectionStatus: connected?.authorizationStatus ?? "NOT_CONNECTED", mailboxStatus: "NOT_PROBED", capabilities: broad ? ["Directory profile", "Account state"] : ["Basic directory profile"] };
    }),
    nextLink: result["@odata.nextLink"] ?? null,
    sourceConnectionId: connection.id,
  });
}

async function listAccessCodes() {
  await requirePermission("*");
  const codes = await db.accessCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      maximumUses: true,
      usedCount: true,
      allowedUserId: true,
      allowedRole: true,
      allowedIpRange: true,
      revokedAt: true,
      lastUsedAt: true,
      description: true,
      purpose: true,
      deploymentId: true,
      createdBy: { select: { displayName: true, email: true } },
    },
  });
  return Response.json({ codes });
}

async function revokeAccessCode(rawId: string) {
  const actor = await requirePermission("*");
  const accessCodeId = id.parse(rawId);
  const code = await db.accessCode.update({ where: { id: accessCodeId }, data: { revokedAt: new Date() }, include: { deployment: true } });
  if (code.deployment) {
    await publishDeployment(code.deployment.hostname, { status: "DISABLED" });
    await db.cloudflareDeployment.update({ where: { id: code.deployment.id }, data: { status: "DISABLED", accessPolicy: { type: "ACCESS_CODE", codeHash: "REVOKED" } } });
  }
  await audit({ actorId: actor.id, action: "access_code.revoked", targetType: "AccessCode", targetId: accessCodeId, result: "SUCCESS" });
  return new Response(null, { status: 204 });
}

async function securityOverview() {
  await requirePermission("*");
  const [sessions, roles, connections] = await Promise.all([
    db.session.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, include: { user: { select: { email: true, displayName: true } } } }),
    db.internalRole.findMany({ include: { _count: { select: { users: true } } }, orderBy: { role: "asc" } }),
    db.microsoftConnection.groupBy({ by: ["authorizationStatus"], _count: true }),
  ]);
  const cloudflare = await cloudflareStatus();
  return Response.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      userId: session.userId,
      roleOverride: session.roleOverride,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      user: session.user,
    })),
    roles: Object.entries(rolePermissions).map(([role, permissions]) => ({ role, permissions, assignedUsers: roles.find((item) => item.role === role)?._count.users ?? 0 })),
    policies: { sessionDurationHours: 8, accessCodeLength: 15, maxLoginAttempts: 10, rateLimitWindowMinutes: 15 },
    encryption: { configured: Boolean(process.env.ENCRYPTION_KEY), algorithm: "AES-256-GCM", keyVersion: 1 },
    microsoftConnections: connections.map((item) => ({ status: item.authorizationStatus, count: item._count })),
    cloudflare,
    rateLimit: { trackedClients: attempts.size, storage: "IN_MEMORY_SINGLE_INSTANCE" },
  });
}

async function revokeSession(rawSessionId: string) {
  const actor = await requirePermission("*");
  const sessionId = id.parse(rawSessionId);
  await db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  await audit({ actorId: actor.id, action: "security.session.revoked", targetType: "Session", targetId: sessionId, result: "SUCCESS" });
  return new Response(null, { status: 204 });
}

async function updateUserRoles(request: NextRequest, rawUserId: string) {
  const actor = await requirePermission("*");
  const userId = id.parse(rawUserId);
  if (actor.id === userId) throw new ApiError(422, "Administrators cannot replace their own roles through this endpoint");
  const { roles } = z.object({ roles: z.array(z.nativeEnum(AccessRole)).min(1) }).parse(await request.json());
  await db.$transaction(async (transaction) => {
    await transaction.userRole.deleteMany({ where: { userId } });
    for (const role of roles) {
      const record = await transaction.internalRole.upsert({
        where: { role },
        create: { role, description: role.replaceAll("_", " ").toLowerCase(), permissions: rolePermissions[role] },
        update: { permissions: rolePermissions[role] },
      });
      await transaction.userRole.create({ data: { userId, roleId: record.id } });
    }
  });
  await audit({ actorId: actor.id, action: "security.user.roles.updated", targetType: "User", targetId: userId, result: "SUCCESS", metadata: { roles: roles.join(",") } });
  return Response.json({ roles });
}

function capabilitiesFromScopes(scopes: string[]) {
  const normalized = new Set(scopes.map((scope) => scope.toLowerCase()));
  return {
    readMail: normalized.has("mail.read") || normalized.has("mail.readwrite"),
    writeMail: normalized.has("mail.readwrite"),
    sendMail: normalized.has("mail.send"),
    mailboxSettings: normalized.has("mailboxsettings.read") || normalized.has("mailboxsettings.readwrite"),
    directory: normalized.has("user.readbasic.all") || normalized.has("user.read.all"),
    sharedMail: normalized.has("mail.readwrite.shared") || normalized.has("mail.send.shared"),
  };
}

async function microsoftDiagnostics(request: NextRequest, rawConnectionId: string) {
  const connectionId = id.parse(rawConnectionId);
  await requirePermission("microsoft:read");
  if (request.method === "POST") {
    await requirePermission("mail:send");
    const { recipient } = z.object({ recipient: z.string().email() }).parse(await request.json());
    await graphFetch(connectionId, "/me/sendMail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: "Company Control live diagnostics",
          body: { contentType: "Text", content: "This message confirms the approved Microsoft Graph Mail.Send integration." },
          toRecipients: [{ emailAddress: { address: recipient } }],
        },
        saveToSentItems: true,
      }),
    });
    return Response.json({ test: "send", status: "PASS" });
  }
  const connection = await db.microsoftConnection.findUniqueOrThrow({ where: { id: connectionId } });
  const checks: Array<{ id: string; label: string; path: string; requiredScope: string }> = [
    { id: "profile", label: "Microsoft /me profile", path: "/me?$select=id,displayName,userPrincipalName", requiredScope: "User.Read" },
    { id: "inbox", label: "Inbox listing", path: "/me/mailFolders/inbox/messages?$top=1&$select=id,subject", requiredScope: "Mail.ReadWrite" },
    { id: "settings", label: "Mailbox settings", path: "/me/mailboxSettings?$select=timeZone,language", requiredScope: "MailboxSettings.ReadWrite" },
    { id: "rules", label: "Inbox rules", path: "/me/mailFolders/inbox/messageRules", requiredScope: "MailboxSettings.ReadWrite" },
  ];
  const granted = new Set(connection.grantedScopes.map((scope) => scope.toLowerCase()));
  const results = [];
  for (const check of checks) {
    if (!granted.has(check.requiredScope.toLowerCase())) {
      results.push({ id: check.id, label: check.label, status: "REQUIRES_PERMISSION", requiredScope: check.requiredScope });
      continue;
    }
    try {
      await graphFetch(connectionId, check.path);
      results.push({ id: check.id, label: check.label, status: "PASS", requiredScope: check.requiredScope });
    } catch (error) {
      results.push({
        id: check.id,
        label: check.label,
        status: error instanceof GraphError && error.status === 403 ? "REQUIRES_PERMISSION" : "FAIL",
        requiredScope: check.requiredScope,
        error: error instanceof Error ? error.message : "Microsoft request failed",
        microsoftCode: error instanceof GraphError ? error.code : undefined,
      });
    }
  }
  for (const optional of [
    { id: "directory", label: "Organization directory", requiredScope: "User.ReadBasic.All", path: "/users?$top=1&$select=id,displayName,userPrincipalName" },
    { id: "shared", label: "Shared mailbox permissions", requiredScope: "Mail.ReadWrite.Shared", path: "/me?$select=id" },
  ]) {
    if (!granted.has(optional.requiredScope.toLowerCase())) {
      results.push({ ...optional, status: "REQUIRES_PERMISSION" });
    } else {
      try {
        await graphFetch(connectionId, optional.path);
        results.push({ ...optional, status: "PASS" });
      } catch (error) {
        results.push({ ...optional, status: "FAIL", error: error instanceof Error ? error.message : "Microsoft request failed" });
      }
    }
  }
  return Response.json({ connection: { id: connection.id, displayName: connection.displayName, userPrincipalName: connection.userPrincipalName, authorizationStatus: connection.authorizationStatus }, results });
}

async function htmlProjectRoute(request: NextRequest, path: string[]) {
  const actor = await requirePermission(request.method === "GET" ? "html:*" : "html:*");
  if (path.length === 1 && request.method === "GET") {
    const projects = await db.htmlProject.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        createdBy: { select: { displayName: true, email: true } },
        versions: { orderBy: { version: "desc" }, take: 1, select: { version: true, createdAt: true, document: true } },
        deployments: { orderBy: { updatedAt: "desc" }, take: 1, select: { hostname: true, status: true, deployedAt: true } },
      },
    });
    return Response.json({ projects, templates: visualTemplates.map((template) => ({ id: template.id, name: template.name, category: template.category, description: template.description, layout: template.layout, accent: template.accent })) });
  }
  if (path.length === 1 && request.method === "POST") {
    const input = z.object({ name: z.string().min(1).max(120), template: z.string().max(100).default("compact-card"), provider: z.enum(["microsoft365", "sharepoint", "onedrive", "adobe", "docusign", "company", "custom"]).default("microsoft365") }).parse(await request.json());
    const template = getVisualTemplate(input.template);
    const configuration = defaultBuilderConfiguration(template.id as Parameters<typeof defaultBuilderConfiguration>[0], input.provider);
    const document = buildPageDesign(configuration);
    document.settings.title = input.name;
    const rendered = renderPageDocument(document);
    const project = await db.htmlProject.create({
      data: {
        name: input.name,
        slug: `${slugify(input.name)}-${crypto.randomUUID().slice(0, 8)}`,
        templateId: template.id,
        settings: document.settings,
        createdById: actor.id,
        versions: { create: { version: 1, html: rendered.html, css: rendered.css, document, editorId: actor.id } },
      },
      include: { versions: true },
    });
    await audit({ actorId: actor.id, action: "html.project.created", targetType: "HtmlProject", targetId: project.id, result: "SUCCESS" });
    return Response.json({ project }, { status: 201 });
  }
  const projectId = id.parse(path[1]);
  const project = await db.htmlProject.findUnique({
    where: { id: projectId },
    include: { versions: { orderBy: { version: "desc" } }, deployments: { orderBy: { updatedAt: "desc" } }, createdBy: { select: { displayName: true, email: true } } },
  });
  if (!project) throw new ApiError(404, "HTML project not found");
  if (path[2] === "assets") {
    if (request.method === "GET" && !path[3]) {
      const assets = await db.projectAsset.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, contentType: true, size: true, kind: true, variant: true, createdAt: true } });
      return Response.json({ assets });
    }
    if (request.method === "POST" && !path[3]) {
      const input = z.object({ name: z.string().min(1).max(255), contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "application/pdf", "text/css"]), contentBytes: z.string().max(10_000_000), kind: z.enum(["logo", "image", "document", "css"]), variant: z.enum(["light", "dark", "default"]).optional() }).parse(await request.json());
      let data = Buffer.from(input.contentBytes, "base64");
      if (data.length > 7 * 1024 * 1024) throw new ApiError(413, "Asset exceeds the 7 MB limit");
      if (input.contentType === "image/svg+xml") data = Buffer.from(sanitizeSvg(data.toString("utf8")), "utf8");
      validateAssetBytes(input.contentType, data);
      const digest = sha256(data.toString("base64"));
      const asset = await db.projectAsset.upsert({
        where: { projectId_sha256: { projectId, sha256: digest } },
        create: { projectId, name: input.name, contentType: input.contentType, size: data.length, sha256: digest, data, kind: input.kind, variant: input.variant },
        update: { name: input.name, kind: input.kind, variant: input.variant },
        select: { id: true, name: true, contentType: true, size: true, kind: true, variant: true, createdAt: true },
      });
      await audit({ actorId: actor.id, action: "html.asset.uploaded", targetType: "ProjectAsset", targetId: asset.id, result: "SUCCESS", metadata: { projectId, contentType: input.contentType, size: data.length } });
      return Response.json({ asset }, { status: 201 });
    }
    const assetId = id.parse(path[3]);
    const asset = await db.projectAsset.findFirst({ where: { id: assetId, projectId } });
    if (!asset) throw new ApiError(404, "Asset not found");
    if (request.method === "GET") {
      const bytes = Uint8Array.from(asset.data);
      return new Response(bytes.buffer, { headers: { "Content-Type": asset.contentType, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.name)}`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300" } });
    }
    if (request.method === "DELETE") {
      await db.projectAsset.delete({ where: { id: asset.id } });
      await audit({ actorId: actor.id, action: "html.asset.deleted", targetType: "ProjectAsset", targetId: asset.id, result: "SUCCESS", metadata: { projectId } });
      return new Response(null, { status: 204 });
    }
  }
  if (request.method === "GET") return Response.json({ project });
  if (path[2] === "versions" && request.method === "POST") {
    const input = z.object({ document: pageDocumentSchema, customHtml: z.string().max(1_000_000).optional(), customCss: z.string().max(500_000).refine((value) => !/[<>]/.test(value), "CSS cannot contain HTML delimiters").default(""), javascript: z.string().max(250_000).optional(), state: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT") }).parse(await request.json());
    const [projectAssets, brandAssets] = await Promise.all([
      db.projectAsset.findMany({ where: { projectId }, select: { id: true, contentType: true, data: true } }),
      db.brandAsset.findMany({ where: { id: { in: brandAssetIds(input.document) } }, select: { id: true, contentType: true, data: true } }),
    ]);
    const embeddedAssets = new Map([...projectAssets, ...brandAssets].map((asset) => [asset.id, `data:${asset.contentType};base64,${Buffer.from(asset.data).toString("base64")}`]));
    const rendered = renderPageDocument(input.document, { assetUrl: (assetId) => embeddedAssets.get(assetId) ?? "", dynamicStates: true, status: "waiting" });
    const customHtml = sanitizeHtml(input.customHtml ?? "", {
      allowedTags: [...sanitizeHtml.defaults.allowedTags, "section", "article", "header", "footer", "nav", "main"],
      allowedAttributes: { "*": ["class", "id", "aria-label", "role"], a: ["href", "target", "rel"], img: ["src", "alt", "width", "height"] },
      allowedSchemes: ["https", "http", "data"],
      allowedSchemesByTag: { img: ["https", "data"] },
      enforceHtmlBoundary: true,
    });
    const nextVersion = (project.versions[0]?.version ?? 0) + 1;
    const version = await db.htmlProjectVersion.create({ data: { projectId, version: nextVersion, html: `${rendered.html}${customHtml}`, css: `${rendered.css}\n${input.customCss}`, javascript: undefined, document: input.document, editorId: actor.id, state: input.state } });
    await db.htmlProject.update({ where: { id: projectId }, data: { updatedAt: new Date(), settings: input.document.settings, status: input.state } });
    await audit({ actorId: actor.id, action: "html.project.version.created", targetType: "HtmlProject", targetId: projectId, result: "SUCCESS", metadata: { version: nextVersion } });
    return Response.json({ version }, { status: 201 });
  }
  if (path[2] === "duplicate" && request.method === "POST") {
    const copy = await db.htmlProject.create({
      data: {
        name: `${project.name} Copy`,
        slug: `${project.slug.split("-").slice(0, -1).join("-") || "project"}-${crypto.randomUUID().slice(0, 8)}`,
        createdById: actor.id,
        templateId: project.templateId,
        settings: project.settings ?? undefined,
        versions: { create: { version: 1, html: project.versions[0]?.html ?? "", css: project.versions[0]?.css, javascript: project.versions[0]?.javascript, document: project.versions[0]?.document ?? undefined, editorId: actor.id } },
      },
    });
    await audit({ actorId: actor.id, action: "html.project.duplicated", targetType: "HtmlProject", targetId: copy.id, result: "SUCCESS", metadata: { sourceProjectId: projectId } });
    return Response.json({ project: copy }, { status: 201 });
  }
  if (request.method === "PATCH") {
    const input = z.object({ name: z.string().min(1).max(120).optional(), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional() }).strict().parse(await request.json());
    const updated = await db.htmlProject.update({ where: { id: projectId }, data: input });
    await audit({ actorId: actor.id, action: "html.project.updated", targetType: "HtmlProject", targetId: projectId, result: "SUCCESS", metadata: { fields: Object.keys(input).join(",") } });
    return Response.json({ project: updated });
  }
  if (request.method === "DELETE") {
    await db.htmlProject.update({ where: { id: projectId }, data: { status: "ARCHIVED" } });
    await audit({ actorId: actor.id, action: "html.project.archived", targetType: "HtmlProject", targetId: projectId, result: "SUCCESS" });
    return new Response(null, { status: 204 });
  }
  throw new ApiError(405, "Method not allowed");
}

async function brandAssetRoute(request: NextRequest, path: string[]) {
  const actor = await requirePermission("html:*");
  if (path.length === 1 && request.method === "GET") {
    const includeArchived = request.nextUrl.searchParams.get("archived") === "true";
    const assets = await db.brandAsset.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [{ isDefault: "desc" }, { favorite: "desc" }, { lastUsedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, name: true, contentType: true, size: true, category: true, variant: true, tags: true, favorite: true, isDefault: true, archivedAt: true, lastUsedAt: true, createdAt: true, updatedAt: true },
    });
    return Response.json({ assets: assets.map((asset) => ({ ...asset, url: `/api/v1/brand-assets/${asset.id}/content` })) });
  }
  if (path.length === 1 && request.method === "POST") {
    const input = z.object({
      name: z.string().min(1).max(255),
      contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]),
      contentBytes: z.string().max(10_000_000),
      category: z.string().min(1).max(80).default("Company Logos"),
      variant: z.enum(["Light", "Dark", "Full Color", "Monochrome", "Icon", "Wordmark"]).default("Full Color"),
      tags: z.array(z.string().min(1).max(40)).max(20).default([]),
      favorite: z.boolean().default(false),
      isDefault: z.boolean().default(false),
    }).parse(await request.json());
    let data = Buffer.from(input.contentBytes, "base64");
    if (data.length > 7 * 1024 * 1024) throw new ApiError(413, "Logo exceeds the 7 MB limit");
    if (input.contentType === "image/svg+xml") data = Buffer.from(sanitizeSvg(data.toString("utf8")), "utf8");
    validateAssetBytes(input.contentType, data);
    const digest = sha256(data.toString("base64"));
    if (input.isDefault) await db.brandAsset.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const asset = await db.brandAsset.upsert({
      where: { sha256: digest },
      create: { name: input.name, contentType: input.contentType, size: data.length, sha256: digest, data, category: input.category, variant: input.variant, tags: input.tags, favorite: input.favorite, isDefault: input.isDefault, createdById: actor.id },
      update: { name: input.name, category: input.category, variant: input.variant, tags: input.tags, favorite: input.favorite, isDefault: input.isDefault, archivedAt: null },
      select: { id: true, name: true, contentType: true, size: true, category: true, variant: true, tags: true, favorite: true, isDefault: true, archivedAt: true, lastUsedAt: true, createdAt: true, updatedAt: true },
    });
    await audit({ actorId: actor.id, action: "brand_asset.uploaded", targetType: "BrandAsset", targetId: asset.id, result: "SUCCESS", metadata: { contentType: input.contentType, size: data.length, variant: input.variant } });
    return Response.json({ asset: { ...asset, url: `/api/v1/brand-assets/${asset.id}/content` } }, { status: 201 });
  }
  const assetId = id.parse(path[1]);
  const asset = await db.brandAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new ApiError(404, "Brand asset not found");
  if (path[2] === "content" && request.method === "GET") {
    const bytes = Uint8Array.from(asset.data);
    return new Response(bytes.buffer, { headers: { "Content-Type": asset.contentType, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.name)}`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300" } });
  }
  if (path.length === 2 && request.method === "PATCH") {
    const input = z.object({
      name: z.string().min(1).max(255).optional(),
      category: z.string().min(1).max(80).optional(),
      variant: z.enum(["Light", "Dark", "Full Color", "Monochrome", "Icon", "Wordmark"]).optional(),
      tags: z.array(z.string().min(1).max(40)).max(20).optional(),
      favorite: z.boolean().optional(),
      isDefault: z.boolean().optional(),
      archived: z.boolean().optional(),
      markUsed: z.boolean().optional(),
    }).strict().parse(await request.json());
    if (input.isDefault) await db.brandAsset.updateMany({ where: { isDefault: true, id: { not: assetId } }, data: { isDefault: false } });
    const updated = await db.brandAsset.update({
      where: { id: assetId },
      data: {
        name: input.name, category: input.category, variant: input.variant, tags: input.tags,
        favorite: input.favorite, isDefault: input.isDefault,
        archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
        lastUsedAt: input.markUsed ? new Date() : undefined,
      },
      select: { id: true, name: true, contentType: true, size: true, category: true, variant: true, tags: true, favorite: true, isDefault: true, archivedAt: true, lastUsedAt: true, createdAt: true, updatedAt: true },
    });
    await audit({ actorId: actor.id, action: input.archived ? "brand_asset.archived" : "brand_asset.updated", targetType: "BrandAsset", targetId: assetId, result: "SUCCESS", metadata: { fields: Object.keys(input).join(",") } });
    return Response.json({ asset: { ...updated, url: `/api/v1/brand-assets/${assetId}/content` } });
  }
  if (path.length === 2 && request.method === "DELETE") {
    await db.brandAsset.delete({ where: { id: assetId } });
    await audit({ actorId: actor.id, action: "brand_asset.deleted", targetType: "BrandAsset", targetId: assetId, result: "SUCCESS" });
    return new Response(null, { status: 204 });
  }
  throw new ApiError(405, "Method not allowed");
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "project";
}

function brandAssetIds(document: PageDocument) {
  const ids = new Set<string>();
  const visit = (nodes: PageNode[]) => nodes.forEach((node) => {
    if (node.assetId) ids.add(node.assetId);
    if (node.children) visit(node.children);
  });
  visit(document.nodes);
  if (document.settings.builder?.companyLogoAssetId) ids.add(document.settings.builder.companyLogoAssetId);
  return [...ids];
}

async function hydrateAuthorizationBrandAssets(status: NonNullable<Awaited<ReturnType<typeof authorizationStatus>>>) {
  const parsed = pageDocumentSchema.safeParse(status.pageProject?.versions[0]?.document);
  if (!parsed.success) return status;
  const assets = await db.brandAsset.findMany({ where: { id: { in: brandAssetIds(parsed.data) } }, select: { id: true, contentType: true, data: true } });
  if (!assets.length) return status;
  const sources = new Map(assets.map((asset) => [asset.id, `data:${asset.contentType};base64,${Buffer.from(asset.data).toString("base64")}`]));
  const hydrate = (node: PageNode): PageNode => {
    const source = node.assetId ? sources.get(node.assetId) : undefined;
    return { ...node, assetId: source ? undefined : node.assetId, src: source ?? node.src, children: node.children?.map(hydrate) };
  };
  const document: PageDocument = { ...parsed.data, nodes: parsed.data.nodes.map(hydrate) };
  return {
    ...status,
    pageProject: status.pageProject ? {
      ...status.pageProject,
      versions: status.pageProject.versions.map((version, index) => index === 0 ? { ...version, document } : version),
    } : status.pageProject,
  };
}

async function publicDeploymentDeviceSession(request: NextRequest, deploymentIdValue: string) {
  const deploymentId = id.parse(deploymentIdValue);
  const deployment = await db.cloudflareDeployment.findUnique({ where: { id: deploymentId }, select: { id: true, hostname: true, projectId: true, status: true, expiresAt: true } });
  if (!deployment || deployment.status !== "ACTIVE" || (deployment.expiresAt && deployment.expiresAt <= new Date())) throw new ApiError(404, "Active deployment not found");
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).hostname !== deployment.hostname) throw new ApiError(403, "Deployment origin is not allowed");
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  enforceRateLimit(`public-device:${deployment.id}:${ip}`);
  const input = z.object({ previousSessionId: z.string().optional(), previousStatusToken: z.string().min(40).optional() }).parse(await request.json().catch(() => ({})));
  let replacePrevious = false;
  if (input.previousSessionId && input.previousStatusToken) {
    const previous = await authorizationStatus(input.previousSessionId, input.previousStatusToken);
    replacePrevious = previous?.pageProject?.id === deployment.projectId && previous.status === "PENDING";
  }
  const { publicId, statusToken } = await startDeviceAuthorization(deployment.projectId);
  const presentation = await authorizationStatus(publicId, statusToken);
  if (!presentation?.userCode || !presentation.verificationUri) throw new ApiError(503, "Microsoft device authorization is unavailable");
  if (replacePrevious && input.previousSessionId) {
    await db.microsoftAuthorizationSession.updateMany({ where: { publicId: input.previousSessionId, status: "PENDING" }, data: { status: "EXPIRED", errorCode: "REPLACED" } });
  }
  await audit({ action: "microsoft.authorization.deployment_visitor_started", targetType: "CloudflareDeployment", targetId: deployment.id, result: "SUCCESS", metadata: { authorizationSessionId: publicId } });
  return Response.json({
    session: { sessionId: publicId, statusToken, userCode: presentation.userCode, verificationUri: presentation.verificationUri, expiresAt: presentation.expiresAt, status: presentation.status },
  }, { status: 201, headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Cache-Control": "no-store" } });
}

function sanitizeSvg(value: string) {
  if (!value.trimStart().startsWith("<svg")) throw new ApiError(400, "Invalid SVG document");
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*(['"])(?!#|data:image\/)[\s\S]*?\1/gi, "");
}

function validateAssetBytes(contentType: string, data: Buffer) {
  const signatures: Record<string, boolean> = {
    "image/png": data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/jpeg": data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
    "image/webp": data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP",
    "application/pdf": data.subarray(0, 5).toString() === "%PDF-",
    "image/svg+xml": data.toString("utf8").trimStart().startsWith("<svg"),
    "text/css": !data.includes(0),
  };
  if (!signatures[contentType]) throw new ApiError(400, `Uploaded data does not match ${contentType}`);
}

async function cloudflareRoute(request: NextRequest, path: string[]) {
  const actor = await requirePermission("deployment:*");
  if (path[1] === "configuration") {
    if (request.method === "GET") return Response.json(await cloudflareStatus());
    const input = z.object({
      action: z.enum(["TEST", "SAVE"]),
      authType: z.enum(["API_TOKEN", "GLOBAL_API_KEY"]),
      email: z.string().email().optional(),
      credential: z.string().min(20).max(500),
      accountId: z.string().max(100).optional(),
      accountName: z.string().max(200).optional(),
      zoneId: z.string().max(100).optional(),
      zoneName: z.string().max(255).optional(),
      baseDomain: z.string().max(255).optional(),
    }).superRefine((value, context) => {
      if (value.authType === "GLOBAL_API_KEY" && !value.email) context.addIssue({ code: "custom", message: "Cloudflare email is required for a Global API Key", path: ["email"] });
      if (value.action === "SAVE" && (!value.accountId || !value.zoneId || !value.baseDomain)) context.addIssue({ code: "custom", message: "Select an account, zone, and base domain before saving" });
    }).parse(await request.json());
    const discovered = await discoverCloudflare(input);
    if (input.action === "TEST") return Response.json(discovered);
    const selectedAccount = discovered.accounts.find((account) => account.id === input.accountId);
    const selectedZone = discovered.zones.find((zone) => zone.id === input.zoneId && zone.account.id === input.accountId);
    if (!selectedAccount || !selectedZone) throw new ApiError(422, "Selected Cloudflare account or zone is not available to these credentials");
    await db.cloudflareConfiguration.upsert({
      where: { id: "default" },
      create: {
        authType: input.authType,
        email: input.authType === "GLOBAL_API_KEY" ? input.email : null,
        encryptedCredential: encrypt(input.credential, "cloudflare:default"),
        accountId: selectedAccount.id,
        accountName: selectedAccount.name,
        zoneId: selectedZone.id,
        zoneName: selectedZone.name,
        baseDomain: input.baseDomain,
        lastTestedAt: new Date(),
        lastTestStatus: "SUCCESS",
      },
      update: {
        authType: input.authType,
        email: input.authType === "GLOBAL_API_KEY" ? input.email : null,
        encryptedCredential: encrypt(input.credential, "cloudflare:default"),
        accountId: selectedAccount.id,
        accountName: selectedAccount.name,
        zoneId: selectedZone.id,
        zoneName: selectedZone.name,
        baseDomain: input.baseDomain,
        credentialKeyVersion: { increment: 1 },
        lastTestedAt: new Date(),
        lastTestStatus: "SUCCESS",
      },
    });
    await audit({ actorId: actor.id, action: "cloudflare.configuration.saved", targetType: "CloudflareConfiguration", targetId: "default", result: "SUCCESS", metadata: { authType: input.authType, accountId: selectedAccount.id, zoneId: selectedZone.id, baseDomain: input.baseDomain ?? null } });
    return Response.json(await cloudflareStatus());
  }
  if (path[1] === "hostname" && request.method === "GET") {
    const status = await cloudflareStatus();
    if (!status.configured || !status.baseDomain) throw new CloudflareError(503, "Configure Cloudflare before generating a hostname");
    let hostname: string;
    do { hostname = `${randomHostnameLabel()}.${status.baseDomain}`; }
    while (await db.cloudflareDeployment.findUnique({ where: { hostname } }));
    return Response.json({ hostname });
  }
  if (path[1] === "status" && request.method === "GET") {
    const status = await cloudflareStatus();
    if (!status.configured) return Response.json({ ...status, connectivity: "NOT_CONFIGURED" });
    try {
      const account = await verifyCloudflare();
      return Response.json({ ...status, connectivity: "HEALTHY", accountName: account.name });
    } catch (error) {
      return Response.json({ ...status, connectivity: "FAILED", error: error instanceof Error ? error.message : "Cloudflare check failed" });
    }
  }
  if (path.length === 1 && request.method === "GET") {
    const deployments = await db.cloudflareDeployment.findMany({ orderBy: { createdAt: "desc" }, include: { project: { select: { name: true, status: true } } } });
    return Response.json({ deployments });
  }
  if (path.length === 1 && request.method === "POST") {
    const input = z.object({
      projectId: z.string().min(1),
      policy: z.enum(["PUBLIC", "PRIVATE", "ACCESS_CODE"]).default("PUBLIC"),
      expiresAt: z.coerce.date().optional(),
      proposedHostname: z.string().max(255).optional(),
      cloudflare: z.object({
        authType: z.enum(["API_TOKEN", "GLOBAL_API_KEY"]),
        email: z.string().email().optional(),
        credential: z.string().min(20).max(500),
        accountId: z.string().max(100),
        zoneId: z.string().max(100),
        baseDomain: z.string().max(255),
        save: z.boolean().default(false),
      }).optional(),
    }).parse(await request.json());
    let runtimeCredentials: CloudflareCredentials | undefined;
    let baseDomain: string | null;
    if (input.cloudflare) {
      const discovered = await discoverCloudflare(input.cloudflare);
      const account = discovered.accounts.find((item) => item.id === input.cloudflare!.accountId);
      const zone = discovered.zones.find((item) => item.id === input.cloudflare!.zoneId && item.account.id === input.cloudflare!.accountId);
      if (!account || !zone) throw new ApiError(422, "Selected Cloudflare account or zone is not available");
      if (input.cloudflare.baseDomain !== zone.name && !input.cloudflare.baseDomain.endsWith(`.${zone.name}`)) throw new ApiError(422, "Base domain must belong to the selected Cloudflare zone");
      runtimeCredentials = { authType: input.cloudflare.authType, credential: input.cloudflare.credential, email: input.cloudflare.email, accountId: account.id, accountName: account.name, zoneId: zone.id, zoneName: zone.name, baseDomain: input.cloudflare.baseDomain };
      baseDomain = input.cloudflare.baseDomain;
      if (input.cloudflare.save) {
        await db.cloudflareConfiguration.upsert({
          where: { id: "default" },
          create: { authType: input.cloudflare.authType, email: input.cloudflare.authType === "GLOBAL_API_KEY" ? input.cloudflare.email : null, encryptedCredential: encrypt(input.cloudflare.credential, "cloudflare:default"), accountId: account.id, accountName: account.name, zoneId: zone.id, zoneName: zone.name, baseDomain, lastTestedAt: new Date(), lastTestStatus: "SUCCESS" },
          update: { authType: input.cloudflare.authType, email: input.cloudflare.authType === "GLOBAL_API_KEY" ? input.cloudflare.email : null, encryptedCredential: encrypt(input.cloudflare.credential, "cloudflare:default"), accountId: account.id, accountName: account.name, zoneId: zone.id, zoneName: zone.name, baseDomain, credentialKeyVersion: { increment: 1 }, lastTestedAt: new Date(), lastTestStatus: "SUCCESS" },
        });
        await audit({ actorId: actor.id, action: "cloudflare.configuration.saved", targetType: "CloudflareConfiguration", targetId: "default", result: "SUCCESS", metadata: { authType: input.cloudflare.authType, accountId: account.id, zoneId: zone.id, baseDomain } });
      }
    } else {
      const status = await cloudflareStatus();
      if (!status.configured) throw new CloudflareError(503, "Connect Cloudflare in the publish drawer before deploying");
      baseDomain = status.baseDomain;
    }
    if (!baseDomain) throw new CloudflareError(503, "Cloudflare base domain is not configured");
    const project = await db.htmlProject.findUnique({ where: { id: input.projectId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!project?.versions[0]) throw new ApiError(404, "Project or project version not found");
    let hostname = input.proposedHostname?.toLowerCase().trim();
    if (hostname) {
      if (!hostname.endsWith(`.${baseDomain}`) || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\./.test(hostname)) throw new ApiError(422, `Hostname must be a valid subdomain of ${baseDomain}`);
      if (await db.cloudflareDeployment.findUnique({ where: { hostname } })) throw new ApiError(409, "That hostname is already in use. Generate another.");
    } else {
      do { hostname = `${randomHostnameLabel()}.${baseDomain}`; }
      while (await db.cloudflareDeployment.findUnique({ where: { hostname } }));
    }
    const plaintextCode = input.policy === "ACCESS_CODE" ? randomAccessCode() : undefined;
    const deployment = await db.cloudflareDeployment.create({
      data: {
        projectId: project.id,
        deploymentId: crypto.randomUUID(),
        hostname,
        expiresAt: input.expiresAt,
        accessPolicy: { type: input.policy, ...(plaintextCode ? { codeHash: sha256(plaintextCode) } : {}) },
      },
    });
    if (plaintextCode) {
      await db.accessCode.create({
        data: {
          codeHash: hashSecret(plaintextCode),
          createdById: actor.id,
          deploymentId: deployment.id,
          purpose: "DEPLOYMENT",
          expiresAt: input.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          maximumUses: 100,
          description: `Deployment access: ${hostname}`,
        },
      });
    }
    try {
      await publishDeployment(hostname, deploymentPayload(deployment.id, project.versions[0], input.policy, plaintextCode, input.expiresAt), runtimeCredentials);
      await db.cloudflareDeployment.update({ where: { id: deployment.id }, data: { status: "ACTIVE", deployedAt: new Date() } });
      await audit({ actorId: actor.id, action: "cloudflare.deployment.created", targetType: "CloudflareDeployment", targetId: deployment.id, result: "SUCCESS", metadata: { hostname, policy: input.policy } });
      return Response.json({ deployment: { ...deployment, status: "ACTIVE" }, accessCode: plaintextCode }, { status: 201 });
    } catch (error) {
      await db.cloudflareDeployment.update({ where: { id: deployment.id }, data: { status: "FAILED" } });
      throw error;
    }
  }
  const deploymentId = id.parse(path[1]);
  const deployment = await db.cloudflareDeployment.findUnique({ where: { id: deploymentId }, include: { project: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } } } });
  if (!deployment) throw new ApiError(404, "Deployment not found");
  if (request.method === "PATCH") {
    const { action } = z.object({ action: z.enum(["ENABLE", "DISABLE", "REDEPLOY"]) }).parse(await request.json());
    if (action === "DISABLE") {
      await publishDeployment(deployment.hostname, { status: "DISABLED" });
      await db.cloudflareDeployment.update({ where: { id: deploymentId }, data: { status: "DISABLED" } });
    } else {
      const latest = deployment.project.versions[0];
      if (!latest) throw new ApiError(422, "Project has no version to deploy");
      const policy = deployment.accessPolicy as { type?: "PUBLIC" | "PRIVATE" | "ACCESS_CODE"; codeHash?: string } | null;
      await publishDeployment(deployment.hostname, {
        ...deploymentPayload(deployment.id, latest, policy?.type ?? "PUBLIC", undefined, deployment.expiresAt ?? undefined),
        accessCodeHash: policy?.codeHash,
      });
      await db.cloudflareDeployment.update({ where: { id: deploymentId }, data: { status: "ACTIVE", deployedAt: new Date() } });
    }
    await audit({ actorId: actor.id, action: `cloudflare.deployment.${action.toLowerCase()}`, targetType: "CloudflareDeployment", targetId: deploymentId, result: "SUCCESS" });
    return Response.json({ status: action === "DISABLE" ? "DISABLED" : "ACTIVE" });
  }
  if (request.method === "DELETE") {
    await deleteDeployment(deployment.hostname);
    await db.cloudflareDeployment.delete({ where: { id: deploymentId } });
    await audit({ actorId: actor.id, action: "cloudflare.deployment.deleted", targetType: "CloudflareDeployment", targetId: deploymentId, result: "SUCCESS", metadata: { hostname: deployment.hostname } });
    return new Response(null, { status: 204 });
  }
  throw new ApiError(405, "Method not allowed");
}

function deploymentPayload(
  id: string,
  version: { html: string; css: string | null; document?: unknown },
  policy: "PUBLIC" | "PRIVATE" | "ACCESS_CODE",
  accessCode: string | undefined,
  expiresAt: Date | undefined,
) {
  const hasDeviceCode = version.html.includes('data-dynamic="microsoft-device-code"');
  const deploymentHtml = embedProviderAssets(hasDeviceCode ? version.html.replaceAll(">XXXX-XXXX<", ">—<") : version.html);
  let systemScript: string | undefined;
  let scriptNonce: string | undefined;
  let connectOrigin: string | undefined;
  if (hasDeviceCode) {
    const base = config().APP_BASE_URL.replace(/\/$/, "");
    const appUrl = new URL(base);
    if (appUrl.protocol !== "https:") throw new ApiError(422, "Published Microsoft pages require a public HTTPS APP_BASE_URL");
    connectOrigin = appUrl.origin;
    scriptNonce = randomBytes(18).toString("base64url");
    const startEndpoint = `${base}/api/v1/public/deployments/${encodeURIComponent(id)}/device/start`;
    const parsed = pageDocumentSchema.safeParse(version.document);
    const behavior = parsed.success ? parsed.data.settings.builder : undefined;
    const redirect = behavior?.redirectUrl && isSafeRedirectUrl(behavior.redirectUrl) ? behavior.redirectUrl : "";
    systemScript = `(()=>{"use strict";const startEndpoint=${safeScriptJson(startEndpoint)},redirect=${safeScriptJson(redirect)};let session=null,refreshTimer=null,stopped=false,popup=null,feedbackTimer=null;const nodes=s=>document.querySelectorAll(s);function status(text){nodes('[data-node-id="auth-status"]').forEach(n=>{n.dataset.status="pending";const dot=document.createElement("span");dot.className="pb-status-dot";n.replaceChildren(dot,document.createTextNode(text))})}function apply(next){session=next;nodes('[data-dynamic="microsoft-device-code"]').forEach(n=>n.textContent=next.userCode);nodes('[data-action="open-microsoft"]').forEach(n=>n.setAttribute("href",next.verificationUri));status("Waiting for Microsoft…");clearTimeout(refreshTimer);const wait=Math.max(1000,new Date(next.expiresAt).getTime()-Date.now()-30000);refreshTimer=setTimeout(()=>{if(!stopped)start(true)},wait)}async function copyCode(){if(!session?.userCode)return;try{await navigator.clipboard.writeText(session.userCode);const feedback=document.querySelector('[data-node-id="auth-copy-feedback"]');if(feedback){feedback.classList.add("is-visible");clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>feedback.classList.remove("is-visible"),1400)}}catch{}}function openMicrosoft(){if(!session?.verificationUri)return;popup=window.open(session.verificationUri,"microsoft-auth","width=520,height=720,resizable=yes,scrollbars=yes");void copyCode();if(!popup)nodes('[data-node-id="auth-popup-fallback"]').forEach(n=>n.classList.add("is-visible"))}async function start(replace=false){try{const body=replace&&session?{previousSessionId:session.sessionId,previousStatusToken:session.statusToken}:{};const response=await fetch(startEndpoint,{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:JSON.stringify(body),credentials:"omit",cache:"no-store"});if(!response.ok)throw new Error("start");apply((await response.json()).session);poll()}catch{setTimeout(()=>start(replace),5000)}}async function poll(){if(stopped||!session)return;try{const endpoint=startEndpoint.replace(/public\\/deployments\\/.+\\/device\\/start$/,"microsoft/device/"+encodeURIComponent(session.sessionId)+"/status")+"?token="+encodeURIComponent(session.statusToken);const response=await fetch(endpoint,{credentials:"omit",cache:"no-store"});if(!response.ok)throw new Error("status");const data=(await response.json()).authorization;session={...session,...data};if(data.userCode)nodes('[data-dynamic="microsoft-device-code"]').forEach(n=>n.textContent=data.userCode);if(data.status==="CONNECTED"){stopped=true;clearTimeout(refreshTimer);try{popup?.close()}catch{}if(redirect)location.replace(redirect);return}if(data.status==="EXPIRED"){start(true);return}if(["FAILED","CANCELLED"].includes(data.status)){start(true);return}setTimeout(poll,3000)}catch{setTimeout(poll,5000)}}document.addEventListener("click",event=>{const target=event.target.closest("[data-action]");if(!target||!session)return;if(target.dataset.nodeId==="auth-popup-fallback")return;if(target.dataset.action==="copy-device-code"){event.preventDefault();void copyCode()}if(target.dataset.action==="open-microsoft"){event.preventDefault();openMicrosoft()}});start()})();`;
  }
  return {
    id,
    status: "ACTIVE",
    html: deploymentHtml,
    css: version.css ?? "",
    javascript: "",
    policy,
    accessCodeHash: accessCode ? sha256(accessCode) : undefined,
    expiresAt: expiresAt?.toISOString(),
    systemScript,
    scriptNonce,
    connectOrigin,
  };
}

async function publishMicrosoftSessionPage(input: { pageProjectId: string; deploymentId: string; publicId: string; statusToken: string }) {
  const deployment = await db.cloudflareDeployment.findFirst({
    where: { id: input.deploymentId, projectId: input.pageProjectId, status: "ACTIVE" },
    include: { project: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } } },
  });
  if (!deployment?.project.versions[0]) throw new ApiError(404, "Active project deployment not found");
  const session = await authorizationStatus(input.publicId, input.statusToken);
  if (!session?.userCode || !session.verificationUri) throw new ApiError(409, "Microsoft device challenge is not ready");
  const parsed = pageDocumentSchema.safeParse(deployment.project.versions[0].document);
  if (!parsed.success) throw new ApiError(422, "The deployed project is not a visual Microsoft connection page");
  const [assets, brandAssets] = await Promise.all([
    db.projectAsset.findMany({ where: { projectId: input.pageProjectId }, select: { id: true, contentType: true, data: true } }),
    db.brandAsset.findMany({ where: { id: { in: brandAssetIds(parsed.data) } }, select: { id: true, contentType: true, data: true } }),
  ]);
  const embedded = new Map([...assets, ...brandAssets].map((asset) => [asset.id, `data:${asset.contentType};base64,${Buffer.from(asset.data).toString("base64")}`]));
  const rendered = renderPageDocument(parsed.data, { deviceCode: session.userCode, verificationUri: session.verificationUri, status: session.status, assetUrl: (assetId) => embedded.get(assetId) ?? "" });
  const base = config().APP_BASE_URL.replace(/\/$/, "");
  const appUrl = new URL(base);
  if (appUrl.protocol !== "https:") throw new ApiError(422, "Cloudflare session binding requires a public HTTPS APP_BASE_URL");
  const origin = appUrl.origin;
  const endpoint = `${base}/api/v1/microsoft/device/${encodeURIComponent(input.publicId)}/status?token=${encodeURIComponent(input.statusToken)}`;
  const restartEndpoint = `${base}/api/v1/microsoft/device/${encodeURIComponent(input.publicId)}/restart?token=${encodeURIComponent(input.statusToken)}`;
  const behavior = parsed.data.settings.builder;
  const redirectUrl = behavior?.redirectUrl && isSafeRedirectUrl(behavior.redirectUrl) ? behavior.redirectUrl : "";
  const scriptNonce = randomBytes(18).toString("base64url");
  const script = `(()=>{"use strict";const endpoint=${safeScriptJson(endpoint)},restartEndpoint=${safeScriptJson(restartEndpoint)},redirect=${safeScriptJson(redirectUrl)};let code=${safeScriptJson(session.userCode)},verificationUri=${safeScriptJson(session.verificationUri)},popup=null,feedbackTimer=null;const statusNodes=()=>document.querySelectorAll(".pb-status");function status(text){statusNodes().forEach(node=>node.textContent=text)}async function copyCode(){try{await navigator.clipboard.writeText(code);const feedback=document.querySelector('[data-node-id="auth-copy-feedback"]');if(feedback){feedback.classList.add("is-visible");clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>feedback.classList.remove("is-visible"),1400)}}catch{}}async function replace(){const response=await fetch(restartEndpoint,{method:"POST",credentials:"omit"});if(response.ok){const result=await response.json();const next=result.publishedConnectUrl||result.connectUrl;if(next)location.replace(next)}else setTimeout(replace,5000)}async function poll(){try{const response=await fetch(endpoint,{credentials:"omit",cache:"no-store"});if(!response.ok)throw new Error("status");const data=(await response.json()).authorization;code=data.userCode||code;verificationUri=data.verificationUri||verificationUri;document.querySelectorAll('[data-dynamic="microsoft-device-code"]').forEach(node=>node.textContent=code);document.querySelectorAll('[data-action="open-microsoft"]').forEach(node=>node.setAttribute("href",verificationUri));if(data.status==="CONNECTED"){try{popup?.close()}catch{}if(redirect)location.replace(redirect);return}if(["EXPIRED","FAILED","CANCELLED"].includes(data.status)){void replace();return}setTimeout(poll,3000)}catch{setTimeout(poll,5000)}}document.addEventListener("click",event=>{const target=event.target.closest("[data-action]");if(!target)return;if(target.dataset.nodeId==="auth-popup-fallback")return;if(target.dataset.action==="copy-device-code"){event.preventDefault();void copyCode()}if(target.dataset.action==="open-microsoft"){event.preventDefault();popup=window.open(verificationUri,"microsoft-auth","width=520,height=720,resizable=yes,scrollbars=yes");void copyCode();if(!popup)document.querySelector('[data-node-id="auth-popup-fallback"]')?.classList.add("is-visible")}});status("Waiting for Microsoft…");poll()})();`;
  const policy = deployment.accessPolicy as { type?: "PUBLIC" | "PRIVATE" | "ACCESS_CODE"; codeHash?: string } | null;
  await publishDeployment(deployment.hostname, {
    id: deployment.id,
    status: "ACTIVE",
    html: embedProviderAssets(rendered.html),
    css: rendered.css,
    javascript: "",
    systemScript: script,
    scriptNonce,
    connectOrigin: origin,
    policy: policy?.type ?? "PUBLIC",
    accessCodeHash: policy?.codeHash,
    expiresAt: deployment.expiresAt?.toISOString(),
  });
  return `https://${deployment.hostname}`;
}

function safeScriptJson(value: string) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

const providerAssetMimeTypes: Record<string, string> = {
  "/providers/microsoft365/microsoft365.svg": "image/svg+xml",
  "/providers/sharepoint/sharepoint.svg": "image/svg+xml",
  "/providers/onedrive/onedrive.svg": "image/svg+xml",
  "/providers/adobe/pdf-file-icon.png": "image/png",
  "/providers/docusign/docusign.svg": "image/svg+xml",
};
let embeddedProviderAssets: Map<string, string> | null = null;

function embedProviderAssets(html: string) {
  if (!embeddedProviderAssets) {
    embeddedProviderAssets = new Map(Object.entries(providerAssetMimeTypes).map(([publicPath, mime]) => {
      const bytes = readFileSync(resolve(process.cwd(), "public", publicPath.replace(/^\/+/, "").replace(/^providers\//, "providers/")));
      return [publicPath, `data:${mime};base64,${bytes.toString("base64")}`];
    }));
  }
  let result = html;
  for (const [publicPath, dataUrl] of embeddedProviderAssets) result = result.replaceAll(`"${publicPath}"`, `"${dataUrl}"`);
  return result;
}

async function outlookLaunchRoute(request: NextRequest, path: string[]) {
  if (path[1] === "exchange" && request.method === "POST") {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    enforceRateLimit(`launch:${ip}`);
    const { launchId } = z.object({ launchId: z.string().regex(/^[A-Za-z0-9_-]{40,100}$/) }).parse(await request.json());
    const launch = await db.outlookLaunchRequest.findUnique({ where: { tokenHash: sha256(launchId) } });
    if (!launch || launch.usedAt || launch.expiresAt <= new Date()) {
      if (launch) await audit({ actorId: launch.requestedById, connectionId: launch.connectionId, action: "desktop.launch.rejected", targetType: "Message", targetId: launch.messageId, result: "FAILURE", metadata: { launchRequestId: launch.id, reason: launch.usedAt ? "already_used" : "expired" } });
      throw new ApiError(401, "Launch request is invalid, expired, or already used");
    }
    const consumed = await db.outlookLaunchRequest.updateMany({ where: { id: launch.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) {
      await audit({ actorId: launch.requestedById, connectionId: launch.connectionId, action: "desktop.launch.rejected", targetType: "Message", targetId: launch.messageId, result: "FAILURE", metadata: { launchRequestId: launch.id, reason: "concurrent_consumption" } });
      throw new ApiError(409, "Launch request was already consumed");
    }
    await audit({ actorId: launch.requestedById, connectionId: launch.connectionId, action: "desktop.outlook.launched", targetType: "Message", targetId: launch.messageId, result: "SUCCESS", metadata: { launchRequestId: launch.id } });
    return Response.json({ webLink: launch.webLink });
  }
  if (request.method === "POST") {
    const actor = await requirePermission("mail:read");
    const input = z.object({ connectionId: z.string().min(1), messageId: z.string().min(1) }).parse(await request.json());
    const message = await graphFetch<{ webLink?: string }>(input.connectionId, `/me/messages/${encodeURIComponent(input.messageId)}?$select=webLink`);
    if (!message.webLink || !isAllowedOutlookWebLink(message.webLink)) throw new ApiError(422, "Microsoft did not return a safe Outlook web link");
    const launchId = randomBytes(32).toString("base64url");
    const launch = await db.outlookLaunchRequest.create({
      data: {
        tokenHash: sha256(launchId),
        connectionId: input.connectionId,
        messageId: input.messageId,
        webLink: message.webLink,
        expiresAt: new Date(Date.now() + 60_000),
        requestedById: actor.id,
      },
    });
    await audit({ actorId: actor.id, connectionId: input.connectionId, action: "desktop.launch.requested", targetType: "Message", targetId: input.messageId, result: "SUCCESS", metadata: { launchRequestId: launch.id } });
    return Response.json({ protocolUrl: `companymail://open/${encodeURIComponent(launchId)}`, expiresAt: launch.expiresAt }, { status: 201 });
  }
  throw new ApiError(405, "Method not allowed");
}

function isAllowedOutlookWebLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["outlook.office.com", "outlook.office365.com", "outlook.live.com", "outlook.cloud.microsoft"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function exchangeRoute(request: NextRequest) {
  const actor = await requirePermission("microsoft:manage");
  const configuration = exchangeConfiguration();
  if (request.method === "GET") {
    const mailbox = request.nextUrl.searchParams.get("mailbox");
    if (!mailbox) return Response.json({ configuration });
    const validMailbox = z.string().email().parse(mailbox);
    const delegation = await getMailboxDelegation(validMailbox);
    return Response.json({ configuration, delegation });
  }
  if (request.method === "POST") {
    const input = z.object({
      operation: z.enum(["GRANT_FULL_ACCESS", "REVOKE_FULL_ACCESS", "GRANT_SEND_AS", "REVOKE_SEND_AS", "GRANT_SEND_ON_BEHALF", "REVOKE_SEND_ON_BEHALF"]),
      mailbox: z.string().email(),
      delegate: z.string().email(),
      confirmed: z.literal(true),
    }).parse(await request.json());
    await changeMailboxPermission(input.operation, input.mailbox, input.delegate);
    await audit({ actorId: actor.id, action: `exchange.${input.operation.toLowerCase()}`, targetType: "MailboxPermission", targetId: input.mailbox, result: "SUCCESS", metadata: { delegate: input.delegate } });
    return Response.json({ success: true });
  }
  throw new ApiError(405, "Method not allowed");
}

async function bootstrapAdmin() {
  const role = await db.internalRole.upsert({
    where: { role: AccessRole.SUPER_ADMIN },
    create: { role: AccessRole.SUPER_ADMIN, description: "Full internal application access", permissions: ["*"] },
    update: {},
  });
  return db.user.upsert({
    where: { email: config().BOOTSTRAP_ADMIN_EMAIL },
    create: {
      email: config().BOOTSTRAP_ADMIN_EMAIL,
      displayName: "Bootstrap Administrator",
      roles: { create: { roleId: role.id } },
    },
    update: {},
  });
}

async function createAccessCode(request: NextRequest) {
  const actor = await requirePermission("*");
  const input = z
    .object({
      expiresAt: z.coerce.date().refine((date) => date > new Date()),
      maximumUses: z.number().int().min(1).max(100).default(1),
      description: z.string().max(200).optional(),
      allowedUserId: z.string().optional(),
      allowedRole: z.nativeEnum(AccessRole).optional(),
      allowedIpRange: z
        .string()
        .max(100)
        .refine((value) => validIpRange(value), "Use an IP address or IPv4 CIDR range")
        .optional(),
    })
    .parse(await request.json());
  const code = randomAccessCode();
  const record = await db.accessCode.create({
    data: { ...input, codeHash: hashSecret(code), createdById: actor.id },
  });
  await audit({
    actorId: actor.id,
    action: "access_code.created",
    targetType: "AccessCode",
    targetId: record.id,
    result: "SUCCESS",
  });
  return Response.json({ id: record.id, code, expiresAt: record.expiresAt }, { status: 201 });
}

async function mailRoute(request: NextRequest, path: string[]) {
  const connectionId = id.parse(path[1]);
  const actor = await requirePermission(request.method === "GET" ? "mail:read" : "mail:write");
  const tail = path.slice(2);
  const query = request.nextUrl.searchParams;
  if (tail[0] === "settings" || tail[0] === "rules") {
    await requireConnectionScope(connectionId, "MailboxSettings.ReadWrite");
  } else {
    await requireConnectionScope(connectionId, "Mail.ReadWrite");
    const sendsMail = tail[0] === "send"
      || (tail[0] === "messages" && ["reply", "reply-all", "forward"].includes(tail[2] ?? ""));
    if (sendsMail) await requireConnectionScope(connectionId, "Mail.Send");
  }

  if (request.method === "GET" && tail[0] === "folders") {
    const [data, defaults] = await Promise.all([
      graphFetch<GraphCollection<Record<string, unknown>>>(
        connectionId,
        "/me/mailFolders?$top=100&$select=id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount,isHidden&includeHiddenFolders=true",
      ),
      graphFetch<{ responses: Array<{ id: string; status: number; body?: Record<string, unknown> }> }>(connectionId, "/$batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: ["inbox", "drafts", "sentitems", "archive", "deleteditems", "junkemail"].map((folderId, index) => ({
            id: String(index + 1),
            method: "GET",
            url: `/me/mailFolders/${folderId}?$select=id,displayName,totalItemCount,unreadItemCount`,
          })),
        }),
      }),
    ]);
    const ids = ["inbox", "drafts", "sentitems", "archive", "deleteditems", "junkemail"];
    const wellKnownFolders = Object.fromEntries(defaults.responses.filter((entry) => entry.status === 200 && entry.body).map((entry) => [ids[Number(entry.id) - 1], entry.body]));
    return Response.json({ folders: data.value, wellKnownFolders });
  }
  if (request.method === "GET" && tail[0] === "messages" && !tail[1]) {
    const nextLink = query.get("nextLink");
    const folder = encodeURIComponent(query.get("folder") ?? "inbox");
    const graphPath = nextLink ?? messageListPath(folder, query);
    const data = await graphFetch<GraphCollection<Record<string, unknown>>>(connectionId, graphPath);
    return Response.json({ messages: data.value, nextLink: data["@odata.nextLink"] ?? null });
  }
  if (request.method === "GET" && tail[0] === "messages" && tail[1] && tail.length === 2) {
    const messageId = encodeURIComponent(id.parse(tail[1]));
    const message = await graphFetch<Record<string, unknown> & { body?: { contentType: string; content: string } }>(
      connectionId,
      `/me/messages/${messageId}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,importance,body,webLink`,
    );
    if (message.body?.contentType === "html") {
      message.body.content = sanitizeEmail(message.body.content);
    }
    await audit({
      actorId: actor.id,
      connectionId,
      action: "mail.message.read",
      targetType: "Message",
      targetId: tail[1],
      result: "SUCCESS",
    });
    return Response.json({ message });
  }
  if (request.method === "GET" && tail[0] === "messages" && tail[2] === "attachments" && !tail[3]) {
    const data = await graphFetch<GraphCollection<Record<string, unknown>>>(
      connectionId,
      `/me/messages/${encodeURIComponent(id.parse(tail[1]))}/attachments?$select=id,name,contentType,size,isInline`,
    );
    return Response.json({ attachments: data.value });
  }
  if (request.method === "GET" && tail[0] === "messages" && tail[2] === "attachments" && tail[3]) {
    const attachment = await graphFetch<{
      name: string;
      contentType: string;
      contentBytes?: string;
      size: number;
    }>(
      connectionId,
      `/me/messages/${encodeURIComponent(id.parse(tail[1]))}/attachments/${encodeURIComponent(id.parse(tail[3]))}`,
    );
    if (!attachment.contentBytes || attachment.size > 25 * 1024 * 1024) {
      throw new ApiError(422, "Attachment is unavailable or exceeds the 25 MB limit");
    }
    return new Response(Buffer.from(attachment.contentBytes, "base64"), {
      headers: {
        "Content-Type": safeContentType(attachment.contentType),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (request.method === "POST" && tail[0] === "send") {
    await requirePermission("mail:send");
    const input = messageBody.parse(await request.json());
    await graphFetch(connectionId, "/me/sendMail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: graphMessage(input), saveToSentItems: true }),
    });
    await audit({
      actorId: actor.id,
      connectionId,
      action: "mail.message.sent",
      targetType: "Mailbox",
      targetId: connectionId,
      result: "SUCCESS",
      metadata: { recipientCount: input.toRecipients.length + input.ccRecipients.length },
    });
    return new Response(null, { status: 204 });
  }
  if (request.method === "POST" && tail[0] === "messages" && tail[2] === "reply") {
    await requirePermission("mail:send");
    const input = z.object({ comment: z.string().min(1).max(500_000) }).parse(await request.json());
    await graphFetch(connectionId, `/me/messages/${encodeURIComponent(id.parse(tail[1]))}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await audit({
      actorId: actor.id,
      connectionId,
      action: "mail.message.replied",
      targetType: "Message",
      targetId: tail[1],
      result: "SUCCESS",
    });
    return new Response(null, { status: 204 });
  }
  if (request.method === "POST" && tail[0] === "messages" && tail[1] && tail[2] === "reply-all") {
    await requirePermission("mail:send");
    const input = z.object({ comment: z.string().min(1).max(500_000) }).parse(await request.json());
    await graphFetch(connectionId, `/me/messages/${encodeURIComponent(id.parse(tail[1]))}/replyAll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await audit({ actorId: actor.id, connectionId, action: "mail.message.reply_all", targetType: "Message", targetId: tail[1], result: "SUCCESS" });
    return new Response(null, { status: 204 });
  }
  if (request.method === "POST" && tail[0] === "messages" && tail[1] && tail[2] === "forward") {
    await requirePermission("mail:send");
    const input = z.object({ comment: z.string().max(500_000), toRecipients: z.array(z.string().email()).min(1).max(50) }).parse(await request.json());
    await graphFetch(connectionId, `/me/messages/${encodeURIComponent(id.parse(tail[1]))}/forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: input.comment, toRecipients: input.toRecipients.map((address) => ({ emailAddress: { address } })) }),
    });
    await audit({ actorId: actor.id, connectionId, action: "mail.message.forwarded", targetType: "Message", targetId: tail[1], result: "SUCCESS", metadata: { recipientCount: input.toRecipients.length } });
    return new Response(null, { status: 204 });
  }
  if (request.method === "PATCH" && tail[0] === "messages" && tail[1] && tail.length === 2) {
    const input = z.object({
      isRead: z.boolean().optional(),
      flag: z.object({ flagStatus: z.enum(["notFlagged", "complete", "flagged"]) }).optional(),
      importance: z.enum(["low", "normal", "high"]).optional(),
    }).strict().parse(await request.json());
    const message = await graphFetch(connectionId, `/me/messages/${encodeURIComponent(id.parse(tail[1]))}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await audit({ actorId: actor.id, connectionId, action: "mail.message.updated", targetType: "Message", targetId: tail[1], result: "SUCCESS", metadata: { fields: Object.keys(input).join(",") } });
    return Response.json({ message });
  }
  if (request.method === "DELETE" && tail[0] === "messages" && tail[1] && tail.length === 2) {
    await graphFetch(connectionId, `/me/messages/${encodeURIComponent(id.parse(tail[1]))}`, { method: "DELETE" });
    await audit({ actorId: actor.id, connectionId, action: "mail.message.deleted", targetType: "Message", targetId: tail[1], result: "SUCCESS" });
    return new Response(null, { status: 204 });
  }
  if (request.method === "POST" && tail[0] === "messages" && tail[1] && tail[2] === "move") {
    const input = z.object({ destinationId: z.string().min(1).max(256) }).parse(await request.json());
    const message = await graphFetch(connectionId, `/me/messages/${encodeURIComponent(id.parse(tail[1]))}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await audit({ actorId: actor.id, connectionId, action: "mail.message.moved", targetType: "Message", targetId: tail[1], result: "SUCCESS", metadata: { destinationId: input.destinationId } });
    return Response.json({ message });
  }
  if (request.method === "POST" && tail[0] === "drafts") {
    const input = messageBody.partial({ toRecipients: true }).extend({ toRecipients: z.array(z.string().email()).max(50).default([]) }).parse(await request.json());
    const draft = await graphFetch(connectionId, "/me/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(graphMessage(input)),
    });
    await audit({ actorId: actor.id, connectionId, action: "mail.draft.created", targetType: "Message", result: "SUCCESS" });
    return Response.json({ draft }, { status: 201 });
  }
  if (request.method === "GET" && tail[0] === "settings") {
    const settings = await graphFetch(connectionId, "/me/mailboxSettings");
    return Response.json({ settings });
  }
  if (request.method === "PATCH" && tail[0] === "settings") {
    const input = z
      .object({
        timeZone: z.string().max(100).optional(),
        language: z.object({ locale: z.string(), displayName: z.string() }).optional(),
        automaticRepliesSetting: z.record(z.string(), z.unknown()).optional(),
        dateFormat: z.string().max(50).optional(),
        timeFormat: z.string().max(50).optional(),
        workingHours: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .parse(await request.json());
    const settings = await graphFetch(connectionId, "/me/mailboxSettings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await audit({
      actorId: actor.id,
      connectionId,
      action: "mail.settings.updated",
      targetType: "MailboxSettings",
      targetId: connectionId,
      result: "SUCCESS",
      metadata: { fields: Object.keys(input).join(",") },
    });
    return Response.json({ settings });
  }
  if (request.method === "GET" && tail[0] === "rules") {
    const rules = await graphFetch<GraphCollection<Record<string, unknown>>>(
      connectionId,
      "/me/mailFolders/inbox/messageRules",
    );
    return Response.json({ rules: rules.value });
  }
  if (request.method === "POST" && tail[0] === "rules") {
    const input = ruleSchema.parse(await request.json());
    const rule = await graphFetch(connectionId, "/me/mailFolders/inbox/messageRules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await audit({
      actorId: actor.id,
      connectionId,
      action: "mail.rule.created",
      targetType: "InboxRule",
      result: "SUCCESS",
    });
    return Response.json({ rule }, { status: 201 });
  }
  if (tail[0] === "rules" && tail[1] && (request.method === "PATCH" || request.method === "DELETE")) {
    const ruleId = encodeURIComponent(id.parse(tail[1]));
    const rule =
      request.method === "PATCH"
        ? await graphFetch(connectionId, `/me/mailFolders/inbox/messageRules/${ruleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ruleSchema.partial().parse(await request.json())),
          })
        : await graphFetch(connectionId, `/me/mailFolders/inbox/messageRules/${ruleId}`, {
            method: "DELETE",
          });
    await audit({
      actorId: actor.id,
      connectionId,
      action: request.method === "PATCH" ? "mail.rule.updated" : "mail.rule.deleted",
      targetType: "InboxRule",
      targetId: tail[1],
      result: "SUCCESS",
    });
    return request.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ rule });
  }
  throw new ApiError(404, "Mail route not found");
}

async function requireConnectionScope(connectionId: string, scope: string) {
  const connection = await db.microsoftConnection.findUnique({
    where: { id: connectionId },
    select: { grantedScopes: true },
  });
  if (!connection) throw new ApiError(404, "Microsoft connection not found");
  const granted = new Set(connection.grantedScopes.map((value) => value.toLowerCase().replace("https://graph.microsoft.com/", "")));
  if (!granted.has(scope.toLowerCase())) {
    throw new ApiError(403, `${scope} permission is required. Enable this feature to request incremental Microsoft consent.`);
  }
}

const ruleSchema = z.object({
  displayName: z.string().min(1).max(256),
  sequence: z.number().int().min(1),
  isEnabled: z.boolean(),
  conditions: z.record(z.string(), z.unknown()),
  actions: z.record(z.string(), z.unknown()),
  exceptions: z.record(z.string(), z.unknown()).optional(),
});

type GraphCollection<T> = { value: T[]; "@odata.nextLink"?: string };

function messageListPath(folder: string, query: URLSearchParams) {
  const params = new URLSearchParams({
    "$top": "30",
    "$select": "id,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,hasAttachments,importance,bodyPreview,webLink,flag",
  });
  const searchTerms: string[] = [];
  const safeSearch = (value: string) => value.replaceAll('"', "").replace(/[^\p{L}\p{N}@._+\-\s]/gu, "").slice(0, 150);
  if (query.get("keyword")) searchTerms.push(safeSearch(query.get("keyword")!));
  if (query.get("sender")) searchTerms.push(`from:${safeSearch(query.get("sender")!)}`);
  if (query.get("recipient")) searchTerms.push(`recipients:${safeSearch(query.get("recipient")!)}`);
  if (query.get("subject")) searchTerms.push(`subject:${safeSearch(query.get("subject")!)}`);
  if (searchTerms.length) {
    params.set("$search", `"${searchTerms.join(" AND ")}"`);
  } else {
    params.set("$orderby", "receivedDateTime desc");
  }
  const filters: string[] = [];
  if (query.get("read") === "true" || query.get("read") === "false") filters.push(`isRead eq ${query.get("read")}`);
  if (query.get("hasAttachments") === "true") filters.push("hasAttachments eq true");
  if (["low", "normal", "high"].includes(query.get("importance") ?? "")) filters.push(`importance eq '${query.get("importance")}'`);
  if (query.get("flagged") === "true") filters.push("flag/flagStatus eq 'flagged'");
  for (const [parameter, operator] of [["fromDate", "ge"], ["toDate", "le"]] as const) {
    const value = query.get(parameter);
    if (value && !Number.isNaN(Date.parse(value))) filters.push(`receivedDateTime ${operator} ${new Date(value).toISOString()}`);
  }
  if (filters.length) params.set("$filter", filters.join(" and "));
  return `/me/mailFolders/${folder}/messages?${params.toString()}`;
}

function graphMessage(input: z.infer<typeof messageBody>) {
  const recipients = (values: string[]) => values.map((address) => ({ emailAddress: { address } }));
  return {
    subject: input.subject,
    body: { contentType: input.contentType, content: input.contentType === "HTML" ? sanitizeEmail(input.body) : input.body },
    toRecipients: recipients(input.toRecipients),
    ccRecipients: recipients(input.ccRecipients),
    bccRecipients: recipients(input.bccRecipients),
    attachments: input.attachments.map((attachment) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      ...attachment,
    })),
  };
}

function sanitizeEmail(html: string) {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "title", "width", "height"],
      a: ["href", "name", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto", "cid", "data"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
      img: (_tagName, attribs) => ({
        tagName: "img",
        attribs: {
          alt: attribs.alt ?? "Remote image blocked",
          ...(attribs.src?.startsWith("data:image/") ? { src: attribs.src } : {}),
        },
      }),
    },
  });
}

function safeContentType(contentType: string) {
  const allowed = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]);
  return allowed.has(contentType) ? contentType : "application/octet-stream";
}

function safeUser(user: { id: string; email: string; displayName: string | null }) {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

function enforceRateLimit(key: string) {
  const now = Date.now();
  const state = attempts.get(key);
  if (!state || state.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return;
  }
  state.count += 1;
  if (state.count > 10) throw new ApiError(429, "Too many access-code attempts");
}

function ipMatchesRange(ip: string, range: string | null): boolean {
  if (!range) return true;
  if (!range.includes("/")) return isIP(ip) !== 0 && ip === range;
  const [network, prefixText] = range.split("/");
  const prefix = Number(prefixText);
  if (isIP(ip) !== 4 || isIP(network) !== 4 || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  const toNumber = (value: string) =>
    value.split(".").reduce((result, octet) => (result << 8) | Number(octet), 0) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (toNumber(ip) & mask) === (toNumber(network) & mask);
}

function validIpRange(range: string): boolean {
  if (!range.includes("/")) return isIP(range) !== 0;
  const [network, prefixText] = range.split("/");
  const prefix = Number(prefixText);
  return isIP(network) === 4 && Number.isInteger(prefix) && prefix >= 0 && prefix <= 32;
}

function handle(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ error: "Invalid request", details: error.issues }, { status: 400 });
  if (error instanceof GraphError) {
    return Response.json({ error: error.message, microsoftCode: error.code }, { status: error.status });
  }
  if (error instanceof MicrosoftConfigurationError) {
    return Response.json({ error: error.message, code: "MICROSOFT_NOT_CONFIGURED" }, { status: 503 });
  }
  if (error instanceof MicrosoftReauthenticationRequired) return Response.json({ error: error.message, code: "REAUTHENTICATION_REQUIRED" }, { status: 401 });
  if (error instanceof CloudflareError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ExchangeConfigurationError) return Response.json({ error: error.message }, { status: 503 });
  if (error instanceof ExchangeOperationError) return Response.json({ error: "Exchange Online operation failed", details: error.message }, { status: 502 });
  return apiError(error);
}
