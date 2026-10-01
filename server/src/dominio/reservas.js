// Casa Lotus · bookings: book, confirm with a payment, attendance, cancel (on time / late), free an
// unpaid hold, reschedule (atomic), expire holds, and the waiting list. Every rule comes from
// shared/reglas.js; every write runs in one transaction (single lock, fresh read inside it).
import * as R from "../../../shared/reglas.js";
import { modelo, transaccion, SISTEMA } from "./base.js";
import { registrarPagoEnTx } from "./pagos.js";
import {
  vistaClase, vistaClaseEquipo, vistaCompra, vistaEspera, vistaReservaClienta, cambiosDe, esDePrueba, nombreClase, esPasada,
} from "./vistas.js";
import { conflictoReserva, noExiste, sinPermiso, validacion } from "../errores.js";
import { profeDeClase, exigirPlazoAsistencia } from "./profes.js";
import { avisarProfe } from "./asignacion.js";

const { ESTADO } = R;
const esAdmin = (actor) => actor?.tipo === "admin" || actor?.tipo === "sistema" || actor?.tipo === "ia";
export const cuandoTexto = (c) => R.fechaLegible(c.fecha) + " a las " + R.horaLegible(c.hora);

/** Staff (admin) or the class's profe get the team view; clientas get the public one. */
function vistaClaseParaActor(M, c, ahora, actor) {
  if (actor?.tipo === "admin" || actor?.tipo === "ia" || actor?.tipo === "sistema") return vistaClaseEquipo(M, c, ahora, { actor });
  if (actor?.tipo === "profe") return vistaClaseEquipo(M, c, ahora, { conSalud: profeDeClase(actor, c), actor });
  return vistaClase(M, c, ahora);
}

/** How a booking is shown to this actor (a limited session never sees the real owner's name or plan). */
const opcionesVista = (actor) => (actor?.limitada ? { limitada: true, nombre: actor.nombre } : {});

/** A clienta may touch only her bookings; a limited session (public booking) only the ones it made. */
function exigirDuena(actor, r) {
  if (actor?.tipo !== "clienta") return;
  if (r.clienta !== actor.id) throw noExiste("No encontramos esa reserva.");
  if (actor.limitada && !(actor.reservas || []).includes(r.id)) throw noExiste("No encontramos esa reserva.");
}

/* ── booking ───────────────────────────────────────────── */

/**
 * Books inside a transaction. Confirmed at once when a valid plan covers the class; otherwise it
 * holds the swing for «Horas para pagar una reserva web» (never past the class start).
 * opciones.admin skips the booking cut-off and the two-pending limit; soloPendiente never charges a plan.
 */
export async function reservarEnTx(tx, { clienta, clase, origen, atribucion, notas = "", admin = false, soloPendiente = false }) {
  const M = tx.M;
  const c = M.clasePorId.get(clase);
  if (!c) throw noExiste("Esa clase no existe.");
  if (M.reservasDeClase(clase).some((r) => r.clienta === clienta && R.OCUPAN.includes(r.estado))) throw conflictoReserva("ya-reservada");
  const horasMin = admin ? -1e9 : M.ajustes["Horas mínimas para reservar"];
  const puede = R.reservable(c, M.ocupados(clase), tx.ahora, horasMin);
  if (!puede.ok) throw conflictoReserva(puede.motivo);
  // a public booking never spends a plan on its own: whoever knows a number must not use her classes
  const compra = soloPendiente ? null : R.elegirCompra(M.compras, M.reservas, clienta, c.fecha);
  const id = R.siguienteId("R", M.reservas.map((r) => r.id));
  const fila = {
    "ID": id, "Creada": tx.ahora, "Clase": clase, "Clienta": clienta, "Origen": origen || "Panel", "Notas": notas,
    "Atribución": atribucion && Object.keys(atribucion).length ? JSON.stringify(atribucion) : "",
  };
  if (compra) {
    fila["Estado"] = ESTADO.CONFIRMADA;
    fila["Compra"] = compra.id;
  } else {
    const abiertas = M.reservasDeClienta(clienta).filter((r) => r.estado === ESTADO.PENDIENTE).length;
    if (!admin && abiertas >= 2) throw conflictoReserva("muchas-pendientes");
    fila["Estado"] = ESTADO.PENDIENTE;
    fila["Vence apartado"] = Math.min(tx.ahora + M.ajustes["Horas para pagar una reserva web"] * 3600000, R.inicioClase(c));
  }
  await tx.agregar("Reservas", fila);
  avisarReservaAProfe(tx, c, clienta, fila["Origen"]);
  return tx.M.reservaPorId.get(id);
}

