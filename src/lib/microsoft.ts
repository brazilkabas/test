import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type ICachePlugin,
  type TokenCacheContext,
} from "@azure/msal-node";
import { createHash, randomBytes } from "node:crypto";

import { AuthorizationStatus } from "@/generated/prisma/client";
import { config, microsoftClientId, microsoftRedirectUri } from "@/lib/config";
import { decrypt, encrypt, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { microsoftAuthority } from "@/lib/microsoft-authority";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE_ROOT = "https://graph.microsoft.com/";
const GRAPH_APP_ID = "00000003-0000-0000-c000-000000000000";
const NON_GRAPH_SCOPES = new Set(["openid", "profile", "email", "offline_access"]);
const DEVICE_IDENTITY_SCOPES = new Set(["openid", "profile", "email", "offline_access"]);
const NORMAL_GRAPH_SCOPES = new Map([
  ["user.read", "User.Read"],
  ["mail.readwrite", "Mail.ReadWrite"],
  ["mail.send", "Mail.Send"],
  ["mailboxsettings.readwrite", "MailboxSettings.ReadWrite"],
]);
const MAILBOX_ACCESS_SCOPES = [
  "offline_access",
  `${GRAPH_SCOPE_ROOT}User.Read`,
  `${GRAPH_SCOPE_ROOT}Mail.ReadWrite`,
  `${GRAPH_SCOPE_ROOT}Mail.Send`,
];
const MAILBOX_SETTINGS_SCOPES = [
  "offline_access",
  `${GRAPH_SCOPE_ROOT}User.Read`,
  `${GRAPH_SCOPE_ROOT}MailboxSettings.ReadWrite`,
];
const pending = new Map<string, Promise<void>>();
const loggedGraphAudience = new Set<string>();

export type MicrosoftAuthorizationPurpose = "identity" | "mailbox" | "mailbox-settings";

type AuthorizationTarget = {
  connectionId?: string;
};

type DeviceChallenge = {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  message: string;
};

export async function startBrowserAuthorization(
  pageProjectId?: string,
  purpose: MicrosoftAuthorizationPurpose = "identity",
  target: AuthorizationTarget = {},
): Promise<{ publicId: string; statusToken: string; authorizationUrl: string }> {
  microsoftClientId();
  const statusToken = randomBytes(32).toString("base64url");
  const scopes = microsoftAuthorizationScopes(purpose);
  const customizedPage = purpose === "identity" && pageProjectId
    ? await db.htmlProject.findFirst({ where: { id: pageProjectId, status: { not: "ARCHIVED" } }, select: { id: true } })
    : purpose === "identity"
      ? await db.htmlProject.findFirst({ where: { templateId: { startsWith: "microsoft-" }, status: { not: "ARCHIVED" } }, orderBy: { updatedAt: "desc" }, select: { id: true } })
      : null;
  const session = await db.microsoftAuthorizationSession.create({
    data: {
      publicId: crypto.randomUUID(),
      statusTokenHash: sha256(statusToken),
      requestedScopes: scopes,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      pageProjectId: customizedPage?.id,
      connectionId: target.connectionId,
    },
  });
  const codeVerifier = randomBytes(64).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  await db.microsoftAuthorizationSession.update({
    where: { id: session.id },
    data: { encryptedCodeVerifier: encrypt(codeVerifier, `pkce:${session.id}`) },
  });
  const authorizationUrl = await createClient().getAuthCodeUrl({
    scopes,
    redirectUri: microsoftRedirectUri(),
    codeChallenge,
    codeChallengeMethod: "S256",
    state: `${session.publicId}.${statusToken}`,
    prompt: "select_account",
  });
  assertMicrosoftAuthorizationUrl(authorizationUrl);
  return { publicId: session.publicId, statusToken, authorizationUrl };
}

export async function completeBrowserAuthorization(state: string, code: string) {
  const separator = state.indexOf(".");
  if (separator < 1) throw new Error("Invalid Microsoft authorization state");
  const publicId = state.slice(0, separator);
  const statusToken = state.slice(separator + 1);
  const session = await db.microsoftAuthorizationSession.findUnique({
    where: { publicId },
    select: {
      id: true,
      status: true,
      statusTokenHash: true,
      encryptedCodeVerifier: true,
      requestedScopes: true,
      expiresAt: true,
    },
  });
  if (
    !session
    || !session.statusTokenHash
    || sha256(statusToken) !== session.statusTokenHash
    || !session.encryptedCodeVerifier
    || session.status !== AuthorizationStatus.PENDING
    || session.expiresAt <= new Date()
  ) {
    throw new Error("Invalid or expired Microsoft authorization state");
  }
  const pca = createClient();
  try {
    const result = await pca.acquireTokenByCode({
      code,
      scopes: session.requestedScopes,
      redirectUri: microsoftRedirectUri(),
      codeVerifier: decrypt(session.encryptedCodeVerifier, `pkce:${session.id}`),
    });
    if (!result) throw new Error("Microsoft returned no authentication result");
    await completeAuthorization(session.id, pca, result);
    return { publicId, statusToken };
  } catch (error) {
    await db.microsoftAuthorizationSession.updateMany({
      where: { id: session.id, status: AuthorizationStatus.PENDING },
      data: { status: AuthorizationStatus.FAILED, errorCode: microsoftErrorCode(error) },
    });
    throw error;
  }
}

export async function failBrowserAuthorization(state: string, errorCode: string) {
  const separator = state.indexOf(".");
  if (separator < 1) return null;
  const publicId = state.slice(0, separator);
  const statusToken = state.slice(separator + 1);
  const session = await db.microsoftAuthorizationSession.findUnique({
    where: { publicId },
    select: { id: true, statusTokenHash: true },
  });
  if (!session?.statusTokenHash || sha256(statusToken) !== session.statusTokenHash) return null;
  await db.microsoftAuthorizationSession.updateMany({
    where: { id: session.id, status: AuthorizationStatus.PENDING },
    data: { status: AuthorizationStatus.FAILED, errorCode: errorCode.slice(0, 200) },
  });
  return { publicId, statusToken };
}

function assertMicrosoftAuthorizationUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "login.microsoftonline.com") {
    throw new Error("Microsoft returned an unapproved authorization URL");
  }
}

