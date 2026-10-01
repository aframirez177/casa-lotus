// Webhook trust: GET verification echo, X-Hub-Signature-256 over the raw body, fast 200, idempotency.

import { test } from "node:test";
import assert from "node:assert/strict";
import { firmar, firmaValida, verificarSuscripcion, igualesSeguro } from "../../src/whatsapp/firma.js";
import { armar, firmado, textoEntrante, APP_SECRET, VERIFY_TOKEN, CONFIG_OK } from "./ayuda.mjs";

test("GET verification echoes the challenge with the right token", () => {
  const r = verificarSuscripcion({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1158201444" }, VERIFY_TOKEN);
  assert.deepEqual(r, { status: 200, texto: "1158201444" });
});

test("GET verification refuses a wrong token, a wrong mode, a missing config and a weird challenge", () => {
  assert.equal(verificarSuscripcion({ "hub.mode": "subscribe", "hub.verify_token": "otro", "hub.challenge": "1" }, VERIFY_TOKEN).status, 403);
  assert.equal(verificarSuscripcion({ "hub.mode": "unsubscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1" }, VERIFY_TOKEN).status, 403);
  assert.equal(verificarSuscripcion({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1" }, "").status, 403);
  assert.equal(verificarSuscripcion({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "<script>" }, VERIFY_TOKEN).status, 400);
  assert.equal(verificarSuscripcion({}, VERIFY_TOKEN).status, 403);
});

test("signature: the exact bytes signed with the app secret pass", () => {
  const cuerpo = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
  assert.equal(firmaValida(cuerpo, firmar(cuerpo, APP_SECRET), APP_SECRET), true);
  assert.equal(firmaValida(cuerpo, firmar(cuerpo, APP_SECRET).toUpperCase().replace("SHA256=", "sha256="), APP_SECRET), true);
});

test("signature: missing, malformed, wrong secret, tampered body or no secret configured all fail", () => {
  const cuerpo = Buffer.from('{"a":1}');
  const buena = firmar(cuerpo, APP_SECRET);
  assert.equal(firmaValida(cuerpo, undefined, APP_SECRET), false);
  assert.equal(firmaValida(cuerpo, "", APP_SECRET), false);
  assert.equal(firmaValida(cuerpo, buena.replace("sha256=", "sha1="), APP_SECRET), false);
  assert.equal(firmaValida(cuerpo, "sha256=abc", APP_SECRET), false);
  assert.equal(firmaValida(cuerpo, firmar(cuerpo, "otro-secreto"), APP_SECRET), false);
  assert.equal(firmaValida(Buffer.from('{"a":2}'), buena, APP_SECRET), false);
  assert.equal(firmaValida(cuerpo, buena, ""), false);
  assert.equal(firmaValida('{"a":1}', buena, APP_SECRET), false, "only raw Buffers are trusted");
});

test("igualesSeguro compares without throwing on different lengths", () => {
  assert.equal(igualesSeguro("abc", "abc"), true);
  assert.equal(igualesSeguro("abc", "abcd"), false);
  assert.equal(igualesSeguro(undefined, ""), true);
});

test("handler: bad signature → 401 and nothing stored", async () => {
  const { nucleo, db } = await armar();
  const { cuerpoCrudo } = firmado(textoEntrante());
  assert.equal(nucleo.webhook.recibir({ cuerpoCrudo, firma: "sha256=" + "0".repeat(64) }).status, 401);
  assert.equal(nucleo.webhook.recibir({ cuerpoCrudo, firma: undefined }).status, 401);
  await nucleo.esperarPendientes();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wa_mensajes").get().n, 0);
});

test("handler: no app secret configured → every POST is rejected", async () => {
  const { nucleo } = await armar({ config: { ...CONFIG_OK, appSecret: "" } });
  const { cuerpoCrudo, firma } = firmado(textoEntrante());
  assert.equal(nucleo.webhook.recibir({ cuerpoCrudo, firma }).status, 401);
});

test("handler: real signature → 200 at once, processing happens after the answer", async () => {
  const { nucleo, db } = await armar();
  const r = nucleo.webhook.recibir(firmado(textoEntrante()));
  assert.equal(r.status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wa_mensajes").get().n, 0, "nothing is processed before the response");
  const resumen = await r.procesando;
  assert.equal(resumen.mensajes, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wa_mensajes").get().n, 1);
});

test("handler: invalid JSON with a valid signature → 400", async () => {
  const { nucleo } = await armar();
  const cuerpoCrudo = Buffer.from("{no es json");
  assert.equal(nucleo.webhook.recibir({ cuerpoCrudo, firma: firmar(cuerpoCrudo, APP_SECRET) }).status, 400);
});

test("handler: the same delivery twice (Meta retries) is stored once and rings once", async () => {
  const { nucleo, db, eventos, dominio } = await armar();
  const a = nucleo.webhook.recibir(firmado(textoEntrante()));
  const b = nucleo.webhook.recibir(firmado(textoEntrante()));
  const [ra, rb] = [await a.procesando, await b.procesando];
  assert.equal(ra.mensajes, 1);
  assert.equal(rb.duplicados, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wa_mensajes").get().n, 1);
  assert.equal(db.prepare("SELECT no_leidos FROM wa_conversaciones").get().no_leidos, 1);
  assert.equal(eventos.length, 1);
  assert.equal(dominio.leads.length, 1);
});

test("handler: two quick messages from a new number create a single lead", async () => {
  const { nucleo, dominio } = await armar();
  const a = nucleo.webhook.recibir(firmado(textoEntrante({ id: "wamid.A" })));
  const b = nucleo.webhook.recibir(firmado(textoEntrante({ id: "wamid.B", texto: "¿Y el domingo?" })));
  await a.procesando; await b.procesando;
  assert.equal(dominio.leads.length, 1);
});

test("handler: messages for another phone number id are ignored", async () => {
  const { nucleo, db } = await armar();
  const p = textoEntrante();
  p.entry[0].changes[0].value.metadata.phone_number_id = "999999999999";
  const r = await nucleo.webhook.recibir(firmado(p)).procesando;
  assert.equal(r.ignorados, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wa_mensajes").get().n, 0);
});
