// The ficha's rules without any UI, so the booking flow can check a step before its form is even loaded.
// Booking asks only what a profe needs before the first class (salud, contacto de emergencia, experiencia)
// and the agreements; the rest of Ana's form («Completa tu perfil») is optional and comes after booking.
import { SALUD_SIN_DATOS, normalizaWhatsApp } from "../../lib/reglas.js";

export const PERFIL_VACIO = {
  nombre: "", whatsapp: "", correo: "", nacimiento: "", barrio: "", intereses: [], salud: "", eps: "",
  contactoEmergencia: { nombre: "", whatsapp: "" }, experiencia: "", llego: "",
};

/** She wrote something about her health (not «Ninguna» nor «Prefiero contárselo…»). */
export const escribioSalud = (salud) => Boolean(salud && salud !== "__contar" && !SALUD_SIN_DATOS.includes(salud));

/** Same rule as the server's `pideFicha`: the safety answers a profe needs are missing. */
export const faltaFicha = (p = {}) => !p.salud || !p.contactoEmergencia?.nombre || !p.contactoEmergencia?.whatsapp;
/** Same rule as the server's `pideAcuerdos`: datos, descargo or the image choice are missing. */
export const faltanAcuerdos = (c = {}) => !c.datos?.acepta || !c.descargo?.acepta || typeof c.imagen?.acepta !== "boolean";

/** The optional «Completa tu perfil» fields, and whether any is still empty. */
export const CAMPOS_PERFIL = ["nacimiento", "barrio", "intereses", "eps", "llego"];
export const perfilPorCompletar = (p = {}) => CAMPOS_PERFIL.some((k) => (Array.isArray(p[k]) ? !p[k].length : !p[k]));

export function validarTu(p) {
  const e = {};
  if (!p.nombre || p.nombre.trim().length < 2) e.nombre = "Escribe tu nombre y apellido.";
  if (!normalizaWhatsApp(p.whatsapp)) e.whatsapp = "Escribe tu celular de 10 dígitos, como 300 123 4567.";
  if (p.correo && !/^\S+@\S+\.\S+$/.test(p.correo)) e.correo = "Revisa el correo.";
  return e;
}
export function validarFicha(p) {
  const e = {};
  if (!p.salud || p.salud === "__contar") e.salud = "Cuéntanos si tienes alguna condición, o elige una opción.";
  if (!p.contactoEmergencia?.nombre?.trim()) e.contactoNombre = "¿A quién llamamos si hace falta?";
  if (!normalizaWhatsApp(p.contactoEmergencia?.whatsapp)) e.contactoWhatsapp = "Su celular de 10 dígitos.";
  if (!p.experiencia) e.experiencia = "Elige una opción.";
  return e;
}
/** Booking agreements: datos + descargo in one box, the image choice, and the health one only if she wrote about it. */
export function validarAcuerdos(c, { completos = true, conSensibles = false } = {}) {
  const e = {};
  if (completos && (!c.datos?.acepta || !c.descargo?.acepta)) e.acuerdos = "Para reservar necesitamos que los aceptes.";
  if (completos && typeof c.imagen?.acepta !== "boolean") e.imagen = "Elige una de las dos opciones.";
  if (conSensibles && typeof c.sensibles?.acepta !== "boolean") e.sensibles = "Elige si podemos guardar lo que escribiste.";
  return e;
}
