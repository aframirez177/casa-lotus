// Casa Lotus · the calendar: the agenda, extra classes, editing and cancelling a class, the weekly
// template (Horario) and the job that keeps «Semanas de clases hacia adelante» generated.
// Classes are created from Horario without holidays; existing classes are never touched by the job.
import * as R from "../../../shared/reglas.js";
import { modelo, transaccion, SISTEMA } from "./base.js";
import { vistaClaseEquipo, vistaClase, esPasada, nombreClase } from "./vistas.js";
import { conflicto, noExiste, validacion } from "../errores.js";
import { porMarcar } from "./profes.js";
import { cuandoTexto } from "./reservas.js";
import { resolverProfe, profeCambiado, avisarProfe, sinProfe } from "./asignacion.js";
import { sinTilde } from "../datos/modelo.js";

export async function agenda(ctx, { desde, hasta } = {}) {
  const M = await modelo(ctx), ahora = ctx.ahora(), hoy = R.hoyClave(ahora);
  const d = desde || R.sumarDias(hoy, -7), h = hasta || R.sumarDias(hoy, 21);
  return M.clases.filter((c) => (c.fecha >= d && c.fecha <= h) || (c.fecha < d && c.fecha >= R.sumarDias(hoy, -14) && porMarcar(M, c, ahora)))
    .map((c) => vistaClaseEquipo(M, c, ahora));
}

export async function verClase(ctx, id) {
  const M = await modelo(ctx);
  const c = M.clasePorId.get(id);
  if (!c) throw noExiste("Esa clase no existe.");
  return vistaClaseEquipo(M, c, ctx.ahora());
}

/** Public availability: counts only, no names (CONTRATO §6). */
export async function disponibilidad(ctx, { desde, dias = 21 } = {}) {
  const M = await modelo(ctx), ahora = ctx.ahora(), hoy = R.hoyClave(ahora);
  const d = desde && desde > hoy ? desde : hoy;
  const n = Math.min(Math.max(Number(dias) || 21, 1), 60);
  const h = R.sumarDias(d, n - 1);
  return {
    actualizado: new Date(ahora).toISOString(),
    horasParaPagar: M.ajustes["Horas para pagar una reserva web"],
    // cancelled classes stay listed (reservable: false, motivo: "cancelada") so the site can say so
    clases: M.clases.filter((c) => c.fecha >= d && c.fecha <= h && !esPasada(c, ahora)).map((c) => vistaClase(M, c, ahora)),
  };
}

/* ── one class ─────────────────────────────────────────── */

export async function crearClaseExtra(ctx, actor, { fecha, hora, clase, profe: profeTexto, cupos, notas = "", forzar = false }) {
  const profe = resolverProfe(ctx, profeTexto);
  return transaccion(ctx, actor, async (tx) => {
    const M = tx.M, hoy = R.hoyClave(tx.ahora);
    if (fecha < hoy) throw validacion("Esa fecha ya pasó.", { fecha: "Elige una fecha de hoy en adelante." });
    const festivo = R.festivosEntre(fecha, fecha)[fecha];
    if (festivo && !forzar) {
      const f = R.fechaUTC(fecha);
      throw conflicto("festivo", "El " + f.getUTCDate() + " de " + R.MESES[f.getUTCMonth()] + " es festivo (" + festivo + "). ¿Crearla igual?");
    }
    const id = R.claseId(fecha, hora);
    if (M.clasePorId.has(id)) throw conflicto("estado", "Ya hay una clase el " + R.fechaLegible(fecha) + " a las " + R.horaLegible(hora) + ".");
    await tx.agregar("Clases", {
      "ID": id, "Fecha": fecha, "Día": R.diaDeSemana(fecha), "Hora": hora, "Clase": clase, "Profe": profe, "Cupos": cupos || M.ajustes["Cupos por clase"],
      "Estado": "Programada", "Notas": notas, "Tipo": "Extra",
    });
    ctx.db.prepare("DELETE FROM reemplazos WHERE clase = ?").run(id); // a new class never inherits an old request with the same id
    tx.auditar("clase.extra", id, { clase, profe, cupos, festivo: festivo || null });
    tx.publicar({ tipo: "clase", titulo: "Clase extra: " + R.fechaCorta(fecha) + " · " + R.horaLegible(hora), detalle: clase + (profe ? " con " + profe : ""), clase: id });
    if (!sinProfe(profe)) {
      tx.despues(() => avisarProfe(ctx, profe, {
        titulo: "Te asignaron la clase extra del " + R.fechaLegible(fecha) + " a las " + R.horaLegible(hora), cuerpo: clase,
        ruta: "/app/profe/clase/" + encodeURIComponent(id),
      }));
    }
    return vistaClaseEquipo(tx.M, tx.M.clasePorId.get(id), tx.ahora);
  });
}

