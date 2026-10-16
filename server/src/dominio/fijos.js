// Casa Lotus · cupos fijos: a regular holds the same weekly slot, so the system books her class every week
// instead of Ana doing it by hand (the real occupancy is ~82% and most of it is regulars).
//  - A fijo lives in the Sheet's «Cupos fijos» tab (created by the server the first time, if missing).
//  - aplicarFijos books every Activo fijo «Días de reserva de cupos fijos» ahead: on her plan when one
//    covers the date («Confirmada»), else «Pendiente de pago» WITHOUT «Vence apartado» (it never expires).
//  - A booking a fijo made is never made again, whatever happened to it: what she cancelled stays cancelled
//    (only the dates its own pause freed come back when it resumes).
//  - A payment confirms her fijo holds against the new plan (pagos.js).
// Every write runs in one transaction (single lock, fresh read inside it) and is audited.
import * as R from "../../../shared/reglas.js";
import { modelo, transaccion, SISTEMA } from "./base.js";
import { vistaClase, vistaFijo, vistaReservaClienta, origenFijo, fijoDeReserva, slotTexto, esPasada, NOTA_FIJO_SIN_PLAN } from "./vistas.js";
import { avisarCupoLiberado } from "./reservas.js";
import { avisarReservaPorCorreo, avisarCancelacionPorCorreo } from "./avisos.js";
import { conflicto, noExiste, validacion } from "../errores.js";
import { DIAS_HORARIO } from "../datos/esquema.js";

const { ESTADO } = R;
export const PESTANA_FIJOS = "Cupos fijos";
export { NOTA_FIJO_SIN_PLAN };
const AJUSTE_DIAS = "Días de reserva de cupos fijos";
const ORDEN_ESTADO = { Activo: 0, Pausado: 1, Terminado: 2 };

/** How many days ahead a fijo's classes are booked (Ajustes, default 14, at most 60). */
export function diasDeReserva(M) {
  const n = Number(M.ajustes[AJUSTE_DIAS]);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 60) : 14;
}

/** Active first, then by weekday and hour, then by name. */
export function ordenarFijos(M) {
  const nombre = (f) => M.clientaPorId.get(f.clienta)?.nombre || "";
  return (a, b) => (ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]) || (DIAS_HORARIO.indexOf(a.dia) - DIAS_HORARIO.indexOf(b.dia)) ||
    (a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : 0) || nombre(a).localeCompare(nombre(b), "es") || (a.id < b.id ? -1 : 1);
}

/**
 * The classes of a fijo's weekly slot inside its window: starting in (now, today + «Días de reserva…»],
 * between Desde and Hasta, not cancelled. Holidays have no class, so they never show up.
 */
export function clasesDeFijo(M, f, ahora) {
  const limite = R.sumarDias(R.hoyClave(ahora), diasDeReserva(M));
  return M.clases.filter((c) => c.tipo !== "Extra" && c.dia === f.dia && c.hora === f.hora && c.estado === "Programada" &&
    c.fecha <= limite && R.inicioClase(c) > ahora && (!f.desde || c.fecha >= f.desde) && (!f.hasta || c.fecha <= f.hasta));
}

/** The fijo's own bookings, any state. */
const reservasDeFijo = (M, f) => M.reservasDeClienta(f.clienta).filter((r) => fijoDeReserva(r) === f.id);

/** Notas the fijo itself leaves when its pause, end or end date frees a booking (editarFijo). */
const NOTAS_DEL_FIJO = /(^| · )Cupo fijo (pausado|terminado|con fecha de fin)$/;
/**
 * Did this fijo already make its booking in that class? Any state counts (what she or Ana cancelled is never
 * made again), except a booking the fijo's own pause or end date freed: resuming books those dates again.
 */
const yaHecha = (r, f) => fijoDeReserva(r) === f.id && !(r.estado === ESTADO.CANCELADA && NOTAS_DEL_FIJO.test(r.notas || ""));

/** Creates «Cupos fijos» when the Sheet lacks it (typed headers only). Inside a transaction. */
async function asegurarPestana(tx) {
  if (tx.M.tienePestana(PESTANA_FIJOS)) return false;
  const creada = await tx.ctx.datos.crearPestana(PESTANA_FIJOS);
  await tx.ctx.datos.leer({ fresco: true });
  if (creada) tx.auditar("hoja.pestana", PESTANA_FIJOS, { creada: true });
  return creada;
}

