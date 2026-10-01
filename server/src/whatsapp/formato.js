// Rows → CONTRATO §6 objects (Conversacion, Mensaje), and the 24-hour customer service window.

import { desjson } from "./almacen.js";
import { whatsappLegible } from "../../../shared/reglas.js";

/** Meta's customer service window: 24 h from her last message. */
export const VENTANA_MS = 24 * 3600 * 1000;
/** We stop free text a little early so a message typed at 23:59 is not refused by Meta in flight. */
export const MARGEN_VENTANA_MS = 2 * 60 * 1000;

/** True while free-form messages are allowed (and free) for a conversation whose last inbound message was at `desdeMs`. */
export function ventanaAbierta(desdeMs, ahoraMs = Date.now()) {
  const d = Number(desdeMs);
  return Number.isFinite(d) && d > 0 && ahoraMs < d + VENTANA_MS - MARGEN_VENTANA_MS;
}

/** ISO instant when the window closes, or null when it is closed (or never opened). */
export function ventanaHasta(desdeMs, ahoraMs = Date.now()) {
  return ventanaAbierta(desdeMs, ahoraMs) ? new Date(Number(desdeMs) + VENTANA_MS - MARGEN_VENTANA_MS).toISOString() : null;
}

export function aConversacion(f, ahoraMs = Date.now()) {
  if (!f) return null;
  const c = {
    id: f.id,
    whatsapp: f.whatsapp || "",            // "" for a contact who only shared her WhatsApp username
    whatsappTexto: f.whatsapp ? whatsappLegible(f.whatsapp) : "",
    nombre: f.clienta_nombre || f.nombre || f.perfil || (f.whatsapp ? whatsappLegible(f.whatsapp) : f.usuario ? "@" + f.usuario : "Contacto de WhatsApp"),
    perfil: f.perfil || "",
    ultimoMensaje: f.ultimo_ts ? { texto: f.ultimo_texto, ts: f.ultimo_ts, direccion: f.ultima_direccion } : null,
    noLeidos: f.no_leidos,
    ventanaHasta: ventanaHasta(f.ventana_desde_ms, ahoraMs),
    estado: f.estado,
    etiquetas: desjson(f.etiquetas, []),
  };
  if (f.usuario) c.usuario = f.usuario;
  if (f.clienta) c.clienta = { id: f.clienta, nombre: f.clienta_nombre || "", etapa: f.clienta_etapa || "" };
  return c;
}

export function aMensaje(f) {
  if (!f) return null;
  const m = {
    id: f.id,
    conversacion: f.conversacion,
    direccion: f.direccion,
    tipo: f.tipo,
    texto: f.texto,
    estado: f.estado,
    ts: f.ts,
    autor: { tipo: f.autor_tipo, nombre: f.autor_nombre },
  };
  if (f.plantilla) m.plantilla = f.plantilla;
  const media = desjson(f.media);
  if (media) m.media = media;
  const datos = desjson(f.datos);
  if (datos) m.datos = datos;
  if (f.responde_a) m.respondeA = f.responde_a;
  if (f.error) m.error = f.error;
  return m;
}
