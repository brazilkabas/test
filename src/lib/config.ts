import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  MICROSOFT_CLIENT_ID: z.string().uuid(),
  MICROSOFT_SCOPES: z.string().default(
    "openid,profile,email,User.Read",
  ),
  ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/, "must be a 32-byte hex key"),
  SESSION_SECRET: z.string().min(32),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email(),
  BOOTSTRAP_ACCESS_CODE: z.string().regex(/^[A-Za-z0-9]{15}$/).optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type AppConfig = z.infer<typeof schema> & { microsoftScopes: string[] };

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

  cached = {
    ...parsed.data,
    microsoftScopes: parsed.data.MICROSOFT_SCOPES.split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  };
  return cached;
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
    microsoftClientId: process.env.MICROSOFT_CLIENT_ID ?? null,
    scopes: (process.env.MICROSOFT_SCOPES ?? "").split(",").filter(Boolean),
  };
}