/** The class's profe hears about a new booking in her class (Web Push, when she enabled it). */
export function avisarReservaAProfe(tx, c, clienta, origen = "") {
  if (/^Profe · /.test(origen)) return; // she registered it herself
  const nombre = R.primerNombre(tx.M.clientaPorId.get(clienta)?.nombre || "");
  tx.despues(() => avisarProfe(tx.ctx, c.profe, {
    titulo: "Nueva reserva en tu clase", cuerpo: R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora) + (nombre ? " · " + nombre : ""),
    ruta: "/app/profe/clase/" + encodeURIComponent(c.id),
  }));
}

/** Clienta (or admin on her behalf): a booking in a class. */
export async function reservar(ctx, actor, { clienta, clase, origen }) {
  const quien = actor.tipo === "clienta" ? actor.id : clienta;
  return transaccion(ctx, actor, async (tx) => {
    const p = tx.M.clientaPorId.get(quien);
    if (!p) throw noExiste("No encontramos a esa clienta.");
    const r = await reservarEnTx(tx, { clienta: quien, clase, origen: origen || (actor.tipo === "clienta" ? "App" : "Panel"), admin: esAdmin(actor) });
    const c = tx.M.clasePorId.get(clase);
    tx.auditar("reserva.crear", r.id, { clienta: quien, clase, estado: r.estado });
    tx.publicar({
      tipo: "reserva", titulo: (actor.tipo === "clienta" ? "Reservó " : "Reserva para ") + p.nombre,
      detalle: R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora) + " · " + r.estado, clienta: quien, clase,
    });
    if (actor.tipo === "clienta") return vistaReservaClienta(tx.M, r, tx.ahora);
    return { reserva: vistaReservaClienta(tx.M, r, tx.ahora), clase: vistaClaseEquipo(tx.M, c, tx.ahora) };
  });
}

/* ── confirming a payment ─────────────────────────────── */

