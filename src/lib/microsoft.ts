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
import { microsoftAuthority } from "@/lib/microsoft-authority";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE_ROOT = "https://graph.microsoft.com/";
const GRAPH_APP_ID = "00000003-0000-0000-c000-000000000000";
const NON_GRAPH_SCOPES = new Set(["openid", "profile", "email", "offline_access"]);
const DEVICE_IDENTITY_SCOPES = new Set(["offline_access"]);
const NORMAL_GRAPH_SCOPES = new Map([
  ["user.read", "User.Read"],
  ["mail.read", "Mail.Read"],
  ["mail.readwrite", "Mail.ReadWrite"],
  ["mail.send", "Mail.Send"],
  ["mailboxsettings.readwrite", "MailboxSettings.ReadWrite"],
]);
const INITIAL_CONNECTION_SCOPES = [
  "offline_access",
  `${GRAPH_SCOPE_ROOT}User.Read`,
  `${GRAPH_SCOPE_ROOT}Mail.Read`,
];
const MAILBOX_ACCESS_SCOPES = [
  "offline_access",
  `${GRAPH_SCOPE_ROOT}Mail.Read`,
];
const MAILBOX_SETTINGS_SCOPES = [
  "offline_access",
  `${GRAPH_SCOPE_ROOT}User.Read`,
  `${GRAPH_SCOPE_ROOT}MailboxSettings.ReadWrite`,
];
const pending = new Map<string, Promise<void>>();
const loggedGraphAudience = new Set<string>();

export type MicrosoftAuthorizationPurpose = "identity" | "mailbox" | "mailbox-settings";

type DeviceChallenge = {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  message: string;
};

