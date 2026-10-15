// Casa Lotus · the student's own e-mails about her classes: the confirmation after any booking (web, app,
// Ana's panel, a reschedule, a confirmed payment) and «Cancelamos tu clase». They are built inside the
// transaction (fresh data) and sent after the lock: a slow or failed e-mail never costs a booking.
import * as R from "../../../shared/reglas.js";
import { vistaPago, vistaSaldo, nombreClase, CLASE_GENERICA, duracionDe, finClase, planDePrueba, esPasada } from "./vistas.js";
import { sinProfe } from "./asignacion.js";
import { correoClaseClienta, correoCancelacionClienta } from "../notificaciones/plantillas.js";
import { ics, intervalo, enlaceGoogleCalendar } from "../notificaciones/calendario.js";

export const esCorreo = (t) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(t ?? "").trim());
const REMITENTE = "Casa Lotus";
const esLimitada = (actor) => actor?.tipo === "clienta" && Boolean(actor.limitada);

/**
 * Where e-mails about a clienta's booking go. A limited session (a public booking with a number that was
 * already known) only ever reaches the address typed on that device, never the owner's; anyone else, the
 * clienta's own e-mail. "" when there is none.
 */
export function destinoDe(M, idClienta, actor) {
  if (esLimitada(actor)) return esCorreo(actor.correo) ? String(actor.correo).trim() : "";
  const c = M.clientaPorId.get(idClienta);
  return esCorreo(c?.correo) ? c.correo.trim() : "";
}

/** The class as the e-mails show it: «Clase aérea» when it has no type yet, the profe only when assigned. */
function claseParaCorreo(M, c) {
  const minutos = duracionDe(M);
  return {
    nombre: nombreClase(c) || CLASE_GENERICA, fechaTexto: R.fechaLegible(c.fecha), horaTexto: R.horaLegible(c.hora),
    finTexto: R.horaLegible(finClase(c.hora, minutos)), profe: sinProfe(c.profe) ? "" : c.profe, minutos,
  };
}

/** First booking of a reschedule chain: its id is the calendar event's UID, so a moved class updates the same event. */
function raizDe(M, r) {
  let x = r, n = 0;
  const vistos = new Set();
  while (x?.reagendadaDe && !vistos.has(x.id) && n < 50) {
    vistos.add(x.id);
    const antes = M.reservaPorId.get(x.reagendadaDe);
    if (!antes) break;
    x = antes;
    n++;
  }
  return { id: x.id, cambios: n };
}

const venceTexto = (ms) => (ms ? R.fechaLegible(R.hoyClave(ms)) + " a las " + R.horaLegible(R.ahoraHora(ms)) : "");

/**
 * Queues the confirmation e-mail of a booking. Returns true when one was queued.
 * o: { para?: address (default: destinoDe), nombre?: how to greet, actor?: who acted (default tx.actor),
 *      mostrarSaldo?: false hides «te quedan N clases», plan?: the plan a held swing is for, reagendadaDe?: the old class row }
 */
