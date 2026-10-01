// Where the future WhatsApp AI agent plugs in. Nothing here calls a model today.
//
// Flow once it exists:
//
//   Meta webhook ─► rutasWebhook (signature) ─► nucleo.procesarMensaje
//        │  stores the message, links the clienta / lead, rings Ana's app (publicar)
//        └─► agente.alRecibirMensaje({ conversacion, mensaje, clienta, historial })
//               │  decides: answer, call tools, or hand over to Ana
//               ├─► tools from src/herramientas/ (CONTRATO §7): the SAME domain functions the REST
//               │   routes use (disponibilidad, reservar, cancelar, reagendar, saldo…), called with
//               │   actor { tipo: "ia", nombre: "Asistente Casa Lotus" } so every write is audited
//               └─► wa.enviarTexto(whatsapp, texto, actor)   ← refuses outside the 24 h window
//
// Guardrails the agent must keep (docs/whatsapp/guia-whatsapp-cloud-api.md §5 cites the policy):
// - Business tasks only (bookings, schedule, plans, payments instructions, studio FAQs). Meta's
//   Business Solution Terms bar general-purpose AI assistants on the WhatsApp Business Platform.
// - Say it is an automated assistant and hand over to a person on request or when unsure:
//   set conversacion.etiquetas += "humano" and stop answering that conversation until Ana closes it.
// - Never ask for health details, card numbers or ID numbers on WhatsApp. Health data is a
//   special category (Ley 1581 de 2012): the ficha in the app collects it, with its own consent.
// - Never confirm a payment by itself: Ana confirms payments (POST /api/admin/reservas/:id/confirmar).
// - Respect BAJA: conversations whose number is in wa_bajas get answers only when she writes.
// - Free-form replies only inside the 24 h window; outside it, templates only.
//
// Contract the agent implements (all async, all optional):
//   alRecibirMensaje({ conversacion, mensaje, clienta }) → void
//     conversacion: CONTRATO Conversacion · mensaje: CONTRATO Mensaje · clienta: ClientaFila | null
//   Errors are caught and logged by the caller: a failing agent never blocks the inbox.

/** Tag that hands a conversation to a person: the agent stays quiet while it is present. */
export const ETIQUETA_HUMANO = "humano";

/**
 * Returns the agent, or null while there is none (today). The server can later pass
 * `crearWhatsApp({ ..., ia: agente })`; until then the inbox works exactly the same without it.
 */
export function crearAgenteIA(opciones = {}) {
  if (opciones?.agente && typeof opciones.agente.alRecibirMensaje === "function") return opciones.agente;
  return null;
}

/** True when the agent may answer this conversation by itself. */
export function agentePuedeResponder(conversacion) {
  return Boolean(conversacion) && conversacion.estado === "abierta" && !(conversacion.etiquetas || []).includes(ETIQUETA_HUMANO);
}
