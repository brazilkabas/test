import { z } from "zod";

import { MICROSOFT_GRAPH_RESOURCE_ID, MICROSOFT_GRAPH_SCOPE_ROOT } from "@/lib/microsoft-resource";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  MICROSOFT_CLIENT_ID: z.string().default(""),
  MICROSOFT_AUTHORITY: z.string().url().default("https://login.microsoftonline.com/organizations"),
  MICROSOFT_REDIRECT_URI: z.string().url().optional(),
  ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/, "must be a 32-byte hex key"),
  SESSION_SECRET: z.string().min(32),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email(),
  BOOTSTRAP_ACCESS_CODE: z.string().regex(/^[A-Za-z0-9]{15}$/).optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type AppConfig = z.infer<typeof schema>;
export type MicrosoftAuthConfig = {
  clientId: string;
  authority: string;
  resourceAppId: string;
  resourceScope: string;
  requestedScopes: string[];
};

let cached: AppConfig | undefined;

export function config(): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server configuration: ${details}`);
  }

  cached = parsed.data;
  return cached;
}

export function microsoftClientId(): string {
  const clientId = config().MICROSOFT_CLIENT_ID.trim();
  if (!clientId) {
    throw new MicrosoftConfigurationError("MICROSOFT_CLIENT_ID is not configured.");
  }
  if (clientId.toLowerCase() === MICROSOFT_GRAPH_RESOURCE_ID) {
    throw new MicrosoftConfigurationError(
      "MICROSOFT_CLIENT_ID must be your Entra application's client ID, not the Microsoft Graph resource ID.",
    );
  }
  return clientId;
}

export function microsoftResourceAppId(): string {
  return MICROSOFT_GRAPH_RESOURCE_ID;
}

export function microsoftAuthConfig(): MicrosoftAuthConfig {
  const clientId = microsoftClientId();
  const resourceAppId = MICROSOFT_GRAPH_RESOURCE_ID;
  const resourceScope = "User.Read,Mail.Read";
  return {
    clientId,
    authority: config().MICROSOFT_AUTHORITY,
    resourceAppId,
    resourceScope,
    requestedScopes: [
      `${MICROSOFT_GRAPH_SCOPE_ROOT}User.Read`,
      `${MICROSOFT_GRAPH_SCOPE_ROOT}Mail.Read`,
    ],
  };
}

export class MicrosoftConfigurationError extends Error {}

export function microsoftRedirectUri(): string {
  return config().MICROSOFT_REDIRECT_URI
    ?? new URL("/api/v1/microsoft/callback", config().APP_BASE_URL).toString();
}

export function publicConfigurationStatus() {
  const keys = [
    "DATABASE_URL",
    "MICROSOFT_CLIENT_ID",
    "ENCRYPTION_KEY",
    "SESSION_SECRET",
    "BOOTSTRAP_ADMIN_EMAIL",
  ] as const;

  return {
    configured: Object.fromEntries(keys.map((key) => [key, Boolean(process.env[key])])),
    microsoftClientId: process.env.MICROSOFT_CLIENT_ID?.trim() || null,
    microsoftResourceAppId: MICROSOFT_GRAPH_RESOURCE_ID,
    microsoftResourceScope: "User.Read,Mail.Read",
    microsoftAuthority: process.env.MICROSOFT_AUTHORITY
      ?? "https://login.microsoftonline.com/organizations",
    microsoftRedirectUri: process.env.MICROSOFT_REDIRECT_URI
      ?? new URL("/api/v1/microsoft/callback", process.env.APP_BASE_URL ?? "http://localhost:3000").toString(),
    scopes: ["User.Read", "Mail.Read"],
  };
}
