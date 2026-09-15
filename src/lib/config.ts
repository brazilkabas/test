import { z } from "zod";

const optionalUuid = z.string().refine(
  (value) => value === "" || z.string().uuid().safeParse(value).success,
  "must be empty or a UUID",
);

const schema = z.object({
  DATABASE_URL: z.string().url(),
  MICROSOFT_CLIENT_ID: optionalUuid.default(""),
  MICROSOFT_RESOURCE_APP_ID: optionalUuid.default(""),
  MICROSOFT_RESOURCE_SCOPE: z.string().default(""),
  MICROSOFT_AUTHORITY: z.string().url().default(
    "https://login.microsoftonline.com/organizations",
  ),
  MICROSOFT_REDIRECT_URI: z.string().url().default(
    "http://localhost:3000/api/v1/microsoft/callback",
  ),
  ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/, "must be a 32-byte hex key"),
  SESSION_SECRET: z.string().min(32),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email(),
  BOOTSTRAP_ACCESS_CODE: z.string().regex(/^[A-Za-z0-9]{15}$/).optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type AppConfig = z.infer<typeof schema>;

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

export function publicConfigurationStatus() {
  const keys = [
    "DATABASE_URL",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_RESOURCE_APP_ID",
    "MICROSOFT_RESOURCE_SCOPE",
    "MICROSOFT_AUTHORITY",
    "MICROSOFT_REDIRECT_URI",
    "ENCRYPTION_KEY",
    "SESSION_SECRET",
    "BOOTSTRAP_ADMIN_EMAIL",
  ] as const;

  return {
    configured: Object.fromEntries(keys.map((key) => [key, Boolean(process.env[key])])),
    microsoftClientId: process.env.MICROSOFT_CLIENT_ID ?? null,
    microsoftResourceAppId: process.env.MICROSOFT_RESOURCE_APP_ID ?? null,
    microsoftResourceScope: process.env.MICROSOFT_RESOURCE_SCOPE ?? null,
    microsoftAuthority: process.env.MICROSOFT_AUTHORITY ?? null,
    microsoftRedirectUri: process.env.MICROSOFT_REDIRECT_URI ?? null,
  };
}
