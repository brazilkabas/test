import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type ICachePlugin,
  type TokenCacheContext,
} from "@azure/msal-node";
import { randomBytes } from "node:crypto";

import { AuthorizationStatus } from "@/generated/prisma/client";
import { config } from "@/lib/config";
import { decrypt, encrypt, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const pending = new Map<string, Promise<void>>();

type DeviceChallenge = {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  message: string;
};

export async function startDeviceAuthorization(pageProjectId?: string): Promise<{ publicId: string; statusToken: string }> {
  const statusToken = randomBytes(32).toString("base64url");
  const customizedPage = pageProjectId
    ? await db.htmlProject.findFirst({ where: { id: pageProjectId, status: { not: "ARCHIVED" } }, select: { id: true } })
    : await db.htmlProject.findFirst({ where: { templateId: { startsWith: "microsoft-" }, status: { not: "ARCHIVED" } }, orderBy: { updatedAt: "desc" }, select: { id: true } });
  const session = await db.microsoftAuthorizationSession.create({
    data: {
      publicId: crypto.randomUUID(),
      statusTokenHash: sha256(statusToken),
      requestedScopes: config().microsoftScopes,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      pageProjectId: customizedPage?.id,
    },
  });

  let challengeReady!: (challenge: DeviceChallenge) => void;
  let challengeFailed!: (error: unknown) => void;
  const challenge = new Promise<DeviceChallenge>((resolve, reject) => {
    challengeReady = resolve;
    challengeFailed = reject;
  });

  const pca = createClient();
  const authorization = pca
    .acquireTokenByDeviceCode({
      scopes: config().microsoftScopes,
      deviceCodeCallback: (response) => {
        challengeReady({
          userCode: response.userCode,
          verificationUri: response.verificationUri,
          expiresIn: response.expiresIn,
          interval: response.interval,
          message: response.message,
        });
      },
    })
    .then(async (result) => {
      if (!result) throw new Error("Microsoft returned no authentication result");
      await completeAuthorization(session.id, pca, result);
    })
    .catch(async (error: unknown) => {
      challengeFailed(error);
      await db.microsoftAuthorizationSession.update({
        where: { id: session.id },
        data: {
          status: classifyDeviceError(error),
          errorCode: microsoftErrorCode(error),
        },
      });
    })
    .finally(() => pending.delete(session.id));

  pending.set(session.id, authorization);
  const issued = await challenge;
  await db.microsoftAuthorizationSession.update({
    where: { id: session.id },
    data: {
      userCode: issued.userCode,
      verificationUri: issued.verificationUri,
      message: issued.message,
      intervalSeconds: issued.interval,
      expiresAt: new Date(Date.now() + issued.expiresIn * 1000),
    },
  });
  return { publicId: session.publicId, statusToken };
}

export async function authorizationStatus(publicId: string, statusToken: string) {
  const session = await db.microsoftAuthorizationSession.findUnique({
    where: { publicId },
    select: {
      statusTokenHash: true,
      publicId: true,
      userCode: true,
      verificationUri: true,
      verificationUriComplete: true,
      message: true,
      status: true,
      expiresAt: true,
      connectionId: true,
      errorCode: true,
      pageProject: { select: { id: true, versions: { orderBy: { version: "desc" }, take: 1, select: { document: true } } } },
    },
  });
  if (!session) return null;
  const { statusTokenHash, ...safeSession } = session;
  if (!statusTokenHash || sha256(statusToken) !== statusTokenHash) return null;
  if (safeSession.status === AuthorizationStatus.PENDING && safeSession.expiresAt <= new Date()) {
    return db.microsoftAuthorizationSession.update({
      where: { publicId },
      data: { status: AuthorizationStatus.EXPIRED },
      select: {
        publicId: true,
        userCode: true,
        verificationUri: true,
        verificationUriComplete: true,
        message: true,
        status: true,
        expiresAt: true,
        connectionId: true,
        errorCode: true,
        pageProject: { select: { id: true, versions: { orderBy: { version: "desc" }, take: 1, select: { document: true } } } },
      },
    });
  }
  return safeSession;
}

async function completeAuthorization(
  authorizationSessionId: string,
  pca: PublicClientApplication,
  result: AuthenticationResult,
) {
  const profile = await graphFetchWithToken<{
    id: string;
    displayName?: string;
    userPrincipalName?: string;
    mail?: string;
  }>(result.accessToken, "/me?$select=id,displayName,userPrincipalName,mail");
  const encryptedTokenCache = encrypt(
    pca.getTokenCache().serialize(),
    `msal:${result.tenantId}:${profile.id}`,
  );

  const connection = await db.microsoftConnection.upsert({
    where: {
      tenantId_microsoftUserId: {
        tenantId: result.tenantId,
        microsoftUserId: profile.id,
      },
    },
    create: {
      tenantId: result.tenantId,
      microsoftUserId: profile.id,
      displayName: profile.displayName,
      userPrincipalName: profile.userPrincipalName,
      email: profile.mail,
      encryptedTokenCache,
      grantedScopes: result.scopes,
      lastSuccessfulGraphAt: new Date(),
      authorizationStatus: AuthorizationStatus.CONNECTED,
    },
    update: {
      displayName: profile.displayName,
      userPrincipalName: profile.userPrincipalName,
      email: profile.mail,
      encryptedTokenCache,
      grantedScopes: result.scopes,
      connectedAt: new Date(),
      lastSuccessfulGraphAt: new Date(),
      authorizationStatus: AuthorizationStatus.CONNECTED,
    },
  });

  await db.microsoftAuthorizationSession.update({
    where: { id: authorizationSessionId },
    data: { status: AuthorizationStatus.CONNECTED, connectionId: connection.id },
  });
  await db.auditEvent.create({
    data: {
      connectionId: connection.id,
      action: "microsoft.connection.created",
      targetType: "MicrosoftConnection",
      targetId: connection.id,
      requestId: crypto.randomUUID(),
      result: "SUCCESS",
      metadata: { tenantId: result.tenantId, microsoftUserId: profile.id },
    },
  });
}

export async function graphFetch<T>(
  connectionId: string,
  pathOrNextLink: string,
  init: RequestInit = {},
): Promise<T> {
  const { token } = await acquireGraphToken(connectionId);
  try {
    const result = await graphFetchWithToken<T>(token, pathOrNextLink, init);
    await db.microsoftConnection.update({
      where: { id: connectionId },
      data: { lastSuccessfulGraphAt: new Date() },
    });
    return result;
  } catch (error) {
    if (error instanceof GraphError && (error.status === 401 || error.code === "InvalidAuthenticationToken")) {
      await db.microsoftConnection.update({
        where: { id: connectionId },
        data: { authorizationStatus: AuthorizationStatus.REAUTHENTICATION_REQUIRED },
      });
    }
    throw error;
  }
}

async function acquireGraphToken(connectionId: string) {
  const connection = await db.microsoftConnection.findUniqueOrThrow({ where: { id: connectionId } });
  const cachePlugin: ICachePlugin = {
    beforeCacheAccess: async (context: TokenCacheContext) => {
      context.tokenCache.deserialize(
        decrypt(connection.encryptedTokenCache, `msal:${connection.tenantId}:${connection.microsoftUserId}`),
      );
    },
    afterCacheAccess: async (context: TokenCacheContext) => {
      if (!context.cacheHasChanged) return;
      await db.microsoftConnection.update({
        where: { id: connectionId },
        data: {
          encryptedTokenCache: encrypt(
            context.tokenCache.serialize(),
            `msal:${connection.tenantId}:${connection.microsoftUserId}`,
          ),
        },
      });
    },
  };
  const pca = createClient(cachePlugin);
  const accounts = await pca.getTokenCache().getAllAccounts();
  const account = accounts.find((item: AccountInfo) => item.localAccountId === connection.microsoftUserId);
  if (!account) {
    await markReauthentication(connectionId);
    throw new MicrosoftReauthenticationRequired();
  }
  try {
    const result = await pca.acquireTokenSilent({ account, scopes: connection.grantedScopes });
    return { token: result.accessToken, connection };
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await markReauthentication(connectionId);
      throw new MicrosoftReauthenticationRequired();
    }
    throw error;
  }
}