export async function editarClase(ctx, actor, id, cambios) {
  if (cambios.profe !== undefined) cambios = { ...cambios, profe: resolverProfe(ctx, cambios.profe) };
  let cambioProfe = null;
  const out = await transaccion(ctx, actor, async (tx) => {
    const c = tx.M.clasePorId.get(id);
    if (!c) throw noExiste("Esa clase no existe.");
    const ocupados = tx.M.ocupados(id);
    if (cambios.cupos !== undefined && cambios.cupos < ocupados) {
      throw validacion("Ya hay " + ocupados + " personas en esa clase: los cupos no pueden ser menos.", { cupos: "Mínimo " + ocupados + "." });
    }
    const fila = {};
    if (cambios.clase !== undefined) fila["Clase"] = cambios.clase;
    if (cambios.profe !== undefined && sinTilde(cambios.profe) !== sinTilde(c.profe)) {
      fila["Profe"] = cambios.profe;
      cambioProfe = { antes: c.profe, ahora: cambios.profe };
    }
    if (cambios.cupos !== undefined) fila["Cupos"] = cambios.cupos;
    if (cambios.notas !== undefined) fila["Notas"] = cambios.notas;
    if (Object.keys(fila).length) await tx.actualizar("Clases", c._fila, fila);
    tx.auditar("clase.editar", id, fila);
    return tx.M.clasePorId.get(id);
  });
  // a new profe closes the substitute request, tells Ana's feed and pushes to the new profe
  if (cambioProfe) profeCambiado(ctx, actor, out, cambioProfe.antes, cambioProfe.ahora);
  const M = await modelo(ctx);
  return vistaClaseEquipo(M, M.clasePorId.get(id) || out, ctx.ahora());
}

/** The studio cancels a class: every booking in it goes back to «Cancelada» (the class returns to each plan). */
export async function cancelarClase(ctx, actor, id, { motivo = "" } = {}) {
  return transaccion(ctx, actor, async (tx) => {
    const M = tx.M;
    const c = M.clasePorId.get(id);
    if (!c) throw noExiste("Esa clase no existe.");
    if (c.estado === "Cancelada") throw conflicto("cancelada", "Esa clase ya estaba cancelada.");
    const afectadasAntes = M.reservasDeClase(id).filter((r) => R.OCUPAN.includes(r.estado) || r.estado === R.ESTADO.CANCELADA_TARDE);
    const avisar = afectadasAntes.filter((r) => [R.ESTADO.PENDIENTE, R.ESTADO.CONFIRMADA].includes(r.estado)).map((r) => r.id);
    const gente = vistaClaseEquipo(M, c, tx.ahora).gente;
    await tx.actualizar("Clases", c._fila, { "Estado": "Cancelada", "Notas": motivo || c.notas });
    ctx.db.prepare("DELETE FROM reemplazos WHERE clase = ?").run(id); // a cancelled class needs no substitute
    for (const r of afectadasAntes) await tx.actualizar("Reservas", r._fila, { "Estado": R.ESTADO.CANCELADA, "Notas": "Clase cancelada" });
    for (const e of M.esperaDeClase(id).filter((x) => x.estado === "Esperando" || x.estado === "Avisada")) {
      await tx.actualizar("Espera", e._fila, { "Estado": "Ya no", "Notas": "Clase cancelada" });
    }
    tx.auditar("clase.cancelar", id, { motivo, reservas: afectadasAntes.map((r) => r.id) });
    tx.publicar({ tipo: "clase", titulo: "Clase cancelada: " + R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora), detalle: motivo, clase: id });
    const cuando = cuandoTexto(c);
    const afectadas = gente.filter((g) => avisar.includes(g.reserva)).map((g) => {
      const texto = "Hola " + R.primerNombre(g.nombre) + ", tuvimos que cancelar la clase del " + cuando + " en Casa Lotus" +
        (motivo ? " (" + motivo + ")" : "") + ". La clase volvió a tu plan. ¿Te reservo en otro horario?";
      return { ...g, estado: R.ESTADO.CANCELADA, waTexto: texto, waEnlace: g.whatsapp ? R.enlaceWhatsApp(g.whatsapp, texto) : "" };
    });
    return { clase: vistaClaseEquipo(tx.M, tx.M.clasePorId.get(id), tx.ahora), afectadas };
  });
}