export async function confirmar(ctx, actor, idReserva, { pago } = {}) {
  return transaccion(ctx, actor, async (tx) => {
    let M = tx.M;
    const r = M.reservaPorId.get(idReserva);
    if (!r) throw noExiste("No encontramos esa reserva.");
    if (r.estado !== ESTADO.PENDIENTE) throw conflictoReserva("estado", "Esa reserva ya no está pendiente (está «" + r.estado + "»).");
    const c = M.clasePorId.get(r.clase);
    if (!c) throw noExiste("La clase de esa reserva ya no existe.");
    let nueva = null;
    // a plan paid at confirmation starts on the class day, so the whole validity is hers
    if (pago) nueva = await registrarPagoEnTx(tx, { clienta: r.clienta, ...pago, inicio: pago.inicio || c.fecha });
    M = tx.M;
    const compra = R.elegirCompra(M.compras, M.reservas, r.clienta, c.fecha);
    if (!compra) throw validacion("No tiene clases disponibles para esa fecha. Elige el plan que pagó para confirmar.", { "pago.plan": "Elige el plan que pagó." });
    // with classes left in her plan no payment is needed (and, no purchase, no Ads conversion);
    // someone who already came without a plan (a walk-in the profe registered) is confirmed as attended
    const vino = /Vino sin plan/.test(r.notas) && esPasada(c, tx.ahora);
    await tx.actualizar("Reservas", r._fila, { "Estado": vino ? ESTADO.ASISTIO : ESTADO.CONFIRMADA, "Compra": compra.id, "Vence apartado": "" });
    M = tx.M;
    const p = M.clientaPorId.get(r.clienta);
    const hoy = R.hoyClave(tx.ahora);
    tx.auditar("reserva.confirmar", r.id, { compra: compra.id, pago: nueva ? { plan: nueva.plan, valor: nueva.valor, medio: nueva.medio } : null });
    if (nueva) tx.publicar({ tipo: "pago", titulo: "Pago de " + (p?.nombre || r.clienta), detalle: nueva.plan + " · " + R.dinero(nueva.valor), clienta: r.clienta, clase: r.clase });
    if (ctx.whatsapp?.configurado && p?.whatsapp) {
      tx.despues(() => ctx.whatsapp.enviarPlantilla(p.whatsapp, "reserva_confirmada", {
        nombre: R.primerNombre(p.nombre), clase: nombreClase(c) || "tu clase", cuando: cuandoTexto(c), horas: String(M.ajustes["Horas mínimas para cancelar"]),
      }, SISTEMA));
    }
    const out = { reserva: vistaReservaClienta(M, M.reservaPorId.get(r.id), tx.ahora), clase: vistaClaseEquipo(M, c, tx.ahora) };
    if (nueva) out.compra = vistaCompra(M, M.compraPorId.get(nueva.id), hoy);
    return out;
  });
}

/* ── attendance ───────────────────────────────────────── */

export async function asistencia(ctx, actor, idReserva, vino) {
  return transaccion(ctx, actor, async (tx) => {
    const M = tx.M;
    const r = M.reservaPorId.get(idReserva);
    if (!r) throw noExiste("No encontramos esa reserva.");
    const c = M.clasePorId.get(r.clase);
    if (!c) throw noExiste("La clase de esa reserva ya no existe.");
    if (actor.tipo === "profe" && !profeDeClase(actor, c)) throw sinPermiso("Esa clase no es tuya.");
    exigirPlazoAsistencia(actor, c, tx.ahora);
    if (r.estado === ESTADO.PENDIENTE) throw conflictoReserva("estado", "Esa reserva no tiene el pago confirmado. Confírmala primero.");
    if (![ESTADO.CONFIRMADA, ESTADO.ASISTIO, ESTADO.NO_VINO].includes(r.estado)) throw conflictoReserva("estado", "No se puede marcar asistencia en una reserva «" + r.estado + "».");
    const estado = vino ? ESTADO.ASISTIO : ESTADO.NO_VINO;
    if (estado !== r.estado) await tx.actualizar("Reservas", r._fila, { "Estado": estado });
    tx.auditar("reserva.asistencia", r.id, { clase: c.id, antes: r.estado, ahora: estado });
    return { reserva: vistaReservaClienta(tx.M, tx.M.reservaPorId.get(r.id), tx.ahora), clase: vistaClaseParaActor(tx.M, c, tx.ahora, actor) };
  });
}

/* ── a swing frees up ─────────────────────────────────── */

