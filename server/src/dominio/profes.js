// Casa Lotus · what a profe sees: only the classes whose «Profe» matches her/his name as written in
// Clases/Horario (accent- and case-insensitive). Health answers only for those classes.
import * as R from "../../../shared/reglas.js";
import { modelo, transaccion } from "./base.js";
import { sinTilde } from "../datos/modelo.js";
import { vistaClaseEquipo, vistaClase, esPasada, asistenciaEditable, reemplazoDe, PLAZO_ASISTENCIA_MS } from "./vistas.js";
import { conflicto, noExiste, sinPermiso, validacion } from "../errores.js";

/**
 * Does this class belong to this staff member? Her schedule name (or, without one, her full name):
 * «Ximena» matches «Ximena», «ximena», «Ximena / Laura».
 */
export function profeDeClase(actor, clase) {
  const yo = [actor?.nombreHorario, actor?.nombre].map(sinTilde).filter(Boolean);
  if (!yo.length) return false;
  const suya = sinTilde(clase?.profe);
  if (!suya) return false;
  if (yo.includes(suya)) return true;
  const partes = suya.split(/\s*(?:,|\/|&|\+|\by\b)\s*/).map((s) => s.trim());
  return yo.some((n) => partes.includes(n));
}

/**
 * Attendance can be marked from the class day on. A profe has until 48 h after the start to mark or
 * correct it; after that only an admin.
 */
export function exigirPlazoAsistencia(actor, c, ahora) {
  if (c.fecha > R.hoyClave(ahora)) throw validacion("Esa clase todavía no ha pasado.");
  if (actor?.tipo === "profe" && ahora > R.inicioClase(c) + PLAZO_ASISTENCIA_MS) {
    throw conflicto("fuera-de-plazo", "Ya pasaron más de 48 horas desde la clase: pídele a Ana que corrija la asistencia.");
  }
}

/** Admin without a schedule name sees every class through the profe endpoints. */
const veTodo = (actor) => actor.tipo === "admin" && !sinTilde(actor.nombreHorario);
const esSuya = (actor, c) => veTodo(actor) || profeDeClase(actor, c);

/** Classes that still have attendance to mark (confirmed bookings in a class that already started). */
export const porMarcar = (M, c, ahora) => esPasada(c, ahora) && c.estado === "Programada" &&
  M.reservasDeClase(c.id).some((r) => r.estado === R.ESTADO.CONFIRMADA);

export async function clasesDeProfe(ctx, actor, { desde, hasta } = {}) {
  const M = await modelo(ctx), ahora = ctx.ahora(), hoy = R.hoyClave(ahora);
  const d = desde || hoy, h = hasta || R.sumarDias(hoy, 14), atras = R.sumarDias(hoy, -7);
  return M.clases.filter((c) => esSuya(actor, c))
    .filter((c) => (c.fecha >= d && c.fecha <= h) || (c.fecha >= atras && c.fecha < d && porMarcar(M, c, ahora)))
    .map((c) => vistaClaseEquipo(M, c, ahora, { actor }));
}

export async function claseDeProfe(ctx, actor, id) {
  const M = await modelo(ctx);
  const c = M.clasePorId.get(id);
  if (!c) throw noExiste("Esa clase no existe.");
  if (!esSuya(actor, c)) throw sinPermiso("Esa clase no es tuya.");
  return vistaClaseEquipo(M, c, ctx.ahora(), { actor });
}

export async function notaDeClase(ctx, actor, id, texto) {
  return transaccion(ctx, actor, async (tx) => {
    const c = tx.M.clasePorId.get(id);
    if (!c) throw noExiste("Esa clase no existe.");
    if (!esSuya(actor, c) && actor.tipo !== "admin") throw sinPermiso("Esa clase no es tuya.");
    await tx.actualizar("Clases", c._fila, { "Notas": texto });
    tx.auditar("clase.nota", c.id, { antes: c.notas, ahora: texto });
    return vistaClaseEquipo(tx.M, tx.M.clasePorId.get(id), tx.ahora, { actor });
  });
}

/** A class counts as taught when it already happened, was not cancelled and had someone booked. */
export const dictada = (M, c, ahora) => esPasada(c, ahora) && c.estado === "Programada" &&
  M.reservasDeClase(c.id).some((r) => [R.ESTADO.ASISTIO, R.ESTADO.NO_VINO, R.ESTADO.CONFIRMADA].includes(r.estado));

export async function resumenProfe(ctx, actor, { mes } = {}) {
  const M = await modelo(ctx), ahora = ctx.ahora(), hoy = R.hoyClave(ahora);
  const m = mes || hoy.slice(0, 7);
  const suyas = M.clases.filter((c) => esSuya(actor, c));
  const delMes = suyas.filter((c) => c.fecha.startsWith(m));
  const dictadas = delMes.filter((c) => dictada(M, c, ahora));
  const asistentes = dictadas.reduce((s, c) => s + M.reservasDeClase(c.id).filter((r) => r.estado === R.ESTADO.ASISTIO).length, 0);
  const cupos = dictadas.reduce((s, c) => s + c.cupos, 0);
  const ocupados = dictadas.reduce((s, c) => s + M.ocupados(c.id), 0);
  const futuras = suyas.filter((c) => c.estado === "Programada" && !esPasada(c, ahora));
  const proximas = futuras.filter((c) => c.fecha <= R.sumarDias(hoy, 14)).length;
  const pendientesPorMarcar = suyas.filter((c) => c.fecha >= R.sumarDias(hoy, -7) && porMarcar(M, c, ahora) && asistenciaEditable(c, ahora, actor)).length;
  const reemplazosPedidos = futuras.filter((c) => reemplazoDe(M, c)?.pedidoPor === actor.id).length;
  return {
    mes: m, clasesDictadas: dictadas.length, asistentes, proximas, ocupacionPct: cupos ? Math.round((ocupados / cupos) * 100) : 0,
    pendientesPorMarcar, proximaClase: futuras[0] ? vistaClase(M, futuras[0], ahora) : null, reemplazosPedidos,
  };
}