/**
 * Books what the Activo fijos (all, or `ids`) still lack. Pairs are taken in class order, so a regular with two
 * slots spends her plan in date order, and two fijos fighting for the last swing: the older fijo wins.
 * Returns { creadas: [{ id, fijo, clienta, clase, sinPlan }], conflictos: [{ fijo, clienta, clase }] }.
 */
async function aplicarEnTx(tx, { ids } = {}) {
  const M = tx.M;
  const activos = M.fijos.filter((f) => f.estado === "Activo" && (!ids || ids.includes(f.id)));
  const pares = [];
  for (const f of activos) for (const c of clasesDeFijo(M, f, tx.ahora)) pares.push({ f, c });
  if (!pares.length) return { creadas: [], conflictos: [] };
  pares.sort((a, b) => (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : a.f.id < b.f.id ? -1 : 1));

  const reservas = M.reservas.slice(); // grows with what this run books, so plans and swings stay right
  const porClase = new Map();
  const deClase = (id) => {
    if (!porClase.has(id)) porClase.set(id, M.reservasDeClase(id).slice());
    return porClase.get(id);
  };
  const idsReserva = M.reservas.map((r) => r.id);
  const filas = [], creadas = [], conflictos = [];
  for (const { f, c } of pares) {
    const enClase = deClase(c.id);
    if (enClase.some((r) => yaHecha(r, f))) continue; // made before: never again
    if (enClase.some((r) => r.clienta === f.clienta && R.OCUPAN.includes(r.estado))) continue; // she is already in
    if (enClase.filter((r) => R.OCUPAN.includes(r.estado)).length >= Number(c.cupos)) {
      conflictos.push({ fijo: f.id, clienta: f.clienta, clase: c.id });
      continue;
    }
    const compra = R.elegirCompra(M.compras, reservas, f.clienta, c.fecha);
    const id = R.siguienteId("R", idsReserva);
    idsReserva.push(id);
    const estado = compra ? ESTADO.CONFIRMADA : ESTADO.PENDIENTE;
    const nueva = { id, clase: c.id, clienta: f.clienta, estado, compra: compra?.id || "", origen: origenFijo(f.id) };
    reservas.push(nueva);
    enClase.push(nueva);
    // no «Vence apartado»: the hold of a regular never expires (expirarApartados skips it)
    filas.push({
      "ID": id, "Creada": tx.ahora, "Clase": c.id, "Clienta": f.clienta, "Estado": estado, "Compra": compra?.id || "",
      "Origen": origenFijo(f.id), "Notas": compra ? "" : NOTA_FIJO_SIN_PLAN,
    });
    creadas.push({ id, fijo: f.id, clienta: f.clienta, clase: c.id, sinPlan: !compra });
  }
  if (filas.length) await tx.agregarVarios("Reservas", filas);
  return { creadas, conflictos };
}

const vistaConflicto = (M, x, ahora) => ({ clase: vistaClase(M, M.clasePorId.get(x.clase), ahora), motivo: "llena" });

/**
 * Books every Activo fijo's window. Runs in the daily job (after the calendar), and after Horario or a class
 * gains classes or swings. Returns { creadas, conflictos } (counts).
 */
export async function aplicarFijos(ctx, actor = SISTEMA) {
  const M0 = await modelo(ctx);
  if (!M0.fijos.some((f) => f.estado === "Activo")) return { creadas: 0, conflictos: 0 };
  return transaccion(ctx, actor, async (tx) => {
    const { creadas, conflictos } = await aplicarEnTx(tx);
    if (creadas.length || conflictos.length) {
      tx.auditar("fijos.aplicar", "", { reservas: creadas.map((x) => x.id), sinColumpio: conflictos.map((x) => x.fijo + " " + x.clase) });
    }
    return { creadas: creadas.length, conflictos: conflictos.length };
  });
}

/** After a change that may have opened classes or swings: never fails the change that triggered it. */
export async function aplicarFijosSinFallar(ctx, actor) {
  try {
    return await aplicarFijos(ctx, actor);
  } catch (e) {
    ctx.log.error("no se pudieron aplicar los cupos fijos", { error: e });
    return { creadas: 0, conflictos: 0 };
  }
}

