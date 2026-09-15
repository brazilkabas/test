import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { decrypt, encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";

const PROVIDER = "custom-ai-chat";
const SECRET_NAME = "ai-api:default";
const SECRET_CONTEXT = "ai-api:default";
const MAX_CURL_LENGTH = 50_000;
const MAX_RESPONSE_BYTES = 2_000_000;

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type StoredRequest = {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

export type AiApiStatus = {
  configured: boolean;
  enabled: boolean;
  endpoint: string | null;
  hostname: string | null;
  model: string | null;
  updatedAt: string | null;
};

export function parseCurlRequest(raw: string): StoredRequest {
  if (!raw.trim() || raw.length > MAX_CURL_LENGTH) {
    throw new AiApiError(400, `The curl command must be between 1 and ${MAX_CURL_LENGTH} characters`);
  }

  const tokens = shellTokens(raw.replace(/(?:\\|\^)\r?\n/g, " "));
  if (tokens.shift()?.toLowerCase() !== "curl") {
    throw new AiApiError(400, "Paste a curl command that starts with curl");
  }

  let urlText = "";
  let method = "";
  let bodyText = "";
  const headers: Record<string, string> = {};

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (["-L", "--location", "--location-trusted", "--compressed", "-s", "--silent", "-S", "--show-error", "--fail", "--fail-with-body"].includes(token)) continue;
    if (token.startsWith("--request=")) {
      method = token.slice("--request=".length).toUpperCase();
      continue;
    }
    if (/^-X.+/.test(token)) {
      method = token.slice(2).toUpperCase();
      continue;
    }
    if (["-X", "--request"].includes(token)) {
      method = requiredFlagValue(tokens, ++index, token).toUpperCase();
      continue;
    }
    if (token.startsWith("--header=")) {
      addHeader(headers, token.slice("--header=".length), "--header");
      continue;
    }
    if (/^-H.+/.test(token)) {
      addHeader(headers, token.slice(2), "-H");
      continue;
    }
    if (["-H", "--header"].includes(token)) {
      addHeader(headers, requiredFlagValue(tokens, ++index, token), token);
      continue;
    }
    const dataPrefix = ["--data=", "--data-raw=", "--data-binary="].find((prefix) => token.startsWith(prefix));
    if (dataPrefix) {
      bodyText = token.slice(dataPrefix.length);
      continue;
    }
    if (["-d", "--data", "--data-raw", "--data-binary"].includes(token)) {
      bodyText = requiredFlagValue(tokens, ++index, token);
      continue;
    }
    if (/^-d.+/.test(token)) {
      bodyText = token.slice(2);
      continue;
    }
    if (token.startsWith("--url=")) {
      urlText = token.slice("--url=".length);
      continue;
    }
    if (token === "--url") {
      urlText = requiredFlagValue(tokens, ++index, token);
      continue;
    }
    if (token.startsWith("-")) {
      throw new AiApiError(400, `Unsupported curl option: ${token}`);
    }
    if (urlText) throw new AiApiError(400, "The curl command contains more than one URL");
    urlText = token;
  }

  if (!urlText) throw new AiApiError(400, "The curl command does not include a URL");
  const url = safeEndpoint(urlText);
  const effectiveMethod = method || (bodyText ? "POST" : "GET");
  if (effectiveMethod !== "POST") throw new AiApiError(400, "AI chat endpoints must use POST");
  if (!bodyText) throw new AiApiError(400, "The curl command must include a JSON request body");

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new AiApiError(400, "The curl request body must be valid JSON");
  }
  if (!body || Array.isArray(body) || typeof body !== "object") {
    throw new AiApiError(400, "The curl request body must be a JSON object");
  }

  const blockedHeaders = new Set(["host", "content-length", "connection", "transfer-encoding", "cookie"]);
  const safeHeaders = Object.fromEntries(
    Object.entries(headers).filter(([name]) => !blockedHeaders.has(name.toLowerCase())),
  );
  if (!Object.keys(safeHeaders).some((name) => name.toLowerCase() === "content-type")) {
    safeHeaders["Content-Type"] = "application/json";
  }

  return { url: url.toString(), method: "POST", headers: safeHeaders, body: body as Record<string, unknown> };
}

