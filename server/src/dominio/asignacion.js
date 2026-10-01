// Casa Lotus · who teaches what: assigning profes (only active staff), substitute requests, and the
// Web Push a profe gets about her classes.
import * as R from "../../../shared/reglas.js";
import { modelo } from "./base.js";
import { sinTilde } from "../datos/modelo.js";
import { anotarRegistro } from "./registro.js";
import { vistaClaseEquipo, esPasada } from "./vistas.js";
import { profeDeClase } from "./profes.js";
import { conflicto, noExiste, sinPermiso, validacion } from "../errores.js";

export const POR_CONFIRMAR = "Por confirmar";
export const sinProfe = (texto) => !sinTilde(texto) || sinTilde(texto) === sinTilde(POR_CONFIRMAR);

const staffActivo = (ctx) => ctx.db.prepare("SELECT * FROM usuarios WHERE activa = 1 AND rol IN ('profe', 'admin')").all();

/** Staff whose schedule name (or full name) is this «Profe» text. */
export function staffDeNombre(ctx, texto) {
  if (sinProfe(texto)) return [];
  return staffActivo(ctx).filter((u) => profeDeClase({ nombreHorario: u.nombre_horario, nombre: u.nombre }, { profe: texto }));
}

/**
 * The «Profe» text to write: "" or «Por confirmar», or an active staff member found by schedule name or full
 * name (accent/case-insensitive), written as her schedule name. Anyone else is refused.
 */
export function resolverProfe(ctx, texto) {
  const t = sinTilde(texto);
  if (!t) return "";
  if (t === sinTilde(POR_CONFIRMAR)) return POR_CONFIRMAR;
  const u = staffActivo(ctx).find((x) => sinTilde(x.nombre_horario) === t || sinTilde(x.nombre) === t);
  if (!u) throw validacion("Elige a alguien del equipo (o «Por confirmar»).", { profe: "Elige a alguien del equipo activo." });
  return u.nombre_horario || u.nombre;
}

/** GET /api/admin/profes: a light list for pickers (profes, and admins who teach). */
export function listarProfes(ctx) {
  return ctx.db.prepare("SELECT * FROM usuarios WHERE rol = 'profe' OR (rol = 'admin' AND nombre_horario != '') ORDER BY activa DESC, nombre").all()
    .map((u) => ({ id: u.id, nombre: u.nombre, nombreHorario: u.nombre_horario || u.nombre, activa: Boolean(u.activa) }));
}

/** Web Push to whoever teaches this class (when she enabled it). */
export function avisarProfe(ctx, profe, carga) {
  if (!ctx.push?.activo) return;
  const ids = staffDeNombre(ctx, profe).map((u) => u.id);
  if (ids.length) ctx.enSegundoPlano(() => ctx.push.aUsuarios(ids, { etiqueta: "profe", ...carga }));
}

/** A class got a new profe: the substitute request closes, Ana's feed hears it, the new profe is told. */
export function profeCambiado(ctx, actor, clase, antes, ahora) {
  ctx.db.prepare("DELETE FROM reemplazos WHERE clase = ?").run(clase.id);
  ctx.novedades.publicar({
    actor, tipo: "clase", clase: clase.id, ruta: "/app/admin/agenda/" + encodeURIComponent(clase.id),
    titulo: "Profe de la clase del " + R.fechaCorta(clase.fecha) + " · " + R.horaLegible(clase.hora) + ": " + (ahora || "sin asignar"),
    detalle: antes && !sinProfe(antes) ? "Antes: " + antes : "",
  });
  if (!sinProfe(ahora)) {
    avisarProfe(ctx, ahora, {
      titulo: "Te asignaron la clase del " + R.fechaLegible(clase.fecha) + " a las " + R.horaLegible(clase.hora),
      cuerpo: clase.clase && clase.clase !== POR_CONFIRMAR ? clase.clase : "Casa Lotus", ruta: "/app/profe/clase/" + encodeURIComponent(clase.id),
    });
  }
}

/** POST /api/profe/clases/:id/reemplazo: she cannot teach it; Ana gets a priority alert and a push. */
export async function pedirReemplazo(ctx, actor, idClase, motivo = "") {
  const M = await modelo(ctx), ahora = ctx.ahora();
  const c = M.clasePorId.get(idClase);
  if (!c) throw noExiste("Esa clase no existe.");
  if (actor.tipo !== "admin" && !profeDeClase(actor, c)) throw sinPermiso("Esa clase no es tuya.");
  if (c.estado === "Cancelada") throw conflicto("cancelada", "Esa clase fue cancelada.");
  if (esPasada(c, ahora)) throw conflicto("empezo", "Esa clase ya empezó.");
  ctx.db.prepare(`INSERT INTO reemplazos (clase, profe, usuario, motivo, fecha) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (clase) DO UPDATE SET profe = excluded.profe, usuario = excluded.usuario, motivo = excluded.motivo, fecha = excluded.fecha`)
    .run(c.id, c.profe || "", actor.id, motivo, ahora);
  anotarRegistro(ctx, actor, "clase.reemplazo", c.id, { motivo });
  ctx.novedades.publicar({
    actor, tipo: "clase", clase: c.id, push: true, ruta: "/app/admin/agenda/" + encodeURIComponent(c.id) + "?profe=1",
    titulo: "Necesita reemplazo: " + R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora),
    detalle: (actor.nombre || "La profe") + (motivo ? ": " + motivo : " no puede dar esta clase."),
  });
  return vistaClaseEquipo(await modelo(ctx), c, ahora, { actor });
}