export async function startDeviceAuthorization(
  pageProjectId?: string,
  purpose: MicrosoftAuthorizationPurpose = "identity",
  expectedConnectionId?: string,
): Promise<{ publicId: string; statusToken: string }> {
  microsoftClientId();
  if (purpose !== "identity" && !expectedConnectionId) {
    throw new MicrosoftConfigurationError(
      "Incremental Microsoft authorization requires the existing connection ID",
    );
  }
  const expectedConnection = expectedConnectionId
    ? await db.microsoftConnection.findUnique({
        where: { id: expectedConnectionId },
        select: {
          tenantId: true,
          microsoftUserId: true,
          encryptedTokenCache: true,
        },
      })
    : null;
  if (expectedConnectionId && !expectedConnection) {
    throw new MicrosoftConfigurationError(
      "The Microsoft connection selected for incremental authorization no longer exists",
    );
  }
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
      expectedConnectionId,
    },
  });
  if (config().NODE_ENV === "development") {
    console.info("[microsoft] authorization started", {
      authority: microsoftAuthority(),
      clientId: config().MICROSOFT_CLIENT_ID,
      requestedScopes: scopes.map(scopeName),
    });
  }

  let challengeReady!: (challenge: DeviceChallenge) => void;
  let challengeFailed!: (error: unknown) => void;
  const challenge = new Promise<DeviceChallenge>((resolve, reject) => {
    challengeReady = resolve;
    challengeFailed = reject;
  });

  const pca = createClient(expectedConnection
    ? {
        beforeCacheAccess: async (context: TokenCacheContext) => {
          context.tokenCache.deserialize(decrypt(
            expectedConnection.encryptedTokenCache,
            `msal:${expectedConnection.tenantId}:${expectedConnection.microsoftUserId}`,
          ));
        },
        // Do not persist a changed cache until account, audience, scope, and
        // live mailbox probes have all succeeded in completeAuthorization.
        afterCacheAccess: async () => undefined,
      }
    : undefined);
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
          authority: microsoftAuthority(),
          clientId: config().MICROSOFT_CLIENT_ID,
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
          errorDescription: microsoftErrorDescription(error),
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
      errorDescription: true,
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
        errorDescription: true,
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
      requestedScopes: true,
      expectedConnectionId: true,
    },
  });
  if (!pendingSession || pendingSession.status !== AuthorizationStatus.PENDING || pendingSession.expiresAt <= new Date()) return;
  const graphAuthorization = pendingSession.requestedScopes.some((scope) =>
    scope.toLowerCase().startsWith(GRAPH_SCOPE_ROOT),
  );
  const mailboxAuthorization = pendingSession.requestedScopes.some(
    (scope) => scopeName(scope).toLowerCase() === "mail.read",
  );
  const profile = profileFromAuthenticationResult(result);
  if (graphAuthorization) {
    assertMicrosoftGraphToken(result.accessToken);
    const tokenIdentity = microsoftIdentityFromAccessToken(result.accessToken);
    if (!tokenIdentity) {
      throw new GraphError(
        401,
        "InvalidTokenIdentity",
        "Microsoft Graph token did not contain tenant and object identity claims.",
      );
    }
    assertMicrosoftConnectionIdentity(
      { tenantId: result.tenantId, microsoftUserId: profile.id },
      tokenIdentity,
    );
    if (mailboxAuthorization && !tokenDelegatedScopes(result.accessToken).has("mail.read")) {
      throw new GraphError(
        403,
        "MissingMailReadScope",
        "Microsoft returned a Graph token without the delegated Mail.Read scope.",
      );
    }
  } else {
    assertConfiguredResourceToken(result.accessToken);
  }
  const expectedConnection = pendingSession.expectedConnectionId
    ? await db.microsoftConnection.findUnique({
        where: { id: pendingSession.expectedConnectionId },
        select: { id: true, tenantId: true, microsoftUserId: true },
      })
    : null;
  if (pendingSession.expectedConnectionId && !expectedConnection) {
    throw new MicrosoftAccountMismatchError(
      "The Microsoft connection selected for incremental authorization no longer exists.",
    );
  }
  if (expectedConnection) {
    assertMicrosoftConnectionIdentity(expectedConnection, {
      tenantId: result.tenantId,
      microsoftUserId: profile.id,
    });
  }
  if (mailboxAuthorization) {
    await graphFetchWithToken<{ value: Array<{ id: string }> }>(
      result.accessToken,
      "/me/mailFolders?$top=1&$select=id",
    );
    await graphFetchWithToken<{ value: Array<{ id: string }> }>(
      result.accessToken,
      "/me/mailFolders/inbox/messages?$top=10&$select=id",
    );
  }
  const stillPending = await db.microsoftAuthorizationSession.findUnique({ where: { id: authorizationSessionId }, select: { status: true, expiresAt: true } });
  if (!stillPending || stillPending.status !== AuthorizationStatus.PENDING || stillPending.expiresAt <= new Date()) return;
  const encryptedTokenCache = encrypt(
    pca.getTokenCache().serialize(),
    `msal:${result.tenantId}:${profile.id}`,
  );
  const existingConnection = await db.microsoftConnection.findUnique({
    where: { tenantId_microsoftUserId: { tenantId: result.tenantId, microsoftUserId: profile.id } },
    select: { grantedScopes: true },
  });
  const grantedScopes = [...new Set([
    ...(existingConnection?.grantedScopes ?? []),
    ...result.scopes,
    ...(mailboxAuthorization ? ["Mail.Read"] : []),
  ])];
  const mailboxReadiness = mailboxAuthorization
    ? {
        mailboxAvailable: true,
        canReadMail: true,
        canReadMailFolders: true,
        mailboxCheckedAt: new Date(),
        accessTokenExpiresAt: result.expiresOn ?? null,
      }
    : {};

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
      clientId: microsoftClientId(),
      displayName: profile.displayName,
      userPrincipalName: profile.userPrincipalName,
      email: profile.mail,
      encryptedTokenCache,
      grantedScopes,
      authorizationStatus: AuthorizationStatus.CONNECTED,
      ...mailboxReadiness,
    },
    update: {
      clientId: microsoftClientId(),
      displayName: profile.displayName,
      userPrincipalName: profile.userPrincipalName,
      email: profile.mail,
      encryptedTokenCache,
      grantedScopes,
      connectedAt: new Date(),
      authorizationStatus: AuthorizationStatus.CONNECTED,
      ...mailboxReadiness,
    },
  });

  await db.microsoftAuthorizationSession.update({
    where: { id: authorizationSessionId },
    data: { status: AuthorizationStatus.CONNECTED, connectionId: connection.id },
  });
  if (config().NODE_ENV === "development") {
    console.info("[microsoft] authorization completed", {
      authority: microsoftAuthority(),
      clientId: config().MICROSOFT_CLIENT_ID,
      requestedScopes: result.scopes.map(scopeName),
      tenantId: result.tenantId,
    });
  }
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
      await markReauthentication(connectionId);
    }
    throw error;
  }
}