export function avisarReservaPorCorreo(tx, idReserva, o = {}) {
  const ctx = tx.ctx, M = tx.M;
  const r = M.reservaPorId.get(idReserva);
  const c = r && M.clasePorId.get(r.clase);
  // a class that already started (a walk-in Ana registers, a payment confirmed afterwards) needs no «te esperamos»
  if (!r || !c || !ctx.correo || esPasada(c, tx.ahora)) return false;
  const actor = o.actor ?? tx.actor;
  const limitada = esLimitada(actor);
  const para = o.para !== undefined ? String(o.para || "").trim() : destinoDe(M, r.clienta, actor);
  if (!esCorreo(para)) return false;
  const duena = M.clientaPorId.get(r.clienta);
  const nombre = o.nombre || (limitada ? actor.nombre : duena?.nombre) || "";
  const confirmada = r.estado === R.ESTADO.CONFIRMADA;
  if (!confirmada && r.estado !== R.ESTADO.PENDIENTE) return false;

  const k = claseParaCorreo(M, c);
  const { inicio, fin } = intervalo(c, k.minutos);
  const publicUrl = ctx.config.publicUrl;
  let pago = null;
  if (!confirmada) {
    // a limited session sees only what that device asked for, never a plan suggested from the owner's history
    const plan = o.plan ?? (limitada ? r.atribucion?.plan || planDePrueba(M)?.nombre : undefined);
    const v = vistaPago(M, r, { nombre, plan });
    pago = { monto: v.monto, llave: v.llave, medios: v.medios, whatsappTexto: R.whatsappLegible(v.whatsapp), venceTexto: venceTexto(r.vence), waEnlace: v.waEnlace };
  }
  const saldo = confirmada && !limitada && o.mostrarSaldo !== false ? vistaSaldo(M, r.clienta, R.hoyClave(tx.ahora)).clases : null;
  const titulo = k.nombre + " · Casa Lotus";
  const descripcion = [
    k.nombre + (k.profe ? " con tu profe " + k.profe : ""),
    confirmada ? "Reserva confirmada." : "Cupo apartado: falta enviar el comprobante de pago.",
    "Código " + r.id + ".",
    "Tus clases: " + publicUrl + "/app/mi",
  ].join("\n");
  const antes = o.reagendadaDe;
  const m = correoClaseClienta({
    nombre, codigo: r.id, publicUrl, horasCancelar: M.ajustes["Horas mínimas para cancelar"], clase: k, confirmada, saldo, pago,
    calendario: enlaceGoogleCalendar({ titulo, descripcion, inicio, fin }),
    reagendadaDe: antes ? R.fechaLegible(antes.fecha) + " a las " + R.horaLegible(antes.hora) : undefined,
  });
  const raiz = raizDe(M, r);
  const archivo = ics({
    uid: raiz.id + "@casalotus.studio", secuencia: raiz.cambios, titulo, descripcion, inicio, fin, url: publicUrl + "/app/mi", confirmada, ahora: tx.ahora,
  });
  tx.despues(() => ctx.correo.enviar({
    para, asunto: m.asunto, html: m.html, texto: m.texto, nombreRemitente: REMITENTE,
    adjuntos: [{ nombre: "casa-lotus-" + c.fecha + ".ics", contenido: archivo, tipo: "text/calendar; charset=utf-8; method=PUBLISH" }],
  }));
  return true;
}

/**
 * Queues «Cancelamos tu clase». r: the booking as it was BEFORE the cancellation; c: its class row.
 * o: { resultado: "devuelta" | "descontada" | "liberada", porEstudio?, motivo?, actor?, para? }
 */
export function avisarCancelacionPorCorreo(tx, r, c, o) {
  const ctx = tx.ctx, M = tx.M;
  if (!ctx.correo || !c || esPasada(c, tx.ahora)) return false;
  const actor = o.actor ?? tx.actor;
  const para = o.para !== undefined ? String(o.para || "").trim() : destinoDe(M, r.clienta, actor);
  if (!esCorreo(para)) return false;
  const nombre = (esLimitada(actor) ? actor.nombre : M.clientaPorId.get(r.clienta)?.nombre) || "";
  const m = correoCancelacionClienta({
    nombre, publicUrl: ctx.config.publicUrl, horasCancelar: M.ajustes["Horas mínimas para cancelar"],
    whatsappTexto: R.whatsappLegible(M.ajustes["WhatsApp de reservas"]), clase: claseParaCorreo(M, c),
    porEstudio: Boolean(o.porEstudio), motivo: o.motivo || "", resultado: o.resultado,
  });
  tx.despues(() => ctx.correo.enviar({ para, asunto: m.asunto, html: m.html, texto: m.texto, nombreRemitente: REMITENTE }));
  return true;
}