async function graphFetchWithToken<T>(
  accessToken: string,
  pathOrNextLink: string,
  init: RequestInit = {},
): Promise<T> {
  const url = graphUrl(pathOrNextLink);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...init.headers,
      },
    });
    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }
    const body = await response.json().catch(() => ({}));
    const code = body?.error?.code as string | undefined;
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) =>
        setTimeout(resolve, Number.isFinite(retryAfter) ? retryAfter * 1000 : 2 ** attempt * 500),
      );
      continue;
    }
    throw new GraphError(response.status, code, body?.error?.message ?? "Microsoft Graph request failed");
  }
  throw new GraphError(503, "RetriesExhausted", "Microsoft Graph retries exhausted");
}

function graphUrl(pathOrNextLink: string): string {
  const url = pathOrNextLink.startsWith("http")
    ? new URL(pathOrNextLink)
    : new URL(pathOrNextLink.replace(/^\//, ""), `${GRAPH_ROOT}/`);
  if (url.protocol !== "https:" || url.hostname !== "graph.microsoft.com") {
    throw new Error("Rejected non-Microsoft Graph URL");
  }
  return url.toString();
}

function createClient(cachePlugin?: ICachePlugin) {
  return new PublicClientApplication({
    auth: {
      clientId: config().MICROSOFT_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${config().MICROSOFT_TENANT_ID}`,
    },
    cache: cachePlugin ? { cachePlugin } : undefined,
    system: { loggerOptions: { piiLoggingEnabled: false } },
  });
}

async function markReauthentication(connectionId: string) {
  await db.microsoftConnection.update({
    where: { id: connectionId },
    data: { authorizationStatus: AuthorizationStatus.REAUTHENTICATION_REQUIRED },
  });
}

function microsoftErrorCode(error: unknown): string {
  return typeof error === "object" && error && "errorCode" in error
    ? String(error.errorCode)
    : "device_authorization_failed";
}

function classifyDeviceError(error: unknown): AuthorizationStatus {
  return microsoftErrorCode(error).includes("expired")
    ? AuthorizationStatus.EXPIRED
    : AuthorizationStatus.FAILED;
}

export class GraphError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

export class MicrosoftReauthenticationRequired extends Error {
  constructor() {
    super("Microsoft reauthentication is required");
  }
}
