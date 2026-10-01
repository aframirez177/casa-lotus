// Inbound flow, statuses, the 24 h window, sends (text, template, auth code), opt-out, admin handlers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { armar, textoEntrante, estadoEntrante, notificacion, valorMensajes, CONFIG_OK, PHONE_ID, WABA_ID, T0 } from "./ayuda.mjs";
import { WhatsAppError } from "../../src/whatsapp/errores.js";
import { ventanaAbierta, ventanaHasta, VENTANA_MS } from "../../src/whatsapp/formato.js";

const H = 3600 * 1000;
const NUM = "573001112233";

async function conMensaje(opts) {
  const ctx = await armar(opts);
  await ctx.nucleo.procesarNotificacion(textoEntrante());
  return ctx;
}

/* ── inbound ── */

test("inbound text from an unknown number: conversation + lead + bell event", async () => {
  const { nucleo, dominio, eventos } = await conMensaje();
  assert.deepEqual(dominio.leads, [{ id: "C-0001", nombre: "Laura Gómez", whatsapp: NUM }]);
  const { cuerpo: lista } = await nucleo.admin.conversaciones({ query: { filtro: "todas" } });
  assert.equal(lista.length, 1);
  const c = lista[0];
  assert.equal(c.whatsapp, NUM);
  assert.equal(c.whatsappTexto, "300 111 2233");
  assert.equal(c.nombre, "Laura Gómez");
  assert.deepEqual(c.clienta, { id: "C-0001", nombre: "Laura Gómez", etapa: "lead" });
  assert.equal(c.noLeidos, 1);
  assert.equal(c.estado, "abierta");
  assert.equal(c.ultimoMensaje.direccion, "entrante");
  assert.equal(c.ventanaHasta, new Date(T0 + VENTANA_MS - 2 * 60 * 1000).toISOString());
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].tipo, "mensaje");
  assert.equal(eventos[0].titulo, "Mensaje de Laura Gómez");
  assert.equal(eventos[0].detalle, "Hola, ¿tienen cupo el sábado?");
  assert.equal(eventos[0].clienta, "C-0001");
  assert.equal(eventos[0].conversacion, c.id);
});

test("inbound from a known clienta links her and creates no lead", async () => {
  const { nucleo, dominio, eventos } = await conMensaje({ clientas: [{ id: "C-0007", nombre: "Laura Gómez", whatsapp: NUM, etapa: "activa" }] });
  assert.equal(dominio.leads.length, 0);
  const [c] = (await nucleo.admin.conversaciones({ query: {} })).cuerpo;
  assert.deepEqual(c.clienta, { id: "C-0007", nombre: "Laura Gómez", etapa: "activa" });
  assert.equal(eventos[0].clienta, "C-0007");
});

test("a failing domain never loses the message (nor the opt-out)", async () => {
  const ctx = await armar();
  ctx.dominio.buscarClientaPorWhatsApp = async () => { throw new Error("Sheets caído"); };
  ctx.dominio.registrarBaja = async () => { throw new Error("Sheets caído"); };
  await ctx.nucleo.procesarNotificacion(textoEntrante({ id: "wamid.STOP", texto: "stop" }));
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM wa_bajas").get().n, 1);
  ctx.db.exec("DELETE FROM wa_mensajes; DELETE FROM wa_bajas;");
  ctx.eventos.length = 0;
  await ctx.nucleo.procesarNotificacion(textoEntrante());
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM wa_mensajes").get().n, 1);
  assert.equal(ctx.eventos.length, 1);
});

/* ── statuses ── */

test("status updates move forward only and record pricing", async () => {
  const { nucleo, db, reloj } = await conMensaje();
  const msg = await nucleo.enviarTexto(NUM, "¡Sí! Quedan 2 cupos.", { tipo: "admin", nombre: "Ana" });
  const metaId = db.prepare("SELECT meta_id FROM wa_mensajes WHERE id = ?").get(msg.id).meta_id;
  const estado = () => db.prepare("SELECT estado FROM wa_mensajes WHERE id = ?").get(msg.id).estado;

  await nucleo.procesarNotificacion(estadoEntrante({ id: metaId, estado: "read", t: reloj.t + 3000 }));
  assert.equal(estado(), "leido");
  await nucleo.procesarNotificacion(estadoEntrante({ id: metaId, estado: "delivered", t: reloj.t + 2000, pricing: { billable: false, pricing_model: "PMP", category: "service", type: "free_customer_service" } }));
  assert.equal(estado(), "leido", "a late «delivered» never downgrades «read»");
  await nucleo.procesarNotificacion(estadoEntrante({ id: metaId, estado: "delivered", t: reloj.t + 2000 }));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wa_estados WHERE meta_id = ?").get(metaId).n, 2, "duplicate status ignored");
  assert.equal(db.prepare("SELECT tipo_precio FROM wa_estados WHERE meta_id = ? AND estado = 'entregado'").get(metaId).tipo_precio, "free_customer_service");
});