export type MailboxStatus = "READY" | "NOT_AUTHORIZED" | "REAUTH_REQUIRED" | "ERROR";

export type MailboxDiagnostic = {
  mailboxAvailable: boolean;
  statusCode: number;
  grantedScopes: string[];
  tokenAudience: string;
  tokenExpiry: string | null;
  folderCount: number | null;
  messageCount: number | null;
};

export type MsalClientProbe = {
  clientId: string | null;
  accountMetadataFound: boolean;
  ownTokenState: boolean;
  refreshTokenPresent: boolean;
  authentication: "PASS" | "FAIL" | "NOT_CONFIGURED";
  silentAcquisition: "PASS" | "FAIL" | "NOT_RUN";
  interactionRequired: boolean;
  graph: "PASS" | "FAIL" | "NOT_RUN";
  audience: string;
  grantedScopes: string[];
  mailRead: boolean;
  errorCode: string | null;
  aadstsCode: string | null;
};

export type MsalClientMatrix = {
  clientA: MsalClientProbe;
  clientB: MsalClientProbe | null;
  foci: {
    familyRefreshTokenPresent: boolean;
    actualMicrosoftFamilyMembership: string[];
    familyLookupEligible: boolean;
    note: string;
  };
};

type MsalCacheCredential = {
  home_account_id?: string;
  client_id?: string;
  family_id?: string;
};

export function inspectMsalCacheMetadata(
  serializedCache: string,
  microsoftUserId: string,
  clientIds: string[],
) {
  let parsed: {
    AccessToken?: Record<string, MsalCacheCredential>;
    RefreshToken?: Record<string, MsalCacheCredential>;
  };
  try {
    parsed = JSON.parse(serializedCache) as typeof parsed;
  } catch {
    parsed = {};
  }
  const belongsToAccount = (credential: MsalCacheCredential) =>
    !credential.home_account_id
    || credential.home_account_id.toLowerCase().includes(microsoftUserId.toLowerCase());
  const accessTokens = Object.values(parsed.AccessToken ?? {}).filter(belongsToAccount);
  const refreshTokens = Object.values(parsed.RefreshToken ?? {}).filter(belongsToAccount);
  const familyIds = [...new Set(
    refreshTokens.map((credential) => credential.family_id).filter((value): value is string => Boolean(value)),
  )].sort();
  const clients = Object.fromEntries(clientIds.map((clientId) => {
    const normalized = clientId.toLowerCase();
    const hasAccessToken = accessTokens.some(
      (credential) => credential.client_id?.toLowerCase() === normalized,
    );
    const hasRefreshToken = refreshTokens.some(
      (credential) => credential.client_id?.toLowerCase() === normalized,
    );
    return [clientId, { hasAccessToken, hasRefreshToken }];
  }));
  return {
    clients,
    familyRefreshTokenPresent: familyIds.length > 0,
    familyIds,
  };
}

