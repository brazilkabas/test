export async function generateAiCodePlan(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  instruction: string;
  baseSha: string;
  files: Array<{ path: string; excerpt: string }>;
}) {
  const response = await fetch(`${input.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Return JSON with explanation, files, unifiedDiff, warnings, and tests. Only modify this application. Never capture Microsoft cookies, PRTs, raw tokens, or device-registration secrets.",
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction: input.instruction,
            baseRevision: input.baseSha,
            files: input.files,
          }),
        },
      ],
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error?.message === "string" ? body.error.message : "The AI provider rejected the request");
  }
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("The AI provider returned an empty plan");
  return content;
}

export async function testAiProvider(baseUrl: string, apiKey: string, model: string) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error("AI provider connection failed");
  const body = await response.json().catch(() => ({}));
  const ids = Array.isArray(body.data) ? body.data.map((item: { id?: string }) => item.id) : [];
  return { ok: true, modelAvailable: ids.includes(model) || ids.length === 0 };
}
