// Casa Lotus · business rules, pure ESM. Shared by server/, app/ and site/.
// Port of apps-script/comun/Reglas.js + Festivos.js (the Sheet's own script keeps its copy).
//
// Time model: Bogotá is UTC−5 all year (no daylight saving since 1993), so every rule works on
// "yyyy-MM-dd" date keys and "HH:mm" times and converts to epoch with a fixed offset. Nothing here
// depends on the machine's time zone, so the browser, the server and the tests always agree.

export const ZONA = "America/Bogota";
const OFFSET_MS = 5 * 3600000; // Bogotá = UTC−5

export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * Booking states, exactly as the Sheet stores them.
 * OCUPAN: the booking holds a swing. CONSUMEN: the booking spends a class of the plan.
 * «Cancelada tarde» frees the swing (someone on the waiting list can take it) but still spends the class.
 */
export const ESTADO = Object.freeze({
  PENDIENTE: "Pendiente de pago",
  CONFIRMADA: "Confirmada",
  ASISTIO: "Asistió",
  NO_VINO: "No vino",
  CANCELADA: "Cancelada",
  CANCELADA_TARDE: "Cancelada tarde",
  VENCIDA: "Vencida",
});
export const OCUPAN = [ESTADO.PENDIENTE, ESTADO.CONFIRMADA, ESTADO.ASISTIO, ESTADO.NO_VINO];
export const CONSUMEN = [ESTADO.CONFIRMADA, ESTADO.ASISTIO, ESTADO.NO_VINO, ESTADO.CANCELADA_TARDE];
export const ACTIVAS = [ESTADO.PENDIENTE, ESTADO.CONFIRMADA]; // still ahead: can be cancelled or rescheduled

export const ESTADO_CLASE = Object.freeze({ PROGRAMADA: "Programada", CANCELADA: "Cancelada" });
export const MEDIOS = ["Nequi", "DaviPlata", "Bre-B", "Transferencia", "Efectivo"];

/* ── dates ─────────────────────────────────────────────── */

const pad = (n) => (n < 10 ? "0" : "") + n;

/** "yyyy-MM-dd" from UTC date parts. */
export function clave(fechaUTC) {
  return fechaUTC.getUTCFullYear() + "-" + pad(fechaUTC.getUTCMonth() + 1) + "-" + pad(fechaUTC.getUTCDate());
}

