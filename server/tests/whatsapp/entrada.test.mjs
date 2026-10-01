// Parsing every inbound message type, statuses and template updates.

import { test } from "node:test";
import assert from "node:assert/strict";
import { leerMensaje, leerEstado, leerNotificacion } from "../../src/whatsapp/entrada.js";
import { notificacion, valorMensajes, T0 } from "./ayuda.mjs";

const ts = String(Math.floor(T0 / 1000));
const base = (type, extra) => ({ from: "573001112233", id: "wamid.X", timestamp: ts, type, ...extra });

test("text", () => {
  const m = leerMensaje(base("text", { text: { body: "Hola" } }));
  assert.equal(m.tipo, "texto");
  assert.equal(m.texto, "Hola");
  assert.equal(m.tsMs, T0);
  assert.equal(m.de, "573001112233");
});

test("image, sticker, audio (voice note), video, document keep only media metadata", () => {
  const img = leerMensaje(base("image", { image: { id: "MEDIA1", mime_type: "image/jpeg", sha256: "x", caption: "Mi comprobante" } }));
  assert.equal(img.tipo, "imagen");
  assert.deepEqual(img.media, { tipo: "imagen", id: "MEDIA1", mime: "image/jpeg" });
  assert.equal(img.texto, "Mi comprobante");
  assert.equal(img.vistaPrevia, "Foto: Mi comprobante");

  const voz = leerMensaje(base("audio", { audio: { id: "MEDIA2", mime_type: "audio/ogg; codecs=opus", voice: true } }));
  assert.equal(voz.tipo, "audio");
  assert.equal(voz.media.tipo, "voz");
  assert.equal(voz.texto, "Nota de voz");

  const doc = leerMensaje(base("document", { document: { id: "MEDIA3", mime_type: "application/pdf", filename: "pago.pdf" } }));
  assert.equal(doc.tipo, "documento");
  assert.equal(doc.media.nombre, "pago.pdf");
  assert.equal(doc.texto, "Documento: pago.pdf");

  const vid = leerMensaje(base("video", { video: { id: "MEDIA4", mime_type: "video/mp4" } }));
  assert.equal(vid.tipo, "documento");
  assert.equal(vid.media.tipo, "video");

  const st = leerMensaje(base("sticker", { sticker: { id: "MEDIA5", mime_type: "image/webp", animated: false } }));
  assert.equal(st.tipo, "imagen");
  assert.equal(st.media.tipo, "sticker");
});

test("location", () => {
  const m = leerMensaje(base("location", { location: { latitude: 4.65, longitude: -74.05, name: "Parque", address: "Calle 1" } }));
  assert.equal(m.tipo, "ubicacion");
  assert.equal(m.texto, "Ubicación: Parque, Calle 1");
  assert.equal(m.datos.ubicacion.lat, 4.65);
});

test("interactive button and list replies, and template quick-reply buttons", () => {
  const b = leerMensaje(base("interactive", { interactive: { type: "button_reply", button_reply: { id: "si", title: "Sí" } } }));
  assert.equal(b.tipo, "interactivo");
  assert.equal(b.texto, "Sí");
  assert.deepEqual(b.datos.respuesta, { tipo: "button_reply", id: "si", titulo: "Sí" });

  const l = leerMensaje(base("interactive", { interactive: { type: "list_reply", list_reply: { id: "sab-0800", title: "Sábado 8:00", description: "Pilates" } } }));
  assert.equal(l.texto, "Sábado 8:00");

  const q = leerMensaje(base("button", { button: { payload: "Necesito cancelar", text: "Necesito cancelar" }, context: { from: "15550001111", id: "wamid.RECORDATORIO" } }));
  assert.equal(q.tipo, "interactivo");
  assert.equal(q.texto, "Necesito cancelar");
  assert.equal(q.respondeA, "wamid.RECORDATORIO");
});

test("reaction does not count as unread", () => {
  const r = leerMensaje(base("reaction", { reaction: { message_id: "wamid.SALIDA1", emoji: "❤️" } }));
  assert.equal(r.tipo, "reaccion");
  assert.equal(r.cuentaComoNoLeido, false);
  assert.equal(r.datos.reaccion.a, "wamid.SALIDA1");
  assert.equal(leerMensaje(base("reaction", { reaction: { message_id: "wamid.SALIDA1", emoji: "" } })).texto, "Quitó su reacción");
});