/* ── reading ─────────────────────────────────────────── */

export async function listarFijos(ctx, { clienta, slot } = {}) {
  const M = await modelo(ctx), ahora = ctx.ahora();
  return M.fijos.filter((f) => (!clienta || f.clienta === clienta) && (!slot || f.dia + " " + f.hora === slot))
    .sort(ordenarFijos(M)).map((f) => vistaFijo(M, f, ahora));
}

/* ── writing ─────────────────────────────────────────── */

function exigirFranja(M, dia, hora, campo = "hora") {
  const s = M.horario.find((x) => x.dia === dia && x.hora === hora);
  if (!s || !s.activa) {
    throw validacion("No hay una clase activa los " + slotTexto(dia, hora) + " en el Horario.", { [campo]: "Elige una franja activa del Horario." });
  }
  return s;
}

const yaTiene = (p, f) => conflicto("ya-reservada", f.estado === "Pausado"
  ? (p?.nombre || f.clienta) + " ya tiene ese cupo fijo en pausa (" + f.id + "): reactívalo."
  : (p?.nombre || f.clienta) + " ya tiene cupo fijo los " + slotTexto(f.dia, f.hora) + " (" + f.id + ").");

/** Admin: a regular gets her weekly slot. Books her window right away. */
export async function crearFijo(ctx, actor, { clienta, dia, hora, desde, hasta = "", notas = "" }) {
  return transaccion(ctx, actor, async (tx) => {
    let M = tx.M;
    const p = M.clientaPorId.get(clienta);
    if (!p) throw noExiste("No encontramos a esa clienta.");
    exigirFranja(M, dia, hora);
    const inicio = desde || R.hoyClave(tx.ahora);
    if (hasta && hasta < inicio) throw validacion("La fecha de fin es antes del inicio.", { hasta: "Elige una fecha desde el " + R.fechaLegible(inicio) + "." });
    const ya = M.fijos.find((f) => f.clienta === clienta && f.dia === dia && f.hora === hora && f.estado !== "Terminado");
    if (ya) throw yaTiene(p, ya);

    await asegurarPestana(tx);
    M = tx.M;
    const id = R.siguienteId("F", M.fijos.map((f) => f.id));
    await tx.agregar(PESTANA_FIJOS, {
      "ID": id, "Clienta": clienta, "Día": dia, "Hora": hora, "Desde": inicio, "Hasta": hasta || "", "Estado": "Activo", "Notas": notas,
    });
    const { creadas, conflictos } = await aplicarEnTx(tx, { ids: [id] });
    M = tx.M;
    tx.auditar("fijo.crear", id, { clienta, slot: dia + " " + hora, desde: inicio, hasta: hasta || "", reservas: creadas.map((x) => x.id), sinColumpio: conflictos.map((x) => x.clase) });
    // one confirmation e-mail for the first class of a new fijo, never one a week
    if (creadas.length) avisarReservaPorCorreo(tx, creadas[0].id, { fijo: slotTexto(dia, hora) });
    const sinPlan = creadas.filter((x) => x.sinPlan).length;
    tx.publicar({
      tipo: "reserva", titulo: "Cupo fijo para " + p.nombre, clienta, ruta: "/app/admin/clientas/" + clienta,
      detalle: slotTexto(dia, hora) + " · " + (creadas.length === 1 ? "1 clase reservada" : creadas.length + " clases reservadas") +
        (sinPlan ? " (" + sinPlan + " sin plan)" : "") + (conflictos.length ? " · " + conflictos.length + " sin columpio" : ""),
    });
    return {
      fijo: vistaFijo(M, M.fijoPorId.get(id), tx.ahora),
      reservasCreadas: creadas.map((x) => vistaReservaClienta(M, M.reservaPorId.get(x.id), tx.ahora)),
      conflictos: conflictos.map((x) => vistaConflicto(M, x, tx.ahora)),
    };
  });
}

/**
 * Admin: pause, resume, end, change the end date or the notes.
 *  - Pausado / Terminado stop the bookings. Terminado is final (a new fijo is created instead).
 *  - hasta: the last date of the fijo ("" or null clears it). Resuming clears a Hasta that already passed.
 *  - cancelarFuturas: this fijo's future Pendiente/Confirmada bookings after Hasta (all of them without one)
 *    become «Cancelada» sin costo (the class goes back to her plan), even inside the cancellation window.
 *  - Whenever it ends Activo, the window is booked right away.
 * Returns { fijo, reservasCanceladas, reservasCreadas, conflictos }.
 */
