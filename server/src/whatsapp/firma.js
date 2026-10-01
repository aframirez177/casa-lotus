// Webhook trust: Meta signs every POST with HMAC-SHA256 of the raw body using the app secret
// (header X-Hub-Signature-256: "sha256=<hex>"), and verifies the endpoint once with a GET
// carrying hub.mode / hub.verify_token / hub.challenge.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time string comparison that does not leak the length through an early return. */
export function igualesSeguro(a, b) {
  const ba = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba); // same work either way
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** "sha256=<hex>" for a raw body. Exposed for tests and for replaying captured payloads. */
export function firmar(cuerpoCrudo, appSecret) {
  return "sha256=" + createHmac("sha256", String(appSecret)).update(cuerpoCrudo).digest("hex");
}

/**
 * True only when the header is a well-formed sha256 signature of exactly these bytes.
 * No app secret configured → false: an unsigned webhook is never trusted.
 */
export function firmaValida(cuerpoCrudo, cabecera, appSecret) {
  if (!appSecret || !Buffer.isBuffer(cuerpoCrudo)) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(String(cabecera ?? "").trim());
  if (!m) return false;
  const esperada = createHmac("sha256", String(appSecret)).update(cuerpoCrudo).digest();
  const recibida = Buffer.from(m[1], "hex");
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

/**
 * GET handshake. Returns { status, texto }: 200 with the challenge echoed, or 403.
 * The challenge is echoed only when it looks like one (Meta sends digits), so this endpoint can
 * never be used to reflect arbitrary content.
 */
export function verificarSuscripcion(query, verifyToken) {
  const modo = query?.["hub.mode"];
  const token = query?.["hub.verify_token"];
  const reto = query?.["hub.challenge"];
  if (!verifyToken || modo !== "subscribe" || typeof token !== "string" || !igualesSeguro(token, verifyToken)) {
    return { status: 403, texto: "Forbidden" };
  }
  if (typeof reto !== "string" || !/^[A-Za-z0-9_.-]{1,256}$/.test(reto)) return { status: 400, texto: "Bad Request" };
  return { status: 200, texto: reto };
}
