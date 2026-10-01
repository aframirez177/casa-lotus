// Casa Lotus · the shared objects of CONTRATO §5, built from the model.
// Public views carry counts only; staff views add names, phones and (admin, the class's profe) health.
import * as R from "../../../shared/reglas.js";
import { fichaCompleta } from "../../../shared/consentimientos.js";
import { sinTilde } from "../datos/modelo.js";

/** A profe marks or corrects attendance from the class day until this long after the start; then only admins. */
export const PLAZO_ASISTENCIA_MS = 48 * 3600000;

export const MEDIOS_LLAVE = ["Nequi", "DaviPlata", "Bre-B"];

export const iso = (ms) => (ms === null || ms === undefined || !Number.isFinite(Number(ms)) ? null : new Date(Number(ms)).toISOString());
export const nombreClase = (c) => (c?.clase && c.clase !== "Por confirmar" ? c.clase : "");
export const esPasada = (c, ahora) => ahora >= R.inicioClase(c);

/** A class object even when its row is gone (an old booking pointing to a deleted class). */
function claseOFantasma(M, id) {
  const c = M.clasePorId.get(id);
  if (c) return c;
  const fecha = /^\d{4}-\d{2}-\d{2}/.test(id) ? id.slice(0, 10) : "2000-01-01";
  const hora = R.horaTexto(id.slice(11)) || "00:00";
  return { id, fecha, dia: R.diaDeSemana(fecha), hora, clase: "", profe: "", cupos: 0, estado: "Cancelada", notas: "", tipo: "Regular" };
}

/** Clase (CONTRATO §5). `real`: staff see the true count (a class can run over its cupos). */
export function vistaClase(M, c, ahora, { real = false } = {}) {
  const ocupados = M.ocupados(c.id);
  const r = R.reservable(c, ocupados, ahora, M.ajustes["Horas mínimas para reservar"]);
  const o = {
    id: c.id, fecha: c.fecha, dia: c.dia, hora: c.hora, fechaTexto: R.fechaLegible(c.fecha), horaTexto: R.horaLegible(c.hora),
    clase: nombreClase(c), tipo: c.tipo, cupos: c.cupos, ocupados: real ? ocupados : Math.min(ocupados, c.cupos),
    libres: Math.max(c.cupos - ocupados, 0), reservable: r.ok, estado: c.estado,
  };
  if (!r.ok) o.motivo = r.motivo;
  return o;
}

export function vistaClasePorId(M, id, ahora) {
  return vistaClase(M, claseOFantasma(M, id), ahora);
}

export function cumpleCerca(nacimiento, fecha, dias = 3) {
  const d = R.diasParaCumple(nacimiento, R.sumarDias(fecha, -dias));
  return d !== null && d <= dias * 2;
}

export function textoContacto(c) {
  if (!c?.nombre && !c?.whatsapp) return "";
  return [c.nombre, c.whatsapp ? R.whatsappLegible(c.whatsapp) : ""].filter(Boolean).join(" · ");
}

export function vistaAsistente(M, r, clase, { conSalud }) {
  const p = M.clientaPorId.get(r.clienta) || { nombre: "(sin nombre)", whatsapp: "", consentimientos: { imagen: { acepta: null } }, contacto: {} };
  const previas = M.reservasDeClienta(r.clienta).filter((x) => x.estado === R.ESTADO.ASISTIO && x.clase < clase.id);
  return {
    reserva: r.id, clienta: r.clienta, nombre: p.nombre, whatsapp: p.whatsapp, whatsappTexto: R.whatsappLegible(p.whatsapp), estado: r.estado,
    primeraVez: previas.length === 0, experiencia: p.experiencia || "",
    salud: conSalud ? p.salud || "" : "",
    cumple: cumpleCerca(p.nacimiento, clase.fecha), autorizaImagen: p.consentimientos?.imagen?.acepta ?? null,
    contactoEmergencia: textoContacto(p.contacto), origen: r.origen || "",
  };
}

export function vistaEspera(M, e) {
  const p = M.clientaPorId.get(e.clienta) || { nombre: "(sin nombre)", whatsapp: "" };
  return { id: e.id, clienta: e.clienta, nombre: p.nombre, whatsapp: p.whatsapp, creada: iso(e.creada), estado: e.estado };
}