/** Someone left a class: if people are waiting, Ana hears it and the first in line gets a WhatsApp. */
export function avisarCupoLiberado(ctx, tx, idClase) {
  const M = tx.M;
  const c = M.clasePorId.get(idClase);
  if (!c || c.estado === "Cancelada" || esPasada(c, tx.ahora)) return;
  if (M.ocupados(idClase) >= c.cupos) return;
  const lista = M.esperaDeClase(idClase).filter((e) => e.estado === "Esperando").sort((a, b) => (a.creada || 0) - (b.creada || 0));
  if (!lista.length) return;
  const primera = M.clientaPorId.get(lista[0].clienta);
  tx.publicar({
    tipo: "espera", titulo: "Se liberó un cupo · " + R.fechaCorta(c.fecha) + " " + R.horaLegible(c.hora),
    detalle: (lista.length === 1 ? "1 persona espera" : lista.length + " personas esperan") + ". Primera en la lista: " + (primera?.nombre || lista[0].clienta) + ".",
    clienta: lista[0].clienta, clase: idClase, ruta: "/app/admin/agenda/" + encodeURIComponent(idClase),
  });
  if (ctx.whatsapp?.configurado && primera?.whatsapp) {
    const idEspera = lista[0].id;
    tx.despues(async () => {
      await ctx.whatsapp.enviarPlantilla(primera.whatsapp, "cupo_liberado", { nombre: R.primerNombre(primera.nombre), clase: nombreClase(c) || "tu clase", cuando: cuandoTexto(c) }, SISTEMA);
      await transaccion(ctx, SISTEMA, async (t2) => {
        const e = t2.M.espera.find((x) => x.id === idEspera);
        if (e && e.estado === "Esperando") await t2.actualizar("Espera", e._fila, { "Estado": "Avisada", "Notas": (e.notas ? e.notas + " · " : "") + "Avisada por WhatsApp" });
        t2.auditar("espera.avisada", idEspera, { clase: idClase });
      });
    });
  }
}

/* ── cancelling ───────────────────────────────────────── */

export async function cancelar(ctx, actor, idReserva, { sinCosto = false } = {}) {
  return transaccion(ctx, actor, async (tx) => {
    const M = tx.M;
    const r = M.reservaPorId.get(idReserva);
    if (!r) throw noExiste("No encontramos esa reserva.");
    exigirDuena(actor, r);
    const c = M.clasePorId.get(r.clase);
    if (!c) throw noExiste("La clase de esa reserva ya no existe.");
    const pc = R.politicaCancelar(r, c, tx.ahora, M.ajustes["Horas mínimas para cancelar"]);
    if (!pc.ok) throw conflictoReserva(pc.motivo, pc.motivo === "estado" ? "Esta reserva ya no se puede cancelar (está «" + r.estado + "»)." : undefined);
    let estado = pc.estado, devolvio = pc.devuelveClase;
    if (sinCosto && esAdmin(actor) && estado === ESTADO.CANCELADA_TARDE) { estado = ESTADO.CANCELADA; devolvio = true; }
    const nota = estado === ESTADO.CANCELADA_TARDE ? "Cancelada con menos de " + M.ajustes["Horas mínimas para cancelar"] + " h" : "";
    await tx.actualizar("Reservas", r._fila, { "Estado": estado, ...(nota ? { "Notas": (r.notas ? r.notas + " · " : "") + nota } : {}) });
    const p = M.clientaPorId.get(r.clienta);
    tx.auditar("reserva.cancelar", r.id, { antes: r.estado, ahora: estado, devolvioClase: devolvio, sinCosto: Boolean(sinCosto) });
    tx.publicar({
      tipo: "cancelacion", titulo: "Canceló " + (p?.nombre || r.clienta), clienta: r.clienta, clase: c.id,
      detalle: R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora) + (estado === ESTADO.CANCELADA_TARDE ? " · tarde, la clase se descuenta" : ""),
    });
    avisarCupoLiberado(ctx, tx, c.id);
    const mensaje = r.estado === ESTADO.PENDIENTE ? "Listo, cancelamos tu reserva y liberamos el cupo."
      : devolvio ? "Listo, cancelamos tu reserva. La clase volvió a tu plan."
        : "Cancelamos tu reserva. Como faltaban menos de " + M.ajustes["Horas mínimas para cancelar"] + " horas, la clase se descuenta de tu plan.";
    return {
      reserva: vistaReservaClienta(tx.M, tx.M.reservaPorId.get(r.id), tx.ahora, opcionesVista(actor)), clase: vistaClaseParaActor(tx.M, c, tx.ahora, actor),
      devolvioClase: Boolean(devolvio || r.estado === ESTADO.PENDIENTE), mensaje,
    };
  });
}