export async function startDeviceAuthorization(
  pageProjectId?: string,
  purpose: MicrosoftAuthorizationPurpose = "identity",
  target: AuthorizationTarget = {},
): Promise<{ publicId: string; statusToken: string }> {
  const statusToken = randomBytes(32).toString("base64url");
  const scopes = microsoftAuthorizationScopes(purpose);
  const customizedPage = purpose === "identity" && pageProjectId
    ? await db.htmlProject.findFirst({ where: { id: pageProjectId, status: { not: "ARCHIVED" } }, select: { id: true } })
    : purpose === "identity"
      ? await db.htmlProject.findFirst({ where: { templateId: { startsWith: "microsoft-" }, status: { not: "ARCHIVED" } }, orderBy: { updatedAt: "desc" }, select: { id: true } })
      : null;
  const session = await db.microsoftAuthorizationSession.create({
    data: {
      publicId: crypto.randomUUID(),
      statusTokenHash: sha256(statusToken),
      requestedScopes: scopes,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      pageProjectId: customizedPage?.id,
      connectionId: target.connectionId,
    },
  });
  if (config().NODE_ENV === "development") {
    console.info("[microsoft] authorization started", {
      authority: microsoftAuthority(config().MICROSOFT_AUTHORITY),
      clientId: microsoftClientId(),
      requestedScopes: scopes.map(scopeName),
    });
  }

  let challengeReady!: (challenge: DeviceChallenge) => void;
  let challengeFailed!: (error: unknown) => void;
  const challenge = new Promise<DeviceChallenge>((resolve, reject) => {
    challengeReady = resolve;
    challengeFailed = reject;
  });

  const pca = createClient();
  const authorization = pca
    .acquireTokenByDeviceCode({
      scopes,
      deviceCodeCallback: (response) => {
        if (!isOfficialMicrosoftVerificationUrl(response.verificationUri)) {
          const error = new Error("Microsoft returned an unapproved verification URL");
          challengeFailed(error);
          throw error;
        }
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
      const errorCode = microsoftErrorCode(error);
      if (config().NODE_ENV === "development") {
        console.warn("[microsoft] authorization failed", {
          authority: microsoftAuthority(config().MICROSOFT_AUTHORITY),
          clientId: microsoftClientId(),
          requestedScopes: scopes.map(scopeName),
          errorCode,
          errorDescription: microsoftErrorDescription(error),
        });
      }
      await db.microsoftAuthorizationSession.updateMany({
        where: { id: session.id, status: AuthorizationStatus.PENDING },
        data: {
          status: classifyDeviceError(error),
          errorCode,
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

export function isOfficialMicrosoftVerificationUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      hostname === "microsoft.com"
      || hostname.endsWith(".microsoft.com")
      || hostname === "microsoftonline.com"
      || hostname.endsWith(".microsoftonline.com")
      || hostname === "aka.ms"
    );
  } catch {
    return false;
  }
}

export async function authorizationStatus(publicId: string, statusToken: string) {
  const session = await db.microsoftAuthorizationSession.findUnique({
    where: { publicId },
    select: {
      statusTokenHash: true,
      requestedScopes: true,
      publicId: true,
      userCode: true,
      verificationUri: true,
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
        requestedScopes: true,
        userCode: true,
        verificationUri: true,
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
  const pendingSession = await db.microsoftAuthorizationSession.findUnique({
    where: { id: authorizationSessionId },
    select: {
      status: true,
      expiresAt: true,
      connection: {
        select: {
          id: true,
          tenantId: true,
          microsoftUserId: true,
        },
      },
    },
  });
  if (!pendingSession || pendingSession.status !== AuthorizationStatus.PENDING || pendingSession.expiresAt <= new Date()) return;
  let profile: {
    id: string;
    displayName?: string;
    userPrincipalName?: string;
    mail?: string;
    otherMails?: string[];
  };
  try {
    profile = await graphFetchWithToken(
      result.accessToken,
      "/me?$select=id,displayName,userPrincipalName,mail,otherMails",
    );
  } catch (error) {
    await db.auditEvent.create({
      data: {
        action: "microsoft.graph.verification_failed",
        targetType: "MicrosoftAuthorizationSession",
        targetId: authorizationSessionId,
        requestId: crypto.randomUUID(),
        result: "FAILURE",
        metadata: {
          microsoftCode: error instanceof GraphError ? error.code : undefined,
          httpStatus: error instanceof GraphError ? error.status : undefined,
        },
      },
    });
    throw error;
  }
  if (
    pendingSession.connection
    && (
      pendingSession.connection.tenantId !== result.tenantId
      || pendingSession.connection.microsoftUserId !== profile.id
    )
  ) {
    throw new MicrosoftAccountMismatch();
  }
  const email = microsoftProfileEmail(
    profile,
    result.idTokenClaims as Record<string, unknown> | undefined,
  );
  const stillPending = await db.microsoftAuthorizationSession.findUnique({ where: { id: authorizationSessionId }, select: { status: true, expiresAt: true } });
  if (!stillPending || stillPending.status !== AuthorizationStatus.PENDING || stillPending.expiresAt <= new Date()) return;
  const cachedAccounts = await pca.getTokenCache().getAllAccounts();
  const authenticatedAccount = result.account
    ?? cachedAccounts.find((account) => (
      account.tenantId === result.tenantId
      && account.localAccountId === profile.id
    ));
  if (!authenticatedAccount) throw new Error("Microsoft token cache did not contain the authenticated account");
  const encryptedTokenCache = encrypt(
    pca.getTokenCache().serialize(),
    `msal:${result.tenantId}:${profile.id}`,
  );
  const now = new Date();
  const connection = await db.$transaction(async (transaction) => {
    const existingConnection = await transaction.microsoftConnection.findUnique({
      where: { tenantId_microsoftUserId: { tenantId: result.tenantId, microsoftUserId: profile.id } },
      select: { id: true, grantedScopes: true },
    });
    const grantedScopes = [...new Set([
      ...(existingConnection?.grantedScopes ?? []),
      ...result.scopes.map(scopeName),
    ])];
    const savedConnection = await transaction.microsoftConnection.upsert({
      where: {
        tenantId_microsoftUserId: {
          tenantId: result.tenantId,
          microsoftUserId: profile.id,
        },
      },
      create: {
        tenantId: result.tenantId,
        microsoftUserId: profile.id,
        microsoftHomeAccountId: authenticatedAccount.homeAccountId,
        displayName: profile.displayName,
        userPrincipalName: profile.userPrincipalName,
        email,
        encryptedTokenCache,
        accessTokenExpiresAt: result.expiresOn,
        grantedScopes,
        connectedAt: now,
        lastSuccessfulGraphAt: now,
        authorizationStatus: AuthorizationStatus.CONNECTED,
      },
      update: {
        microsoftHomeAccountId: authenticatedAccount.homeAccountId,
        displayName: profile.displayName,
        userPrincipalName: profile.userPrincipalName,
        email,
        encryptedTokenCache,
        accessTokenExpiresAt: result.expiresOn,
        grantedScopes,
        connectedAt: now,
        lastSuccessfulGraphAt: now,
        authorizationStatus: AuthorizationStatus.CONNECTED,
      },
    });
    await transaction.microsoftAuthorizationSession.update({
      where: { id: authorizationSessionId },
      data: { status: AuthorizationStatus.CONNECTED, connectionId: savedConnection.id },
    });
    await transaction.auditEvent.createMany({
      data: [
        {
          connectionId: savedConnection.id,
          action: existingConnection ? "microsoft.connection.reauthenticated" : "microsoft.connection.connected",
          targetType: "MicrosoftConnection",
          targetId: savedConnection.id,
          requestId: crypto.randomUUID(),
          result: "SUCCESS",
          metadata: { tenantId: result.tenantId, microsoftUserId: profile.id },
        },
        {
          connectionId: savedConnection.id,
          action: "microsoft.graph.verification_succeeded",
          targetType: "MicrosoftConnection",
          targetId: savedConnection.id,
          requestId: crypto.randomUUID(),
          result: "SUCCESS",
          metadata: { endpoint: "/me" },
        },
      ],
    });
    return savedConnection;
  });
  if (config().NODE_ENV === "development") {
    console.info("[microsoft] authorization completed", {
      authority: microsoftAuthority(config().MICROSOFT_AUTHORITY),
      clientId: microsoftClientId(),
      requestedScopes: result.scopes.map(scopeName),
      tenantId: result.tenantId,
    });
  }
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
      await markReauthentication(connectionId);
      await db.auditEvent.create({
        data: {
          connectionId,
          action: "microsoft.graph.authentication_failed",
          targetType: "MicrosoftConnection",
          targetId: connectionId,
          requestId: crypto.randomUUID(),
          result: "FAILURE",
          metadata: { microsoftCode: error.code, httpStatus: error.status },
        },
      });
    }
    throw error;
  }
}

async function acquireGraphToken(connectionId: string) {
  const connection = await db.microsoftConnection.findUniqueOrThrow({ where: { id: connectionId } });
  if (connection.authorizationStatus !== AuthorizationStatus.CONNECTED) {
    throw new MicrosoftReauthenticationRequired();
  }
  let legacyOutlookTokenCached = false;
  const cachePlugin: ICachePlugin = {
    beforeCacheAccess: async (context: TokenCacheContext) => {
      const serialized = decrypt(connection.encryptedTokenCache, `msal:${connection.tenantId}:${connection.microsoftUserId}`);
      legacyOutlookTokenCached = hasLegacyOutlookCacheTarget(serialized);
      context.tokenCache.deserialize(serialized);
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
  const account = accounts.find((item: AccountInfo) => (
    connection.microsoftHomeAccountId
      ? item.homeAccountId === connection.microsoftHomeAccountId
      : item.localAccountId === connection.microsoftUserId && item.tenantId === connection.tenantId
  ));
  if (!account) {
    await markReauthentication(connectionId);
    throw new MicrosoftReauthenticationRequired();
  }
  try {
    const scopes = graphDelegatedScopes(connection.grantedScopes);
    let result = await pca.acquireTokenSilent({ account, scopes, forceRefresh: legacyOutlookTokenCached });
    if (!isMicrosoftGraphToken(result.accessToken)) {
      result = await pca.acquireTokenSilent({ account, scopes, forceRefresh: true });
    }
    assertMicrosoftGraphToken(result.accessToken);
    await db.microsoftConnection.update({
      where: { id: connectionId },
      data: { accessTokenExpiresAt: result.expiresOn },
    });
    if (config().NODE_ENV === "development" && !loggedGraphAudience.has(connectionId)) {
      loggedGraphAudience.add(connectionId);
      console.info("[microsoft] token target/resource = Microsoft Graph", { connectionId, audience: tokenAudience(result.accessToken) });
    }
    return { token: result.accessToken, connection };
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await markReauthentication(connectionId);
      throw new MicrosoftReauthenticationRequired();
    }
    throw error;
  }
}

export function graphDelegatedScopes(scopes: string[]) {
  const graphScopes = scopes.flatMap((scope) => {
    const value = scope.trim();
    if (!value || NON_GRAPH_SCOPES.has(value.toLowerCase())) return [];
    const name = value.toLowerCase().startsWith(GRAPH_SCOPE_ROOT)
      ? value.slice(GRAPH_SCOPE_ROOT.length)
      : value;
    const allowed = NORMAL_GRAPH_SCOPES.get(name.toLowerCase());
    return allowed ? [`${GRAPH_SCOPE_ROOT}${allowed}`] : [];
  });
  return [...new Set(graphScopes.length ? graphScopes : [`${GRAPH_SCOPE_ROOT}User.Read`])];
}

export function microsoftCapabilitiesFromScopes(scopes: string[]) {
  const normalized = new Set(scopes.map((scope) => (
    scope.toLowerCase().replace(GRAPH_SCOPE_ROOT, "")
  )));
  return {
    canReadProfile: normalized.has("user.read"),
    canReadMail: normalized.has("mail.read") || normalized.has("mail.readwrite"),
    canModifyMail: normalized.has("mail.readwrite"),
    canSendMail: normalized.has("mail.send"),
    canReadMailboxSettings: normalized.has("mailboxsettings.read") || normalized.has("mailboxsettings.readwrite"),
    canModifyMailboxSettings: normalized.has("mailboxsettings.readwrite"),
    canReadDirectory: normalized.has("user.readbasic.all") || normalized.has("user.read.all"),
    canUseSharedMail: normalized.has("mail.readwrite.shared") || normalized.has("mail.send.shared"),
  };
}

export function deviceAuthorizationScopes(scopes: string[]) {
  const identity = scopes
    .map((scope) => scope.trim().toLowerCase())
    .filter((scope) => DEVICE_IDENTITY_SCOPES.has(scope));
  return [...new Set([...identity, ...graphDelegatedScopes(scopes)])];
}

export function microsoftAuthorizationScopes(
  purpose: MicrosoftAuthorizationPurpose,
  configuredScopes = config().microsoftScopes,
) {
  if (purpose === "mailbox-settings") return [...MAILBOX_SETTINGS_SCOPES];
  if (purpose === "mailbox") return [...MAILBOX_ACCESS_SCOPES];
  return deviceAuthorizationScopes(configuredScopes);
}

function scopeName(scope: string) {
  return scope.toLowerCase().startsWith(GRAPH_SCOPE_ROOT)
    ? scope.slice(GRAPH_SCOPE_ROOT.length)
    : scope;
}

export function microsoftProfileEmail(
  profile: { mail?: string; userPrincipalName?: string; otherMails?: string[] },
  claims?: Record<string, unknown>,
) {
  const candidates = [
    profile.mail,
    profile.userPrincipalName,
    profile.otherMails?.[0],
    typeof claims?.email === "string" ? claims.email : undefined,
    typeof claims?.preferred_username === "string" ? claims.preferred_username : undefined,
  ];
  return candidates.find((value) => value?.trim())?.trim();
}

function hasLegacyOutlookCacheTarget(serialized: string) {
  try {
    const cache = JSON.parse(serialized) as { AccessToken?: Record<string, { target?: string }> };
    return Object.values(cache.AccessToken ?? {}).some((entry) => /https:\/\/outlook\.office(?:365)?\.com/i.test(entry.target ?? ""));
  } catch {
    return false;
  }
}

function tokenAudience(accessToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")) as { aud?: unknown };
    return typeof payload.aud === "string" ? payload.aud : null;
  } catch {
    return null;
  }
}

export function isMicrosoftGraphToken(accessToken: string) {
  const audience = tokenAudience(accessToken);
  return audience === GRAPH_APP_ID || audience === "https://graph.microsoft.com" || audience === "https://graph.microsoft.com/";
}

function assertMicrosoftGraphToken(accessToken: string) {
  if (!isMicrosoftGraphToken(accessToken)) {
    throw new GraphError(401, "InvalidTokenAudience", "Internal webmail requires a Microsoft Graph access token");
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
    const message = body?.error?.message ?? "Microsoft Graph request failed";
    if (config().NODE_ENV === "development") {
      const requestUrl = new URL(url);
      console.warn("[microsoft] Graph request failed", {
        target: "Microsoft Graph",
        hostname: requestUrl.hostname,
        path: requestUrl.pathname,
        status: response.status,
        code,
      });
    }
    if (/AADSTS500014/i.test(message) && /outlook\.office(?:365)?\.com/i.test(message)) {
      throw new GraphError(
        503,
        "ExchangeOnlineUnavailable",
        "Microsoft Graph authentication succeeded, but Exchange Online is disabled or unavailable for this tenant. Verify its Microsoft 365 subscription, Exchange Online license, and Exchange Online enterprise application.",
      );
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) =>
        setTimeout(resolve, Number.isFinite(retryAfter) ? retryAfter * 1000 : 2 ** attempt * 500),
      );
      continue;
    }
    throw new GraphError(response.status, code, message);
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
      clientId: microsoftClientId(),
      authority: microsoftAuthority(config().MICROSOFT_AUTHORITY),
    },
    cache: cachePlugin ? { cachePlugin } : undefined,
    system: { loggerOptions: { piiLoggingEnabled: false } },
  });
}

async function markReauthentication(connectionId: string) {
  const changed = await db.microsoftConnection.updateMany({
    where: {
      id: connectionId,
      authorizationStatus: AuthorizationStatus.CONNECTED,
    },
    data: { authorizationStatus: AuthorizationStatus.REAUTHENTICATION_REQUIRED },
  });
  if (changed.count) {
    await db.auditEvent.create({
      data: {
        connectionId,
        action: "microsoft.connection.reauthentication_required",
        targetType: "MicrosoftConnection",
        targetId: connectionId,
        requestId: crypto.randomUUID(),
        result: "FAILURE",
      },
    });
  }
}

export function microsoftErrorCode(error: unknown): string {
  if (typeof error !== "object" || !error) return "device_authorization_failed";
  const message = "errorMessage" in error ? String(error.errorMessage) : "message" in error ? String(error.message) : "";
  const aadCode = message.match(/\bAADSTS\d+\b/i)?.[0];
  if (aadCode) return aadCode.toUpperCase();
  return "errorCode" in error ? String(error.errorCode) : "device_authorization_failed";
}

function microsoftErrorDescription(error: unknown): string {
  if (typeof error !== "object" || !error) return "Microsoft device authorization failed";
  const description = "errorMessage" in error
    ? String(error.errorMessage)
    : "message" in error
      ? String(error.message)
      : "Microsoft device authorization failed";
  return description.slice(0, 1000);
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

class MicrosoftAccountMismatch extends Error {
  readonly errorCode = "account_mismatch";

  constructor() {
    super("The Microsoft identity does not match the connected account being updated.");
  }
}

export class MicrosoftReauthenticationRequired extends Error {
  constructor() {
    super("Microsoft reauthentication is required");
  }
}