/** The open substitute request of a class (it lives while the class's profe is still the one who asked). */
export function reemplazoDe(M, c) {
  const r = M.reemplazos?.get(c.id);
  if (!r || sinTilde(r.profe) !== sinTilde(c.profe) || c.estado === "Cancelada") return null;
  return { fecha: iso(r.fecha), motivo: r.motivo || "", pedidoPor: r.usuario };
}

/** Can this actor mark attendance on this class right now? (admins: from the class day on; profes: up to 48 h after). */
export function asistenciaEditable(c, ahora, actor) {
  if (c.estado === "Cancelada" || c.fecha > R.hoyClave(ahora)) return false;
  return actor?.tipo !== "profe" || ahora <= R.inicioClase(c) + PLAZO_ASISTENCIA_MS;
}

/** ClaseEquipo: what Ana and the class's profe see. `actor` decides asistenciaEditable (default: admin). */
export function vistaClaseEquipo(M, c, ahora, { conSalud = true, actor } = {}) {
  const base = vistaClase(M, c, ahora, { real: true });
  const hoy = R.hoyClave(ahora);
  const pasada = esPasada(c, ahora);
  const gente = M.reservasDeClase(c.id)
    .filter((r) => r.estado !== R.ESTADO.VENCIDA && r.estado !== R.ESTADO.CANCELADA)
    .map((r) => vistaAsistente(M, r, c, { conSalud }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const espera = M.esperaDeClase(c.id).filter((e) => e.estado === "Esperando" || e.estado === "Avisada")
    .sort((a, b) => (a.creada || 0) - (b.creada || 0)).map((e) => vistaEspera(M, e));
  return {
    ...base, profe: c.profe || "", notas: c.notas || "", esHoy: c.fecha === hoy, pasada,
    pocaGente: !pasada && c.estado === "Programada" && base.ocupados < M.ajustes["Mínimo de personas"],
    gente, espera, asistenciaEditable: asistenciaEditable(c, ahora, actor), reemplazoPedido: reemplazoDe(M, c),
  };
}

export function vistaPlan(p) {
  return { nombre: p.nombre, clases: p.clases, precio: p.precio, vigencia: p.vigencia, tipo: p.tipo, activo: p.activo };
}

export function vistaCompra(M, c, hoy) {
  const e = R.estadoCompra(c, M.reservas, hoy);
  const p = M.clientaPorId.get(c.clienta);
  return {
    id: c.id, fecha: c.fecha, clienta: c.clienta, nombre: p?.nombre || "", plan: c.plan, clases: c.clases, valor: c.valor, medio: c.medio,
    inicio: c.inicio, vence: c.vence, usadas: e.usadas, disponibles: e.disponibles, estado: e.estado,
  };
}

export function vistaSaldo(M, idClienta, hoy) {
  const s = R.saldo(M.compras, M.reservas, idClienta, hoy);
  return { clases: s.clases, vence: s.vence, venceTexto: s.vence ? R.fechaLegible(s.vence) : "" };
}

export function perfilDe(c) {
  return {
    nombre: c.nombre, whatsapp: c.whatsapp, correo: c.correo, nacimiento: c.nacimiento, barrio: c.barrio, intereses: c.intereses,
    salud: c.salud, eps: c.eps, contactoEmergencia: { nombre: c.contacto?.nombre || "", whatsapp: c.contacto?.whatsapp || "" },
    experiencia: c.experiencia, llego: c.llego, novedades: Boolean(c.novedades),
  };
}

export const consentimientosDe = (c) => c.consentimientos;
export const fichaDe = (c) => fichaCompleta(perfilDe(c), c.consentimientos);

/* ── plans and payments ───────────────────────────────── */

export function planDePrueba(M) {
  return M.planes.find((p) => p.tipo === "Prueba" && p.activo) || M.planPorNombre.get("Clase de prueba") || null;
}

/** The plan a payment is probably for: the trial for someone new, otherwise her last plan. */
export function planSugerido(M, idClienta) {
  const suyas = (idClienta ? M.comprasDeClienta(idClienta) : []).filter((c) => c.tipoPlan !== "Ajuste")
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  if (!suyas.length) return planDePrueba(M);
  const ultima = M.planPorNombre.get(suyas[suyas.length - 1].plan);
  if (ultima && ultima.tipo !== "Prueba" && ultima.activo) return ultima;
  return M.planes.filter((p) => p.tipo === "Mensual" && p.activo).sort((a, b) => a.precio - b.precio)[0] || planDePrueba(M);
}

/** Payment instructions for a pending booking (CONTRATO §6 `pago`). */
/** The plan a pending booking is for: the one she asked for (public booking), else a suggestion. */
export function planDeReserva(M, r) {
  return (r.atribucion?.plan && M.planPorNombre.get(r.atribucion.plan)) || planSugerido(M, r.clienta);
}

export function vistaPago(M, r, { plan, nombre } = {}) {
  const p = (plan && M.planPorNombre.get(plan)) || planDeReserva(M, r);
  const c = claseOFantasma(M, r.clase);
  const monto = p?.precio || 0;
  const quien = nombre || M.clientaPorId.get(r.clienta)?.nombre || "";
  const waTexto = "Hola, soy " + R.primerNombre(quien) + ". Aparté la clase del " + R.fechaLegible(c.fecha) + " a las " + R.horaLegible(c.hora) +
    " (código " + r.id + ")" + (p ? ". Te envío el comprobante de pago de " + p.nombre.toLowerCase() + " por " + R.dinero(monto) : ". Te envío el comprobante de pago") + ".";
  const whatsapp = M.ajustes["WhatsApp de reservas"];
  return {
    monto, plan: p?.nombre || "", llave: M.ajustes["Llave de pago"], medios: MEDIOS_LLAVE, whatsapp,
    venceApartado: iso(r.vence), waTexto, waEnlace: R.enlaceWhatsApp(whatsapp, waTexto),
  };
}

/* ── bookings as the clienta sees them ────────────────── */

/** How many times a booking has been moved (length of its «Reagendada de» chain). */
export function cambiosDe(M, r) {
  let n = 0, x = r;
  const vistos = new Set();
  while (x?.reagendadaDe && n < 50 && !vistos.has(x.id)) {
    vistos.add(x.id);
    x = M.reservaPorId.get(x.reagendadaDe);
    n++;
  }
  return n;
}

/** A trial booking: charged to a trial plan, or still unpaid by someone who never bought anything. */
export function esDePrueba(M, r) {
  if (r.compra) return M.compraPorId.get(r.compra)?.tipoPlan === "Prueba";
  if (r.estado !== R.ESTADO.PENDIENTE) return false;
  return M.comprasDeClienta(r.clienta).length === 0;
}

/** limitada: a session opened by a public booking with a known number sees nothing of the real owner. */
export function vistaReservaClienta(M, r, ahora, { nombre, limitada = false } = {}) {
  const c = claseOFantasma(M, r.clase);
  const horas = M.ajustes["Horas mínimas para cancelar"];
  const pc = R.politicaCancelar(r, c, ahora, horas);
  const max = esDePrueba(M, r) ? M.ajustes["Cambios permitidos clase de prueba"] : Infinity;
  const pr = R.politicaReagendar(r, c, ahora, horas, cambiosDe(M, r), max);
  const compra = r.compra ? M.compraPorId.get(r.compra) : null;
  const o = {
    id: r.id, estado: r.estado, clase: vistaClase(M, c, ahora),
    puedeCancelar: pc.ok, cancelarSinCosto: Boolean(pc.ok && (pc.devuelveClase || r.estado === R.ESTADO.PENDIENTE)),
    limiteCancelar: iso(pc.limiteMs), puedeReagendar: pr.ok && c.estado !== "Cancelada", limiteReagendar: iso(pr.limiteMs),
  };
  if (compra && !limitada) { o.compra = compra.id; o.plan = compra.plan; }
  if (r.reagendadaDe) o.reagendadaDe = r.reagendadaDe;
  if (r.estado === R.ESTADO.PENDIENTE) {
    // a limited session sees only what that device asked for, never a plan suggested from her history
    o.pago = vistaPago(M, r, { nombre, plan: limitada ? r.atribucion?.plan || planDePrueba(M)?.nombre : undefined });
  }
  return o;
}
