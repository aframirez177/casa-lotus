// «Cupo fijo» (a regular's weekly slot) in words. Staff screens and the clienta's home share these, and the demo
// adapter builds `slotTexto` with the same helper the server mirrors: «sábados 8:00 a. m.».
import { horaLegible, fechaUTC, DIAS, primerNombre, sumarDias, fechaLegible } from "./reglas.js";

const PLURAL = { Lunes: "lunes", Martes: "martes", Miércoles: "miércoles", Jueves: "jueves", Viernes: "viernes", Sábado: "sábados", Domingo: "domingos" };

/** «sábados 8:00 a. m.» from ("Sábado", "08:00"). */
export const slotTexto = (dia, hora) => `${PLURAL[dia] || String(dia || "").toLowerCase()} ${horaLegible(hora)}`;

/** «4 fijas de 8» on a slot card (staff only: never shown to the public). */
export const textoFijas = (n, cupos) => (n ? `${n} ${n === 1 ? "fija" : "fijas"} de ${cupos}` : "Sin fijas");

/** «sábado 24» — the short day a conflict talks about. */
export const diaCorto = (fecha) => `${DIAS[fechaUTC(fecha).getUTCDay()].toLowerCase()} ${fechaUTC(fecha).getUTCDate()}`;

/** «El sábado 24 está lleno: no se pudo reservar». */
export const textoConflicto = (c) => `El ${diaCorto(c.clase.fecha)} está ${c.motivo === "llena" || !c.motivo ? "lleno" : "cerrado"}: no se pudo reservar`;

/** «sábado 18, sábado 25 y sábado 1» */
export function listaDias(fechas) {
  const d = fechas.map(diaCorto);
  return d.length <= 1 ? d.join("") : `${d.slice(0, -1).join(", ")} y ${d[d.length - 1]}`;
}

/**
 * What adding a fijo did, in two or three short lines: who is now fixed, what got booked (and whether it waits
 * for a payment), and every class that was full.
 */
export function resumenAlta(nombre, r) {
  const creadas = r?.reservasCreadas || [];
  const conflictos = r?.conflictos || [];
  const sinPlan = creadas.filter((x) => x.estado === "Pendiente de pago").length;
  const lineas = [];
  if (creadas.length) lineas.push(`Reservamos ${listaDias(creadas.map((x) => x.clase.fecha))}.`);
  else if (!conflictos.length) lineas.push("Todavía no hay clases abiertas en esa franja: se reserva sola cuando se creen.");
  if (sinPlan) lineas.push(sinPlan === creadas.length ? "No tiene plan: quedaron apartadas esperando su pago." : `${sinPlan === 1 ? "Una quedó apartada" : sinPlan + " quedaron apartadas"} esperando su pago.`);
  return {
    titulo: `${primerNombre(nombre)} queda fija los ${r?.fijo?.slotTexto || ""}`.trim(),
    lineas,
    conflictos: conflictos.map(textoConflicto),
  };
}

export const ESTADO_FIJO = {
  Activo: { texto: "Activo", clase: "chip-ok" },
  Pausado: { texto: "Pausado", clase: "chip-aviso" },
  Terminado: { texto: "Terminado", clase: "" },
};

/**
 * Pausing from a date: the server keeps booking until `hasta` (the day before) and the pause starts after it.
 * From today (or a past date) there is no `hasta`: the pause starts now.
 */
export const hastaDePausa = (desde, hoy) => (desde && desde > hoy ? sumarDias(desde, -1) : "");

/** «Pausado», «Pausado desde el sábado 1 de noviembre», «Terminó el 15 de octubre». */
export function estadoFijoTexto(f, hoy) {
  if (f.estado === "Pausado") return f.hasta && f.hasta >= hoy ? `Pausado desde el ${fechaLegible(sumarDias(f.hasta, 1))}` : "Pausado";
  if (f.estado === "Terminado") return f.hasta ? `Terminó el ${fechaLegible(f.hasta).replace(/^\S+ /, "")}` : "Terminado";
  return f.hasta && f.hasta >= hoy ? `Activo hasta el ${fechaLegible(f.hasta)}` : "Activo";
}

/** A booking's Origen for people: «Cupo fijo · F-0001» reads «Cupo fijo». */
export const origenTexto = (o = "") => (/^Cupo fijo/.test(o) ? "Cupo fijo" : o);

/** `reservasCanceladas` is a list of bookings (a count from older servers): how many. */
export const cuantas = (x) => (Array.isArray(x) ? x.length : Number(x) || 0);

/** «1 clase volvió a su plan» / «3 clases volvieron a su plan» / "" */
export const textoDevueltas = (x) => { const n = cuantas(x); return n ? `${n === 1 ? "1 clase volvió" : n + " clases volvieron"} a su plan.` : ""; };
