// Opt-out («BAJA») and opt-back-in («ALTA») keywords.
//
// Only short messages that are clearly a request to stop count: a whole-message match after
// removing accents, punctuation and emojis. «cancelar» alone is NOT an opt-out here: at Casa Lotus
// it means cancelling a class, and treating it as a BAJA would silently stop her reminders.

import { plano } from "./almacen.js";

const BAJA = new Set([
  "stop", "baja", "darme de baja", "dar de baja", "de baja", "me doy de baja", "quiero darme de baja",
  "no mas", "no mas mensajes", "no quiero mas mensajes", "no me envien mas mensajes", "no me escriban mas",
  "no me manden mas mensajes", "no enviar mas", "parar", "detener", "detener promociones", "stop promotions",
  "unsubscribe", "cancelar suscripcion", "eliminar suscripcion", "salir", "basta",
]);

const ALTA = new Set(["alta", "start", "volver", "quiero volver a recibir mensajes", "suscribir", "suscribirme", "reanudar"]);

/** Lowercase, no accents, no punctuation or emojis, single spaces. */
export function normalizarPalabra(texto) {
  return plano(texto).replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** "baja" | "alta" | null for an inbound text. Long messages never count (they are conversations). */
export function intencionSuscripcion(texto) {
  const t = normalizarPalabra(texto);
  if (!t || t.length > 40) return null;
  if (BAJA.has(t)) return "baja";
  if (ALTA.has(t)) return "alta";
  return null;
}

export const TEXTO_BAJA_CONFIRMADA =
  "Listo, no te enviaremos más mensajes automáticos por aquí. Si quieres reservar o tienes una pregunta, puedes escribirnos cuando quieras. " +
  "Para volver a recibir recordatorios, responde ALTA.";

export const TEXTO_ALTA_CONFIRMADA = "¡Qué bueno tenerte de vuelta! Volverás a recibir tus recordatorios y avisos de clases por aquí.";