export async function editarFijo(ctx, actor, id, { estado, hasta, notas, cancelarFuturas = false } = {}) {
  return transaccion(ctx, actor, async (tx) => {
    let M = tx.M;
    const f = M.fijoPorId.get(id);
    if (!f) throw noExiste("No encontramos ese cupo fijo.");
    const p = M.clientaPorId.get(f.clienta);
    const hoy = R.hoyClave(tx.ahora);
    const fila = {};
    const nuevoEstado = estado ?? f.estado;
    if (estado !== undefined && estado !== f.estado) {
      if (f.estado === "Terminado") throw conflicto("estado", "Ese cupo fijo ya terminó. Crea uno nuevo para volver a apartarle la clase.");
      if (estado === "Activo") {
        const otro = M.fijos.find((x) => x.id !== f.id && x.clienta === f.clienta && x.dia === f.dia && x.hora === f.hora && x.estado === "Activo");
        if (otro) throw yaTiene(p, otro);
        exigirFranja(M, f.dia, f.hora, "estado");
      }
      fila["Estado"] = estado;
    }
    let nuevoHasta = f.hasta;
    if (hasta !== undefined) {
      nuevoHasta = hasta || "";
      if (nuevoHasta && f.desde && nuevoHasta < f.desde) {
        throw validacion("La fecha de fin es antes del inicio.", { hasta: "Elige una fecha desde el " + R.fechaLegible(f.desde) + "." });
      }
      if (nuevoHasta !== f.hasta) fila["Hasta"] = nuevoHasta;
    } else if (estado === "Activo" && f.estado !== "Activo" && f.hasta && f.hasta < hoy) {
      nuevoHasta = ""; // resuming with an end date already gone would book nothing
      fila["Hasta"] = "";
    }
    if (notas !== undefined && notas !== f.notas) fila["Notas"] = notas;
    if (Object.keys(fila).length) await tx.actualizar(PESTANA_FIJOS, f._fila, fila);

    const canceladas = [];
    if (cancelarFuturas) {
      M = tx.M;
      const nota = nuevoEstado === "Terminado" ? "Cupo fijo terminado" : nuevoEstado === "Pausado" ? "Cupo fijo pausado" : "Cupo fijo con fecha de fin";
      const futuras = reservasDeFijo(M, f).filter((r) => R.ACTIVAS.includes(r.estado)).map((r) => ({ r, c: M.clasePorId.get(r.clase) }))
        .filter(({ c }) => c && !esPasada(c, tx.ahora) && (!nuevoHasta || c.fecha > nuevoHasta));
      for (const { r, c } of futuras) {
        await tx.actualizar("Reservas", r._fila, { "Estado": ESTADO.CANCELADA, "Notas": (r.notas ? r.notas + " · " : "") + nota });
        tx.auditar("reserva.cancelar", r.id, { antes: r.estado, ahora: ESTADO.CANCELADA, devolvioClase: r.estado === ESTADO.CONFIRMADA, sinCosto: true, fijo: f.id });
        avisarCancelacionPorCorreo(tx, r, c, { resultado: r.estado === ESTADO.PENDIENTE ? "liberada" : "devuelta" });
        canceladas.push(r.id);
      }
      for (const clase of new Set(futuras.map((x) => x.c.id))) avisarCupoLiberado(ctx, tx, clase);
    }

    let creadas = [], conflictos = [];
    if (nuevoEstado === "Activo") ({ creadas, conflictos } = await aplicarEnTx(tx, { ids: [f.id] }));
    M = tx.M;
    tx.auditar("fijo.editar", f.id, {
      ...fila, cancelarFuturas: Boolean(cancelarFuturas), canceladas, reservas: creadas.map((x) => x.id), sinColumpio: conflictos.map((x) => x.clase),
    });
    if (fila["Estado"] || canceladas.length) {
      const que = { Activo: "reactivado", Pausado: "en pausa", Terminado: "terminado" }[nuevoEstado];
      tx.publicar({
        tipo: "reserva", titulo: "Cupo fijo " + que + ": " + (p?.nombre || f.clienta), clienta: f.clienta, ruta: "/app/admin/clientas/" + f.clienta,
        detalle: slotTexto(f.dia, f.hora) + (canceladas.length ? " · " + (canceladas.length === 1 ? "1 clase cancelada" : canceladas.length + " clases canceladas") : "") +
          (creadas.length ? " · " + (creadas.length === 1 ? "1 clase reservada" : creadas.length + " clases reservadas") : ""),
      });
    }
    return {
      fijo: vistaFijo(M, M.fijoPorId.get(f.id), tx.ahora),
      reservasCanceladas: canceladas.map((x) => vistaReservaClienta(M, M.reservaPorId.get(x), tx.ahora)),
      reservasCreadas: creadas.map((x) => vistaReservaClienta(M, M.reservaPorId.get(x.id), tx.ahora)),
      conflictos: conflictos.map((x) => vistaConflicto(M, x, tx.ahora)),
    };
  });
}

