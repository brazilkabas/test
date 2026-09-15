const FORBIDDEN = [
  /estsauth/i,
  /rtfa/i,
  /\bfedauth\b/i,
  /primary refresh token|\bprt\b/i,
  /device.?registration.?service/i,
  /steal|harvest|exfiltrat/i,
  /raw (access )?token/i,
  /microsoft (session )?cookie/i,
];

export function isDisallowedAiInstruction(instruction: string) {
  return FORBIDDEN.some((pattern) => pattern.test(instruction));
}

export function maskSecret(value: string | null | undefined) {
  if (!value) return "Not configured";
  const trimmed = value.trim();
  if (trimmed.length < 8) return "Configured";
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-4)}`;
}

export function aiChangeBranchName(jobId: string) {
  return `ai/change-${jobId}`;
}

export function parseModelPlan(raw: string) {
  const json = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(json) as {
    explanation?: unknown;
    files?: unknown;
    unifiedDiff?: unknown;
    warnings?: unknown;
    tests?: unknown;
  };
  if (typeof parsed.explanation !== "string" || typeof parsed.unifiedDiff !== "string") {
    throw new Error("The model did not return a usable plan");
  }
  return {
    explanation: parsed.explanation,
    selectedFiles: Array.isArray(parsed.files)
      ? parsed.files.filter((file): file is string => typeof file === "string")
      : [],
    unifiedDiff: parsed.unifiedDiff,
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((warning): warning is string => typeof warning === "string")
      : [],
    tests: Array.isArray(parsed.tests)
      ? parsed.tests.filter((test): test is string => typeof test === "string")
      : ["npm run lint", "npm run typecheck", "npm test", "NODE_ENV=production npm run build"],
  };
}