export async function diagnoseMsalClientMatrix(
  connectionId: string,
  comparisonClientId?: string,
): Promise<MsalClientMatrix> {
  const connection = await db.microsoftConnection.findUniqueOrThrow({
    where: { id: connectionId },
  });
  const serializedCache = decrypt(
    connection.encryptedTokenCache,
    `msal:${connection.tenantId}:${connection.microsoftUserId}`,
  );
  const configuredClientId = connection.clientId || config().MICROSOFT_CLIENT_ID || null;
  const clientIds = [configuredClientId, comparisonClientId]
    .filter((value): value is string => Boolean(value));
  const metadata = inspectMsalCacheMetadata(
    serializedCache,
    connection.microsoftUserId,
    clientIds,
  );
  const clientA = await probeMsalClient(
    configuredClientId,
    connection.microsoftUserId,
    serializedCache,
    metadata,
  );
  const clientB = comparisonClientId
    ? await probeMsalClient(
        comparisonClientId,
        connection.microsoftUserId,
        serializedCache,
        metadata,
      )
    : null;
  return {
    clientA,
    clientB,
    foci: {
      familyRefreshTokenPresent: metadata.familyRefreshTokenPresent,
      actualMicrosoftFamilyMembership: metadata.familyIds,
      familyLookupEligible: metadata.familyRefreshTokenPresent && Boolean(comparisonClientId),
      note: metadata.familyRefreshTokenPresent
        ? "MSAL cache contains an actual family refresh-token marker. Microsoft still decides whether the comparison client belongs to that family."
        : "No family_id exists in the encrypted MSAL cache; cross-client family lookup is unavailable.",
    },
  };
}

async function probeMsalClient(
  clientId: string | null,
  microsoftUserId: string,
  serializedCache: string,
  metadata: ReturnType<typeof inspectMsalCacheMetadata>,
): Promise<MsalClientProbe> {
  if (!clientId) return emptyMsalClientProbe(null, "NOT_CONFIGURED");
  const ownState = metadata.clients[clientId] ?? {
    hasAccessToken: false,
    hasRefreshToken: false,
  };
  const pca = new PublicClientApplication({
    auth: { clientId, authority: microsoftAuthority() },
    cache: {
      cachePlugin: {
        beforeCacheAccess: async (context: TokenCacheContext) => {
          context.tokenCache.deserialize(serializedCache);
        },
        // Diagnostics never persist cache mutations or returned tokens.
        afterCacheAccess: async () => undefined,
      },
    },
    system: { loggerOptions: { piiLoggingEnabled: false } },
  });
  const account = (await pca.getTokenCache().getAllAccounts()).find(
    (candidate) =>
      candidate.localAccountId.toLowerCase() === microsoftUserId.toLowerCase(),
  );
  if (!account) {
    return {
      ...emptyMsalClientProbe(clientId, "FAIL"),
      accountMetadataFound: false,
      ownTokenState: ownState.hasAccessToken || ownState.hasRefreshToken,
      refreshTokenPresent: ownState.hasRefreshToken,
      errorCode: "account_not_found",
    };
  }
  try {
    const result = await pca.acquireTokenSilent({
      account,
      scopes: [
        `${GRAPH_SCOPE_ROOT}User.Read`,
        `${GRAPH_SCOPE_ROOT}Mail.Read`,
      ],
    });
    const audience = tokenAudience(result.accessToken) ?? "NONE";
    const grantedScopes = [...tokenDelegatedScopes(result.accessToken)].sort();
    const graph = isMicrosoftGraphToken(result.accessToken);
    return {
      clientId,
      accountMetadataFound: true,
      ownTokenState: ownState.hasAccessToken || ownState.hasRefreshToken,
      refreshTokenPresent: ownState.hasRefreshToken,
      authentication: "PASS",
      silentAcquisition: "PASS",
      interactionRequired: false,
      graph: graph ? "PASS" : "FAIL",
      audience,
      grantedScopes,
      mailRead: graph && grantedScopes.includes("mail.read"),
      errorCode: null,
      aadstsCode: null,
    };
  } catch (error) {
    const errorCode = microsoftErrorCode(error);
    const description = microsoftErrorDescription(error);
    return {
      clientId,
      accountMetadataFound: true,
      ownTokenState: ownState.hasAccessToken || ownState.hasRefreshToken,
      refreshTokenPresent: ownState.hasRefreshToken,
      authentication: ownState.hasAccessToken || ownState.hasRefreshToken
        ? "PASS"
        : "FAIL",
      silentAcquisition: "FAIL",
      interactionRequired: error instanceof InteractionRequiredAuthError
        || /interaction|required|consent|no_tokens_found|invalid_grant/i.test(errorCode),
      graph: "FAIL",
      audience: "NONE",
      grantedScopes: [],
      mailRead: false,
      errorCode,
      aadstsCode: description.match(/\bAADSTS\d+\b/i)?.[0].toUpperCase() ?? null,
    };
  }
}

