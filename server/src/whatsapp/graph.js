// Minimal Graph API client for the WhatsApp Cloud API: Bearer token, timeout, retries with
// exponential backoff on 429 / 5xx / Meta's «try again» codes, and Meta errors turned into
// WhatsAppError with a Spanish message. `fetch` is injectable so tests never touch the network.
//
// Retry safety: a POST is retried only when Meta answered that it did not take the request
// (429, 5xx, throttling codes) or when the connection never opened (DNS, refused). A timeout on a
// POST is NOT retried, because Meta may have accepted the message and a retry would send it twice.

import { WhatsAppError, errorDeMeta } from "./errores.js";

const CODIGOS_REINTENTABLES = new Set([1, 2, 4, 80007, 130429, 131000, 131016, 131057, 135000]);
const RED_SIN_ENVIO = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"]);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function crearClienteGraph({ cfg, fetch: fetchFn = globalThis.fetch, esperar = dormir, log = console } = {}) {
  if (typeof fetchFn !== "function") throw new Error("crearClienteGraph: fetch is not available");

  const url = (ruta, query) => {
    const u = new URL(`${cfg.baseUrl.replace(/\/+$/, "")}/${cfg.graphVersion}/${String(ruta).replace(/^\/+/, "")}`);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
    return u;
  };

  const pausa = (intento, retryAfter) => {
    const s = Number(retryAfter);
    if (Number.isFinite(s) && s > 0) return Math.min(s * 1000, 5000);
    return Math.min(400 * 2 ** intento, 4000) + Math.floor(Math.random() * 200);
  };

  /**
   * One Graph call. Returns the parsed JSON body on success; throws WhatsAppError otherwise.
   * @param {"GET"|"POST"|"DELETE"} metodo
   * @param {string} ruta  e.g. "123456/messages" (no version, no leading slash needed)
   */
  async function llamar(metodo, ruta, { cuerpo, query } = {}) {
    if (!cfg.token) throw new WhatsAppError("no-configurado", "Falta el token de WhatsApp (WHATSAPP_TOKEN).");
    const destino = url(ruta, query);
    const esGet = metodo === "GET";
    const maxIntentos = 1 + Math.max(0, cfg.reintentos ?? 3);
    let ultimoError;

    for (let intento = 0; intento < maxIntentos; intento++) {
      let res;
      try {
        res = await fetchFn(destino, {
          method: metodo,
          headers: {
            Authorization: `Bearer ${cfg.token}`,
            Accept: "application/json",
            ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
          signal: AbortSignal.timeout(cfg.timeoutMs ?? 10000),
        });
      } catch (e) {
        const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
        const codigoRed = e?.cause?.code || e?.code;
        const sinEnvio = RED_SIN_ENVIO.has(codigoRed);
        ultimoError = new WhatsAppError(
          "servidor",
          timeout
            ? esGet
              ? "WhatsApp no respondió a tiempo. Intenta de nuevo."
              : "WhatsApp no respondió a tiempo. Revisa en el chat si el mensaje llegó antes de reenviarlo."
            : "No hay conexión con WhatsApp en este momento. Intenta de nuevo en unos minutos.",
          { status: timeout ? 504 : 502, reintentable: esGet || sinEnvio },
        );
        log?.warn?.(`[whatsapp] ${metodo} ${destino.pathname} ${timeout ? "timeout" : "red " + (codigoRed || e?.message)}`);
        if ((esGet || sinEnvio) && intento < maxIntentos - 1) { await esperar(pausa(intento)); continue; }
        throw ultimoError;
      }

      let datos = null;
      const texto = await res.text().catch(() => "");
      if (texto) { try { datos = JSON.parse(texto); } catch { datos = null; } }

      if (res.ok && datos && !datos.error) return datos;

      const errorMeta = datos?.error || { message: `HTTP ${res.status}`, code: res.status >= 500 ? 2 : undefined };
      ultimoError = errorDeMeta(errorMeta, res.status);
      const reintentar = res.status === 429 || res.status >= 500 || CODIGOS_REINTENTABLES.has(Number(errorMeta.code));
      log?.warn?.(`[whatsapp] ${metodo} ${destino.pathname} → ${res.status} código ${errorMeta.code ?? "?"}${reintentar && intento < maxIntentos - 1 ? " (reintento)" : ""}`);
      if (reintentar && intento < maxIntentos - 1) { await esperar(pausa(intento, res.headers?.get?.("retry-after"))); continue; }
      throw ultimoError;
    }
    throw ultimoError;
  }

  return {
    llamar,
    get: (ruta, query) => llamar("GET", ruta, { query }),
    post: (ruta, cuerpo) => llamar("POST", ruta, { cuerpo }),
    /** GET that follows `paging.next` cursors and returns every `data` item (bounded). */
    async todas(ruta, query, maxPaginas = 20) {
      const items = [];
      let after;
      for (let i = 0; i < maxPaginas; i++) {
        const r = await llamar("GET", ruta, { query: { ...query, after } });
        items.push(...(Array.isArray(r?.data) ? r.data : []));
        after = r?.paging?.cursors?.after;
        if (!r?.paging?.next || !after) break;
      }
      return items;
    },
  };
}
