// Casa Lotus · WhatsApp Cloud API module (CRM inbox + templates + webhook).
// Usage and contract: ./README.md. Platform contract: ../../../shared/CONTRATO.md §6 «CRM · WhatsApp».

import { crearNucleo } from "./nucleo.js";

export { WhatsAppError } from "./errores.js";
export { PLANTILLAS } from "./plantillas.js";

/**
 * @param {object} o
 * @param {object} o.config     config.whatsapp: { token, phoneNumberId, wabaId, appSecret, verifyToken, graphVersion, modo } (falls back to WHATSAPP_* env vars)
 * @param {import("node:sqlite").DatabaseSync} o.db
 * @param {object} o.dominio    { buscarClientaPorWhatsApp(numero), crearLead({ nombre, whatsapp }), buscarClientaPorId?(id), registrarBaja?(numero) } (sync or async)
 * @param {(evento: object) => void} o.publicar  rings Ana's app
 * @param {object} [o.log]      console-like
 * @param {(e: { accion, objeto, detalle, actor }) => void} [o.auditar]
 * @param {typeof fetch} [o.fetch]  injectable for tests
 */
export async function crearWhatsApp(o = {}) {
  const nucleo = await crearNucleo(o);
  let rutas;
  try {
    rutas = await import("./rutas.js");
  } catch (e) {
    throw new Error(`crearWhatsApp: no se pudo cargar Express para las rutas (${e?.message}). Instala express en web/server.`);
  }
  const log = o.log ?? console;

  return {
    configurado: nucleo.configurado,
    rutasAdmin: rutas.crearRutasAdmin(nucleo, { log }),
    rutasWebhook: rutas.crearRutasWebhook(nucleo, { log }),
    estado: nucleo.estado,
    enviarTexto: nucleo.enviarTexto,
    enviarPlantilla: nucleo.enviarPlantilla,
    enviarCodigo: nucleo.enviarCodigo,
    resumenConversacion: nucleo.resumenConversacion,
    // Extras for the server agent (additive to the agreed interface):
    optIn: nucleo.optIn,
    listarPlantillas: nucleo.listarPlantillas,
    sincronizarPlantillas: nucleo.sincronizarPlantillas,
    enviarPlantillasAMeta: nucleo.enviarPlantillasAMeta,
    resumenConfig: nucleo.resumenConfig,
    esperarPendientes: nucleo.esperarPendientes,
  };
}
