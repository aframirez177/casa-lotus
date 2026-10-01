// Live events for Ana: Server-Sent Events from /api/admin/stream; the demo plugs in its own source.
let fuenteDemo = null;
export function usarStreamDemo(fn) { fuenteDemo = fn; }

/** Opens the stream. alEstado(true|false) reports whether it is live. Returns a closer. */
export function abrirStream(alEvento, alEstado) {
  if (fuenteDemo) {
    alEstado?.(true);
    return fuenteDemo(alEvento);
  }
  if (typeof EventSource === "undefined") { alEstado?.(false); return () => {}; }
  const es = new EventSource("/api/admin/stream", { withCredentials: true });
  es.onopen = () => alEstado?.(true);
  es.onerror = () => alEstado?.(false); // the browser retries by itself; polling covers the gap
  es.addEventListener("evento", (m) => {
    try { alEvento(JSON.parse(m.data)); } catch { /* malformed event: skip */ }
  });
  return () => es.close();
}
