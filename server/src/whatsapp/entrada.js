// Parses Meta's webhook notifications into plain records. Pure functions: no I/O, no clock
// except the fallback for a missing timestamp, so every case is unit-testable with fixtures.
//
// Shape (Cloud API): { object: "whatsapp_business_account", entry: [{ id: <WABA_ID>, changes: [{ field, value }] }] }
//   field "messages": value.metadata.phone_number_id, value.contacts[], value.messages[], value.statuses[], value.errors[]
//   field "message_template_status_update" | "template_category_update": template news
//   field "user_preferences": she stopped / resumed marketing messages from WhatsApp itself
//   field "smb_message_echoes": coexistence only, messages sent from the Business app on the phone
//   anything else (history, smb_app_state_sync, quality updates…): returned in `otros` so the caller can log it.

import { ESTADO_META } from "./almacen.js";

const MAX_TEXTO = 4096;
const recorta = (s, n = MAX_TEXTO) => String(s ?? "").slice(0, n);

function tsMs(segundos, ahora) {
  const n = Number(segundos);
  return Number.isFinite(n) && n > 1e9 ? n * 1000 : ahora;
}

/** Digits-only WhatsApp id ("573001234567"), or "" when it is not one. */
export function waId(v) {
  const s = String(v ?? "").trim();
  return /^\d{6,20}$/.test(s) ? s : "";
}

/**
 * Business-scoped user id (BSUID, e.g. "CO.1234…"), or "". Since 2026 every messages webhook
 * carries it, and a contact who uses a WhatsApp username may arrive WITHOUT a phone number.
 */
