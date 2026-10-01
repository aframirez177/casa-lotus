// Attribution for the booking (paid inside the commission: every booking must say where it came from).
// The site keeps { utm, clickIds, landing, ts } in localStorage["cl_atribucion"] for 90 days (CONTRATO §9).
// A visitor who lands right here with utm_* / click ids in the URL is captured into the same key.
const UTM = ["source", "medium", "campaign", "term", "content"];
const CLICK = ["gclid", "gbraid", "wbraid", "fbclid"];
const CLAVE = "cl_atribucion";
const VIGENCIA_MS = 90 * 86400000;

function guardada(ahora) {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || "null");
    if (!g) return {};
    const ts = Date.parse(g.ts);
    return Number.isFinite(ts) && ahora - ts > VIGENCIA_MS ? {} : g;
  } catch { return {}; }
}

export function leerAtribucion(params = new URLSearchParams(location.search), ahora = Date.now()) {
  const g = guardada(ahora);
  const utmUrl = {}, clickUrl = {};
  for (const k of UTM) if (params.get("utm_" + k)) utmUrl[k] = params.get("utm_" + k);
  for (const k of CLICK) if (params.get(k)) clickUrl[k] = params.get(k);
  const nuevaVisita = Object.keys(utmUrl).length || Object.keys(clickUrl).length;
  const utm = nuevaVisita ? utmUrl : { ...(g.utm || {}) };
  const clickIds = nuevaVisita ? clickUrl : { ...(g.clickIds || {}) };
  if (nuevaVisita) {
    try { localStorage.setItem(CLAVE, JSON.stringify({ ...g, utm, clickIds, landing: location.pathname + location.search, ts: new Date(ahora).toISOString() })); } catch { /* private mode */ }
  }
  const ref = (params.get("ref") || g.ref || g.cta?.ref || "APP-RESERVAR").slice(0, 60);
  const limpio = (o) => (Object.keys(o).length ? o : undefined);
  return { ref, utm: limpio(utm), clickIds: limpio(clickIds), landing: nuevaVisita ? location.pathname : g.landing };
}

/** Fire-and-forget analytics event (sendBeacon when it can). */
export function evento(tipo, datos = {}) {
  try {
    const at = leerAtribucion();
    const cuerpo = JSON.stringify({ tipo, ref: at.ref, pagina: location.pathname, utm: at.utm, clickIds: at.clickIds, ...datos });
    if (window.__clDemo) return;
    const blob = new Blob([cuerpo], { type: "text/plain;charset=UTF-8" });
    if (!(navigator.sendBeacon && navigator.sendBeacon("/api/publico/eventos", blob))) {
      fetch("/api/publico/eventos", { method: "POST", body: cuerpo, keepalive: true, credentials: "include", headers: { "Content-Type": "application/json", "X-Casa-Lotus": "1" } }).catch(() => {});
    }
  } catch { /* analytics never breaks booking */ }
}
