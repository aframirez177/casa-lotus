// An .ics file for a class, so it lands in her phone's calendar with a reminder.
import { inicioClase } from "./reglas.js";
import { nombreClase } from "./clases.js";

const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapar = (s) => String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");

export function icsDeClase(clase, { duracionMin = 60, codigo = "" } = {}) {
  const ini = inicioClase(clase);
  const lineas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Casa Lotus//App//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${clase.id.replace(/\W/g, "")}${codigo ? "-" + codigo : ""}@casalotus.studio`,
    `DTSTAMP:${utc(Date.now())}`,
    `DTSTART:${utc(ini)}`,
    `DTEND:${utc(ini + duracionMin * 60000)}`,
    `SUMMARY:${escapar(nombreClase(clase) + " · Casa Lotus")}`,
    `DESCRIPTION:${escapar("Llega 10 minutos antes, con ropa deportiva ajustada y tu botella de agua. Para cambiar o cancelar, entra a casalotus.studio/app")}`,
    "LOCATION:Casa Lotus, Bogotá",
    "URL:https://casalotus.studio/app/mi",
    "BEGIN:VALARM", "TRIGGER:-PT3H", "ACTION:DISPLAY", `DESCRIPTION:${escapar("Hoy tienes clase en Casa Lotus")}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lineas.join("\r\n");
}

export function descargarIcs(clase, opciones) {
  const blob = new Blob([icsDeClase(clase, opciones)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `casa-lotus-${clase.fecha}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