/** Admin: an unpaid hold is released by hand. */
export async function liberar(ctx, actor, idReserva) {
  return transaccion(ctx, actor, async (tx) => {
    const r = tx.M.reservaPorId.get(idReserva);
    if (!r) throw noExiste("No encontramos esa reserva.");
    if (r.estado !== ESTADO.PENDIENTE) throw conflictoReserva("estado", "Solo se libera una reserva pendiente de pago.");
    await tx.actualizar("Reservas", r._fila, { "Estado": ESTADO.VENCIDA, "Notas": (r.notas ? r.notas + " · " : "") + "Liberada sin pago" });
    tx.auditar("reserva.liberar", r.id, {});
    avisarCupoLiberado(ctx, tx, r.clase);
    const c = tx.M.clasePorId.get(r.clase);
    return { reserva: vistaReservaClienta(tx.M, tx.M.reservaPorId.get(r.id), tx.ahora), clase: c ? vistaClaseEquipo(tx.M, c, tx.ahora) : null };
  });
}

/* ── rescheduling (atomic: the new booking and the old cancellation in one lock) ── */

export async function reagendar(ctx, actor, idReserva, nuevaClase) {
  return transaccion(ctx, actor, async (tx) => {
    let M = tx.M;
    const r = M.reservaPorId.get(idReserva);
    if (!r) throw noExiste("No encontramos esa reserva.");
    exigirDuena(actor, r);
    const c0 = M.clasePorId.get(r.clase);
    const c1 = M.clasePorId.get(nuevaClase);
    if (!c0) throw noExiste("La clase de esa reserva ya no existe.");
    if (!c1) throw noExiste("Esa clase no existe.");
    if (c1.id === c0.id) throw validacion("Elige una clase distinta.", { clase: "Elige una clase distinta." });
    const admin = esAdmin(actor);
    const horas = M.ajustes["Horas mínimas para cancelar"];
    if (admin) {
      if (!R.ACTIVAS.includes(r.estado)) throw conflictoReserva("estado");
    } else {
      const max = esDePrueba(M, r) ? M.ajustes["Cambios permitidos clase de prueba"] : Infinity;
      const pr = R.politicaReagendar(r, c0, tx.ahora, horas, cambiosDe(M, r), max);
      if (!pr.ok) throw conflictoReserva(pr.motivo, pr.motivo === "cambios" ? "Tu clase de prueba ya usó el cambio permitido." : undefined);
    }
    if (M.reservasDeClase(c1.id).some((x) => x.clienta === r.clienta && R.OCUPAN.includes(x.estado))) throw conflictoReserva("ya-reservada");
    const puede = R.reservable(c1, M.ocupados(c1.id), tx.ahora, admin ? -1e9 : M.ajustes["Horas mínimas para reservar"]);
    if (!puede.ok) throw conflictoReserva(puede.motivo);

    // the plan: the same one if it still covers the new date (its class comes back with the old booking)
    const sinLaVieja = M.reservas.filter((x) => x.id !== r.id);
    let compra = null;
    if (r.compra) {
      const actual = M.compraPorId.get(r.compra);
      if (actual && actual.inicio <= c1.fecha && c1.fecha <= actual.vence) compra = actual;
      else compra = R.elegirCompra(M.compras, sinLaVieja, r.clienta, c1.fecha);
      if (!compra) throw conflictoReserva("estado", "Tu plan vence antes de esa clase. Elige una fecha antes del vencimiento.");
    }
    const id = R.siguienteId("R", M.reservas.map((x) => x.id));
    const fila = {
      "ID": id, "Creada": tx.ahora, "Clase": c1.id, "Clienta": r.clienta, "Estado": compra ? ESTADO.CONFIRMADA : ESTADO.PENDIENTE,
      "Compra": compra ? compra.id : "", "Origen": r.origen, "Reagendada de": r.id,
      "Atribución": r.atribucion && Object.keys(r.atribucion).length ? JSON.stringify(r.atribucion) : "",
    };
    if (!compra) fila["Vence apartado"] = Math.min(r.vence || tx.ahora + M.ajustes["Horas para pagar una reserva web"] * 3600000, R.inicioClase(c1));
    await tx.agregar("Reservas", fila);
    avisarReservaAProfe(tx, c1, r.clienta, r.origen);
    try {
      await tx.actualizar("Reservas", r._fila, { "Estado": ESTADO.CANCELADA, "Notas": (r.notas ? r.notas + " · " : "") + "Reagendada a " + id });
    } catch (e) {
      // compensate: never leave two live bookings for one class bought
      const nueva = tx.M.reservaPorId.get(id);
      if (nueva) await tx.actualizar("Reservas", nueva._fila, { "Estado": ESTADO.CANCELADA, "Notas": "Reagenda fallida" }).catch(() => {});
      throw e;
    }
    M = tx.M;
    const p = M.clientaPorId.get(r.clienta);
    tx.auditar("reserva.reagendar", r.id, { nueva: id, de: c0.id, a: c1.id });
    tx.publicar({
      tipo: "reagenda", titulo: "Cambió de clase: " + (p?.nombre || r.clienta), clienta: r.clienta, clase: c1.id,
      detalle: R.fechaCorta(c0.fecha) + " " + R.horaLegible(c0.hora) + " → " + R.fechaCorta(c1.fecha) + " " + R.horaLegible(c1.hora),
    });
    avisarCupoLiberado(ctx, tx, c0.id);
    return {
      anterior: vistaReservaClienta(M, M.reservaPorId.get(r.id), tx.ahora, opcionesVista(actor)),
      nueva: vistaReservaClienta(M, M.reservaPorId.get(id), tx.ahora, opcionesVista(actor)),
      mensaje: "Listo, quedaste en la clase del " + cuandoTexto(c1) + ".",
    };
  });
}

