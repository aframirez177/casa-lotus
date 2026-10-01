// Casa Lotus e2e · where things run and the dev accounts (server/src/datos/semilla.js, memory driver only).
export const SITIO = process.env.E2E_SITIO || "http://localhost:4321";
export const APP = process.env.E2E_APP || "http://localhost:5180";
export const API = process.env.E2E_API || "http://localhost:8787";
/** Production build of the app (service worker), served by `vite preview` with /api proxied to the API. */
export const APP_PROD = process.env.E2E_APP_PROD || "http://localhost:5182";

export const CUENTAS = {
  admin: { correo: "admin@casalotus.test", password: "lotus-admin-dev-2026", nombre: "Ana Admin (dev)" },
  laura: { correo: "laura@casalotus.test", password: "lotus-profe-dev-2026", nombreHorario: "Laura" },
  ximena: { correo: "ximena@casalotus.test", password: "lotus-profe-dev-2026", nombreHorario: "Ximena" },
  geral: { correo: "geral@casalotus.test", password: "lotus-profe-dev-2026", nombreHorario: "Geral" },
};

/** The studio's public numbers (CLAUDE.md): bookings WhatsApp and payment key. */
export const WHATSAPP_RESERVAS = "573128720888";
export const LLAVE_PAGO = "319 328 8469";

/**
 * A different client IP per test. The API trusts loopback proxies (TRUST_PROXY default), so an
 * X-Forwarded-For from the test runner is the client's IP: rate limits (login 5/15 min per e-mail+IP,
 * public bookings 10/h per IP, codes 10/h per IP) then count per test, as they would per real visitor.
 * 100.64.0.0/10 (carrier-grade NAT) is not in the server's trusted-proxy list.
 */
export function ipUnica() {
  const r = (n) => Math.floor(Math.random() * n);
  return `100.${64 + r(64)}.${r(256)}.${1 + r(254)}`;
}

/** A Colombian mobile number that is not anybody's: 10 digits, starts with 3 (server schema). */
export function celular() {
  return "31" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
}

export const sufijo = () => Math.random().toString(36).slice(2, 6).toUpperCase();