export async function aiApiStatus(): Promise<AiApiStatus> {
  const integration = await db.integration.findUnique({ where: { provider: PROVIDER } });
  const configuration = integration?.configuration as { endpoint?: string; hostname?: string; model?: string | null } | null;
  return {
    configured: Boolean(integration?.secretReferenceId),
    enabled: integration?.enabled ?? false,
    endpoint: configuration?.endpoint ?? null,
    hostname: configuration?.hostname ?? null,
    model: configuration?.model ?? null,
    updatedAt: integration?.updatedAt.toISOString() ?? null,
  };
}

export async function saveAiApiCurl(raw: string): Promise<AiApiStatus> {
  const parsed = parseCurlRequest(raw);
  const model = typeof parsed.body.model === "string" ? parsed.body.model : null;
  const encrypted = encrypt(JSON.stringify(parsed), SECRET_CONTEXT);

  await db.$transaction(async (tx) => {
    const secret = await tx.encryptedSecretReference.upsert({
      where: { name: SECRET_NAME },
      create: { name: SECRET_NAME, ciphertext: encrypted },
      update: { ciphertext: encrypted, keyVersion: { increment: 1 } },
    });
    await tx.integration.upsert({
      where: { provider: PROVIDER },
      create: {
        provider: PROVIDER,
        enabled: true,
        secretReferenceId: secret.id,
        configuration: { endpoint: parsed.url, hostname: new URL(parsed.url).hostname, model },
      },
      update: {
        enabled: true,
        secretReferenceId: secret.id,
        configuration: { endpoint: parsed.url, hostname: new URL(parsed.url).hostname, model },
      },
    });
  });
  return aiApiStatus();
}

export async function deleteAiApiConfiguration(): Promise<void> {
  await db.$transaction([
    db.integration.deleteMany({ where: { provider: PROVIDER } }),
    db.encryptedSecretReference.deleteMany({ where: { name: SECRET_NAME } }),
  ]);
}

export async function sendAiChat(messages: AiMessage[]): Promise<{ content: string; model: string | null }> {
  const request = await storedRequest();
  const endpoint = new URL(request.url);
  await assertPublicEndpoint(endpoint);
  const body = requestBody(request.body, messages, endpoint.hostname, request.headers);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "The AI API timed out"
      : "The AI API could not be reached";
    throw new AiApiError(502, message);
  }

  const text = await limitedResponseText(response);
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    // Plain-text APIs are supported.
  }
  if (!response.ok) {
    throw new AiApiError(502, providerError(payload, response.status));
  }

  const content = responseContent(payload);
  if (!content) throw new AiApiError(502, "The AI API response did not contain a supported text result");
  const model = isRecord(payload) && typeof payload.model === "string"
    ? payload.model
    : typeof body.model === "string" ? body.model : null;
  return { content, model };
}

function requestBody(
  template: Record<string, unknown>,
  messages: AiMessage[],
  hostname: string,
  headers: Record<string, string>,
): Record<string, unknown> {
  const body = structuredClone(template);
  const anthropic = hostname.endsWith("anthropic.com") ||
    Object.keys(headers).some((name) => name.toLowerCase() === "anthropic-version");
  if ("contents" in body) {
    body.contents = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));
    const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    if (system) body.systemInstruction = { parts: [{ text: system }] };
  } else if ("prompt" in body) {
    body.prompt = transcript(messages);
  } else if ("input" in body && !("messages" in body)) {
    body.input = messages;
  } else if (anthropic) {
    const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    if (system) body.system = system;
    body.messages = messages.filter((message) => message.role !== "system");
  } else {
    body.messages = messages;
  }
  body.stream = false;
  return body;
}

function transcript(messages: AiMessage[]) {
  return messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
}

async function storedRequest(): Promise<StoredRequest> {
  const integration = await db.integration.findUnique({ where: { provider: PROVIDER } });
  if (!integration?.enabled || !integration.secretReferenceId) {
    throw new AiApiError(503, "Configure an AI API curl command before starting a chat");
  }
  const secret = await db.encryptedSecretReference.findUnique({ where: { id: integration.secretReferenceId } });
  if (!secret) throw new AiApiError(503, "The saved AI API credential is unavailable");
  try {
    return JSON.parse(decrypt(secret.ciphertext, SECRET_CONTEXT)) as StoredRequest;
  } catch {
    throw new AiApiError(500, "The saved AI API configuration could not be decrypted");
  }
}