/** Date at UTC midnight for a key (date arithmetic only, never shown). */
export function fechaUTC(claveTexto) {
  const [y, m, d] = String(claveTexto).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function sumarDias(claveTexto, dias) {
  const f = fechaUTC(claveTexto);
  f.setUTCDate(f.getUTCDate() + dias);
  return clave(f);
}

export function diaDeSemana(claveTexto) { return DIAS[fechaUTC(claveTexto).getUTCDay()]; }

/** Today in Bogotá as "yyyy-MM-dd". */
export function hoyClave(ahoraMs = Date.now()) { return clave(new Date(ahoraMs - OFFSET_MS)); }

/** Current Bogotá time as "HH:mm". */
export function ahoraHora(ahoraMs = Date.now()) {
  const f = new Date(ahoraMs - OFFSET_MS);
  return pad(f.getUTCHours()) + ":" + pad(f.getUTCMinutes());
}

/** Epoch ms of a Bogotá wall-clock moment. */
export function momentoMs(claveTexto, hhmm = "00:00") {
  const [y, m, d] = String(claveTexto).split("-").map(Number);
  const [h, min] = String(hhmm).split(":").map(Number);
  return Date.UTC(y, m - 1, d, h || 0, min || 0) + OFFSET_MS;
}

/** Bogotá "yyyy-MM-dd" and "HH:mm" of an epoch ms or Date. */
export function partesBogota(t) {
  const ms = t instanceof Date ? t.getTime() : Number(t);
  return { fecha: hoyClave(ms), hora: ahoraHora(ms) };
}

/** "18:00" from "18:00", "6:00", "18:00:00" or a Date (Sheets time value read in Bogotá). */
export function horaTexto(v) {
  if (v instanceof Date) return partesBogota(v).hora;
  const m = String(v ?? "").match(/(\d{1,2}):(\d{2})/);
  return m ? pad(Number(m[1])) + ":" + m[2] : "";
}

/** "6:00 p. m." (Colombian style) from "18:00". */
export function horaLegible(hhmm) {
  const [hs, m = "00"] = String(hhmm).split(":");
  const h = Number(hs);
  const sufijo = h < 12 ? "a. m." : "p. m.";
  return (h % 12 === 0 ? 12 : h % 12) + ":" + m + " " + sufijo;
}

/** "sábado 3 de octubre" from "2026-10-03". */
export function fechaLegible(claveTexto) {
  const f = fechaUTC(claveTexto);
  return DIAS[f.getUTCDay()].toLowerCase() + " " + f.getUTCDate() + " de " + MESES[f.getUTCMonth()];
}

/** "sáb 3 oct" — compact, for chips and lists. */
export function fechaCorta(claveTexto) {
  const f = fechaUTC(claveTexto);
  return DIAS[f.getUTCDay()].slice(0, 3).toLowerCase() + " " + f.getUTCDate() + " " + MESES[f.getUTCMonth()].slice(0, 3);
}

/* ── people ────────────────────────────────────────────── */

/** Colombian WhatsApp number as digits with country code: "312 872 0888" → "573128720888". */
export function normalizaWhatsApp(texto) {
  let d = String(texto ?? "").replace(/\D/g, "");
  if (d.length === 10 && d.charAt(0) === "3") d = "57" + d;
  return /^573\d{9}$/.test(d) ? d : "";
}

/** "573128720888" → "312 872 0888" (how people read it). */
export function whatsappLegible(d) {
  d = String(d ?? "");
  const n = d.startsWith("57") ? d.slice(2) : d;
  return n.length === 10 ? n.slice(0, 3) + " " + n.slice(3, 6) + " " + n.slice(6) : d;
}

export function primerNombre(nombre) { return String(nombre ?? "").trim().split(/\s+/)[0] || ""; }

/** A WhatsApp link with a prefilled message. */
export function enlaceWhatsApp(numero, texto) {
  return "https://wa.me/" + numero + (texto ? "?text=" + encodeURIComponent(texto) : "");
}

/** "$158.000" — money is always COP, dot thousands, no decimals. */
export function dinero(valor) {
  const n = Math.round(Number(valor) || 0);
  return (n < 0 ? "-$" : "$") + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Days until the next birthday (0 = today), or null without a birth date. */
export function diasParaCumple(nacimiento, hoy) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(nacimiento ?? ""))) return null;
  const [, m, d] = nacimiento.split("-").map(Number);
  const anio = Number(hoy.slice(0, 4));
  let prox = clave(new Date(Date.UTC(anio, m - 1, d)));
  if (prox < hoy) prox = clave(new Date(Date.UTC(anio + 1, m - 1, d)));
  return Math.round((fechaUTC(prox) - fechaUTC(hoy)) / 86400000);
}

/* ── ids ───────────────────────────────────────────────── */

/** Class id: one room, so date + time is unique. "2026-10-03 08:00". */
export function claseId(fecha, hora) { return fecha + " " + hora; }

/** Next sequential id with a prefix: ("R", ["R-0007", "R-0012"]) → "R-0013". */
export function siguienteId(prefijo, existentes) {
  let max = 0;
  for (const id of existentes || []) {
    const m = String(id).match(/-(\d+)$/);
    if (m && String(id).startsWith(prefijo + "-")) max = Math.max(max, Number(m[1]));
  }
  return prefijo + "-" + String(max + 1).padStart(4, "0");
}

/* ── holidays (Ley 51 de 1983, «Ley Emiliani») ─────────── */

function pascua(anio) {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}
const masUTC = (f, dias) => new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate() + dias));
const lunesSiguiente = (f) => masUTC(f, (8 - f.getUTCDay()) % 7);