function emptyMsalClientProbe(
  clientId: string | null,
  authentication: "FAIL" | "NOT_CONFIGURED",
): MsalClientProbe {
  return {
    clientId,
    accountMetadataFound: false,
    ownTokenState: false,
    refreshTokenPresent: false,
    authentication,
    silentAcquisition: "NOT_RUN",
    interactionRequired: false,
    graph: "NOT_RUN",
    audience: "NONE",
    grantedScopes: [],
    mailRead: false,
    errorCode: authentication === "NOT_CONFIGURED" ? "client_not_configured" : null,
    aadstsCode: null,
  };
}

export async function diagnoseMailboxConnection(
  connectionId: string,
): Promise<MailboxDiagnostic> {
  const connection = await db.microsoftConnection.findUniqueOrThrow({
    where: { id: connectionId },
    select: { grantedScopes: true },
  });
  const storedScopes = normalizedScopeNames(connection.grantedScopes);
  let grantedScopes = storedScopes;
  let tokenAudienceValue = "NONE";
  let tokenExpiry: string | null = null;
  try {
    const authorization = await acquireGraphToken(connectionId);
    tokenAudienceValue = tokenAudience(authorization.token) ?? "NONE";
    tokenExpiry = authorization.expiresOn?.toISOString() ?? null;
    grantedScopes = [...tokenDelegatedScopes(authorization.token)].sort();
    if (!grantedScopes.includes("mail.read")) {
      return {
        mailboxAvailable: false,
        statusCode: 403,
        grantedScopes,
        tokenAudience: tokenAudienceValue,
        tokenExpiry,
        folderCount: null,
        messageCount: null,
      };
    }
    const folders = await graphFetchWithToken<{ value: Array<{ id: string }> }>(
      authorization.token,
      "/me/mailFolders?$top=1&$select=id",
    );
    const messages = await graphFetchWithToken<{ value: Array<{ id: string }> }>(
      authorization.token,
      "/me/mailFolders/inbox/messages?$top=1&$select=id",
    );
    return {
      mailboxAvailable: true,
      statusCode: 200,
      grantedScopes,
      tokenAudience: tokenAudienceValue,
      tokenExpiry,
      folderCount: folders.value.length,
      messageCount: messages.value.length,
    };
  } catch (error) {
    return {
      mailboxAvailable: false,
      statusCode: mailboxDiagnosticStatusCode(error),
      grantedScopes,
      tokenAudience: tokenAudienceValue,
      tokenExpiry,
      folderCount: null,
      messageCount: null,
    };
  }
}

export function mailboxDiagnosticStatusCode(error: unknown) {
  if (error instanceof MicrosoftReauthenticationRequired) return 401;
  if (error instanceof GraphError) {
    if ([401, 403, 429].includes(error.status)) return error.status;
    return error.status >= 400 && error.status <= 599 ? error.status : 500;
  }
  return 500;
}

function normalizedScopeNames(scopes: string[]) {
  return [...new Set(scopes.map((scope) => scopeName(scope).toLowerCase()))].sort();
}

