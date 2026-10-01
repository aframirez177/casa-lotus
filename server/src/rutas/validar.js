// Casa Lotus · zod → CONTRATO §4 validation errors ({ campos: { "perfil.nombre": "mensaje" } }).
import { validacion } from "../errores.js";

const INGLES = /^(Invalid|Too|Expected|Unrecognized|Required|Number must|String must|Array must)/;

function mensaje(issue) {
  if (issue.message && !INGLES.test(issue.message)) return issue.message;
  switch (issue.code) {
    case "invalid_type": return issue.input === undefined ? "Este dato es obligatorio." : "Revisa este dato.";
    case "too_small": return issue.origin === "array" ? "Elige al menos " + issue.minimum + "." : "Es muy corto.";
    case "too_big": return issue.origin === "array" ? "Elige máximo " + issue.maximum + "." : "Es muy largo.";
    case "invalid_format": return "Revisa el formato.";
    case "invalid_value": return "Elige una opción de la lista.";
    default: return "Revisa este dato.";
  }
}

export function errorZod(error) {
  const campos = {};
  for (const i of error.issues) {
    const k = i.path.join(".") || "_";
    if (!campos[k]) campos[k] = mensaje(i);
  }
  const primero = Object.values(campos)[0];
  return validacion(Object.keys(campos).length === 1 && primero ? primero : "Revisa los datos marcados.", campos);
}

export function validar(esquema, datos) {
  const r = esquema.safeParse(datos ?? {});
  if (!r.success) throw errorZod(r.error);
  return r.data;
}
