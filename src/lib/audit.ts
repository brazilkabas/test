import { headers } from "next/headers";

import { db } from "@/lib/db";

type AuditInput = {
  actorId?: string;
  connectionId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  result: "SUCCESS" | "FAILURE" | "DENIED";
  requestId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function audit(input: AuditInput): Promise<void> {
  const requestHeaders = await headers();
  await db.auditEvent.create({
    data: {
      ...input,
      requestId: input.requestId ?? requestHeaders.get("x-request-id") ?? crypto.randomUUID(),
      ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: requestHeaders.get("user-agent"),
    },
  });
}
