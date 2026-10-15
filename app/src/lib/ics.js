// Her class in her calendar: a Google Calendar link (no file, opens in the browser or the app) and an
// .ics for the iPhone and other calendars. Times are Bogotá wall-clock (shared momentoMs), sent as UTC.
import { inicioClase, momentoMs, partesBogota, horaLegible } from "./reglas.js";
import { nombreClase } from "./clases.js";

export const DURACION_DEFECTO = 60;
const LUGAR = "Casa Lotus, Bogotá";
const NOTA = "Llega 10 minutos antes, con ropa deportiva ajustada y tu botella de agua. Para cambiar o cancelar, entra a https://casalotus.studio/app/mi";

/** End of the class in epoch ms: `fin` from the API when it has it, else start + duración. */
export function finClase(clase, duracionMin = DURACION_DEFECTO) {
  const ini = inicioClase(clase);
  if (/^\d{2}:\d{2}$/.test(clase?.fin || "")) {
    const fin = momentoMs(clase.fecha, clase.fin);
    if (fin > ini) return fin;
  }
  return ini + (Number(duracionMin) || DURACION_DEFECTO) * 60000;
}

/** «8:00 – 9:00 a. m.» (one suffix when both ends share it), «11:30 a. m. – 12:30 p. m.» otherwise. */
export function rangoHora(clase, duracionMin) {
  const a = horaLegible(clase.hora);
  const b = horaLegible(partesBogota(finClase(clase, duracionMin)).hora);
  const [ha, sa] = [a.split(" ")[0], a.split(" ").slice(1).join(" ")];
  const sb = b.split(" ").slice(1).join(" ");
  return sa === sb ? `${ha} – ${b}` : `${a} – ${b}`;
}

const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapar = (s) => String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
const titulo = (clase) => nombreClase(clase) + " · Casa Lotus";

/** https://calendar.google.com/calendar/render?action=TEMPLATE… (dates in UTC). */
export function enlaceGoogleCalendar(clase, { duracionMin, codigo = "" } = {}) {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: titulo(clase),
    dates: `${utc(inicioClase(clase))}/${utc(finClase(clase, duracionMin))}`,
    details: NOTA + (codigo ? `\nCódigo de tu reserva: ${codigo}` : ""),
    location: LUGAR,
    ctz: "America/Bogota",
  });
  return "https://calendar.google.com/calendar/render?" + q.toString();
}

export function icsDeClase(clase, { duracionMin, codigo = "" } = {}) {
  const lineas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Casa Lotus//App//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${clase.id.replace(/\W/g, "")}${codigo ? "-" + codigo : ""}@casalotus.studio`,
    `DTSTAMP:${utc(Date.now())}`,
    `DTSTART:${utc(inicioClase(clase))}`,
    `DTEND:${utc(finClase(clase, duracionMin))}`,
    `SUMMARY:${escapar(titulo(clase))}`,
    `DESCRIPTION:${escapar(NOTA + (codigo ? `\nCódigo de tu reserva: ${codigo}` : ""))}`,
    `LOCATION:${escapar(LUGAR)}`,
    "URL:https://casalotus.studio/app/mi",
    "BEGIN:VALARM", "TRIGGER:-PT3H", "ACTION:DISPLAY", `DESCRIPTION:${escapar("Hoy tienes clase en Casa Lotus")}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lineas.join("\r\n");
}

/**
 * The .ics: on iPhone/iPad, Safari opens a text/calendar page as «Agregar al calendario» instead of
 * saving a file; elsewhere it downloads, and the phone's calendar opens it.
 */
export function abrirIcs(clase, opciones, { ios = false } = {}) {
  const texto = icsDeClase(clase, opciones);
  if (ios) {
    location.assign("data:text/calendar;charset=utf-8," + encodeURIComponent(texto));
    return;
  }
  const url = URL.createObjectURL(new Blob([texto], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `casa-lotus-${clase.fecha}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
