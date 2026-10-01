// Test helpers for the WhatsApp module: in-memory SQLite, scripted fetch, fake domain, webhook fixtures.

import { DatabaseSync } from "node:sqlite";
import { crearNucleo } from "../../src/whatsapp/nucleo.js";
import { firmar } from "../../src/whatsapp/firma.js";

export const APP_SECRET = "secreto-de-prueba";
export const VERIFY_TOKEN = "token-verificacion-prueba";
export const PHONE_ID = "109876543210987";
export const WABA_ID = "102030405060708";
export const T0 = Date.parse("2026-10-01T15:00:00Z"); // 10:00 a. m. in Bogotá

export const CONFIG_OK = {
  token: "EAAG-prueba", phoneNumberId: PHONE_ID, wabaId: WABA_ID, appSecret: APP_SECRET,
  verifyToken: VERIFY_TOKEN, graphVersion: "v24.0", modo: "prueba", reintentos: 2,
};

/** fetch double: answers from a queue of scripted responses (or a function), records every call. */
export function fetchFalso(guion = []) {
  const llamadas = [];
  const cola = Array.isArray(guion) ? [...guion] : [];
  const f = async (url, init = {}) => {
    const u = new URL(String(url));
    const llamada = { url: u, metodo: init.method || "GET", cabeceras: init.headers || {}, cuerpo: init.body ? JSON.parse(init.body) : undefined };
    llamadas.push(llamada);
    let r = typeof guion === "function" ? guion(llamada) : cola.shift();
    if (r === undefined) r = { status: 200, body: { messaging_product: "whatsapp", messages: [{ id: `wamid.SALIDA${llamadas.length}`, message_status: "accepted" }] } };
    if (r instanceof Error) throw r;
    if (typeof r === "function") r = await r(llamada);
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers || {}) } });
  };
  f.llamadas = llamadas;
  return f;
}

/** Domain double with a tiny clientas table. */
export function dominioFalso(clientas = []) {
  const filas = [...clientas];
  const d = {
    leads: [],
    bajas: [],
    async registrarBaja(numero) { d.bajas.push(numero); return true; },
    async buscarClientaPorWhatsApp(numero) { return filas.find((c) => c.whatsapp === numero) || null; },
    async buscarClientaPorId(id) { return filas.find((c) => c.id === id) || null; },
    async crearLead({ nombre, whatsapp }) {
      const id = `C-${String(filas.length + 1).padStart(4, "0")}`;
      filas.push({ id, nombre, whatsapp, etapa: "lead" });
      d.leads.push({ id, nombre, whatsapp });
      return id;
    },
  };
  return d;
}

export const logMudo = { info() {}, warn() {}, error() {}, debug() {} };

/** A ready core with every double wired. Returns { nucleo, db, fetch, dominio, eventos, auditoria, reloj }. */
export async function armar({ config = CONFIG_OK, guion, clientas, ahora } = {}) {
  const db = new DatabaseSync(":memory:");
  const fetch = fetchFalso(guion);
  const dominio = dominioFalso(clientas);
  const eventos = [];
  const auditoria = [];
  const reloj = { t: ahora ?? T0 };
  const nucleo = await crearNucleo({
    config, db, dominio, publicar: (e) => eventos.push(e), log: logMudo, auditar: (a) => auditoria.push(a),
    fetch, esperar: async () => {}, ahora: () => reloj.t, env: {},
  });
  return { nucleo, db, fetch, dominio, eventos, auditoria, reloj };
}

/* ── webhook fixtures (shapes from Meta's Cloud API webhook reference) ── */

export function notificacion(value, field = "messages") {
  return { object: "whatsapp_business_account", entry: [{ id: WABA_ID, changes: [{ field, value }] }] };
}

export function valorMensajes({ mensajes = [], estados = [], contactos = [], phoneNumberId = PHONE_ID } = {}) {
  const v = { messaging_product: "whatsapp", metadata: { display_phone_number: "15550001111", phone_number_id: phoneNumberId } };
  if (contactos.length) v.contacts = contactos;
  if (mensajes.length) v.messages = mensajes;
  if (estados.length) v.statuses = estados;
  return v;
}

export function textoEntrante({ id = "wamid.ENTRADA1", de = "573001112233", nombre = "Laura Gómez", texto = "Hola, ¿tienen cupo el sábado?", t = T0 } = {}) {
  return notificacion(valorMensajes({
    contactos: [{ profile: { name: nombre }, wa_id: de }],
    mensajes: [{ from: de, id, timestamp: String(Math.floor(t / 1000)), type: "text", text: { body: texto } }],
  }));
}

export function estadoEntrante({ id, estado, de = "573001112233", t = T0, errores, pricing } = {}) {
  const s = { id, status: estado, timestamp: String(Math.floor(t / 1000)), recipient_id: de };
  if (errores) s.errors = errores;
  if (pricing) s.pricing = pricing;
  return notificacion(valorMensajes({ estados: [s] }));
}

/** Signed raw body for the webhook handler. */
export function firmado(payload, secreto = APP_SECRET) {
  const cuerpoCrudo = Buffer.from(JSON.stringify(payload));
  return { cuerpoCrudo, firma: firmar(cuerpoCrudo, secreto) };
}