/** Admin: the fijo ends and its future bookings are cancelled sin costo. */
export async function terminarFijo(ctx, actor, id) {
  const out = await editarFijo(ctx, actor, id, { estado: "Terminado", cancelarFuturas: true });
  return { fijo: out.fijo, reservasCanceladas: out.reservasCanceladas };
}

/* ── alerts for «Hoy» ────────────────────────────────── */

/**
 * fijo-sin-plan (one per fijo: its nearest unpaid class; prioridad 1 within 48 h) and fijo-sin-columpio (one per
 * fijo and full class in the window that it could not book).
 */
export function alertasFijos(M, ahora) {
  const out = [];
  for (const f of M.fijos) {
    const p = M.clientaPorId.get(f.clienta);
    const clienta = { id: f.clienta, nombre: p?.nombre || "" };
    const nombre = p?.nombre || f.clienta;
    const pendientes = reservasDeFijo(M, f).filter((r) => r.estado === ESTADO.PENDIENTE).map((r) => M.clasePorId.get(r.clase))
      .filter((c) => c && c.estado === "Programada" && !esPasada(c, ahora)).sort((a, b) => (a.id < b.id ? -1 : 1));
    if (pendientes.length) {
      const c = pendientes[0];
      const horas = (R.inicioClase(c) - ahora) / 3600000;
      const texto = "Hola " + R.primerNombre(p?.nombre) + ", tu clase fija del " + R.diaDeSemana(c.fecha).toLowerCase() + " " + R.horaLegible(c.hora) +
        " sigue apartada para ti. Para confirmarla, ¿renovamos tu plan?";
      out.push({
        id: "fijo-sin-plan:" + f.id, tipo: "fijo-sin-plan", prioridad: horas <= 48 ? 1 : 2, titulo: nombre + ": su clase fija no tiene plan",
        detalle: (pendientes.length === 1 ? "La clase del " + R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora) + " está apartada sin pago."
          : pendientes.length + " clases apartadas sin pago, la primera el " + R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora) + ".") + " Renueva su plan para confirmarla.",
        clienta, clase: vistaClase(M, c, ahora),
        accion: p?.whatsapp ? { tipo: "whatsapp", texto, enlace: R.enlaceWhatsApp(p.whatsapp, texto) } : { tipo: "abrir", ruta: "/app/admin/clientas/" + f.clienta },
      });
    }
    if (f.estado !== "Activo") continue;
    for (const c of clasesDeFijo(M, f, ahora)) {
      const enClase = M.reservasDeClase(c.id);
      if (enClase.some((r) => yaHecha(r, f) || (r.clienta === f.clienta && R.OCUPAN.includes(r.estado)))) continue;
      if (M.ocupados(c.id) < Number(c.cupos)) continue;
      out.push({
        id: "fijo-sin-columpio:" + f.id + ":" + c.id, tipo: "fijo-sin-columpio", prioridad: 1, titulo: "Sin columpio para " + nombre + " (cupo fijo)",
        detalle: R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora) + ": la clase está llena y su cupo fijo no se pudo apartar. Libera un columpio o súbele los cupos.",
        clienta, clase: vistaClase(M, c, ahora), accion: { tipo: "abrir", ruta: "/app/admin/agenda/" + encodeURIComponent(c.id) },
      });
    }
  }
  return out;
}
