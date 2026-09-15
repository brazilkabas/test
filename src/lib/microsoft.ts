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
import {
  config,
  MicrosoftConfigurationError,
  microsoftAuthConfig,
  microsoftClientId,
  microsoftGraphMailAuthConfig,
  microsoftRedirectUri,
  type MicrosoftAuthConfig,
  type MicrosoftGraphMailAuthConfig,
} from "@/lib/config";
import { decrypt, encrypt, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { microsoftAuthority } from "@/lib/microsoft-authority";
import {
  MICROSOFT_GRAPH_API_ROOT,
  MICROSOFT_GRAPH_RESOURCE,
  MICROSOFT_GRAPH_RESOURCE_ID,
  MICROSOFT_GRAPH_SCOPE_ROOT,
  isMicrosoftGraphResource,
  tokenAudienceMatchesResource,
} from "@/lib/microsoft-resource";

const NON_GRAPH_SCOPES = new Set(["openid", "profile", "email", "offline_access"]);
const DEVICE_IDENTITY_SCOPES = new Set(["openid", "profile", "email", "offline_access"]);
const NORMAL_GRAPH_SCOPES = new Map([
  ["user.read", "User.Read"],
  ["mail.read", "Mail.Read"],
  ["mail.readwrite", "Mail.ReadWrite"],
  ["mail.send", "Mail.Send"],
  ["mailboxsettings.readwrite", "MailboxSettings.ReadWrite"],
]);
const pending = new Map<string, Promise<void>>();
const loggedGraphAudience = new Set<string>();

export type MicrosoftAuthorizationPurpose = "identity" | "mailbox" | "mailbox-settings";

type AuthorizationTarget = {
  connectionId?: string;
  authorizationProfile?: "PRIMARY" | "GRAPH_MAIL";
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
  const authConfig = microsoftAuthConfig();
  const statusToken = randomBytes(32).toString("base64url");
  const scopes = microsoftAuthorizationScopes(purpose, authConfig.requestedScopes);
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
      clientId: authConfig.clientId,
      resourceAppId: authConfig.resourceAppId,
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
      authorizationProfile: true,
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
  const authorizationProfile = target.authorizationProfile ?? "PRIMARY";
  if (authorizationProfile === "GRAPH_MAIL" && !target.connectionId) {
    throw new MicrosoftConfigurationError("Graph mail authorization must be attached to an existing Microsoft connection.");
  }
  const authConfig = authorizationProfile === "GRAPH_MAIL"
    ? microsoftGraphMailAuthConfig()
    : microsoftAuthConfig();
  const statusToken = randomBytes(32).toString("base64url");
  const scopes = microsoftAuthorizationScopes(purpose, authConfig.requestedScopes);
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
      clientId: authConfig.clientId,
      resourceAppId: authConfig.resourceAppId,
      authorizationProfile,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      pageProjectId: customizedPage?.id,
      connectionId: target.connectionId,
    },
  });
  if (config().NODE_ENV === "development") {
    console.info("[microsoft] Microsoft authentication configuration", {
      authFlow: "Device Code",
      clientId: authConfig.clientId,
      resource: isMicrosoftGraphResource(authConfig.resourceAppId) ? MICROSOFT_GRAPH_RESOURCE : "Configured Microsoft resource",
      resourceId: authConfig.resourceAppId,
      authority: microsoftAuthority(authConfig.authority),
      requestedScopes: scopes,
    });
  }

  let challengeReady!: (challenge: DeviceChallenge) => void;
  let challengeFailed!: (error: unknown) => void;
  const challenge = new Promise<DeviceChallenge>((resolve, reject) => {
    challengeReady = resolve;
    challengeFailed = reject;
  });

  const pca = createClient(undefined, authConfig);
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
          clientId: authConfig.clientId,
          resource: isMicrosoftGraphResource(authConfig.resourceAppId) ? MICROSOFT_GRAPH_RESOURCE : "Configured Microsoft resource",
          resourceId: authConfig.resourceAppId,
          authority: microsoftAuthority(config().MICROSOFT_AUTHORITY),
          requestedScopes: scopes,
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
      authorizationProfile: true,
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
        authorizationProfile: true,
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
  const claimed = await db.microsoftAuthorizationSession.updateMany({
    where: {
      id: authorizationSessionId,
      status: { in: [AuthorizationStatus.PENDING, AuthorizationStatus.EXPIRED] },
      errorCode: null,
    },
    data: {
      status: AuthorizationStatus.PENDING,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });
  if (!claimed.count) return;
  const pendingSession = await db.microsoftAuthorizationSession.findUnique({
    where: { id: authorizationSessionId },
    select: {
      clientId: true,
      resourceAppId: true,
      authorizationProfile: true,
      connection: {
        select: {
          id: true,
          tenantId: true,
          microsoftUserId: true,
          clientId: true,
          resourceAppId: true,
        },
      },
    },
  });
  if (!pendingSession) return;
  assertResourceToken(result.accessToken, pendingSession.resourceAppId);
  const cachedAccounts = await pca.getTokenCache().getAllAccounts();
  const accessClaims = tokenClaims(result.accessToken);
  const authenticatedAccount = result.account
    ?? cachedAccounts.find((account) => (
      account.tenantId === result.tenantId
      && account.localAccountId === accessClaims?.oid
    ));
  if (!authenticatedAccount) throw new Error("Microsoft token cache did not contain the authenticated account");
  const graphResource = isMicrosoftGraphResource(pendingSession.resourceAppId);
  let profile: {
    id: string;
    displayName?: string;
    userPrincipalName?: string;
    mail?: string;
    otherMails?: string[];
  };
  if (graphResource) {
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
  } else {
    const idTokenClaims = result.idTokenClaims as Record<string, unknown> | undefined;
    const identityId = authenticatedAccount.localAccountId
      || claimString(accessClaims?.oid)
      || claimString(idTokenClaims?.oid);
    if (!identityId) throw new Error("Microsoft returned no stable user object ID");
    profile = {
      id: identityId,
      displayName: authenticatedAccount.name || claimString(idTokenClaims?.name),
      userPrincipalName: authenticatedAccount.username || claimString(idTokenClaims?.preferred_username),
      mail: claimString(idTokenClaims?.email),
    };
  }
  if (!profile.id?.trim()) throw new Error("Microsoft returned no stable user object ID");
  if (
    pendingSession.connection
    && (
      pendingSession.connection.tenantId !== result.tenantId
      || pendingSession.connection.microsoftUserId !== profile.id
      || (
        pendingSession.authorizationProfile === "PRIMARY"
        && (
          pendingSession.connection.clientId !== pendingSession.clientId
          || pendingSession.connection.resourceAppId !== pendingSession.resourceAppId
        )
      )
    )
  ) {
    throw new MicrosoftAccountMismatch();
  }
  const grantedCapabilities = microsoftCapabilitiesFromScopes(result.scopes, pendingSession.resourceAppId);
  if (graphResource && grantedCapabilities.canReadMail) {
    try {
      await graphFetchWithToken(
        result.accessToken,
        "/me/mailFolders?$top=1&$select=id",
      );
      await graphFetchWithToken(
        result.accessToken,
        "/me/mailFolders/inbox/messages?$top=10",
      );
    } catch (error) {
      await db.auditEvent.create({
        data: {
          action: "microsoft.graph.mail_verification_failed",
          targetType: "MicrosoftAuthorizationSession",
          targetId: authorizationSessionId,
          requestId: crypto.randomUUID(),
          result: "FAILURE",
          metadata: {
            endpoint: error instanceof GraphError ? error.endpoint : "/me/mailFolders",
            microsoftCode: error instanceof GraphError ? error.code : undefined,
            httpStatus: error instanceof GraphError ? error.status : undefined,
          },
        },
      });
      throw error;
    }
  }
  const email = microsoftProfileEmail(
    profile,
    result.idTokenClaims as Record<string, unknown> | undefined,
  );
  if (
    authenticatedAccount.tenantId !== result.tenantId
    || authenticatedAccount.localAccountId !== profile.id
  ) {
    throw new MicrosoftAccountMismatch();
  }
  if (pendingSession.authorizationProfile === "GRAPH_MAIL") {
    if (!pendingSession.connection || !graphResource) {
      throw new MicrosoftConfigurationError("Graph mail authorization is not attached to a valid Microsoft Graph target.");
    }
    const tokenCacheKeyVersion = 1;
    const encryptedTokenCache = encrypt(
      pca.getTokenCache().serialize(),
      microsoftGraphMailTokenCacheContext({
        connectionId: pendingSession.connection.id,
        tenantId: result.tenantId,
        microsoftUserId: profile.id,
        clientId: pendingSession.clientId,
        tokenCacheKeyVersion,
      }),
    );
    const now = new Date();
    await db.$transaction(async (transaction) => {
      const graphMailAuth = await transaction.microsoftGraphMailAuth.upsert({
        where: { connectionId: pendingSession.connection!.id },
        create: {
          connectionId: pendingSession.connection!.id,
          tenantId: result.tenantId,
          microsoftUserId: profile.id,
          microsoftHomeAccountId: authenticatedAccount.homeAccountId,
          clientId: pendingSession.clientId,
          resourceAppId: MICROSOFT_GRAPH_RESOURCE_ID,
          grantedScopes: result.scopes.map(scopeName),
          capabilities: grantedCapabilities,
          authorizationStatus: AuthorizationStatus.CONNECTED,
          encryptedTokenCache,
          tokenCacheKeyVersion,
          accessTokenExpiresAt: result.expiresOn,
          lastSuccessfulGraphAt: now,
        },
        update: {
          tenantId: result.tenantId,
          microsoftUserId: profile.id,
          microsoftHomeAccountId: authenticatedAccount.homeAccountId,
          clientId: pendingSession.clientId,
          resourceAppId: MICROSOFT_GRAPH_RESOURCE_ID,
          grantedScopes: result.scopes.map(scopeName),
          capabilities: grantedCapabilities,
          authorizationStatus: AuthorizationStatus.CONNECTED,
          encryptedTokenCache,
          tokenCacheKeyVersion,
          accessTokenExpiresAt: result.expiresOn,
          lastSuccessfulGraphAt: now,
        },
      });
      await transaction.microsoftConnection.update({
        where: { id: pendingSession.connection!.id },
        data: { lastSuccessfulGraphAt: now },
      });
      const completed = await transaction.microsoftAuthorizationSession.updateMany({
        where: {
          id: authorizationSessionId,
          status: AuthorizationStatus.PENDING,
          errorCode: null,
        },
        data: {
          status: AuthorizationStatus.CONNECTED,
          connectionId: pendingSession.connection!.id,
        },
      });
      if (!completed.count) throw new MicrosoftAuthorizationCancelled();
      await transaction.auditEvent.createMany({
        data: [
          {
            connectionId: pendingSession.connection!.id,
            action: "microsoft.graph_mail.connected",
            targetType: "MicrosoftGraphMailAuth",
            targetId: graphMailAuth.id,
            requestId: crypto.randomUUID(),
            result: "SUCCESS",
            metadata: { scopes: result.scopes.map(scopeName) },
          },
          {
            connectionId: pendingSession.connection!.id,
            action: "microsoft.graph.mail_verification_succeeded",
            targetType: "MicrosoftGraphMailAuth",
            targetId: graphMailAuth.id,
            requestId: crypto.randomUUID(),
            result: "SUCCESS",
            metadata: { endpoints: ["/me", "/me/mailFolders", "/me/mailFolders/inbox/messages"] },
          },
        ],
      });
    });
    return;
  }
  const tokenCacheKeyVersion = 2;
  const encryptedTokenCache = encrypt(
    pca.getTokenCache().serialize(),
    microsoftTokenCacheContext({
      tenantId: result.tenantId,
      microsoftUserId: profile.id,
      clientId: pendingSession.clientId,
      resourceAppId: pendingSession.resourceAppId,
      tokenCacheKeyVersion,
    }),
  );
  const now = new Date();
  await db.$transaction(async (transaction) => {
    const existingConnection = await transaction.microsoftConnection.findUnique({
      where: {
        tenantId_microsoftUserId_clientId_resourceAppId: {
          tenantId: result.tenantId,
          microsoftUserId: profile.id,
          clientId: pendingSession.clientId,
          resourceAppId: pendingSession.resourceAppId,
        },
      },
      select: { id: true, grantedScopes: true },
    });
    const grantedScopes = [...new Set([
      ...(existingConnection?.grantedScopes ?? []),
      ...result.scopes.map(scopeName),
    ])];
    const savedConnection = await transaction.microsoftConnection.upsert({
      where: {
        tenantId_microsoftUserId_clientId_resourceAppId: {
          tenantId: result.tenantId,
          microsoftUserId: profile.id,
          clientId: pendingSession.clientId,
          resourceAppId: pendingSession.resourceAppId,
        },
      },
      create: {
        tenantId: result.tenantId,
        microsoftUserId: profile.id,
        microsoftHomeAccountId: authenticatedAccount.homeAccountId,
        clientId: pendingSession.clientId,
        resourceAppId: pendingSession.resourceAppId,
        resourceScopes: result.scopes,
        displayName: profile.displayName,
        userPrincipalName: profile.userPrincipalName,
        email,
        encryptedTokenCache,
        tokenCacheKeyVersion,
        accessTokenExpiresAt: result.expiresOn,
        grantedScopes,
        capabilities: grantedCapabilities,
        connectedAt: now,
        lastSuccessfulGraphAt: graphResource ? now : null,
        authorizationStatus: AuthorizationStatus.CONNECTED,
      },
      update: {
        microsoftHomeAccountId: authenticatedAccount.homeAccountId,
        resourceScopes: result.scopes,
        displayName: profile.displayName,
        userPrincipalName: profile.userPrincipalName,
        email,
        encryptedTokenCache,
        tokenCacheKeyVersion,
        accessTokenExpiresAt: result.expiresOn,
        grantedScopes,
        capabilities: grantedCapabilities,
        connectedAt: now,
        lastSuccessfulGraphAt: graphResource ? now : existingConnection ? undefined : null,
        authorizationStatus: AuthorizationStatus.CONNECTED,
      },
    });
    const completed = await transaction.microsoftAuthorizationSession.updateMany({
      where: {
        id: authorizationSessionId,
        status: AuthorizationStatus.PENDING,
        errorCode: null,
      },
      data: { status: AuthorizationStatus.CONNECTED, connectionId: savedConnection.id },
    });
    if (!completed.count) throw new MicrosoftAuthorizationCancelled();
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
        ...(graphResource ? [{
          connectionId: savedConnection.id,
          action: "microsoft.graph.verification_succeeded",
          targetType: "MicrosoftConnection",
          targetId: savedConnection.id,
          requestId: crypto.randomUUID(),
          result: "SUCCESS",
          metadata: { endpoint: "/me" },
        }] : [{
          connectionId: savedConnection.id,
          action: "microsoft.resource.audience_verified",
          targetType: "MicrosoftConnection",
          targetId: savedConnection.id,
          requestId: crypto.randomUUID(),
          result: "SUCCESS",
          metadata: { resourceAppId: pendingSession.resourceAppId },
        }]),
        ...(graphResource && grantedCapabilities.canReadMail ? [{
          connectionId: savedConnection.id,
          action: "microsoft.graph.mail_verification_succeeded",
          targetType: "MicrosoftConnection",
          targetId: savedConnection.id,
          requestId: crypto.randomUUID(),
          result: "SUCCESS",
          metadata: { endpoints: ["/me/mailFolders", "/me/mailFolders/inbox/messages"] },
        }] : []),
      ],
    });
    return savedConnection;
  });
  if (config().NODE_ENV === "development") {
    console.info("[microsoft] authorization completed", {
      authority: microsoftAuthority(config().MICROSOFT_AUTHORITY),
      clientId: microsoftClientId(),
      resourceAppId: pendingSession.resourceAppId,
      requestedScopes: result.scopes,
      tenantId: result.tenantId,
    });
  }
}

