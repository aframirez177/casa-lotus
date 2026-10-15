// Casa Lotus · a class as a calendar event: an .ics file (RFC 5545) attached to the confirmation e-mail
// and an «Agregar a Google Calendar» link. Times travel in UTC (…Z), so every calendar shows them in its
// own zone. The address is never published: the location is «Casa Lotus, Bogotá».
import { momentoMs } from "../../../shared/reglas.js";

export const LUGAR = "Casa Lotus, Bogotá";

/** "20261003T130000Z" from epoch ms. */
export const utcCompacto = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/** Start and end of a class in epoch ms. clase: { fecha, hora }, minutos: its duration. */
export function intervalo(clase, minutos) {
  const inicio = momentoMs(clase.fecha, clase.hora);
  return { inicio, fin: inicio + minutos * 60000 };
}

/** Text value escaping (RFC 5545 §3.3.11). */
const escapar = (t) => String(t ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds a content line at 75 octets (UTF-8 aware, never splitting a character). */
export function plegar(linea) {
  const out = [];
  let actual = "", bytes = 0, limite = 75;
  for (const ch of linea) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > limite) {
      out.push(actual);
      actual = " ";
      bytes = 1;
      limite = 75;
    }
    actual += ch;
    bytes += b;
  }
  out.push(actual);
  return out.join("\r\n");
}

/**
 * The .ics text for one booking. e: { uid, secuencia, titulo, descripcion, inicio, fin, url, confirmada, ahora }.
 * A held (unpaid) swing is TENTATIVE; a confirmed class CONFIRMED. A reminder rings two hours before.
 * A rescheduled booking keeps the first booking's UID with a higher SEQUENCE, so calendars move the event.
 */
export function ics(e) {
  const lineas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Casa Lotus//Reservas//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + e.uid,
    "SEQUENCE:" + (Number(e.secuencia) || 0),
    "DTSTAMP:" + utcCompacto(e.ahora),
    "DTSTART:" + utcCompacto(e.inicio),
    "DTEND:" + utcCompacto(e.fin),
    "SUMMARY:" + escapar(e.titulo),
    "LOCATION:" + escapar(LUGAR),
    "DESCRIPTION:" + escapar(e.descripcion),
    ...(e.url ? ["URL:" + e.url] : []),
    "STATUS:" + (e.confirmada ? "CONFIRMED" : "TENTATIVE"),
    "TRANSP:OPAQUE",
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT2H", "DESCRIPTION:" + escapar(e.titulo), "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lineas.map(plegar).join("\r\n") + "\r\n";
}

/** Query value as Google Calendar's own links write it: spaces as «+», commas kept. */
const q = (t) => encodeURIComponent(String(t ?? "")).replace(/%20/g, "+").replace(/%2C/gi, ",");

/** https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…Z/…Z&details=…&location=… */
export function enlaceGoogleCalendar({ titulo, descripcion, inicio, fin }) {
  return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + q(titulo) + "&dates=" + utcCompacto(inicio) + "/" + utcCompacto(fin) +
    "&details=" + q(descripcion) + "&location=" + q(LUGAR);
}
