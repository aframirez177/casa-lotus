// The ficha's rules without any UI, so the booking flow can check a step before its form is even loaded.
import { SALUD_SIN_DATOS, normalizaWhatsApp } from "../../lib/reglas.js";

export const PERFIL_VACIO = {
  nombre: "", whatsapp: "", correo: "", nacimiento: "", barrio: "", intereses: [], salud: "", eps: "",
  contactoEmergencia: { nombre: "", whatsapp: "" }, experiencia: "", llego: "",
};

/** She wrote something about her health (not «Ninguna» nor «Prefiero contárselo…»). */
export const escribioSalud = (salud) => Boolean(salud && !SALUD_SIN_DATOS.includes(salud));

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
export function validarAcuerdos(c) {
  const e = {};
  if (!c.descargo?.acepta) e.descargo = "Para tomar la clase necesitamos que lo aceptes.";
  if (!c.datos?.acepta) e.datos = "Sin esta autorización no podemos guardar tu reserva.";
  if (typeof c.imagen?.acepta !== "boolean") e.imagen = "Elige una de las dos opciones.";
  return e;
}

