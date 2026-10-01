// WhatsApp Cloud API settings. They come from the server's config (`config.whatsapp`) and fall
// back to process.env, so the module also works when it is started on its own (CLI, tests).
// Secrets never get logged: `resumenConfig()` is the only view of the config meant for logs.

/** Graph API version used when WHATSAPP_GRAPH_VERSION is not set. Bump it on purpose, never silently. */
export const GRAPH_VERSION_POR_DEFECTO = "v26.0"; // released 2026-07-29 (Graph API changelog)

export const MODOS = ["desconectado", "prueba", "produccion"];

/** Every env var the module reads, in the order `faltan` reports them. */
export const VARIABLES = Object.freeze({
  token: "WHATSAPP_TOKEN",
  phoneNumberId: "WHATSAPP_PHONE_NUMBER_ID",
  wabaId: "WHATSAPP_WABA_ID",
  appSecret: "WHATSAPP_APP_SECRET",
  verifyToken: "WHATSAPP_VERIFY_TOKEN",
  graphVersion: "WHATSAPP_GRAPH_VERSION",
  modo: "WHATSAPP_MODO",
});

// Required to say «configured»: send (token + phone number id) and trust inbound webhooks (app secret).
const PARA_ENVIAR = ["token", "phoneNumberId", "appSecret"];
// Also needed for the whole feature set: webhook verification and template management.
const PARA_TODO = [...PARA_ENVIAR, "verifyToken", "wabaId"];

const limpio = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

/**
 * Normalizes the module config.
 * Accepts `{ whatsapp: {...} }` (the whole server config) or the WhatsApp object itself.
 * Every missing key falls back to its WHATSAPP_* env var.
 */
export function leerConfig(config = {}, env = process.env) {
  const base = config && typeof config === "object" && config.whatsapp && typeof config.whatsapp === "object" ? config.whatsapp : config || {};
  const valor = (clave) => limpio(base[clave]) || limpio(env?.[VARIABLES[clave]]);

  let graphVersion = valor("graphVersion") || GRAPH_VERSION_POR_DEFECTO;
  if (/^\d+\.\d+$/.test(graphVersion)) graphVersion = "v" + graphVersion;
  if (!/^v\d+\.\d+$/.test(graphVersion)) graphVersion = GRAPH_VERSION_POR_DEFECTO;

  const cfg = {
    token: valor("token"),
    phoneNumberId: valor("phoneNumberId"),
    wabaId: valor("wabaId"),
    appSecret: valor("appSecret"),
    verifyToken: valor("verifyToken"),
    graphVersion,
    modo: "desconectado",
    // Not env-driven on purpose: tuning knobs for tests and for the server agent.
    timeoutMs: Number(base.timeoutMs) > 0 ? Number(base.timeoutMs) : 10000,
    reintentos: Number.isInteger(base.reintentos) && base.reintentos >= 0 ? base.reintentos : 3,
    baseUrl: limpio(base.baseUrl) || "https://graph.facebook.com",
  };

  // Numeric Meta ids only: a pasted URL or a typo must not end up in a request path.
  for (const clave of ["phoneNumberId", "wabaId"]) if (cfg[clave] && !/^\d{5,30}$/.test(cfg[clave])) cfg[clave] = "";

  cfg.faltan = PARA_TODO.filter((k) => !cfg[k]).map((k) => VARIABLES[k]);
  cfg.configurado = PARA_ENVIAR.every((k) => Boolean(cfg[k]));

  const modo = valor("modo").toLowerCase();
  cfg.modo = !cfg.configurado ? "desconectado" : modo === "produccion" || modo === "producción" ? "produccion" : "prueba";
  return cfg;
}

/** Safe view for logs and /salud: says what is set, never the values. */
export function resumenConfig(cfg) {
  return {
    configurado: cfg.configurado,
    modo: cfg.modo,
    graphVersion: cfg.graphVersion,
    phoneNumberId: cfg.phoneNumberId ? "…" + cfg.phoneNumberId.slice(-4) : "",
    wabaId: cfg.wabaId ? "…" + cfg.wabaId.slice(-4) : "",
    faltan: cfg.faltan,
  };
}
