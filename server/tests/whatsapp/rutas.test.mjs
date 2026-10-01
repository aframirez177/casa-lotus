// Express routes over real HTTP. Skipped (with a clear message) while express is not installed in web/server.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { CONFIG_OK, VERIFY_TOKEN, dominioFalso, fetchFalso, firmado, logMudo, textoEntrante, T0 } from "./ayuda.mjs";

let express = null;
try { express = (await import("express")).default; } catch { /* not installed yet */ }
const omitir = express ? false : "express is not installed in web/server yet (the server agent owns package.json); core logic is covered by the other tests";

async function servidor({ usuario = { id: "u1", rol: "admin", nombre: "Ana" }, config = CONFIG_OK } = {}) {
  const { crearWhatsApp } = await import("../../src/whatsapp/index.js");
  const eventos = [];
  const wa = await crearWhatsApp({ config, db: new DatabaseSync(":memory:"), dominio: dominioFalso(), publicar: (e) => eventos.push(e), log: logMudo, fetch: fetchFalso(), ahora: () => T0, env: {} });
  const app = express();
  app.use("/api/whatsapp", wa.rutasWebhook);
  app.use(express.json()); // the server's global parser comes after the webhook, as agreed
  app.use("/api/admin/whatsapp", (req, _res, next) => { if (usuario) req.usuario = usuario; next(); }, wa.rutasAdmin);
  const http = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  const base = `http://127.0.0.1:${http.address().port}`;
  return { wa, eventos, base, cerrar: () => new Promise((r) => http.close(r)) };
}

test("GET /api/whatsapp/webhook echoes the challenge as text/plain", { skip: omitir }, async () => {
  const s = await servidor();
  try {
    const ok = await fetch(`${s.base}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=987654`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), "987654");
    assert.match(ok.headers.get("content-type"), /text\/plain/);
    const mal = await fetch(`${s.base}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1`);
    assert.equal(mal.status, 403);
  } finally { await s.cerrar(); }
});

test("POST /api/whatsapp/webhook checks the signature on the raw bytes", { skip: omitir }, async () => {
  const s = await servidor();
  try {
    const { cuerpoCrudo, firma } = firmado(textoEntrante());
    const sinFirma = await fetch(`${s.base}/api/whatsapp/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: cuerpoCrudo });
    assert.equal(sinFirma.status, 401);
    const bien = await fetch(`${s.base}/api/whatsapp/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": firma }, body: cuerpoCrudo });
    assert.equal(bien.status, 200);
    await s.wa.esperarPendientes();
    assert.equal(s.eventos.length, 1);
  } finally { await s.cerrar(); }
});

test("admin routes: list, detail, 404 and 422 follow CONTRATO §4", { skip: omitir }, async () => {
  const s = await servidor();
  try {
    const { cuerpoCrudo, firma } = firmado(textoEntrante());
    await fetch(`${s.base}/api/whatsapp/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": firma }, body: cuerpoCrudo });
    await s.wa.esperarPendientes();
    const lista = await (await fetch(`${s.base}/api/admin/whatsapp/conversaciones?filtro=todas`)).json();
    assert.equal(lista.length, 1);
    const det = await fetch(`${s.base}/api/admin/whatsapp/conversaciones/${lista[0].id}`);
    assert.equal(det.status, 200);
    assert.equal((await det.json()).conversacion.noLeidos, 0);
    const no = await fetch(`${s.base}/api/admin/whatsapp/conversaciones/cv_x`);
    assert.equal(no.status, 404);
    assert.deepEqual(Object.keys(await no.json()).sort(), ["error", "mensaje", "ok"]);
    const mal = await fetch(`${s.base}/api/admin/whatsapp/conversaciones/${lista[0].id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ estado: "x" }) });
    assert.equal(mal.status, 422);
    const enviado = await fetch(`${s.base}/api/admin/whatsapp/conversaciones/${lista[0].id}/mensajes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texto: "Hola Laura" }) });
    assert.equal(enviado.status, 201);
    const plantillas = await (await fetch(`${s.base}/api/admin/whatsapp/plantillas`)).json();
    assert.equal(plantillas.length, 10);
  } finally { await s.cerrar(); }
});

test("admin routes refuse requests without an admin user, and sends answer 503 when not configured", { skip: omitir }, async () => {
  const sin = await servidor({ usuario: null });
  try { assert.equal((await fetch(`${sin.base}/api/admin/whatsapp/estado`)).status, 401); } finally { await sin.cerrar(); }
  const profe = await servidor({ usuario: { id: "p1", rol: "profe", nombre: "Geral" } });
  try { assert.equal((await fetch(`${profe.base}/api/admin/whatsapp/estado`)).status, 403); } finally { await profe.cerrar(); }
  const nc = await servidor({ config: {} });
  try {
    const e = await (await fetch(`${nc.base}/api/admin/whatsapp/estado`)).json();
    assert.equal(e.conectado, false);
    assert.ok(e.faltan.includes("WHATSAPP_TOKEN"));
    assert.deepEqual(await (await fetch(`${nc.base}/api/admin/whatsapp/conversaciones`)).json(), []);
  } finally { await nc.cerrar(); }
});