test("a failed status marks the message, explains it in Spanish and rings Ana", async () => {
  const { nucleo, db, eventos } = await conMensaje();
  const msg = await nucleo.enviarTexto(NUM, "Hola", { tipo: "admin", nombre: "Ana" });
  const metaId = db.prepare("SELECT meta_id FROM wa_mensajes WHERE id = ?").get(msg.id).meta_id;
  await nucleo.procesarNotificacion(estadoEntrante({ id: metaId, estado: "failed", errores: [{ code: 131026, title: "Message undeliverable" }] }));
  const fila = db.prepare("SELECT estado, error, error_codigo FROM wa_mensajes WHERE id = ?").get(msg.id);
  assert.equal(fila.estado, "fallido");
  assert.equal(fila.error_codigo, 131026);
  assert.match(fila.error, /No se pudo entregar/);
  assert.equal(eventos.at(-1).tipo, "sistema");
});

test("error 131050 (she stopped marketing) records a marketing-only opt-out", async () => {
  const { nucleo, db, dominio } = await conMensaje();
  await nucleo.procesarNotificacion(estadoEntrante({ id: "wamid.MKT", estado: "failed", errores: [{ code: 131050, title: "User stopped marketing" }] }));
  assert.equal(db.prepare("SELECT alcance FROM wa_bajas WHERE whatsapp = ?").get(NUM).alcance, "marketing");
  assert.deepEqual(dominio.bajas, [NUM]);
  await assert.rejects(nucleo.enviarPlantilla(NUM, "bienvenida_prueba", { nombre: "Laura" }), (e) => e.motivo === "baja");
  await nucleo.enviarPlantilla(NUM, "recordatorio_clase", { nombre: "Laura", cuando: "sábado 3 de octubre a las 8:00 a. m.", clase: "Pilates Aéreo" });
});

/* ── 24 h window ── */

test("window math: open for 24 h minus a safety margin, closed before any message", () => {
  assert.equal(ventanaAbierta(T0, T0 + 23 * H), true);
  assert.equal(ventanaAbierta(T0, T0 + 24 * H - 60 * 1000), false, "the last 2 minutes count as closed");
  assert.equal(ventanaAbierta(T0, T0 + 25 * H), false);
  assert.equal(ventanaAbierta(null, T0), false);
  assert.equal(ventanaHasta(T0, T0 + 30 * H), null);
});

test("free text inside the window goes out with the right payload", async () => {
  const { nucleo, fetch, auditoria } = await conMensaje();
  const m = await nucleo.enviarTexto("300 111 2233", "Hola Laura, sí hay cupo.", { tipo: "admin", id: "u1", nombre: "Ana" });
  const ll = fetch.llamadas.at(-1);
  assert.equal(ll.metodo, "POST");
  assert.equal(ll.url.pathname, `/v24.0/${PHONE_ID}/messages`);
  assert.equal(ll.cabeceras.Authorization, "Bearer EAAG-prueba");
  assert.deepEqual(ll.cuerpo, { messaging_product: "whatsapp", recipient_type: "individual", to: NUM, type: "text", text: { body: "Hola Laura, sí hay cupo.", preview_url: false } });
  assert.equal(m.direccion, "saliente");
  assert.equal(m.tipo, "texto");
  assert.equal(m.estado, "enviado");
  assert.deepEqual(m.autor, { tipo: "admin", nombre: "Ana" });
  assert.equal(auditoria.at(-1).accion, "whatsapp.texto");
});

test("free text outside the window (or with no conversation) is refused before calling Meta", async () => {
  const { nucleo, fetch, reloj } = await conMensaje();
  reloj.t = T0 + 25 * H;
  const antes = fetch.llamadas.length;
  await assert.rejects(nucleo.enviarTexto(NUM, "Hola", { nombre: "Ana" }), (e) => e instanceof WhatsAppError && e.status === 409 && e.motivo === "ventana");
  await assert.rejects(nucleo.enviarTexto("573009990000", "Hola"), (e) => e.motivo === "ventana");
  assert.equal(fetch.llamadas.length, antes);
});