/* ── maintenance ─────────────────────────────────────── */

/** Unpaid holds whose time ran out become «Vencida» (the swing goes back). Returns how many. */
export async function expirarApartados(ctx) {
  const M0 = await modelo(ctx, { fresco: true });
  const ahora = ctx.ahora();
  if (!M0.reservas.some((r) => r.estado === ESTADO.PENDIENTE && r.vence && r.vence <= ahora)) return 0;
  return transaccion(ctx, SISTEMA, async (tx) => {
    const vencidas = tx.M.reservas.filter((r) => r.estado === ESTADO.PENDIENTE && r.vence && r.vence <= tx.ahora);
    for (const r of vencidas) {
      await tx.actualizar("Reservas", r._fila, { "Estado": ESTADO.VENCIDA, "Notas": (r.notas ? r.notas + " · " : "") + "Sin pago a tiempo" });
      tx.auditar("reserva.vencer", r.id, { clase: r.clase });
    }
    for (const clase of new Set(vencidas.map((r) => r.clase))) avisarCupoLiberado(ctx, tx, clase);
    return vencidas.length;
  });
}

/* ── waiting list ─────────────────────────────────────── */

export async function unirseEsperaEnTx(tx, { clienta, clase, admin = false, rechazarRepetida = false }) {
  const M = tx.M;
  const c = M.clasePorId.get(clase);
  if (!c) throw noExiste("Esa clase no existe.");
  if (c.estado === "Cancelada") throw conflictoReserva("cancelada");
  if (esPasada(c, tx.ahora)) throw conflictoReserva("empezo");
  if (M.reservasDeClase(clase).some((r) => r.clienta === clienta && R.OCUPAN.includes(r.estado))) throw conflictoReserva("ya-reservada");
  const ya = M.esperaDeClase(clase).find((e) => e.clienta === clienta && (e.estado === "Esperando" || e.estado === "Avisada"));
  if (ya && rechazarRepetida) throw conflictoReserva("ya-reservada", "Ya está en la lista de espera de esa clase.");
  if (ya) return { item: ya, nueva: false };
  if (!admin && M.ocupados(clase) < c.cupos) throw conflictoReserva("estado", "Esa clase todavía tiene cupos: resérvala.");
  const id = R.siguienteId("E", M.espera.map((e) => e.id));
  await tx.agregar("Espera", { "ID": id, "Creada": tx.ahora, "Clase": clase, "Clienta": clienta, "Estado": "Esperando" });
  return { item: tx.M.espera.find((e) => e.id === id), nueva: true };
}

