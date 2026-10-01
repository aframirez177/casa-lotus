// Casa Lotus · the audit log (SQLite): every write, with who did it. Never personal data beyond ids
// and what changed; health text is never copied into it.

const LARGO = 2000;

export function anotarRegistro(ctx, actor, accion, objeto = "", detalle = {}) {
  const a = actor || { tipo: "sistema" };
  let d = "{}";
  try { d = JSON.stringify(detalle ?? {}).slice(0, LARGO); } catch { d = "{}"; }
  ctx.db.prepare("INSERT INTO registro (ts, actor_tipo, actor_id, actor_nombre, accion, objeto, detalle) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(ctx.ahora(), String(a.tipo || "sistema"), String(a.id || ""), String(a.nombre || ""), String(accion), String(objeto || ""), d);
}

export function listarRegistro(ctx, { limite = 100, antes } = {}) {
  const lim = Math.min(Math.max(Number(limite) || 100, 1), 500);
  const antesMs = antes ? Date.parse(antes) : NaN;
  const filas = Number.isFinite(antesMs)
    ? ctx.db.prepare("SELECT * FROM registro WHERE ts < ? ORDER BY ts DESC, id DESC LIMIT ?").all(antesMs, lim)
    : ctx.db.prepare("SELECT * FROM registro ORDER BY ts DESC, id DESC LIMIT ?").all(lim);
  return filas.map((r) => {
    let detalle = {};
    try { detalle = JSON.parse(r.detalle); } catch { detalle = {}; }
    return { ts: new Date(r.ts).toISOString(), actor: { tipo: r.actor_tipo, id: r.actor_id, nombre: r.actor_nombre }, accion: r.accion, objeto: r.objeto, detalle };
  });
}
