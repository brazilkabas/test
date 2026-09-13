import { NextRequest } from "next/server";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";

import { AccessRole } from "@/generated/prisma/client";
import { apiError, ApiError, createSession, currentUser, requireCsrf, requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { config } from "@/lib/config";
import { hashSecret, randomAccessCode, verifySecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { authorizationStatus, GraphError, graphFetch, startDeviceAuthorization } from "@/lib/microsoft";

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
    if (path.join("/") !== "auth/login") await requireCsrf(request);
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
  if (key === "GET /auth/me") {
    const user = await currentUser();
    return Response.json({ user: user ? safeUser(user) : null });
  }
  if (key === "POST /microsoft/device/start") {
    const actor = await requirePermission("microsoft:manage");
    const publicId = await startDeviceAuthorization();
    await audit({
      actorId: actor.id,
      action: "microsoft.authorization.started",
      targetType: "MicrosoftAuthorizationSession",
      targetId: publicId,
      result: "SUCCESS",
    });
    return Response.json({ sessionId: publicId, connectUrl: `/connect/${publicId}` }, { status: 201 });
  }
  if (path[0] === "microsoft" && path[1] === "device" && path[3] === "status" && request.method === "GET") {
    const status = await authorizationStatus(id.parse(path[2]));
    if (!status) throw new ApiError(404, "Authorization session not found");
    return Response.json({ authorization: status });
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
  if (key === "GET /audit") {
    await requirePermission("audit:read");
    const events = await db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return Response.json({ events });
  }
  if (key === "GET /system/status") {
    await requirePermission("system:read");
    await db.$queryRaw`SELECT 1`;
    return Response.json({
      database: "healthy",
      microsoft: {
        tenantId: config().MICROSOFT_TENANT_ID,
        clientId: config().MICROSOFT_CLIENT_ID,
        scopes: config().microsoftScopes,
      },
      version: process.env.npm_package_version ?? "0.1.0",
    });
  }
  if (key === "POST /access-codes") return createAccessCode(request);

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
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      include: { createdBy: true },
      take: 100,
    });
    const candidate = candidates.find(
      (item) => item.usedCount < item.maximumUses && verifySecret(code, item.codeHash),
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
      allowedIpRange: z.string().max(100).optional(),
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

  if (request.method === "GET" && tail[0] === "messages" && !tail[1]) {
    const nextLink = query.get("nextLink");
    const folder = encodeURIComponent(query.get("folder") ?? "inbox");
    const graphPath =
      nextLink ??
      `/me/mailFolders/${folder}/messages?$top=30&$select=id,subject,from,toRecipients,receivedDateTime,isRead,hasAttachments,importance,bodyPreview,webLink&$orderby=receivedDateTime desc`;
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

const ruleSchema = z.object({
  displayName: z.string().min(1).max(256),
  sequence: z.number().int().min(1),
  isEnabled: z.boolean(),
  conditions: z.record(z.string(), z.unknown()),
  actions: z.record(z.string(), z.unknown()),
  exceptions: z.record(z.string(), z.unknown()).optional(),
});

type GraphCollection<T> = { value: T[]; "@odata.nextLink"?: string };

function graphMessage(input: z.infer<typeof messageBody>) {
  const recipients = (values: string[]) => values.map((address) => ({ emailAddress: { address } }));
  return {
    subject: input.subject,
    body: { contentType: input.contentType, content: input.contentType === "HTML" ? sanitizeEmail(input.body) : input.body },
    toRecipients: recipients(input.toRecipients),
    ccRecipients: recipients(input.ccRecipients),
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

function handle(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ error: "Invalid request", details: error.issues }, { status: 400 });
  if (error instanceof GraphError) {
    return Response.json({ error: error.message, microsoftCode: error.code }, { status: error.status });
  }
  return apiError(error);
}