/* ── the weekly template ──────────────────────────────── */

const claseDeSlot = (s) => (c) => c.tipo !== "Extra" && c.dia === s.dia && c.hora === s.hora;

function vistaSlot(M, s, ahora) {
  const proximas = M.clases.filter(claseDeSlot(s)).filter((c) => c.estado === "Programada" && !esPasada(c, ahora)).length;
  return { id: s.id, dia: s.dia, hora: s.hora, clase: s.clase, profe: s.profe, cupos: s.cupos, activa: s.activa, proximas };
}

export async function horario(ctx) {
  const M = await modelo(ctx), ahora = ctx.ahora();
  const orden = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  return M.horario.slice().sort((a, b) => orden.indexOf(a.dia) - orden.indexOf(b.dia) || (a.hora < b.hora ? -1 : 1)).map((s) => vistaSlot(M, s, ahora));
}

/** New classes for some slots, from `desde`, up to the horizon, skipping holidays and existing ids. */
async function generarEnTx(tx, slots, desde) {
  const M = tx.M, hoy = R.hoyClave(tx.ahora);
  const semanas = M.ajustes["Semanas de clases hacia adelante"];
  const inicio = desde && desde > hoy ? desde : hoy;
  const fin = R.sumarDias(hoy, semanas * 7);
  const dias = Math.max(Math.ceil((R.fechaUTC(fin) - R.fechaUTC(inicio)) / 86400000 / 7), 0);
  if (!dias) return [];
  const plantilla = slots.filter((s) => s.activa).map((s) => ({ ...s, clase: s.clase || "Por confirmar", profe: s.profe || "Por confirmar" }));
  const nuevas = R.fechasDeClase(plantilla, inicio, dias)
    .filter((c) => c.fecha < fin && !M.clasePorId.has(c.id))
    .filter((c) => c.fecha > hoy || R.momentoMs(c.fecha, c.hora) > tx.ahora);
  await tx.agregarVarios("Clases", nuevas.map((c) => ({
    "ID": c.id, "Fecha": c.fecha, "Día": c.dia, "Hora": c.hora, "Clase": c.clase, "Profe": c.profe, "Cupos": c.cupos || M.ajustes["Cupos por clase"],
    "Estado": "Programada", "Notas": "", "Tipo": "Regular",
  })));
  return nuevas;
}

export async function crearSlot(ctx, actor, { dia, hora, clase, profe: profeTexto, cupos, activa = true, desde }) {
  const profe = resolverProfe(ctx, profeTexto);
  return transaccion(ctx, actor, async (tx) => {
    const id = dia + " " + hora;
    if (tx.M.horario.some((s) => s.id === id)) throw conflicto("estado", "Ya existe la franja del " + dia.toLowerCase() + " a las " + R.horaLegible(hora) + ".");
    await tx.agregar("Horario", { "Día": dia, "Hora": hora, "Clase": clase, "Profe": profe, "Cupos": cupos, "Activa": activa ? "Sí" : "No" });
    const s = tx.M.horario.find((x) => x.id === id);
    const nuevas = activa ? await generarEnTx(tx, [s], desde) : [];
    tx.auditar("horario.crear", id, { clase, profe, cupos, activa, clasesCreadas: nuevas.length });
    if (nuevas.length) tx.publicar({ tipo: "clase", titulo: "Nueva franja: " + dia + " " + R.horaLegible(hora), detalle: nuevas.length + " clases nuevas en el calendario." });
    if (nuevas.length && !sinProfe(profe)) {
      tx.despues(() => avisarProfe(ctx, profe, { titulo: "Te asignaron las clases de los " + dia.toLowerCase() + " a las " + R.horaLegible(hora), cuerpo: clase, ruta: "/app/profe" }));
    }
    return { slot: vistaSlot(tx.M, s, tx.ahora), clasesCreadas: nuevas.length };
  });
}

