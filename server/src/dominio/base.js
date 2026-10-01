// Casa Lotus · how the domain reads and writes the business record.
//  - modelo(ctx): the current model (snapshot cache, memoized per version). For reads.
//  - transaccion(ctx, actor, fn): takes the single write lock, re-reads the Sheet bypassing the cache,
//    and gives fn a `tx` that writes typed columns, sees its own writes (tx.M), audits with the actor,
//    and queues side effects (novedades, e-mail, push, WhatsApp) that run after the lock is released.
import { construirModelo, aFila } from "../datos/modelo.js";
import { anotarRegistro } from "./registro.js";

const memo = new WeakMap(); // driver → { version, M }

/** Substitute requests (SQLite) travel with the model so every class view can show them. */
function reemplazosDe(ctx) {
  try {
    return new Map(ctx.db.prepare("SELECT * FROM reemplazos").all().map((r) => [r.clase, r]));
  } catch {
    return new Map();
  }
}

function modeloDe(ctx, snap) {
  const m = memo.get(ctx.datos);
  let M;
  if (m && m.version === snap.version && m.snap === snap) M = m.M;
  else {
    M = construirModelo(snap);
    memo.set(ctx.datos, { version: snap.version, snap, M });
  }
  M.reemplazos = reemplazosDe(ctx);
  return M;
}

export async function modelo(ctx, { fresco = false } = {}) {
  const snap = await ctx.datos.leer({ fresco });
  return modeloDe(ctx, snap);
}

/** Actor of background jobs. */
export const SISTEMA = Object.freeze({ tipo: "sistema", id: "sistema", nombre: "Casa Lotus" });

export async function transaccion(ctx, actor, fn) {
  const publicar = [];
  const despues = [];
  const resultado = await ctx.candado.con(async () => {
    await ctx.datos.leer({ fresco: true });
    const tx = {
      ctx,
      ahora: ctx.ahora(),
      actor,
      get M() { return modeloDe(ctx, ctx.datos.instantanea()); },
      async agregar(pestana, obj) {
        const [fila] = await ctx.datos.agregar(pestana, [aFila(pestana, obj)]);
        return fila;
      },
      async agregarVarios(pestana, objs) {
        if (!objs.length) return [];
        return ctx.datos.agregar(pestana, objs.map((o) => aFila(pestana, o)));
      },
      async actualizar(pestana, fila, cambios) {
        await ctx.datos.actualizar(pestana, fila, aFila(pestana, cambios));
      },
      auditar(accion, objeto, detalle) {
        anotarRegistro(ctx, actor, accion, objeto, detalle);
      },
      publicar(evento) { publicar.push(evento); },
      despues(f) { despues.push(f); },
    };
    return fn(tx);
  });
  for (const e of publicar) {
    try { ctx.novedades.publicar({ actor, ...e }); } catch (err) { ctx.log.error("no se pudo publicar la novedad", { error: err }); }
  }
  for (const f of despues) ctx.enSegundoPlano(f, resultado);
  return resultado;
}