export function bsuid(v) {
  const s = String(v ?? "").trim();
  return /^[A-Za-z]{2}\.[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/.test(s) ? s : "";
}

const MEDIA = { image: ["imagen", "Foto"], sticker: ["imagen", "Sticker"], audio: ["audio", "Audio"], video: ["documento", "Video"], document: ["documento", "Documento"] };

/**
 * One inbound message → { metaId, de, tsMs, tipo, texto, vistaPrevia, media?, datos?, respondeA?, error?, errorCodigo?, abreVentana, cuentaComoNoLeido }
 * `tipo` is CONTRATO's Mensaje.tipo; `media.tipo` keeps Meta's precise kind (video, sticker, voice…).
 */
export function leerMensaje(m, ahora = Date.now()) {
  const base = {
    metaId: String(m?.id ?? ""),
    de: waId(m?.from),
    usuarioId: bsuid(m?.from_user_id),
    tsMs: tsMs(m?.timestamp, ahora),
    respondeA: m?.context?.id ? String(m.context.id) : undefined,
    abreVentana: true,
    cuentaComoNoLeido: true,
  };
  const datos = {};
  if (m?.referral && typeof m.referral === "object") {
    // Click-to-WhatsApp ad: keep the ad ids for attribution (the studio pays a commission on attributed sales).
    const r = m.referral;
    datos.referido = { origen: r.source_type, id: r.source_id, url: r.source_url, titulo: recorta(r.headline, 200), ctwaClid: r.ctwa_clid };
  }
  if (m?.context?.forwarded || m?.context?.frequently_forwarded) datos.reenviado = true;

  const t = m?.type;
  let r;
  if (t === "text") {
    const texto = recorta(m.text?.body);
    r = { tipo: "texto", texto, vistaPrevia: texto };
  } else if (MEDIA[t]) {
    const o = m[t] || {};
    const [tipo, etiqueta] = MEDIA[t];
    const esNota = t === "audio" && o.voice === true;
    const caption = recorta(o.caption, 1024);
    const nombreArchivo = t === "document" ? recorta(o.filename, 200) : "";
    const texto = caption || (nombreArchivo ? `${etiqueta}: ${nombreArchivo}` : esNota ? "Nota de voz" : etiqueta);
    r = {
      tipo, texto, vistaPrevia: caption ? `${etiqueta}: ${caption}` : texto,
      media: { tipo: esNota ? "voz" : t === "image" ? "imagen" : t === "document" ? "documento" : t, id: String(o.id ?? ""), mime: String(o.mime_type ?? ""), ...(nombreArchivo ? { nombre: nombreArchivo } : {}) },
    };
  } else if (t === "location") {
    const o = m.location || {};
    const lugar = [o.name, o.address].filter(Boolean).join(", ");
    datos.ubicacion = { lat: Number(o.latitude), lng: Number(o.longitude), nombre: o.name || "", direccion: o.address || "", url: o.url || "" };
    r = { tipo: "ubicacion", texto: lugar ? `Ubicación: ${recorta(lugar, 300)}` : "Ubicación compartida" };
  } else if (t === "interactive") {
    const i = m.interactive || {};
    const resp = i.button_reply || i.list_reply;
    if (resp) {
      datos.respuesta = { tipo: i.type, id: String(resp.id ?? ""), titulo: recorta(resp.title, 200) };
      r = { tipo: "interactivo", texto: recorta(resp.title, 200) || "Respuesta" };
    } else if (i.nfm_reply) {
      datos.respuesta = { tipo: "nfm_reply", nombre: i.nfm_reply.name || "", json: recorta(i.nfm_reply.response_json, 2000) };
      r = { tipo: "interactivo", texto: "Respondió un formulario" };
    } else {
      r = { tipo: "interactivo", texto: "Respuesta" };
    }
  } else if (t === "button") {
    // Quick-reply button of a template we sent (e.g. «Necesito cancelar» in recordatorio_clase).
    const texto = recorta(m.button?.text, 200);
    datos.respuesta = { tipo: "boton", id: String(m.button?.payload ?? ""), titulo: texto };
    r = { tipo: "interactivo", texto: texto || "Botón" };
  } else if (t === "reaction") {
    const emoji = String(m.reaction?.emoji ?? "");
    datos.reaccion = { a: String(m.reaction?.message_id ?? ""), emoji };
    // A reaction does not ring or count as unread, but it is a message from her, so it does open the window.
    r = { tipo: "reaccion", texto: emoji ? `Reaccionó ${emoji}` : "Quitó su reacción", cuentaComoNoLeido: false };
  } else if (t === "contacts") {
    const c = Array.isArray(m.contacts) ? m.contacts : [];
    const nombres = c.map((x) => x?.name?.formatted_name).filter(Boolean);
    datos.contactos = c.slice(0, 5).map((x) => ({ nombre: x?.name?.formatted_name || "", telefonos: (x?.phones || []).map((p) => p?.wa_id || p?.phone).filter(Boolean).slice(0, 3) }));
    r = { tipo: "sistema", texto: nombres.length ? `Compartió un contacto: ${recorta(nombres.join(", "), 200)}` : "Compartió un contacto" };
  } else if (t === "order") {
    r = { tipo: "sistema", texto: "Envió un pedido del catálogo" };
  } else if (t === "system") {
    const s = m.system || {};
    if (s.type === "user_changed_number" || s.wa_id) datos.nuevoNumero = waId(s.wa_id || s.new_wa_id);
    r = { tipo: "sistema", texto: recorta(s.body, 300) || "Aviso de WhatsApp", abreVentana: false, cuentaComoNoLeido: false };
  } else if (t === "request_welcome") {
    r = { tipo: "sistema", texto: "Abrió el chat por primera vez", cuentaComoNoLeido: false };
  } else {
    // "unsupported" / "unknown" or a type this code does not know yet: keep the error so Ana knows to check the phone.
    const e = Array.isArray(m?.errors) ? m.errors[0] : null;
    r = {
      tipo: "sistema", texto: "Mensaje que WhatsApp no deja ver aquí. Revísalo en el celular.",
      ...(e ? { error: recorta(e.error_data?.details || e.title || e.message, 300), errorCodigo: Number(e.code) || null } : {}),
    };
    datos.tipoMeta = String(t ?? "");
  }
  return { ...base, ...r, ...(Object.keys(datos).length ? { datos } : {}) };
}

/** One status → { metaId, estado, tsMs, destinatario, errorCodigo?, error?, categoria?, cobrable?, tipoPrecio? } or null. */
export function leerEstado(s, ahora = Date.now()) {
  const estado = ESTADO_META[s?.status];
  if (!estado || !s?.id) return null;
  const e = Array.isArray(s.errors) ? s.errors[0] : null;
  const p = s.pricing || {};
  return {
    metaId: String(s.id),
    estado,
    tsMs: tsMs(s.timestamp, ahora),
    destinatario: waId(s.recipient_id) || null,
    destinatarioUsuario: bsuid(s.recipient_user_id) || null,
    ...(e ? { errorCodigo: Number(e.code) || null, errorTitulo: recorta(e.title || e.message, 200), errorDetalle: recorta(e.error_data?.details, 300) } : {}),
    ...(p.category ? { categoria: String(p.category).toLowerCase(), cobrable: p.billable === true, tipoPrecio: p.type ? String(p.type) : null } : {}),
  };
}

const ESTADOS_PLANTILLA = new Set([
  "APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED", "IN_APPEAL", "PENDING_DELETION", "DELETED",
  "FLAGGED", "REINSTATED", "LIMIT_EXCEEDED", "ARCHIVED", "UNARCHIVED", "LOCKED",
]);

/**
 * Whole notification → { mensajes, ecos, estados, plantillas, preferencias, errores, otros }.
 * Every record carries `phoneNumberId` (messages, statuses) so the caller can ignore other numbers.
 */
export function leerNotificacion(payload, ahora = Date.now()) {
  const out = { mensajes: [], ecos: [], estados: [], plantillas: [], preferencias: [], errores: [], otros: [] };
  if (!payload || payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) return out;

  for (const entrada of payload.entry) {
    for (const cambio of Array.isArray(entrada?.changes) ? entrada.changes : []) {
      const valor = cambio?.value || {};
      const campo = cambio?.field;
      if (campo === "messages") {
        const phoneNumberId = String(valor.metadata?.phone_number_id ?? "");
        const contactos = Array.isArray(valor.contacts) ? valor.contacts : [];
        // The sender's contact entry: matched by number or BSUID; a lone entry only when the message names neither.
        const contactoDe = (msg) => contactos.find((c) => (msg.de && waId(c?.wa_id) === msg.de) || (msg.usuarioId && bsuid(c?.user_id) === msg.usuarioId))
          || (!msg.de && !msg.usuarioId && contactos.length === 1 ? contactos[0] : null);
        for (const m of Array.isArray(valor.messages) ? valor.messages : []) {
          const msg = leerMensaje(m, ahora);
          const c = contactoDe(msg);
          if (!msg.de && c) msg.de = waId(c.wa_id);
          if (!msg.usuarioId && c) msg.usuarioId = bsuid(c.user_id);
          if (!msg.metaId || (!msg.de && !msg.usuarioId)) { out.otros.push({ campo, motivo: "mensaje sin id o sin remitente" }); continue; }
          out.mensajes.push({
            ...msg, phoneNumberId,
            perfil: recorta(c?.profile?.name, 120).trim(),
            usuario: recorta(c?.profile?.username, 60).trim() || null,
          });
        }
        for (const s of Array.isArray(valor.statuses) ? valor.statuses : []) {
          const e = leerEstado(s, ahora);
          if (e) out.estados.push({ ...e, phoneNumberId });
        }
        for (const e of Array.isArray(valor.errors) ? valor.errors : []) {
          out.errores.push({ phoneNumberId, codigo: Number(e?.code) || null, titulo: recorta(e?.title || e?.message, 200), detalle: recorta(e?.error_data?.details, 300) });
        }
      } else if (campo === "smb_message_echoes") {
        // Coexistence: what Ana sends from the WhatsApp Business app on her phone, echoed to the API.
        const phoneNumberId = String(valor.metadata?.phone_number_id ?? "");
        for (const e of Array.isArray(valor.message_echoes) ? valor.message_echoes : []) {
          const msg = leerMensaje({ ...e, from: e?.to, from_user_id: e?.to_user_id }, ahora);
          if (!msg.metaId || (!msg.de && !msg.usuarioId)) continue;
          out.ecos.push({ ...msg, phoneNumberId });
        }
      } else if (campo === "user_preferences") {
        // She tapped «stop / resume marketing messages» in WhatsApp itself.
        for (const p of Array.isArray(valor.user_preferences) ? valor.user_preferences : []) {
          const valorPref = String(p?.value ?? "").toLowerCase();
          if (!["stop", "resume"].includes(valorPref)) continue;
          out.preferencias.push({ whatsapp: waId(p?.wa_id) || null, usuarioId: bsuid(p?.user_id) || null, categoria: String(p?.category ?? ""), valor: valorPref });
        }
      } else if (campo === "message_template_status_update") {
        const evento = String(valor.event ?? "").toUpperCase();
        if (!valor.message_template_name || !ESTADOS_PLANTILLA.has(evento)) { out.otros.push({ campo, valor }); continue; }
        out.plantillas.push({
          tipo: "estado", nombre: String(valor.message_template_name), idioma: String(valor.message_template_language || "es"),
          metaId: valor.message_template_id != null ? String(valor.message_template_id) : null, estado: evento,
          motivo: valor.reason && valor.reason !== "NONE" ? recorta(valor.reason, 300) : null,
        });
      } else if (campo === "template_category_update") {
        if (!valor.message_template_name) { out.otros.push({ campo, valor }); continue; }
        out.plantillas.push({
          tipo: "categoria", nombre: String(valor.message_template_name), idioma: String(valor.message_template_language || "es"),
          metaId: valor.message_template_id != null ? String(valor.message_template_id) : null,
          categoria: String(valor.new_category || valor.correct_category || "").toUpperCase() || null,
        });
      } else {
        out.otros.push({ campo, valor });
      }
    }
  }
  return out;
}
