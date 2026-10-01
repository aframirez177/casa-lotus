// Casa Lotus · the one way the app talks to the API.
// Same origin, cookie session (credentials: include), CSRF header on every request, and errors
// normalized to { status, error, mensaje, campos, motivo } so screens can show Ana's words.

export class ErrorApi extends Error {
  constructor({ status = 0, error = "red", mensaje, campos, motivo, sinApi = false } = {}) {
    super(mensaje || MENSAJES[error] || MENSAJES.servidor);
    this.name = "ErrorApi";
    this.status = status;
    this.error = error;
    this.mensaje = this.message;
    this.campos = campos || null;
    this.motivo = motivo || null;
    /** true when the API itself is unreachable (no network, proxy error, a non-JSON answer): not a business error */
    this.sinApi = sinApi;
  }
}

const MENSAJES = {
  "no-autenticado": "Tu sesión se cerró. Entra de nuevo.",
  "sin-permiso": "No tienes permiso para hacer esto.",
  "no-existe": "No encontramos eso. Puede que ya no exista.",
  validacion: "Revisa los datos marcados.",
  conflicto: "Algo cambió mientras tanto. Vuelve a intentarlo.",
  limite: "Demasiados intentos. Espera unos minutos y vuelve a probar.",
  servidor: "Algo falló de nuestro lado. Intenta de nuevo en un momento.",
  "no-configurado": "Esto todavía no está conectado.",
  red: "Sin conexión. Revisa tu internet e intenta de nuevo.",
};

/** Words for each conflict reason (409 motivo). */
export const MOTIVOS = {
  llena: "La clase se llenó hace un momento.",
  tarde: "Ya es muy tarde para eso: el plazo se cerró.",
  cancelada: "Esta clase se canceló.",
  "ya-reservada": "Ya tienes esta clase reservada.",
  "muchas-pendientes": "Tienes reservas esperando pago. Paga una antes de apartar otra.",
  cambios: "Esta reserva ya no admite más cambios.",
  empezo: "La clase ya empezó.",
  estado: "Esta reserva ya cambió de estado.",
};

const CODIGO_POR_STATUS = { 401: "no-autenticado", 403: "sin-permiso", 404: "no-existe", 409: "conflicto", 422: "validacion", 429: "limite", 503: "no-configurado" };

/** Network layer, swappable: the demo adapter replaces it with an in-browser studio. */
let transporte = (url, init) => fetch(url, init);
export function usarTransporte(fn) { transporte = fn; }

/** Listeners for 401s anywhere (the session ended): the app goes back to /entrar. */
const alSalir = new Set();
export function alPerderSesion(fn) { alSalir.add(fn); return () => alSalir.delete(fn); }

/**
 * pedir("/api/yo") · pedir("/api/yo/reservas", { metodo: "POST", cuerpo: { clase } })
 * consulta: object → query string (empty values skipped).
 */
export async function pedir(ruta, { metodo = "GET", cuerpo, consulta, senal, silencioso401 = false } = {}) {
  let url = ruta;
  if (consulta) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(consulta)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += (url.includes("?") ? "&" : "?") + s;
  }
  const headers = { Accept: "application/json", "X-Casa-Lotus": "1" };
  const init = { method: metodo, credentials: "include", headers, signal: senal };
  if (cuerpo !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(cuerpo);
  }

  let res;
  try {
    res = await transporte(url, init);
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new ErrorApi({ status: 0, error: "red", sinApi: true });
  }

  if (res.status === 204) return null;
  let datos = null;
  const texto = await res.text();
  if (texto) {
    try { datos = JSON.parse(texto); } catch { datos = null; }
  }
  if (!res.ok || datos?.ok === false) {
    const error = datos?.error || CODIGO_POR_STATUS[res.status] || "servidor";
    const motivo = datos?.motivo || null;
    const mensaje = datos?.mensaje || (motivo && MOTIVOS[motivo]) || MENSAJES[error];
    const sinApi = datos === null || res.status === 502 || res.status === 504;
    const err = new ErrorApi({ status: res.status, error, mensaje, campos: datos?.campos, motivo, sinApi });
    if (res.status === 401 && !silencioso401) for (const fn of alSalir) fn(err);
    throw err;
  }
  return datos;
}

export const api = {
  get: (ruta, consulta, opciones) => pedir(ruta, { ...opciones, consulta }),
  post: (ruta, cuerpo, opciones) => pedir(ruta, { ...opciones, metodo: "POST", cuerpo: cuerpo ?? {} }),
  patch: (ruta, cuerpo, opciones) => pedir(ruta, { ...opciones, metodo: "PATCH", cuerpo: cuerpo ?? {} }),
  del: (ruta, cuerpo, opciones) => pedir(ruta, { ...opciones, metodo: "DELETE", cuerpo }),
};

/** encodeURIComponent for ids with spaces ("2026-10-03 08:00"). */
export const id = (v) => encodeURIComponent(v);