test("a new inbound message reopens the window", async () => {
  const { nucleo, reloj } = await conMensaje();
  reloj.t = T0 + 30 * H;
  await nucleo.procesarNotificacion(textoEntrante({ id: "wamid.NUEVO", t: reloj.t - 1000 }));
  const m = await nucleo.enviarTexto(NUM, "¡Claro!", { nombre: "Ana" });
  assert.equal(m.estado, "enviado");
});

test("text validation: empty, too long, bad number", async () => {
  const { nucleo } = await conMensaje();
  await assert.rejects(nucleo.enviarTexto(NUM, "   "), (e) => e.status === 422);
  await assert.rejects(nucleo.enviarTexto(NUM, "x".repeat(4097)), (e) => e.status === 422);
  await assert.rejects(nucleo.enviarTexto("12", "hola"), (e) => e.status === 422);
});

/* ── templates ── */

test("template send: named parameters, language es, rendered text stored, conversation created", async () => {
  const { nucleo, fetch, db } = await armar();
  const m = await nucleo.enviarPlantilla(NUM, "cupo_liberado", { nombre: "Laura", clase: "Pilates Aéreo", cuando: "sábado 3 de octubre a las 8:00 a. m." }, { tipo: "sistema", nombre: "Casa Lotus" });
  const { cuerpo } = fetch.llamadas.at(-1);
  assert.deepEqual(cuerpo, {
    messaging_product: "whatsapp", recipient_type: "individual", to: NUM, type: "template",
    template: {
      name: "cupo_liberado", language: { code: "es" },
      components: [{ type: "body", parameters: [
        { type: "text", parameter_name: "nombre", text: "Laura" },
        { type: "text", parameter_name: "clase", text: "Pilates Aéreo" },
        { type: "text", parameter_name: "cuando", text: "sábado 3 de octubre a las 8:00 a. m." },
      ] }],
    },
  });
  assert.equal(m.tipo, "plantilla");
  assert.equal(m.plantilla, "cupo_liberado");
  assert.match(m.texto, /^Hola Laura, se liberó un cupo en Pilates Aéreo del sábado 3 de octubre/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wa_conversaciones").get().n, 1);
  assert.equal(db.prepare("SELECT no_leidos FROM wa_conversaciones").get().no_leidos, 0);
});

test("template variables also work as an array in catalogue order, and are cleaned to one line", async () => {
  const { nucleo, fetch } = await armar();
  await nucleo.enviarPlantilla(NUM, "saldo_bajo", ["Laura", "2 clases", "viernes\n30 de   octubre"]);
  const p = fetch.llamadas.at(-1).cuerpo.template.components[0].parameters;
  assert.deepEqual(p.map((x) => x.text), ["Laura", "2 clases", "viernes 30 de octubre"]);
});

test("template validation: unknown name, missing variable, auth template by hand", async () => {
  const { nucleo, fetch } = await armar();
  await assert.rejects(nucleo.enviarPlantilla(NUM, "no_existe", {}), (e) => e.status === 422);
  await assert.rejects(nucleo.enviarPlantilla(NUM, "cupo_liberado", { nombre: "Laura" }), (e) => e.status === 422 && Boolean(e.campos.clase && e.campos.cuando));
  await assert.rejects(nucleo.enviarPlantilla(NUM, "codigo_acceso", { codigo: "123456" }), (e) => e.status === 422);
  assert.equal(fetch.llamadas.length, 0);
});

test("a template Meta has not approved is refused locally", async () => {
  const { nucleo, fetch } = await armar();
  nucleo.almacen.guardarPlantilla({ nombre: "recordatorio_clase", idioma: "es", estado: "PENDING" });
  await assert.rejects(nucleo.enviarPlantilla(NUM, "recordatorio_clase", ["Laura", "mañana", "Yoga Aéreo"]), (e) => e.status === 409 && e.motivo === "plantilla");
  assert.equal(fetch.llamadas.length, 0);
});

test("authentication code: copy-code payload, never stored in clear, returns a boolean", async () => {
  const { nucleo, fetch, db } = await conMensaje();
  assert.equal(await nucleo.enviarCodigo("3001112233", "482913"), true);
  assert.deepEqual(fetch.llamadas.at(-1).cuerpo.template, {
    name: "codigo_acceso", language: { code: "es" },
    components: [
      { type: "body", parameters: [{ type: "text", text: "482913" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "482913" }] },
    ],
  });
  const filas = db.prepare("SELECT texto, variables FROM wa_mensajes WHERE plantilla = 'codigo_acceso'").all();
  assert.equal(filas.length, 1);
  assert.doesNotMatch(filas[0].texto, /482913/);
  assert.equal(filas[0].variables, null);
  assert.equal(await nucleo.enviarCodigo(NUM, "12"), false, "bad code");
  assert.equal(await nucleo.enviarCodigo("abc", "123456"), false, "bad number");
});

test("authentication code returns false when Meta refuses or when not configured", async () => {
  const { nucleo } = await armar({ guion: [{ status: 400, body: { error: { message: "x", code: 131030 } } }] });
  assert.equal(await nucleo.enviarCodigo(NUM, "123456"), false);
  const sin = await armar({ config: {} });
  assert.equal(await sin.nucleo.enviarCodigo(NUM, "123456"), false);
});

/* ── opt-out ── */

test("BAJA: recorded, confirmed politely inside the window, Ana is told, templates refused", async () => {
  const { nucleo, fetch, db, eventos, dominio } = await conMensaje();
  await nucleo.procesarNotificacion(textoEntrante({ id: "wamid.BAJA", texto: "No más mensajes, por favor!" }));
  // "No más mensajes, por favor!" is longer than a keyword → it is a conversation, not an opt-out
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wa_bajas").get().n, 0);

  await nucleo.procesarNotificacion(textoEntrante({ id: "wamid.BAJA2", texto: "BAJA" }));
  assert.equal(db.prepare("SELECT alcance FROM wa_bajas WHERE whatsapp = ?").get(NUM).alcance, "todo");
  assert.deepEqual(dominio.bajas, [NUM], "the Sheet's «novedades» consent goes off too");
  const respuesta = fetch.llamadas.at(-1).cuerpo;
  assert.equal(respuesta.type, "text");
  assert.match(respuesta.text.body, /no te enviaremos más mensajes automáticos/);
  assert.match(eventos.at(-1).titulo, /pidió no recibir más mensajes/);
  await assert.rejects(nucleo.enviarPlantilla(NUM, "recordatorio_clase", ["Laura", "mañana", "Yoga"]), (e) => e.status === 409 && e.motivo === "baja");
  // She can still be answered while she writes (inside the window).
  assert.equal((await nucleo.enviarTexto(NUM, "Entendido, Laura.", { nombre: "Ana" })).estado, "enviado");
  // Login codes she asks for herself still go out.
  assert.equal(await nucleo.enviarCodigo(NUM, "123456"), true);
});

test("STOP / Stop. / «no mas» count; «cancelar» does not (it means cancelling a class)", async () => {
  for (const [texto, esperado] of [["STOP", 1], ["Stop.", 1], ["no mas", 1], ["darme de baja 🙏", 1], ["cancelar", 0], ["Necesito cancelar", 0]]) {
    const { nucleo, db } = await conMensaje();
    await nucleo.procesarNotificacion(textoEntrante({ id: "wamid.K", texto }));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wa_bajas").get().n, esperado, texto);
  }
});

test("ALTA and optIn clear a BAJA", async () => {
  const { nucleo, db } = await conMensaje();
  await nucleo.procesarNotificacion(textoEntrante({ id: "wamid.B1", texto: "baja" }));
  await nucleo.procesarNotificacion(textoEntrante({ id: "wamid.A1", texto: "Alta" }));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wa_bajas").get().n, 0);
  await nucleo.procesarNotificacion(textoEntrante({ id: "wamid.B2", texto: "stop" }));
  assert.equal(nucleo.optIn("300 111 2233", "web"), true);
  assert.equal(nucleo.optIn("300 111 2233", "web"), false);
});

/* ── not configured ── */

test("not configured: estado lists what is missing, lists work, sends answer 503", async () => {
  const { nucleo } = await armar({ config: {} });
  assert.equal(nucleo.configurado, false);
  const e = await nucleo.estado();
  assert.equal(e.conectado, false);
  assert.equal(e.modo, "desconectado");
  assert.deepEqual(e.faltan, ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_WABA_ID"]);
  assert.equal(e.plantillas.length, 10);
  assert.ok(e.plantillas.every((p) => p.estadoMeta === "NO_ENVIADA"));
  assert.deepEqual((await nucleo.admin.conversaciones({ query: {} })).cuerpo, []);
  await assert.rejects(nucleo.enviarTexto(NUM, "hola"), (err) => err.status === 503 && err.codigo === "no-configurado");
  await assert.rejects(nucleo.enviarPlantilla(NUM, "saldo_bajo", ["a", "b", "c"]), (err) => err.status === 503);
  await assert.rejects(nucleo.sincronizarPlantillas(), (err) => err.status === 503);
});

test("estado when configured reads the number from Meta and caches it", async () => {
  const { nucleo, fetch } = await armar({ guion: [{ status: 200, body: { display_phone_number: "+57 312 8720888", verified_name: "Casa Lotus", quality_rating: "GREEN", id: PHONE_ID } }] });
  const e = await nucleo.estado();
  assert.equal(e.conectado, true);
  assert.equal(e.modo, "prueba");
  assert.equal(e.nombreVerificado, "Casa Lotus");
  assert.equal(e.calidad, "GREEN");
  assert.deepEqual(e.faltan, []);
  await nucleo.estado();
  assert.equal(fetch.llamadas.length, 1, "cached for 5 minutes");
  assert.equal(fetch.llamadas[0].url.searchParams.get("fields").split(",").includes("verified_name"), true);
});

test("estado reports conectado:false with Meta's error when the token is bad", async () => {
  const { nucleo } = await armar({ guion: [{ status: 401, body: { error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190 } } }] });
  const e = await nucleo.estado();
  assert.equal(e.conectado, false);
  assert.match(e.error, /token/);
});

/* ── Graph client: retries and errors ── */

test("429 and 5xx are retried with backoff; a 4xx Meta error maps to Spanish without retry", async () => {
  const { nucleo, fetch } = await conMensaje({
    guion: [
      { status: 503, body: { error: { message: "Service unavailable", code: 2 } } },
      { status: 429, body: { error: { message: "Rate limit", code: 130429 } } },
      undefined, // success
    ],
  });
  const m = await nucleo.enviarTexto(NUM, "Hola", { nombre: "Ana" });
  assert.equal(m.estado, "enviado");
  assert.equal(fetch.llamadas.length, 3);

  const otro = await conMensaje({ guion: [{ status: 400, body: { error: { message: "Re-engagement", code: 131047 } } }] });
  await assert.rejects(otro.nucleo.enviarTexto(NUM, "Hola"), (e) => e.status === 502 && /24 horas/.test(e.message) && e.cuerpo().meta.codigo === 131047);
  assert.equal(otro.fetch.llamadas.length, 1);
});

test("a POST that times out is NOT retried (Meta may have sent it)", async () => {
  const t = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  const { nucleo, fetch } = await conMensaje({ guion: [t, undefined] });
  await assert.rejects(nucleo.enviarTexto(NUM, "Hola"), (e) => e.status === 504 && /Revisa en el chat/.test(e.message));
  assert.equal(fetch.llamadas.length, 1);
});

test("a refused connection is retried for POST too (nothing was sent)", async () => {
  const red = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
  const { nucleo, fetch } = await conMensaje({ guion: [red, undefined] });
  assert.equal((await nucleo.enviarTexto(NUM, "Hola")).estado, "enviado");
  assert.equal(fetch.llamadas.length, 2);
});

/* ── templates sync / submit ── */

test("sincronizarPlantillas follows paging and caches Meta's status; enviarPlantillasAMeta submits only the missing ones", async () => {
  const { nucleo, fetch } = await armar({
    guion: (ll) => {
      if (ll.metodo === "GET" && ll.url.pathname.endsWith("/message_templates")) {
        if (!ll.url.searchParams.get("after")) return { body: { data: [{ id: "1", name: "recordatorio_clase", status: "APPROVED", category: "UTILITY", language: "es" }], paging: { cursors: { after: "C1" }, next: "https://next" } } };
        return { body: { data: [{ id: "2", name: "saldo_bajo", status: "REJECTED", category: "UTILITY", language: "es", rejected_reason: "INVALID_FORMAT" }], paging: { cursors: { after: "C2" } } } };
      }
      if (ll.metodo === "POST" && ll.url.pathname.endsWith("/message_templates")) return { body: { id: "99", status: "PENDING", category: ll.cuerpo.category } };
      return undefined;
    },
  });
  const r = await nucleo.enviarPlantillasAMeta();
  const porNombre = Object.fromEntries(r.map((x) => [x.nombre, x]));
  assert.equal(porNombre.recordatorio_clase.accion, "existe");
  assert.equal(porNombre.saldo_bajo.accion, "existe");
  assert.equal(porNombre.codigo_acceso.accion, "enviada");
  assert.equal(r.filter((x) => x.accion === "enviada").length, 8);
  const posts = fetch.llamadas.filter((l) => l.metodo === "POST");
  assert.ok(posts.every((p) => p.url.pathname === `/v24.0/${WABA_ID}/message_templates`));
  const lista = nucleo.listarPlantillas();
  const saldo = lista.find((p) => p.nombre === "saldo_bajo");
  assert.equal(saldo.estadoMeta, "REJECTED");
  assert.equal(saldo.motivo, "INVALID_FORMAT");
  assert.equal(lista.find((p) => p.nombre === "cupo_liberado").estadoMeta, "PENDING");
});

test("template status webhooks update the cache; a recategorization is kept apart", async () => {
  const { nucleo } = await armar();
  await nucleo.procesarNotificacion(notificacion({ event: "APPROVED", message_template_id: 5, message_template_name: "saldo_bajo", message_template_language: "es", reason: "NONE" }, "message_template_status_update"));
  await nucleo.procesarNotificacion(notificacion({ message_template_id: 5, message_template_name: "saldo_bajo", message_template_language: "es", previous_category: "UTILITY", new_category: "MARKETING" }, "template_category_update"));
  const p = nucleo.listarPlantillas().find((x) => x.nombre === "saldo_bajo");
  assert.equal(p.estadoMeta, "APPROVED");
  assert.equal(p.categoriaMeta, "MARKETING");
});

/* ── admin handlers (CONTRATO §6) ── */

test("detail marks the conversation read, sends Meta a read receipt and returns the clienta", async () => {
  const { nucleo, fetch } = await conMensaje();
  const [c] = (await nucleo.admin.conversaciones({ query: { filtro: "sin-leer" } })).cuerpo;
  const { cuerpo } = await nucleo.admin.conversacion({ params: { id: c.id } });
  assert.equal(cuerpo.conversacion.noLeidos, 0);
  assert.equal(cuerpo.mensajes.length, 1);
  assert.equal(cuerpo.mensajes[0].autor.tipo, "clienta");
  assert.equal(cuerpo.clienta.id, "C-0001");
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(fetch.llamadas.at(-1).cuerpo, { messaging_product: "whatsapp", status: "read", message_id: "wamid.ENTRADA1" });
  assert.equal((await nucleo.admin.conversaciones({ query: { filtro: "sin-leer" } })).cuerpo.length, 0);
  await assert.rejects(nucleo.admin.conversacion({ params: { id: "cv_nope" } }), (e) => e.status === 404);
});

test("search is accent-insensitive and matches numbers", async () => {
  const { nucleo } = await conMensaje();
  assert.equal((await nucleo.admin.conversaciones({ query: { filtro: "todas", q: "gomez" } })).cuerpo.length, 1);
  assert.equal((await nucleo.admin.conversaciones({ query: { filtro: "todas", q: "2233" } })).cuerpo.length, 1);
  assert.equal((await nucleo.admin.conversaciones({ query: { filtro: "todas", q: "pedro" } })).cuerpo.length, 0);
});

test("POST mensajes: text → 201, template → 201, nothing → 422", async () => {
  const { nucleo } = await conMensaje();
  const [c] = (await nucleo.admin.conversaciones({ query: {} })).cuerpo;
  const actor = { tipo: "admin", id: "u1", nombre: "Ana" };
  const a = await nucleo.admin.enviar({ params: { id: c.id }, body: { texto: "Hola" }, actor });
  assert.equal(a.status, 201);
  assert.equal(a.cuerpo.autor.nombre, "Ana");
  const b = await nucleo.admin.enviar({ params: { id: c.id }, body: { plantilla: "saldo_bajo", variables: { nombre: "Laura", saldo: "1 clase", vence: "viernes 30 de octubre" } }, actor });
  assert.equal(b.status, 201);
  assert.equal(b.cuerpo.tipo, "plantilla");
  await assert.rejects(nucleo.admin.enviar({ params: { id: c.id }, body: {}, actor }), (e) => e.status === 422);
});

test("PATCH: estado, etiquetas (deduped), clienta link and unlink; bad input → 422", async () => {
  const { nucleo, auditoria } = await conMensaje({ clientas: [{ id: "C-0009", nombre: "Otra", whatsapp: "573000000000", etapa: "activa" }] });
  const [c] = (await nucleo.admin.conversaciones({ query: {} })).cuerpo;
  const actor = { tipo: "admin", id: "u1", nombre: "Ana" };
  const r = await nucleo.admin.actualizar({ params: { id: c.id }, body: { estado: "cerrada", etiquetas: ["prueba", "Prueba", " pago "] }, actor });
  assert.equal(r.cuerpo.estado, "cerrada");
  assert.deepEqual(r.cuerpo.etiquetas, ["prueba", "pago"]);
  assert.equal(auditoria.at(-1).accion, "whatsapp.conversacion");
  const l = await nucleo.admin.actualizar({ params: { id: c.id }, body: { clienta: "C-0009" }, actor });
  assert.deepEqual(l.cuerpo.clienta, { id: "C-0009", nombre: "Otra", etapa: "activa" });
  await assert.rejects(nucleo.admin.actualizar({ params: { id: c.id }, body: { clienta: "C-7777" }, actor }), (e) => e.status === 404);
  const u = await nucleo.admin.actualizar({ params: { id: c.id }, body: { clienta: null }, actor });
  assert.equal(u.cuerpo.clienta, undefined);
  await assert.rejects(nucleo.admin.actualizar({ params: { id: c.id }, body: { estado: "borrada" }, actor }), (e) => e.status === 422 && Boolean(e.campos.estado));
  await assert.rejects(nucleo.admin.actualizar({ params: { id: c.id }, body: {}, actor }), (e) => e.status === 422);

  // After an explicit unlink, a new message does not auto-link or create a lead again.
  await nucleo.procesarNotificacion(textoEntrante({ id: "wamid.OTRO" }));
  assert.equal((await nucleo.admin.conversaciones({ query: { filtro: "todas" } })).cuerpo[0].clienta, undefined);
});

test("a closed conversation reopens when she writes again", async () => {
  const { nucleo } = await conMensaje();
  const [c] = (await nucleo.admin.conversaciones({ query: {} })).cuerpo;
  await nucleo.admin.actualizar({ params: { id: c.id }, body: { estado: "cerrada" }, actor: { nombre: "Ana" } });
  assert.equal((await nucleo.admin.conversaciones({ query: { filtro: "abiertas" } })).cuerpo.length, 0);
  await nucleo.procesarNotificacion(textoEntrante({ id: "wamid.REABRE" }));
  assert.equal((await nucleo.admin.conversaciones({ query: { filtro: "abiertas" } })).cuerpo.length, 1);
});

test("resumenConversacion for ClientaDetalle", async () => {
  const { nucleo } = await conMensaje();
  const r = nucleo.resumenConversacion("3001112233");
  assert.equal(r.noLeidos, 1);
  assert.equal(r.ultimoMensaje.texto, "Hola, ¿tienen cupo el sábado?");
  assert.equal(nucleo.resumenConversacion("573009999999"), null);
});

test("reactions open the window but neither ring nor count as unread", async () => {
  const { nucleo, eventos } = await armar();
  await nucleo.procesarNotificacion(notificacion(valorMensajes({
    contactos: [{ profile: { name: "Laura" }, wa_id: NUM }],
    mensajes: [{ from: NUM, id: "wamid.R", timestamp: String(Math.floor(T0 / 1000)), type: "reaction", reaction: { message_id: "wamid.X", emoji: "👍" } }],
  })));
  assert.equal(eventos.length, 0);
  const [c] = (await nucleo.admin.conversaciones({ query: {} })).cuerpo;
  assert.equal(c.noLeidos, 0);
  assert.ok(c.ventanaHasta);
});

test("config falls back to env vars and never exposes secrets", async () => {
  const { leerConfig, resumenConfig } = await import("../../src/whatsapp/config.js");
  const cfg = leerConfig({}, { WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "123456789", WHATSAPP_APP_SECRET: "s", WHATSAPP_MODO: "produccion", WHATSAPP_GRAPH_VERSION: "23.0" });
  assert.equal(cfg.configurado, true);
  assert.equal(cfg.modo, "produccion");
  assert.equal(cfg.graphVersion, "v23.0");
  assert.deepEqual(cfg.faltan, ["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_WABA_ID"]);
  const r = JSON.stringify(resumenConfig(cfg));
  assert.doesNotMatch(r, /"t"|"s"/);
  assert.equal(leerConfig({ whatsapp: { ...CONFIG_OK, phoneNumberId: "https://evil" } }, {}).phoneNumberId, "", "only numeric ids");
});

/* ── 2026 usernames (BSUID), coexistence echoes, marketing preferences ── */

const BSUID = "CO.1234567890abcdef";

function deUsuario({ id = "wamid.U1", texto = "Hola, soy @laura", conNumero = false } = {}) {
  const contacto = { profile: { name: "Laura", username: "laura.yoga" }, user_id: BSUID, ...(conNumero ? { wa_id: NUM } : {}) };
  const m = { id, timestamp: String(Math.floor(T0 / 1000)), type: "text", text: { body: texto }, from_user_id: BSUID, ...(conNumero ? { from: NUM } : {}) };
  return notificacion(valorMensajes({ contactos: [contacto], mensajes: [m] }));
}

test("a username-only contact (no phone number) gets a conversation, no lead, and replies go to `recipient`", async () => {
  const { nucleo, fetch, dominio } = await armar();
  await nucleo.procesarNotificacion(deUsuario());
  assert.equal(dominio.leads.length, 0, "the Sheet knows people by number");
  const [c] = (await nucleo.admin.conversaciones({ query: {} })).cuerpo;
  assert.equal(c.whatsapp, "");
  assert.equal(c.usuario, "laura.yoga");
  assert.equal(c.nombre, "Laura");
  const r = await nucleo.admin.enviar({ params: { id: c.id }, body: { texto: "¡Hola Laura!" }, actor: { nombre: "Ana" } });
  assert.equal(r.status, 201);
  const cuerpo = fetch.llamadas.at(-1).cuerpo;
  assert.equal(cuerpo.recipient, BSUID);
  assert.equal(cuerpo.to, undefined);
  // When she later writes with her number, it is the same conversation (history kept) and she is linked.
  await nucleo.procesarNotificacion(deUsuario({ id: "wamid.U2", conNumero: true }));
  const lista = (await nucleo.admin.conversaciones({ query: { filtro: "todas" } })).cuerpo;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].whatsapp, NUM);
  assert.equal(dominio.leads.length, 1);
});