test("unsupported and unknown types keep Meta's error and say to check the phone", () => {
  const u = leerMensaje(base("unsupported", { errors: [{ code: 131051, title: "Message type unknown", error_data: { details: "Message type is currently not supported." } }] }));
  assert.equal(u.tipo, "sistema");
  assert.equal(u.errorCodigo, 131051);
  assert.match(u.texto, /celular/);
  assert.equal(leerMensaje(base("algo_nuevo", {})).datos.tipoMeta, "algo_nuevo");
});

test("contacts, system and click-to-WhatsApp referral", () => {
  const c = leerMensaje(base("contacts", { contacts: [{ name: { formatted_name: "Ana" }, phones: [{ phone: "+57 300", wa_id: "57300" }] }] }));
  assert.equal(c.texto, "Compartió un contacto: Ana");
  const s = leerMensaje(base("system", { system: { body: "Cambió de número", type: "user_changed_number", wa_id: "573009998877" } }));
  assert.equal(s.abreVentana, false);
  assert.equal(s.datos.nuevoNumero, "573009998877");
  const ad = leerMensaje(base("text", { text: { body: "Info" }, referral: { source_type: "ad", source_id: "123", source_url: "https://fb.me/x", headline: "Yoga aéreo", ctwa_clid: "ARAkLk" } }));
  assert.equal(ad.datos.referido.ctwaClid, "ARAkLk");
});

test("statuses map to CONTRATO states with pricing and errors", () => {
  const e = leerEstado({ id: "wamid.S", status: "delivered", timestamp: ts, recipient_id: "573001112233", pricing: { billable: true, pricing_model: "PMP", category: "utility", type: "regular" } });
  assert.deepEqual({ estado: e.estado, categoria: e.categoria, cobrable: e.cobrable, tipoPrecio: e.tipoPrecio }, { estado: "entregado", categoria: "utility", cobrable: true, tipoPrecio: "regular" });
  const f = leerEstado({ id: "wamid.S", status: "failed", timestamp: ts, recipient_id: "573001112233", errors: [{ code: 131047, title: "Re-engagement message" }] });
  assert.equal(f.estado, "fallido");
  assert.equal(f.errorCodigo, 131047);
  assert.equal(leerEstado({ id: "x", status: "weird" }), null);
});

test("notification: messages carry the profile name; template updates are parsed; other fields go to `otros`", () => {
  const n = leerNotificacion(notificacion(valorMensajes({
    contactos: [{ profile: { name: "Laura" }, wa_id: "573001112233" }],
    mensajes: [base("text", { text: { body: "Hola" } })],
    estados: [{ id: "wamid.S", status: "read", timestamp: ts, recipient_id: "573001112233" }],
  })));
  assert.equal(n.mensajes[0].perfil, "Laura");
  assert.equal(n.estados[0].estado, "leido");

  const t = leerNotificacion(notificacion({ event: "APPROVED", message_template_id: 123, message_template_name: "recordatorio_clase", message_template_language: "es", reason: "NONE" }, "message_template_status_update"));
  assert.deepEqual(t.plantillas[0], { tipo: "estado", nombre: "recordatorio_clase", idioma: "es", metaId: "123", estado: "APPROVED", motivo: null });

  const c = leerNotificacion(notificacion({ message_template_id: 9, message_template_name: "saldo_bajo", message_template_language: "es", previous_category: "UTILITY", new_category: "MARKETING" }, "template_category_update"));
  assert.equal(c.plantillas[0].categoria, "MARKETING");

  const o = leerNotificacion(notificacion({ phone_number: "x" }, "phone_number_quality_update"));
  assert.equal(o.otros[0].campo, "phone_number_quality_update");

  assert.deepEqual(leerNotificacion({ object: "page", entry: [] }).mensajes, []);
  assert.deepEqual(leerNotificacion(null).mensajes, []);
});

test("a message without a valid sender is skipped, not crashed on", () => {
  const n = leerNotificacion(notificacion(valorMensajes({ mensajes: [{ id: "wamid.Y", type: "text", text: { body: "x" } }] })));
  assert.equal(n.mensajes.length, 0);
  assert.equal(n.otros.length, 1);
});