export async function graphFetch<T>(
  connectionId: string,
  pathOrNextLink: string,
  init: RequestInit = {},
): Promise<T> {
  const { token } = await acquireMicrosoftGraphMailToken(connectionId);
  try {
    const result = await graphFetchWithToken<T>(token, pathOrNextLink, init);
    const now = new Date();
    await db.$transaction([
      db.microsoftConnection.update({ where: { id: connectionId }, data: { lastSuccessfulGraphAt: now } }),
      db.microsoftGraphMailAuth.update({ where: { connectionId }, data: { lastSuccessfulGraphAt: now } }),
    ]);
    return result;
  } catch (error) {
    if (error instanceof GraphError && (error.status === 401 || error.code === "InvalidAuthenticationToken")) {
      await markGraphMailReauthentication(connectionId);
      await db.auditEvent.create({
        data: {
          connectionId,
          action: "microsoft.graph.authentication_failed",
          targetType: "MicrosoftGraphMailAuth",
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

export async function acquireMicrosoftGraphMailToken(connectionId: string) {
  try {
    return await db.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`graph-mail:${connectionId}`}))`;
      const connection = await transaction.microsoftConnection.findUniqueOrThrow({
        where: { id: connectionId },
        include: { graphMailAuth: true },
      });
      if (connection.authorizationStatus !== AuthorizationStatus.CONNECTED) {
        throw new MicrosoftReauthenticationRequired();
      }
      const graphMailAuth = connection.graphMailAuth;
      if (!graphMailAuth || graphMailAuth.authorizationStatus !== AuthorizationStatus.CONNECTED) {
        throw new MicrosoftGraphMailAuthorizationRequired();
      }
      const authConfig = microsoftGraphMailAuthConfig();
      if (graphMailAuth.clientId !== authConfig.clientId) {
        throw new MicrosoftConfigurationError("Configured Microsoft Graph mail client does not match this stored mail authorization.");
      }
      const cachePlugin: ICachePlugin = {
        beforeCacheAccess: async (context: TokenCacheContext) => {
          context.tokenCache.deserialize(decrypt(
            graphMailAuth.encryptedTokenCache,
            microsoftGraphMailTokenCacheContext(graphMailAuth),
          ));
        },
        afterCacheAccess: async (context: TokenCacheContext) => {
          if (!context.cacheHasChanged) return;
          await transaction.microsoftGraphMailAuth.update({
            where: { connectionId },
            data: {
              encryptedTokenCache: encrypt(
                context.tokenCache.serialize(),
                microsoftGraphMailTokenCacheContext(graphMailAuth),
              ),
            },
          });
        },
      };
      const pca = createClient(cachePlugin, authConfig);
      const accounts = await pca.getTokenCache().getAllAccounts();
      const account = accounts.find((item: AccountInfo) => (
        graphMailAuth.microsoftHomeAccountId
          ? item.homeAccountId === graphMailAuth.microsoftHomeAccountId
          : item.localAccountId === graphMailAuth.microsoftUserId && item.tenantId === graphMailAuth.tenantId
      ));
      if (!account) throw new MicrosoftReauthenticationRequired();
      let result = await pca.acquireTokenSilent({ account, scopes: authConfig.requestedScopes });
      if (!isMicrosoftGraphToken(result.accessToken)) {
        result = await pca.acquireTokenSilent({
          account,
          scopes: authConfig.requestedScopes,
          forceRefresh: true,
        });
      }
      assertResourceToken(result.accessToken, MICROSOFT_GRAPH_RESOURCE_ID);
      await transaction.microsoftGraphMailAuth.update({
        where: { connectionId },
        data: { accessTokenExpiresAt: result.expiresOn },
      });
      if (config().NODE_ENV === "development" && !loggedGraphAudience.has(connectionId)) {
        loggedGraphAudience.add(connectionId);
        console.info("[microsoft] Graph mail token resource validated", {
          connectionId,
          resource: MICROSOFT_GRAPH_RESOURCE,
          resourceId: MICROSOFT_GRAPH_RESOURCE_ID,
          audience: tokenAudience(result.accessToken),
        });
      }
      return { token: result.accessToken, connection, graphMailAuth };
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError || error instanceof MicrosoftReauthenticationRequired) {
      await markGraphMailReauthentication(connectionId);
      throw new MicrosoftReauthenticationRequired();
    }
    throw error;
  }
}

export function graphDelegatedScopes(scopes: string[]) {
  const graphScopes = scopes.flatMap((scope) => {
    const value = scope.trim();
    if (!value || NON_GRAPH_SCOPES.has(value.toLowerCase())) return [];
    const name = value.toLowerCase().startsWith(MICROSOFT_GRAPH_SCOPE_ROOT)
      ? value.slice(MICROSOFT_GRAPH_SCOPE_ROOT.length)
      : value;
    const allowed = NORMAL_GRAPH_SCOPES.get(name.toLowerCase());
    return allowed ? [`${MICROSOFT_GRAPH_SCOPE_ROOT}${allowed}`] : [];
  });
  return [...new Set(graphScopes.length ? graphScopes : [`${MICROSOFT_GRAPH_SCOPE_ROOT}User.Read`])];
}

export function microsoftCapabilitiesFromScopes(
  scopes: string[],
  resourceAppId = MICROSOFT_GRAPH_RESOURCE_ID,
) {
  const graphResource = isMicrosoftGraphResource(resourceAppId);
  const normalized = new Set(scopes.map(normalizeMicrosoftScope));
  return {
    canReadProfile: graphResource && normalized.has("user.read"),
    canReadMail: graphResource && (normalized.has("mail.read") || normalized.has("mail.readwrite")),
    canReadMailFolders: graphResource && (
      normalized.has("mail.readbasic")
      || normalized.has("mail.read")
      || normalized.has("mail.readwrite")
    ),
    canModifyMail: graphResource && normalized.has("mail.readwrite"),
    canSendMail: graphResource && normalized.has("mail.send"),
    canReadMailboxSettings: graphResource && (normalized.has("mailboxsettings.read") || normalized.has("mailboxsettings.readwrite")),
    canModifyMailboxSettings: graphResource && normalized.has("mailboxsettings.readwrite"),
    canReadDirectory: graphResource && (normalized.has("user.readbasic.all") || normalized.has("user.read.all")),
    canUseSharedMail: graphResource && (normalized.has("mail.readwrite.shared") || normalized.has("mail.send.shared")),
  };
}

export function normalizeMicrosoftScope(scope: string) {
  return scope.trim().toLowerCase().replace(MICROSOFT_GRAPH_SCOPE_ROOT, "");
}

export function microsoftTokenCacheContext(connection: {
  tenantId: string;
  microsoftUserId: string;
  clientId: string;
  resourceAppId: string;
  tokenCacheKeyVersion: number;
}) {
  if (connection.tokenCacheKeyVersion >= 2) {
    return [
      "msal-v2",
      connection.tenantId,
      connection.microsoftUserId,
      connection.clientId,
      connection.resourceAppId,
    ].join(":");
  }
  return `msal:${connection.tenantId}:${connection.microsoftUserId}`;
}

export function microsoftGraphMailTokenCacheContext(graphMailAuth: {
  connectionId: string;
  tenantId: string;
  microsoftUserId: string;
  clientId: string;
  tokenCacheKeyVersion: number;
}) {
  return [
    "msal-graph-mail",
    graphMailAuth.tokenCacheKeyVersion,
    graphMailAuth.connectionId,
    graphMailAuth.tenantId,
    graphMailAuth.microsoftUserId,
    graphMailAuth.clientId,
  ].join(":");
}

export function deviceAuthorizationScopes(scopes: string[]) {
  const identity = scopes
    .map((scope) => scope.trim().toLowerCase())
    .filter((scope) => DEVICE_IDENTITY_SCOPES.has(scope));
  return [...new Set([...identity, ...graphDelegatedScopes(scopes)])];
}

export function microsoftAuthorizationScopes(
  _purpose: MicrosoftAuthorizationPurpose,
  configuredScopes = microsoftAuthConfig().requestedScopes,
) {
  return [...new Set(configuredScopes.map((scope) => scope.trim()).filter(Boolean))];
}

export async function repairMicrosoftCapabilities(connectionId: string) {
  const connection = await db.microsoftConnection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      authorizationStatus: true,
      graphMailAuth: {
        select: {
          authorizationStatus: true,
          grantedScopes: true,
          capabilities: true,
        },
      },
    },
  });
  if (!connection) return null;
  const graphMailAuth = connection.graphMailAuth;
  if (!graphMailAuth) return microsoftCapabilitiesFromScopes([], MICROSOFT_GRAPH_RESOURCE_ID);
  const derived = microsoftCapabilitiesFromScopes(graphMailAuth.grantedScopes, MICROSOFT_GRAPH_RESOURCE_ID);
  if (
    connection.authorizationStatus !== AuthorizationStatus.CONNECTED
    || graphMailAuth.authorizationStatus !== AuthorizationStatus.CONNECTED
  ) {
    return microsoftCapabilitiesFromScopes([], MICROSOFT_GRAPH_RESOURCE_ID);
  }
  const persisted = microsoftStoredCapabilities(graphMailAuth.capabilities);
  const complete = Object.keys(derived).every((key) => typeof persisted[key] === "boolean");
  if (complete) return persisted as ReturnType<typeof microsoftCapabilitiesFromScopes>;
  if (!derived.canReadMail) {
    await db.microsoftGraphMailAuth.update({
      where: { connectionId },
      data: { capabilities: derived },
    });
    return derived;
  }

  await graphFetch(connectionId, "/me/mailFolders?$top=1&$select=id");
  await graphFetch(connectionId, "/me/mailFolders/inbox/messages?$top=1&$select=id");
  await db.$transaction([
    db.microsoftGraphMailAuth.update({
      where: { connectionId },
      data: { capabilities: derived },
    }),
    db.auditEvent.create({
      data: {
        connectionId,
        action: "microsoft.graph.capabilities_repaired",
        targetType: "MicrosoftConnection",
        targetId: connectionId,
        requestId: crypto.randomUUID(),
        result: "SUCCESS",
        metadata: { endpoints: ["/me/mailFolders", "/me/mailFolders/inbox/messages"] },
      },
    }),
  ]);
  return derived;
}

export function microsoftStoredCapabilities(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
  );
}

function scopeName(scope: string) {
  return scope.toLowerCase().startsWith(MICROSOFT_GRAPH_SCOPE_ROOT)
    ? scope.slice(MICROSOFT_GRAPH_SCOPE_ROOT.length)
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

function tokenAudience(accessToken: string): string | null {
  return claimString(tokenClaims(accessToken)?.aud) ?? null;
}

function tokenClaims(accessToken: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function claimString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function isMicrosoftGraphToken(accessToken: string) {
  return isResourceToken(accessToken, MICROSOFT_GRAPH_RESOURCE_ID);
}

export function isResourceToken(accessToken: string, resourceAppId: string) {
  return tokenAudienceMatchesResource(tokenAudience(accessToken), resourceAppId);
}

function assertResourceToken(accessToken: string, resourceAppId: string) {
  if (!isResourceToken(accessToken, resourceAppId)) {
    throw new GraphError(401, "InvalidTokenAudience", "Microsoft returned a token for a different resource");
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
        safeGraphEndpoint(url),
      );
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) =>
        setTimeout(resolve, Number.isFinite(retryAfter) ? retryAfter * 1000 : 2 ** attempt * 500),
      );
      continue;
    }
    throw new GraphError(response.status, code, message, safeGraphEndpoint(url));
  }
  throw new GraphError(503, "RetriesExhausted", "Microsoft Graph retries exhausted", safeGraphEndpoint(url));
}

function graphUrl(pathOrNextLink: string): string {
  const url = pathOrNextLink.startsWith("http")
    ? new URL(pathOrNextLink)
    : new URL(pathOrNextLink.replace(/^\//, ""), `${MICROSOFT_GRAPH_API_ROOT}/`);
  if (url.protocol !== "https:" || url.hostname !== "graph.microsoft.com") {
    throw new Error("Rejected non-Microsoft Graph URL");
  }
  return url.toString();
}

function safeGraphEndpoint(url: string) {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

function createClient(
  cachePlugin?: ICachePlugin,
  authConfig: Pick<MicrosoftAuthConfig | MicrosoftGraphMailAuthConfig, "clientId" | "authority"> = microsoftAuthConfig(),
) {
  return new PublicClientApplication({
    auth: {
      clientId: authConfig.clientId,
      authority: microsoftAuthority(authConfig.authority),
    },
    cache: cachePlugin ? { cachePlugin } : undefined,
    system: { loggerOptions: { piiLoggingEnabled: false } },
  });
}

async function markGraphMailReauthentication(connectionId: string) {
  const changed = await db.microsoftGraphMailAuth.updateMany({
    where: {
      connectionId,
      authorizationStatus: AuthorizationStatus.CONNECTED,
    },
    data: { authorizationStatus: AuthorizationStatus.REAUTHENTICATION_REQUIRED },
  });
  if (changed.count) {
    await db.auditEvent.create({
      data: {
        connectionId,
        action: "microsoft.graph_mail.reauthentication_required",
        targetType: "MicrosoftGraphMailAuth",
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
  return description;
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
    public readonly endpoint?: string,
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

class MicrosoftAuthorizationCancelled extends Error {
  readonly errorCode = "authorization_cancelled";

  constructor() {
    super("Microsoft authorization was cancelled before account storage completed.");
  }
}

export class MicrosoftReauthenticationRequired extends Error {
  constructor() {
    super("Microsoft reauthentication is required");
  }
}

export class MicrosoftGraphMailAuthorizationRequired extends Error {
  constructor() {
    super("Connect mailbox to authorize Microsoft Graph mail access.");
  }
}
