// Casa Lotus · first-party attribution (shared/CONTRATO.md §9, docs/seo/plan.md §8.4).
// The site is paid by the sales it brings, so every booking must be traceable to its ad and button:
// - on landing, utm_* and click ids (gclid, gbraid, wbraid, fbclid) go to localStorage «cl_atribucion»
//   = { utm, clickIds, landing, ts } for 90 days (Google Ads accepts conversions up to 90 days after the
//   click); the last non-empty click wins; the app reads it when she books;
// - every CTA click ([data-cta], WhatsApp links) sends one event to POST /api/publico/eventos.
// No cookies, no third parties, nothing personal: a campaign, a click id and a button name.

const CLAVE = "cl_atribucion";
const VIDA = 90 * 24 * 3600 * 1000;
const EVENTOS = "/api/publico/eventos";
const UTM = ["source", "medium", "campaign", "term", "content"];
const CLICS = ["gclid", "gbraid", "wbraid", "fbclid"];

/** The stored attribution, or null when there is none or it is older than 90 days (then it is dropped). */
export function leer() {
  try {
    const a = JSON.parse(localStorage.getItem(CLAVE) || "null");
    if (a && (!a.ts || Date.now() - Date.parse(a.ts) > VIDA)) {
      localStorage.removeItem(CLAVE);
      return null;
    }
    return a;
  } catch { return null; }
}
function guardar(a) {
  try { localStorage.setItem(CLAVE, JSON.stringify(a)); } catch { /* storage blocked: the URL ref still attributes */ }
}

/** Referrer host when it is another site (google.com, instagram.com…): organic attribution without UTM. */
function referente() {
  try {
    const r = document.referrer && new URL(document.referrer);
    return r && r.host !== location.host ? r.host : "";
  } catch { return ""; }
}

/**
 * One event to the server, as a beacon: it survives the navigation a CTA click starts, never blocks the
 * click, and a server that is down (502 until the API is deployed) costs nothing and logs nothing.
 * text/plain JSON, the same as the app's events (no CORS preflight; the server parses both).
 */
export function enviar(datos) {
  try {
    const body = JSON.stringify(datos);
    if (navigator.sendBeacon?.(EVENTOS, new Blob([body], { type: "text/plain;charset=UTF-8" }))) return;
    fetch(EVENTOS, { method: "POST", body, keepalive: true, credentials: "same-origin", headers: { "content-type": "application/json", "x-casa-lotus": "1" } }).catch(() => {});
  } catch { /* never block a click */ }
}

/**
 * Reads the landing URL. A new click id replaces the whole record (last non-empty click wins, its 90-day
 * clock starts again). A campaign without a click id (an Instagram bio link) updates the channel but keeps
 * a stored click id and its clock. A plain visit keeps whatever is stored.
 */
export function capturar() {
  const q = new URLSearchParams(location.search);
  const utm = {}, clickIds = {};
  for (const k of UTM) { const v = q.get("utm_" + k); if (v) utm[k] = v.slice(0, 150); }
  for (const k of CLICS) { const v = q.get(k); if (v) clickIds[k] = v.slice(0, 300); }
  const hayClic = Object.keys(clickIds).length > 0, hayUtm = Object.keys(utm).length > 0;
  const ahora = new Date().toISOString(), landing = location.pathname;
  let a = leer(), nuevo = false;
  if (!a || hayClic) {
    a = { ...(a || {}), utm, clickIds, landing, ts: ahora, referente: referente() };
    nuevo = true;
  } else if (hayUtm) {
    const conClic = Object.keys(a.clickIds || {}).length > 0;
    a = { ...a, utm, landing, referente: referente(), ts: conClic ? a.ts : ahora };
    nuevo = true;
  }
  if (nuevo) {
    guardar(a);
    // the landing view goes when the visitor leaves the page (or clicks first): nothing on the network
    // while the page loads, and one beacon however the visit ends
    const vista = { tipo: "vista", ref: "WEB-ENTRADA", pagina: landing, utm: a.utm, clickIds: a.clickIds };
    let enviada = false;
    const una = () => { if (!enviada) { enviada = true; enviar(vista); } };
    addEventListener("pagehide", una, { once: true });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") una(); });
    document.addEventListener("click", (e) => { if (e.target instanceof Element && e.target.closest("[data-cta], a[data-wa]")) una(); }, { capture: true });
  }
  return a;
}

export function iniciarAtribucion() {
  const a = capturar();
  const fuente = a?.utm?.source;

  // WhatsApp links (questions, not bookings) carry the ref inside the message, plus the source (v1)
  document.querySelectorAll("a[data-wa]").forEach((el) => {
    const ref = el.dataset.wa + (fuente ? `·${fuente}` : "");
    const texto = el.dataset.waText || "Hola Casa Lotus, tengo una pregunta";
    el.href = `https://wa.me/${el.dataset.waNumero || "573128720888"}?text=${encodeURIComponent(`${texto} (ref:${ref})`)}`;
    el.target = "_blank";
    el.rel = "noopener";
  });

  document.addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target.closest("[data-cta], a[data-wa]") : null;
    if (!el) return;
    const ref = el.dataset.cta || el.dataset.wa;
    const actual = leer() || a || {};
    actual.ref = ref; // the app falls back to it when a link carries no ref
    actual.cta = { ref, pagina: location.pathname, ts: new Date().toISOString() };
    guardar(actual);
    enviar({ tipo: "cta", ref, pagina: location.pathname, utm: actual.utm, clickIds: actual.clickIds });
    window.dispatchEvent(new CustomEvent("casalotus:cta", { detail: { ref } }));
  }, { capture: true });
}

/** Video opens are measured too (they are the strongest proof on the page). */
export function videoAbierto(ref) {
  const a = leer() || {};
  enviar({ tipo: "video", ref, pagina: location.pathname, utm: a.utm, clickIds: a.clickIds });
}