export async function editarSlot(ctx, actor, id, { clase, profe: profeTexto, cupos, activa, aplicarAFuturas = false }) {
  const profe = profeTexto === undefined ? undefined : resolverProfe(ctx, profeTexto);
  const reasignadas = [];
  const out = await transaccion(ctx, actor, async (tx) => {
    const s = tx.M.horario.find((x) => x.id === id);
    if (!s) throw noExiste("Esa franja no existe.");
    const fila = {};
    if (clase !== undefined) fila["Clase"] = clase;
    if (profe !== undefined) fila["Profe"] = profe;
    if (cupos !== undefined) fila["Cupos"] = cupos;
    if (activa !== undefined) fila["Activa"] = activa ? "Sí" : "No";
    if (Object.keys(fila).length) await tx.actualizar("Horario", s._fila, fila);
    let actualizadas = 0;
    if (aplicarAFuturas) {
      const futuras = tx.M.clases.filter(claseDeSlot(s)).filter((c) => c.estado === "Programada" && !esPasada(c, tx.ahora));
      for (const c of futuras) {
        const cambio = {};
        if (clase !== undefined && clase !== c.clase) cambio["Clase"] = clase;
        if (profe !== undefined && sinTilde(profe) !== sinTilde(c.profe)) { cambio["Profe"] = profe; reasignadas.push({ clase: c, antes: c.profe }); }
        if (cupos !== undefined && cupos !== c.cupos) cambio["Cupos"] = Math.max(cupos, tx.M.ocupados(c.id));
        if (Object.keys(cambio).length) { await tx.actualizar("Clases", c._fila, cambio); actualizadas++; }
      }
    }
    let creadas = 0;
    if (activa === true && !s.activa) creadas = (await generarEnTx(tx, [tx.M.horario.find((x) => x.id === id)])).length;
    tx.auditar("horario.editar", id, { ...fila, aplicarAFuturas, clasesActualizadas: actualizadas, clasesCreadas: creadas });
    return { slot: vistaSlot(tx.M, tx.M.horario.find((x) => x.id === id), tx.ahora), clasesActualizadas: actualizadas + creadas, dia: tx.M.horario.find((x) => x.id === id) };
  });
  if (reasignadas.length) {
    for (const r of reasignadas) ctx.db.prepare("DELETE FROM reemplazos WHERE clase = ?").run(r.clase.id);
    const s = out.dia;
    ctx.novedades.publicar({
      actor, tipo: "clase", titulo: "Profe de los " + s.dia.toLowerCase() + " " + R.horaLegible(s.hora) + ": " + (profe || "sin asignar"),
      detalle: reasignadas.length + (reasignadas.length === 1 ? " clase actualizada." : " clases actualizadas."), ruta: "/app/admin/horario",
    });
    if (!sinProfe(profe)) avisarProfe(ctx, profe, { titulo: "Te asignaron las clases de los " + s.dia.toLowerCase() + " a las " + R.horaLegible(s.hora), cuerpo: s.clase || "Casa Lotus", ruta: "/app/profe" });
  }
  return { slot: out.slot, clasesActualizadas: out.clasesActualizadas };
}

/** Deactivates a slot: its future classes without bookings are cancelled; those with bookings are returned. */
export async function desactivarSlot(ctx, actor, id) {
  return transaccion(ctx, actor, async (tx) => {
    const s = tx.M.horario.find((x) => x.id === id);
    if (!s) throw noExiste("Esa franja no existe.");
    if (s.activa) await tx.actualizar("Horario", s._fila, { "Activa": "No" });
    const futuras = tx.M.clases.filter(claseDeSlot(s)).filter((c) => c.estado === "Programada" && !esPasada(c, tx.ahora));
    const conReservas = [];
    let canceladas = 0;
    for (const c of futuras) {
      if (tx.M.reservasDeClase(c.id).some((r) => R.OCUPAN.includes(r.estado))) { conReservas.push(c); continue; }
      await tx.actualizar("Clases", c._fila, { "Estado": "Cancelada", "Notas": "Franja desactivada" });
      canceladas++;
    }
    tx.auditar("horario.desactivar", id, { canceladas, conReservas: conReservas.map((c) => c.id) });
    return { canceladas, conReservas: conReservas.map((c) => vistaClaseEquipo(tx.M, tx.M.clasePorId.get(c.id), tx.ahora)) };
  });
}

/** Daily job: keep the calendar «Semanas de clases hacia adelante» ahead. Returns how many it created. */
export async function generarCalendario(ctx) {
  return transaccion(ctx, SISTEMA, async (tx) => {
    const nuevas = await generarEnTx(tx, tx.M.horario);
    if (nuevas.length) tx.auditar("calendario.generar", "", { clases: nuevas.length });
    return nuevas.length;
  });
}

export { nombreClase };