/** Colombian public holidays for a year: [{ fecha: "yyyy-MM-dd", nombre }], sorted. */
export function festivosColombia(anio) {
  const p = pascua(anio);
  const fijos = [[0, 1, "Año Nuevo"], [4, 1, "Día del Trabajo"], [6, 20, "Independencia"], [7, 7, "Batalla de Boyacá"],
    [11, 8, "Inmaculada Concepción"], [11, 25, "Navidad"]];
  const trasladables = [[0, 6, "Reyes Magos"], [2, 19, "San José"], [5, 29, "San Pedro y San Pablo"], [7, 15, "Asunción de la Virgen"],
    [9, 12, "Día de la Raza"], [10, 1, "Todos los Santos"], [10, 11, "Independencia de Cartagena"]];
  const lista = [];
  for (const [m, d, n] of fijos) lista.push({ fecha: clave(new Date(Date.UTC(anio, m, d))), nombre: n });
  for (const [m, d, n] of trasladables) lista.push({ fecha: clave(lunesSiguiente(new Date(Date.UTC(anio, m, d)))), nombre: n });
  lista.push({ fecha: clave(masUTC(p, -3)), nombre: "Jueves Santo" });
  lista.push({ fecha: clave(masUTC(p, -2)), nombre: "Viernes Santo" });
  lista.push({ fecha: clave(lunesSiguiente(masUTC(p, 39))), nombre: "Ascensión del Señor" });
  lista.push({ fecha: clave(lunesSiguiente(masUTC(p, 60))), nombre: "Corpus Christi" });
  lista.push({ fecha: clave(lunesSiguiente(masUTC(p, 68))), nombre: "Sagrado Corazón" });
  return lista.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}

/** { "yyyy-MM-dd": "name" } for every holiday between two keys (inclusive years). */
export function festivosEntre(desde, hasta) {
  const s = {};
  for (let y = Number(desde.slice(0, 4)); y <= Number(hasta.slice(0, 4)); y++) for (const f of festivosColombia(y)) s[f.fecha] = f.nombre;
  return s;
}

/* ── calendar ──────────────────────────────────────────── */

/**
 * Class dates for the weekly template, from `desde` for `semanas` weeks, skipping holidays.
 * horario: [{ dia: "Sábado", hora: "08:00", clase, profe, cupos, activa: true }]
 * Returns [{ id, fecha, dia, hora, clase, profe, cupos }] in date order.
 */
