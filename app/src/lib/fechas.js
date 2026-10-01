// Time words for people: «Faltan 20 horas», «hace 5 min», countdowns. Bogotá time via shared/reglas.js.
import { fechaLegible, horaLegible, partesBogota, hoyClave, sumarDias, fechaCorta } from "./reglas.js";

const plural = (n, uno, varios) => (n === 1 ? uno : varios.replace("#", n));

/** «Faltan 20 horas» / «Falta 1 hora» / «Faltan 40 minutos» / «Faltan 3 días» until `ms`. */
export function faltaTexto(ms, ahora = Date.now()) {
  const min = Math.max(0, Math.round((ms - ahora) / 60000));
  if (min < 60) return min <= 1 ? "Falta 1 minuto" : `Faltan ${min} minutos`;
  const h = Math.floor(min / 60);
  if (h < 48) return h === 1 ? "Falta 1 hora" : `Faltan ${h} horas`;
  const d = Math.floor(h / 24);
  return `Faltan ${d} días`;
}

/** «2 h 14 min», «14 min», «menos de 1 min» — for holds and live countdowns. */
export function duracionCorta(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  if (totalMin < 1) return "menos de 1 min";
  const d = Math.floor(totalMin / 1440), h = Math.floor((totalMin % 1440) / 60), m = totalMin % 60;
  if (d) return `${d} d ${h} h`;
  if (h) return m ? `${h} h ${m} min` : `${h} h`;
  return `${m} min`;
}

/** Big countdown parts: { d, h, m, s } until ms. */
export function partesCuenta(ms, ahora = Date.now()) {
  let t = Math.max(0, Math.floor((ms - ahora) / 1000));
  const d = Math.floor(t / 86400); t -= d * 86400;
  const h = Math.floor(t / 3600); t -= h * 3600;
  const m = Math.floor(t / 60);
  return { d, h, m, s: t - m * 60 };
}

/** «sábado 3 de octubre, 2:00 a. m.» from an ISO instant or epoch ms. */
export function momentoLegible(t) {
  const ms = typeof t === "number" ? t : Date.parse(t);
  if (!Number.isFinite(ms)) return "";
  const { fecha, hora } = partesBogota(ms);
  return `${diaRelativo(fecha)}, ${horaLegible(hora)}`;
}

/** «hoy», «mañana», «ayer» or «sábado 3 de octubre». */
export function diaRelativo(fecha, hoy = hoyClave()) {
  if (fecha === hoy) return "hoy";
  if (fecha === sumarDias(hoy, 1)) return "mañana";
  if (fecha === sumarDias(hoy, -1)) return "ayer";
  return fechaLegible(fecha);
}

/** «hace 5 min», «hace 3 h», «ayer», «sáb 3 oct». */
export function haceTexto(iso, ahora = Date.now()) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const min = Math.round((ahora - ms) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const { fecha } = partesBogota(ms);
  if (fecha === sumarDias(hoyClave(ahora), -1)) return "ayer";
  return fechaCorta(fecha);
}

/** «Buenos días» / «Buenas tardes» / «Buenas noches» by Bogotá hour. */
export function saludoHora(ahora = Date.now()) {
  const h = Number(partesBogota(ahora).hora.slice(0, 2));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

/** "yyyy-MM" of today in Bogotá, and a readable month. */
export const mesActual = (ahora = Date.now()) => hoyClave(ahora).slice(0, 7);
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function mesLegible(mes) {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}
export function mesMas(mes, n) {
  const [y, m] = mes.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0");
}

export { plural };
