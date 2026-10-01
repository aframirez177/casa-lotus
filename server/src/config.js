// Casa Lotus · server configuration, read once from the environment and validated.
// Secrets (service account, SMTP password, VAPID private key, WhatsApp token) live only in .env
// on the server; nothing here has a real default for them.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const VERSION = "2.0.0";

/** Cloudflare's published edge ranges (https://www.cloudflare.com/ips/). Caddy sits behind them. */
export const CLOUDFLARE_IPS = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
  "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];

const vacioANada = (v) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const texto = () => z.preprocess(vacioANada, z.string().trim().optional());
const bool = (def) => z.preprocess((v) => (v === undefined || v === "" ? def : ["1", "true", "si", "sí", "yes", "on"].includes(String(v).toLowerCase())), z.boolean());

const Esquema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  PUBLIC_URL: z.preprocess(vacioANada, z.url().default("https://casalotus.studio")),
  DATOS: z.preprocess(vacioANada, z.enum(["sheets", "memoria"]).optional()),
  SHEET_ID: z.preprocess(vacioANada, z.string().regex(/^[\w-]{20,}$/).default("1mf4n7Yj9buyafjedw8zHMfoGG0yraaLcZ_DWGMc3xdo")),
  CONVERSIONES_SHEET_ID: z.preprocess(vacioANada, z.string().regex(/^[\w-]{20,}$/).optional()),
  GOOGLE_SERVICE_ACCOUNT_JSON: texto(),
  GOOGLE_APPLICATION_CREDENTIALS: texto(),
  SQLITE_PATH: z.preprocess(vacioANada, z.string().default("./data/casalotus.db")),
  CORREO_DRIVER: z.preprocess(vacioANada, z.enum(["console", "smtp"]).optional()),
  CORREO_REMITENTE: z.preprocess(vacioANada, z.string().default("Casa Lotus <casalotusbogota@gmail.com>")),
  SMTP_HOST: texto(),
  SMTP_PORT: z.preprocess(vacioANada, z.coerce.number().int().default(465)),
  SMTP_SECURE: bool(true),
  SMTP_USER: texto(),
  SMTP_PASS: texto(),
  VAPID_PUBLIC_KEY: texto(),
  VAPID_PRIVATE_KEY: texto(),
  VAPID_SUBJECT: z.preprocess(vacioANada, z.string().default("mailto:casalotusbogota@gmail.com")),
  WHATSAPP_TOKEN: texto(),
  WHATSAPP_PHONE_NUMBER_ID: texto(),
  WHATSAPP_WABA_ID: texto(),
  WHATSAPP_APP_SECRET: texto(),
  WHATSAPP_VERIFY_TOKEN: texto(),
  WHATSAPP_GRAPH_VERSION: texto(),
  WHATSAPP_MODO: texto(),
  TRUST_PROXY: texto(),
  CORS_ORIGENES: texto(),
  TAREAS: bool(true),
  LOG_LEVEL: z.preprocess(vacioANada, z.enum(["debug", "info", "warn", "error", "silencio"]).default("info")),
  SEMILLA: z.preprocess(vacioANada, z.enum(["demo", "basica", "vacia"]).default("demo")),
});

/** Parses the environment. Throws a readable error listing the bad variables (values are never echoed). */
export function leerConfig(env = process.env, extra = {}) {
  const r = Esquema.safeParse({ ...env, ...extra });
  if (!r.success) {
    const malas = r.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error("Configuración inválida en: " + malas);
  }
  const e = r.data;
  const dev = e.NODE_ENV === "development";
  const datos = e.DATOS || (dev || e.NODE_ENV === "test" ? "memoria" : "sheets");
  if (datos === "memoria" && e.NODE_ENV === "production") throw new Error("DATOS=memoria no se permite en producción.");

  const publicUrl = new URL(e.PUBLIC_URL);
  const devOrigenes = ["http://localhost:5180", "http://localhost:4321", "http://127.0.0.1:5180", "http://127.0.0.1:4321"];
  const cors = dev ? (e.CORS_ORIGENES ? e.CORS_ORIGENES.split(",").map((s) => s.trim()).filter(Boolean) : devOrigenes) : [];

  return {
    entorno: e.NODE_ENV,
    dev,
    produccion: e.NODE_ENV === "production",
    version: VERSION,
    puerto: e.PORT,
    publicUrl: publicUrl.origin,
    origenesPermitidos: [publicUrl.origin, ...cors],
    cors,
    trustProxy: e.TRUST_PROXY
      ? e.TRUST_PROXY.split(",").map((s) => s.trim()).filter(Boolean)
      : ["loopback", "linklocal", "uniquelocal", ...CLOUDFLARE_IPS],
    datos,
    semilla: e.SEMILLA,
    sheets: { id: e.SHEET_ID, credenciales: credencialesGoogle(e) },
    conversiones: { sheetId: e.CONVERSIONES_SHEET_ID || "" },
    sqlitePath: e.SQLITE_PATH,
    correo: {
      driver: e.CORREO_DRIVER || (e.SMTP_HOST ? "smtp" : "console"),
      remitente: e.CORREO_REMITENTE,
      smtp: { host: e.SMTP_HOST, port: e.SMTP_PORT, secure: e.SMTP_SECURE, user: e.SMTP_USER, pass: e.SMTP_PASS },
    },
    push: { publica: e.VAPID_PUBLIC_KEY || "", privada: e.VAPID_PRIVATE_KEY || "", sujeto: e.VAPID_SUBJECT },
    whatsapp: {
      token: e.WHATSAPP_TOKEN || "",
      phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID || "",
      wabaId: e.WHATSAPP_WABA_ID || "",
      appSecret: e.WHATSAPP_APP_SECRET || "",
      verifyToken: e.WHATSAPP_VERIFY_TOKEN || "",
      graphVersion: e.WHATSAPP_GRAPH_VERSION || "",
      modo: e.WHATSAPP_MODO || "",
    },
    tareas: e.TAREAS,
    logLevel: e.LOG_LEVEL,
  };
}

/** Service account credentials: base64 JSON in the env, or a file path. Null when absent. */
function credencialesGoogle(e) {
  try {
    if (e.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const crudo = e.GOOGLE_SERVICE_ACCOUNT_JSON.trim();
      const json = crudo.startsWith("{") ? crudo : Buffer.from(crudo, "base64").toString("utf8");
      return JSON.parse(json);
    }
    if (e.GOOGLE_APPLICATION_CREDENTIALS) return JSON.parse(readFileSync(e.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  } catch {
    throw new Error("No pude leer las credenciales de la cuenta de servicio de Google (GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_APPLICATION_CREDENTIALS).");
  }
  return null;
}