export function fechasDeClase(horario, desde, semanas, festivos = festivosEntre(desde, sumarDias(desde, semanas * 7))) {
  const out = [];
  for (let i = 0; i < semanas * 7; i++) {
    const fecha = sumarDias(desde, i);
    if (festivos[fecha]) continue;
    const dia = diaDeSemana(fecha);
    for (const h of horario) {
      if (!h.activa || h.dia !== dia) continue;
      const hora = horaTexto(h.hora);
      out.push({ id: claseId(fecha, hora), fecha, dia, hora, clase: h.clase, profe: h.profe, cupos: Number(h.cupos) || 8 });
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Swings taken in a class by its bookings. */
export function ocupados(reservas, idClase) {
  return reservas.filter((r) => r.clase === idClase && OCUPAN.includes(r.estado)).length;
}

/** Epoch ms when a class starts. clase: { fecha, hora }. */
export function inicioClase(clase) { return momentoMs(clase.fecha, clase.hora); }

/* ── plans and balances (never typed: classes bought − classes spent) ── */

function usadasPorCompra(reservas) {
  const usadas = {};
  for (const r of reservas) if (r.compra && CONSUMEN.includes(r.estado)) usadas[r.compra] = (usadas[r.compra] || 0) + 1;
  return usadas;
}

/**
 * The plan a new class is charged to: valid on the class date, with classes left, the one that
 * expires first (so nothing is lost). compras: [{ id, clienta, inicio, vence, clases }].
 */
export function elegirCompra(compras, reservas, idClienta, fechaClase) {
  const usadas = usadasPorCompra(reservas);
  const validas = compras.filter((c) => c.clienta === idClienta && c.inicio <= fechaClase && fechaClase <= c.vence && Number(c.clases) - (usadas[c.id] || 0) > 0);
  validas.sort((a, b) => (a.vence < b.vence ? -1 : a.vence > b.vence ? 1 : 0));
  return validas[0] || null;
}

/** Classes left and the latest expiry across a client's valid plans on a given day. */
export function saldo(compras, reservas, idClienta, hoy) {
  const usadas = usadasPorCompra(reservas);
  let clases = 0, vence = "";
  for (const c of compras) {
    if (c.clienta !== idClienta || c.vence < hoy) continue;
    const quedan = Number(c.clases) - (usadas[c.id] || 0);
    if (quedan <= 0) continue;
    clases += quedan;
    if (c.vence > vence) vence = c.vence;
  }
  return { clases, vence };
}

/** Per purchase: used, left and state, the same rule as the Sheet's «Estado» formula. */
export function estadoCompra(compra, reservas, hoy) {
  const usadas = reservas.filter((r) => r.compra === compra.id && CONSUMEN.includes(r.estado)).length;
  const disponibles = Number(compra.clases) - usadas;
  const estado = disponibles <= 0 ? "Agotado" : hoy > compra.vence ? "Vencido" : "Vigente";
  return { usadas, disponibles, estado };
}

/* ── booking policy ────────────────────────────────────── */

/** Can this class still be booked? Needs a free swing and `horasMin` of notice. */
export function reservable(clase, ocupadosAhora, ahoraMs, horasMin) {
  if (!clase || clase.estado === ESTADO_CLASE.CANCELADA) return { ok: false, motivo: "cancelada" };
  if (inicioClase(clase) - ahoraMs < horasMin * 3600000) return { ok: false, motivo: "tarde" };
  if (ocupadosAhora >= Number(clase.cupos)) return { ok: false, motivo: "llena" };
  return { ok: true };
}

/**
 * Cancelling a booking. With `horasMin` of notice or more, the class goes back to the plan
 * («Cancelada»). With less, the swing is freed but the class is spent («Cancelada tarde»),
 * except a pending (unpaid) booking, which simply expires. A class that already started cannot be cancelled.
 * Returns { ok, estado, devuelveClase, limiteMs, motivo? }.
 */
export function politicaCancelar(reserva, clase, ahoraMs, horasMin) {
  const inicio = inicioClase(clase), limiteMs = inicio - horasMin * 3600000;
  if (!ACTIVAS.includes(reserva.estado)) return { ok: false, motivo: "estado", limiteMs };
  if (ahoraMs >= inicio) return { ok: false, motivo: "empezo", limiteMs };
  if (reserva.estado === ESTADO.PENDIENTE) return { ok: true, estado: ESTADO.CANCELADA, devuelveClase: false, limiteMs };
  const aTiempo = ahoraMs <= limiteMs;
  return { ok: true, estado: aTiempo ? ESTADO.CANCELADA : ESTADO.CANCELADA_TARDE, devuelveClase: aTiempo, limiteMs };
}

/**
 * Moving a booking to another class. Allowed with `horasMin` of notice on the original class,
 * while the booking is active, at most `maxCambios` times along its chain (`cambiosHechos`).
 * The target class must itself be reservable (checked separately with `reservable`).
 */
export function politicaReagendar(reserva, clase, ahoraMs, horasMin, cambiosHechos = 0, maxCambios = Infinity) {
  const limiteMs = inicioClase(clase) - horasMin * 3600000;
  if (!ACTIVAS.includes(reserva.estado)) return { ok: false, motivo: "estado", limiteMs };
  if (ahoraMs > limiteMs) return { ok: false, motivo: "tarde", limiteMs };
  if (cambiosHechos >= maxCambios) return { ok: false, motivo: "cambios", limiteMs };
  return { ok: true, limiteMs };
}