export async function probeMailboxReadiness(connectionId: string): Promise<{
  mailboxAvailable: boolean;
  mailboxStatus: MailboxStatus;
}> {
  try {
    await graphFetch<{ value: Array<{ id: string }> }>(
      connectionId,
      "/me/mailFolders?$top=1&$select=id",
    );
    await db.microsoftConnection.update({
      where: { id: connectionId },
      data: {
        mailboxAvailable: true,
        canReadMail: true,
        canReadMailFolders: true,
        mailboxCheckedAt: new Date(),
      },
    });
    return { mailboxAvailable: true, mailboxStatus: "READY" };
  } catch (error) {
    await db.microsoftConnection.update({
      where: { id: connectionId },
      data: {
        mailboxAvailable: false,
        canReadMail: false,
        canReadMailFolders: false,
        mailboxCheckedAt: new Date(),
      },
    });
    if (
      error instanceof MicrosoftReauthenticationRequired
      || (error instanceof GraphError
        && (error.status === 401 || error.code === "InvalidAuthenticationToken"))
    ) {
      return { mailboxAvailable: false, mailboxStatus: "REAUTH_REQUIRED" };
    }
    if (error instanceof GraphError && error.status === 403) {
      return { mailboxAvailable: false, mailboxStatus: "NOT_AUTHORIZED" };
    }
    return { mailboxAvailable: false, mailboxStatus: "ERROR" };
  }
}

async function acquireGraphToken(connectionId: string) {
  const connection = await db.microsoftConnection.findUniqueOrThrow({ where: { id: connectionId } });
  if (connection.clientId && connection.clientId !== microsoftClientId()) {
    await markReauthentication(connectionId);
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
  const account = accounts.find((item: AccountInfo) => item.localAccountId === connection.microsoftUserId);
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
      data: { accessTokenExpiresAt: result.expiresOn ?? null },
    });
    if (config().NODE_ENV === "development" && !loggedGraphAudience.has(connectionId)) {
      loggedGraphAudience.add(connectionId);
      console.info("[microsoft] token target/resource = Microsoft Graph", { connectionId, audience: tokenAudience(result.accessToken) });
    }
    return { token: result.accessToken, connection, expiresOn: result.expiresOn };
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

export function deviceAuthorizationScopes(scopes: string[]) {
  const identity = scopes
    .map((scope) => scope.trim().toLowerCase())
    .filter((scope) => DEVICE_IDENTITY_SCOPES.has(scope));
  return [...new Set([...identity, ...graphDelegatedScopes(scopes)])];
}

export function microsoftAuthorizationScopes(
  purpose: MicrosoftAuthorizationPurpose,
) {
  if (purpose === "mailbox-settings") return [...MAILBOX_SETTINGS_SCOPES];
  if (purpose === "mailbox") return [...MAILBOX_ACCESS_SCOPES];
  return [...INITIAL_CONNECTION_SCOPES];
}

function scopeName(scope: string) {
  return scope.toLowerCase().startsWith(GRAPH_SCOPE_ROOT)
    ? scope.slice(GRAPH_SCOPE_ROOT.length)
    : scope;
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

export function tokenDelegatedScopes(accessToken: string) {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"),
    ) as { scp?: unknown };
    if (typeof payload.scp !== "string") return new Set<string>();
    return new Set(payload.scp.split(/\s+/).filter(Boolean).map((scope) => scope.toLowerCase()));
  } catch {
    return new Set<string>();
  }
}

export function microsoftIdentityFromAccessToken(accessToken: string) {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"),
    ) as { tid?: unknown; oid?: unknown };
    if (typeof payload.tid !== "string" || typeof payload.oid !== "string") return null;
    return { tenantId: payload.tid, microsoftUserId: payload.oid };
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

function assertConfiguredResourceToken(accessToken: string) {
  const audience = tokenAudience(accessToken);
  const { appId } = microsoftResourceConfiguration();
  if (audience !== appId && audience !== `api://${appId}`) {
    throw new MicrosoftConfigurationError(
      "Microsoft returned a token for a resource that does not match MICROSOFT_RESOURCE_APP_ID",
    );
  }
}

