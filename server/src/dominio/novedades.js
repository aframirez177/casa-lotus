// Casa Lotus · novedades: the admin bell. One bus feeds three outlets:
// SQLite (GET /api/admin/novedades and the clienta timeline), Server-Sent Events (/api/admin/stream)
// and Web Push to the admins' installed app.

const TIPOS = new Set(["reserva-web", "reserva", "cancelacion", "reagenda", "pago", "asistencia", "mensaje", "espera", "clase", "sistema"]);
const PUSH = new Set(["reserva-web", "espera", "mensaje"]);

function aEvento(fila) {
  let actor = {}, datos = {};
  try { actor = JSON.parse(fila.actor); } catch { actor = {}; }
  try { datos = JSON.parse(fila.datos); } catch { datos = {}; }
  const e = { id: String(fila.id), ts: new Date(fila.ts).toISOString(), tipo: fila.tipo, titulo: fila.titulo, actor };
  if (fila.detalle) e.detalle = fila.detalle;
  if (fila.clienta) e.clienta = fila.clienta;
  if (fila.clase) e.clase = fila.clase;
  if (datos.conversacion) e.conversacion = datos.conversacion;
  if (datos.ruta) e.ruta = datos.ruta;
  return e;
}

export function crearNovedades(ctx) {
  const oyentes = new Set();

  function publicar(evento) {
    const tipo = TIPOS.has(evento?.tipo) ? evento.tipo : "sistema";
    const tsIn = evento?.ts ? (typeof evento.ts === "number" ? evento.ts : Date.parse(evento.ts)) : NaN;
    const ts = Number.isFinite(tsIn) ? tsIn : ctx.ahora();
    const a = evento?.actor || {};
    const actor = { tipo: String(a.tipo || "sistema"), id: a.id ? String(a.id) : undefined, nombre: String(a.nombre || "") };
    const datos = {};
    if (evento?.conversacion) datos.conversacion = String(evento.conversacion);
    if (evento?.ruta) datos.ruta = String(evento.ruta);
    const r = ctx.db.prepare("INSERT INTO eventos (ts, tipo, titulo, detalle, clienta, clase, actor, datos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      ts, tipo, String(evento?.titulo || "").slice(0, 200), String(evento?.detalle || "").slice(0, 1000),
      evento?.clienta ? String(evento.clienta) : null, evento?.clase ? String(evento.clase) : null, JSON.stringify(actor), JSON.stringify(datos),
    );
    const guardado = aEvento(ctx.db.prepare("SELECT * FROM eventos WHERE id = ?").get(r.lastInsertRowid));
    for (const f of oyentes) {
      try { f(guardado); } catch { /* a broken listener never stops the others */ }
    }
    if ((PUSH.has(tipo) || evento?.push === true) && ctx.push?.activo) {
      ctx.enSegundoPlano(() => ctx.push.aAdmins({ titulo: guardado.titulo, cuerpo: guardado.detalle || "", ruta: datos.ruta || "/app/admin", etiqueta: tipo }));
    }
    return guardado;
  }

  function listar({ desde, limite = 100 } = {}) {
    const desdeMs = desde ? Date.parse(desde) : NaN;
    const min = Number.isFinite(desdeMs) ? desdeMs : ctx.ahora() - 7 * 86400000;
    return ctx.db.prepare("SELECT * FROM eventos WHERE ts > ? ORDER BY ts DESC, id DESC LIMIT ?").all(min, Math.min(limite, 500)).map(aEvento);
  }

  function deClienta(id, limite = 100) {
    return ctx.db.prepare("SELECT * FROM eventos WHERE clienta = ? ORDER BY ts DESC, id DESC LIMIT ?").all(id, limite).map(aEvento);
  }

  return {
    publicar,
    listar,
    deClienta,
    suscribir(f) { oyentes.add(f); return () => oyentes.delete(f); },
    get oyentes() { return oyentes.size; },
  };
}
