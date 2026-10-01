// Casa Lotus · reading and writing Sheet cells.
// Sheets hands dates back as serial numbers (days since 1899-12-30) when read with
// UNFORMATTED_VALUE + SERIAL_NUMBER. The spreadsheet's time zone is America/Bogota, so the parts of a
// serial ARE Bogotá wall-clock time: a serial is converted as if it were UTC, then shifted by −5 h.
import { clave, horaTexto, momentoMs, partesBogota } from "../../../shared/reglas.js";

const EPOCH = Date.UTC(1899, 11, 30);
const DIA = 86400000;
const pad = (n) => String(n).padStart(2, "0");

/** Serial → { fecha: "yyyy-MM-dd", hora: "HH:mm", segundos } (Bogotá wall clock). */
export function serialAPartes(serial) {
  const ms = EPOCH + Math.round(Number(serial) * 86400) * 1000;
  const d = new Date(ms);
  return { fecha: clave(d), hora: pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()), segundos: d.getUTCSeconds() };
}

/** Serial → epoch ms of that Bogotá moment. */
export function serialAMs(serial) {
  const p = serialAPartes(serial);
  return momentoMs(p.fecha, p.hora) + p.segundos * 1000;
}

/** "yyyy-MM-dd" → whole-day serial. */
export function fechaASerial(fecha) {
  const [y, m, d] = String(fecha).split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DIA);
}

/** Epoch ms → Bogotá wall-clock serial (with the time as a fraction, to the second). */
export function msASerial(ms) {
  const p = partesBogota(ms);
  const segundos = Math.floor((Number(ms) % 60000 + 60000) % 60000 / 1000);
  const [h, mi] = p.hora.split(":").map(Number);
  return fechaASerial(p.fecha) + (h * 3600 + mi * 60 + segundos) / 86400;
}

/** "yyyy-MM-dd HH:mm:ss" in Bogotá for an epoch ms. */
export function textoFechaHora(ms) {
  const p = partesBogota(ms);
  const s = Math.floor((Number(ms) % 60000 + 60000) % 60000 / 1000);
  return p.fecha + " " + p.hora + ":" + pad(s);
}

/* ── reading ─────────────────────────────────────────── */

export function leerFecha(v) {
  if (typeof v === "number" && Number.isFinite(v)) return serialAPartes(v).fecha;
  if (v instanceof Date) return partesBogota(v).fecha;
  const m = String(v ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  const dmy = String(v ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // what es_CO shows when typed as text
  if (dmy) return dmy[3] + "-" + pad(Number(dmy[2])) + "-" + pad(Number(dmy[1]));
  return "";
}

/** Epoch ms or null. */
export function leerFechaHora(v) {
  if (typeof v === "number" && Number.isFinite(v)) return serialAMs(v);
  if (v instanceof Date) return v.getTime();
  const t = String(v ?? "").trim();
  if (!t) return null;
  const m = t.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})(?::(\d{2}))?$/);
  if (m) return momentoMs(m[1], m[2]) + Number(m[3] || 0) * 1000;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return momentoMs(t, "00:00");
  const iso = Date.parse(t);
  return Number.isFinite(iso) ? iso : null;
}

export function leerHora(v) {
  if (typeof v === "number" && Number.isFinite(v)) return serialAPartes(v % 1).hora;
  return horaTexto(v);
}

/** A class id, even when Sheets turned "2026-10-03 08:00" into a date-time serial. */
export function leerClaseId(v) {
  if (typeof v === "number" && Number.isFinite(v) && v > 20000) {
    const p = serialAPartes(v);
    return p.fecha + " " + p.hora;
  }
  const t = String(v ?? "").trim();
  const m = t.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  return m ? m[1] + " " + pad(Number(m[2])) + ":" + m[3] : t;
}

export function leerId(v) {
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.round(v));
  return String(v ?? "").trim();
}

export function leerTexto(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Numbers, also from text like "$158.000" or "158.000" (Colombian thousands). */
export function leerNumero(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const t = String(v ?? "").trim();
  if (!t) return 0;
  const limpio = t.replace(/[$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

/** Reads a raw cell by column kind. */
export function leerCelda(tipo, v) {
  switch (tipo) {
    case "fecha": return leerFecha(v);
    case "fechaHora": return leerFechaHora(v);
    case "hora": return leerHora(v);
    case "claseId": return leerClaseId(v);
    case "id": return leerId(v);
    case "numero": return leerNumero(v);
    case "valor": return typeof v === "number" ? v : leerTexto(v);
    default: return leerTexto(v);
  }
}

/* ── writing ─────────────────────────────────────────── */

/** Domain value → cell value, by column kind (the same for every driver). */
export function aCelda(tipo, v) {
  if (v === undefined || v === null || v === "") return "";
  switch (tipo) {
    case "fecha": return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? fechaASerial(v) : "";
    case "fechaHora": return typeof v === "number" ? msASerial(v) : "";
    case "numero": return Number(v) || 0;
    default: return typeof v === "number" ? v : String(v);
  }
}

/**
 * What the Sheets driver sends with USER_ENTERED for free text: a leading apostrophe keeps it a
 * literal string when it would otherwise become a formula (=, +, -, @: formula injection), a number
 * or a date. Sheets stores the text without the apostrophe.
 */
export function escaparTexto(v) {
  if (typeof v !== "string" || v === "") return v;
  if (/^[=+\-@\t\r]/.test(v) || /^[\s\d.,:/()$%+\-]+$/.test(v) || /^(true|false|verdadero|falso)$/i.test(v)) return "'" + v;
  return v;
}