function profileFromAuthenticationResult(result: AuthenticationResult) {
  const claims = (result.idTokenClaims ?? {}) as {
    oid?: unknown;
    name?: unknown;
    preferred_username?: unknown;
    email?: unknown;
  };
  const id = typeof claims.oid === "string"
    ? claims.oid
    : result.account?.localAccountId;
  if (!id) {
    throw new MicrosoftConfigurationError("Microsoft did not return an account object identifier");
  }
  const userPrincipalName = typeof claims.preferred_username === "string"
    ? claims.preferred_username
    : result.account?.username;
  const email = typeof claims.email === "string" ? claims.email : userPrincipalName;
  return {
    id,
    displayName: typeof claims.name === "string" ? claims.name : result.account?.name,
    userPrincipalName,
    mail: email,
  };
}

export function assertMicrosoftConnectionIdentity(
  expected: { tenantId: string; microsoftUserId: string },
  authorized: { tenantId: string; microsoftUserId: string },
) {
  if (
    expected.tenantId.toLowerCase() !== authorized.tenantId.toLowerCase()
    || expected.microsoftUserId.toLowerCase() !== authorized.microsoftUserId.toLowerCase()
  ) {
    throw new MicrosoftAccountMismatchError(
      "Microsoft authorized a different account. Sign in with the account already connected to this website session.",
    );
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
  const clientId = microsoftClientId();
  return new PublicClientApplication({
    auth: {
      clientId,
      authority: microsoftAuthority(),
    },
    cache: cachePlugin ? { cachePlugin } : undefined,
    system: { loggerOptions: { piiLoggingEnabled: false } },
  });
}

function microsoftClientId() {
  const clientId = config().MICROSOFT_CLIENT_ID;
  if (!clientId) {
    throw new MicrosoftConfigurationError(
      "Microsoft login is not configured. Set MICROSOFT_CLIENT_ID.",
    );
  }
  return clientId;
}

function microsoftResourceConfiguration() {
  const { MICROSOFT_RESOURCE_APP_ID: appId, MICROSOFT_RESOURCE_SCOPE: scope } = config();
  const missing = [
    ...(!appId ? ["MICROSOFT_RESOURCE_APP_ID"] : []),
    ...(!scope ? ["MICROSOFT_RESOURCE_SCOPE"] : []),
  ];
  if (missing.length) {
    throw new MicrosoftConfigurationError(
      `Microsoft login is not configured. Set ${missing.join(" and ")}.`,
    );
  }
  const normalizedScope = scope.toLowerCase();
  const normalizedAppId = appId.toLowerCase();
  if (
    !normalizedScope.startsWith(`${normalizedAppId}/`)
    && !normalizedScope.startsWith(`api://${normalizedAppId}/`)
  ) {
    throw new MicrosoftConfigurationError(
      "MICROSOFT_RESOURCE_SCOPE must target MICROSOFT_RESOURCE_APP_ID",
    );
  }
  return { appId, scope };
}

async function markReauthentication(connectionId: string) {
  await db.microsoftConnection.update({
    where: { id: connectionId },
    data: {
      authorizationStatus: AuthorizationStatus.REAUTHENTICATION_REQUIRED,
      mailboxAvailable: false,
      canReadMail: false,
      canReadMailFolders: false,
      mailboxCheckedAt: new Date(),
    },
  });
}

function microsoftErrorCode(error: unknown): string {
  if (typeof error !== "object" || !error) return "device_authorization_failed";
  const message = "errorMessage" in error ? String(error.errorMessage) : "message" in error ? String(error.message) : "";
  const aadCode = message.match(/\bAADSTS\d+\b/i)?.[0];
  if (aadCode) return aadCode.toUpperCase();
  if ("errorCode" in error) return String(error.errorCode);
  if ("code" in error) return String(error.code);
  return "device_authorization_failed";
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

export class MicrosoftReauthenticationRequired extends Error {
  constructor() {
    super("Microsoft reauthentication is required");
  }
}

export class MicrosoftConfigurationError extends Error {}

export class MicrosoftAccountMismatchError extends Error {
  readonly code = "MICROSOFT_ACCOUNT_MISMATCH";
}