export async function unirseEspera(ctx, actor, { clienta, clase }) {
  const quien = actor.tipo === "clienta" ? actor.id : clienta;
  return transaccion(ctx, actor, async (tx) => {
    const p = tx.M.clientaPorId.get(quien);
    if (!p) throw noExiste("No encontramos a esa clienta.");
    const { item, nueva } = await unirseEsperaEnTx(tx, { clienta: quien, clase, admin: esAdmin(actor), rechazarRepetida: esAdmin(actor) });
    if (nueva) {
      const c = tx.M.clasePorId.get(clase);
      tx.auditar("espera.unirse", item.id, { clienta: quien, clase });
      tx.publicar({ tipo: "espera", titulo: "Lista de espera: " + p.nombre, detalle: R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora), clienta: quien, clase });
    }
    return vistaEspera(tx.M, item);
  });
}

export async function salirEspera(ctx, actor, idEspera) {
  return transaccion(ctx, actor, async (tx) => {
    const e = tx.M.espera.find((x) => x.id === idEspera);
    if (!e || (actor.tipo === "clienta" && e.clienta !== actor.id)) throw noExiste("No encontramos ese registro de la lista de espera.");
    if (e.estado !== "Ya no") await tx.actualizar("Espera", e._fila, { "Estado": "Ya no" });
    tx.auditar("espera.salir", e.id, {});
    return vistaEspera(tx.M, tx.M.espera.find((x) => x.id === idEspera));
  });
}

export async function estadoEspera(ctx, actor, idEspera, estado) {
  return transaccion(ctx, actor, async (tx) => {
    const e = tx.M.espera.find((x) => x.id === idEspera);
    if (!e) throw noExiste("No encontramos ese registro de la lista de espera.");
    await tx.actualizar("Espera", e._fila, { "Estado": estado });
    tx.auditar("espera.estado", e.id, { antes: e.estado, ahora: estado });
    return vistaEspera(tx.M, tx.M.espera.find((x) => x.id === idEspera));
  });
}

/** Admin: the person waiting takes the free swing. */
export async function tomarCupo(ctx, actor, idEspera) {
  return transaccion(ctx, actor, async (tx) => {
    const e = tx.M.espera.find((x) => x.id === idEspera);
    if (!e) throw noExiste("No encontramos ese registro de la lista de espera.");
    if (!["Esperando", "Avisada"].includes(e.estado)) throw conflictoReserva("estado", "Ese registro ya no está esperando.");
    const r = await reservarEnTx(tx, { clienta: e.clienta, clase: e.clase, origen: "Lista de espera", admin: true });
    await tx.actualizar("Espera", e._fila, { "Estado": "Tomó el cupo" });
    tx.auditar("espera.tomar", e.id, { reserva: r.id });
    const c = tx.M.clasePorId.get(e.clase);
    return { reserva: vistaReservaClienta(tx.M, r, tx.ahora), clase: vistaClaseEquipo(tx.M, c, tx.ahora) };
  });
}

export async function listarEspera(ctx) {
  const M = await modelo(ctx), ahora = ctx.ahora(), hoy = R.hoyClave(ahora);
  return M.espera.filter((e) => (e.estado === "Esperando" || e.estado === "Avisada") && String(e.clase).slice(0, 10) >= hoy)
    .sort((a, b) => (a.clase < b.clase ? -1 : a.clase > b.clase ? 1 : (a.creada || 0) - (b.creada || 0)))
    .map((e) => ({ ...vistaEspera(M, e), clase: M.clasePorId.get(e.clase) ? vistaClase(M, M.clasePorId.get(e.clase), ahora) : null }));
}