test("a number conversation and a username conversation are merged when Meta links them", async () => {
  const { nucleo, db } = await armar();
  await nucleo.procesarNotificacion(textoEntrante({ id: "wamid.N1" }));
  await nucleo.procesarNotificacion(deUsuario({ id: "wamid.U1" }));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wa_conversaciones").get().n, 2);
  await nucleo.procesarNotificacion(deUsuario({ id: "wamid.U2", conNumero: true }));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wa_conversaciones").get().n, 1);
  const [c] = (await nucleo.admin.conversaciones({ query: { filtro: "todas" } })).cuerpo;
  const { cuerpo } = await nucleo.admin.conversacion({ params: { id: c.id } });
  assert.equal(cuerpo.mensajes.length, 3);
});

test("coexistence echoes (sent from the phone app) are stored as Ana's, mark the chat read and never ring", async () => {
  const { nucleo, eventos } = await conMensaje();
  const eco = notificacion({
    messaging_product: "whatsapp", metadata: { display_phone_number: "573128720888", phone_number_id: PHONE_ID },
    message_echoes: [{ from: "573128720888", to: NUM, id: "wamid.ECO1", timestamp: String(Math.floor(T0 / 1000) + 60), type: "text", text: { body: "¡Hola Laura! Sí hay cupo." } }],
  }, "smb_message_echoes");
  const r = await nucleo.procesarNotificacion(eco);
  assert.equal(r.ecos, 1);
  assert.equal((await nucleo.procesarNotificacion(eco)).ecos, 0, "idempotent");
  const [c] = (await nucleo.admin.conversaciones({ query: { filtro: "todas" } })).cuerpo;
  assert.equal(c.noLeidos, 0);
  assert.equal(c.ultimoMensaje.direccion, "saliente");
  const { cuerpo } = await nucleo.admin.conversacion({ params: { id: c.id } });
  assert.deepEqual(cuerpo.mensajes.at(-1).autor, { tipo: "admin", nombre: "Desde el celular" });
  assert.equal(eventos.length, 1, "only the original inbound message rang");
});

test("user_preferences stop/resume toggles a marketing-only opt-out", async () => {
  const { nucleo, db } = await armar();
  const pref = (value) => notificacion({ messaging_product: "whatsapp", metadata: { phone_number_id: PHONE_ID }, user_preferences: [{ wa_id: NUM, detail: "x", category: "marketing_messages", value, timestamp: 1 }] }, "user_preferences");
  await nucleo.procesarNotificacion(pref("stop"));
  assert.equal(db.prepare("SELECT alcance FROM wa_bajas WHERE whatsapp = ?").get(NUM).alcance, "marketing");
  await nucleo.procesarNotificacion(pref("resume"));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wa_bajas").get().n, 0);
});
