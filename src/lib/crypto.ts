import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import { config } from "@/lib/config";

const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function encrypt(plaintext: string, context: string): Uint8Array<ArrayBuffer> {
  const key = Buffer.from(config().ENCRYPTION_KEY, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Uint8Array.from(Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ciphertext]));
}

export function decrypt(payload: Uint8Array, context: string): string {
  const data = Buffer.from(payload);
  if (data[0] !== VERSION || data.length <= 1 + IV_LENGTH + TAG_LENGTH) {
    throw new Error("Unsupported or invalid encrypted payload");
  }
  const key = Buffer.from(config().ENCRYPTION_KEY, "hex");
  const iv = data.subarray(1, 1 + IV_LENGTH);
  const tag = data.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.subarray(1 + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
}

export function hashSecret(value: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(value, salt, 32);
  return `${salt.toString("hex")}.${hash.toString("hex")}`;
}

export function verifySecret(value: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(".");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(value, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomAccessCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(15), (byte) => alphabet[byte % alphabet.length]).join("");
}

export function randomHostnameLabel(length = 8): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(length), (byte) => alphabet[byte % alphabet.length]).join("");
}
