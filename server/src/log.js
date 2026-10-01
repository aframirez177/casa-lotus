// Casa Lotus · structured logs (one JSON line each). Personal data never reaches them:
// phones, e-mails and long tokens are masked before anything is written.

const NIVELES = { debug: 10, info: 20, warn: 30, error: 40, silencio: 99 };

/** Masks phones (≥ 9 digits), e-mails and long opaque tokens inside any string. */
export function enmascarar(texto) {
  return String(texto ?? "")
    .replace(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (_, dominio) => "•••@" + dominio)
    .replace(/\+?\d[\d\s-]{7,}\d/g, (m) => {
      const d = m.replace(/\D/g, "");
      return d.length >= 9 ? "•••" + d.slice(-3) : m; // phones (9+ digits), not dates
    })
    .replace(/[A-Za-z0-9_-]{32,}/g, "[token]");
}

/** Masks a URL path: tokens in /enlace/:token, /invitacion/:token… */
export function rutaSegura(url) {
  const [ruta] = String(url || "").split("?");
  return enmascarar(ruta);
}

function limpiarCampos(campos) {
  const out = {};
  for (const [k, v] of Object.entries(campos || {})) {
    if (v === undefined) continue;
    if (v instanceof Error) out[k] = enmascarar(v.message);
    else if (typeof v === "string") out[k] = enmascarar(v).slice(0, 500);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
    else out[k] = enmascarar(JSON.stringify(v)).slice(0, 500);
  }
  return out;
}

export function crearLog({ nivel = "info", salida = process.stdout } = {}) {
  const minimo = NIVELES[nivel] ?? 20;
  const escribir = (n, msg, campos) => {
    if (NIVELES[n] < minimo) return;
    const linea = JSON.stringify({ t: new Date().toISOString(), n, msg: enmascarar(msg), ...limpiarCampos(campos) });
    salida.write(linea + "\n");
  };
  return {
    debug: (msg, c) => escribir("debug", msg, c),
    info: (msg, c) => escribir("info", msg, c),
    warn: (msg, c) => escribir("warn", msg, c),
    error: (msg, c) => escribir("error", msg, c),
  };
}