function safeEndpoint(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AiApiError(400, "The curl URL is invalid");
  }
  if (url.protocol !== "https:") throw new AiApiError(400, "The AI API URL must use HTTPS");
  if (url.username || url.password) throw new AiApiError(400, "Credentials must be supplied in headers, not in the URL");
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || isPrivateAddress(url.hostname)) {
    throw new AiApiError(400, "Private and local AI API addresses are not allowed");
  }
  return url;
}

async function assertPublicEndpoint(url: URL): Promise<void> {
  safeEndpoint(url.toString());
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new AiApiError(400, "The AI API hostname could not be resolved");
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new AiApiError(400, "The AI API hostname resolves to a private or local address");
  }
}

function isPrivateAddress(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
  if (isIP(normalized) === 6) {
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
      normalized.startsWith("fd") || /^fe[89ab]/.test(normalized);
  }
  if (isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
}

function shellTokens(input: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | "\"" | null = null;
  let active = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quote) {
      if (character === quote) {
        quote = null;
      } else if (character === "\\" && quote === "\"" && index + 1 < input.length) {
        token += input[++index];
      } else {
        token += character;
      }
      active = true;
    } else if (character === "'" || character === "\"") {
      quote = character;
      active = true;
    } else if (/\s/.test(character)) {
      if (active) {
        tokens.push(token);
        token = "";
        active = false;
      }
    } else if (character === "\\" && index + 1 < input.length) {
      token += input[++index];
      active = true;
    } else {
      token += character;
      active = true;
    }
  }
  if (quote) throw new AiApiError(400, "The curl command contains an unclosed quote");
  if (active) tokens.push(token);
  return tokens;
}

function requiredFlagValue(tokens: string[], index: number, flag: string): string {
  const value = tokens[index];
  if (value === undefined) throw new AiApiError(400, `${flag} requires a value`);
  return value;
}

function addHeader(headers: Record<string, string>, header: string, flag: string): void {
  const separator = header.indexOf(":");
  if (separator <= 0) throw new AiApiError(400, `Invalid header in ${flag}`);
  const name = header.slice(0, separator).trim();
  const value = header.slice(separator + 1).trim();
  if (!name || /[\r\n]/.test(name + value)) throw new AiApiError(400, "Invalid curl header");
  headers[name] = value;
}

async function limitedResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) throw new AiApiError(502, "The AI API response was too large");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new AiApiError(502, "The AI API response was too large");
  return text;
}

function responseContent(payload: unknown): string {
  if (typeof payload === "string") return payload.trim();
  if (!isRecord(payload)) return "";
  if (typeof payload.output_text === "string") return payload.output_text.trim();
  if (typeof payload.response === "string") return payload.response.trim();
  if (typeof payload.message === "string") return payload.message.trim();

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const choice = isRecord(choices[0]) ? choices[0] : null;
  if (choice) {
    const message = isRecord(choice.message) ? choice.message : null;
    if (typeof message?.content === "string") return message.content.trim();
    if (typeof choice.text === "string") return choice.text.trim();
  }

  const content = Array.isArray(payload.content) ? payload.content : [];
  const contentText = content
    .filter(isRecord)
    .map((item) => typeof item.text === "string" ? item.text : "")
    .filter(Boolean)
    .join("\n");
  if (contentText) return contentText.trim();

  const output = Array.isArray(payload.output) ? payload.output : [];
  const outputText = output
    .filter(isRecord)
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .filter(isRecord)
    .map((item) => typeof item.text === "string" ? item.text : "")
    .filter(Boolean)
    .join("\n");
  if (outputText) return outputText.trim();

  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const candidate = isRecord(candidates[0]) ? candidates[0] : null;
  const candidateContent = candidate && isRecord(candidate.content) ? candidate.content : null;
  const parts = candidateContent && Array.isArray(candidateContent.parts) ? candidateContent.parts : [];
  return parts
    .filter(isRecord)
    .map((part) => typeof part.text === "string" ? part.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function providerError(payload: unknown, status: number): string {
  if (isRecord(payload)) {
    const error = isRecord(payload.error) ? payload.error : null;
    const message = typeof error?.message === "string"
      ? error.message
      : typeof payload.error === "string" ? payload.error : null;
    if (message) return `AI API error (${status}): ${message.slice(0, 500)}`;
  }
  return `AI API request failed (${status})`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class AiApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}
