import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyShopifyHmac(
  rawBody: string | Buffer,
  headerHmacBase64: string | undefined,
  secret: string,
): boolean {
  if (!headerHmacBase64) return false;
  const computed = createHmac("sha256", secret).update(rawBody).digest("base64");
  return safeEqual(computed, headerHmacBase64);
}

export function verifyMetaSignature(
  rawBody: string | Buffer,
  headerSignature: string | undefined,
  appSecret: string,
): boolean {
  if (!headerSignature || !headerSignature.startsWith("sha256=")) return false;
  const provided = headerSignature.slice("sha256=".length);
  const computed = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeEqual(computed, provided);
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Normalize a phone string to digits-only E.164 (no leading "+", no spaces / dashes).
 * Meta Cloud API accepts the digits-only form in the `to` field.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}
