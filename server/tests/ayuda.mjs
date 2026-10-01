// Test helper: the real app on an ephemeral port, memory driver, :memory: SQLite, a movable clock,
// and a tiny fetch client with a cookie jar that sends the CSRF header.
import express from "express";
import { leerConfig } from "../src/config.js";
import { crearContexto } from "../src/contexto.js";
import { crearApp } from "../src/app.js";
import { crearDriverMemoria } from "../src/datos/memoria.js";
import { sembrar, CUENTAS_DEV } from "../src/datos/semilla.js";
import { crearLog } from "../src/log.js";

/** Thursday 1 October 2026, 10:00 in Bogotá. */
export const JUEVES = Date.parse("2026-10-01T10:00:00-05:00");
export const ADMIN = CUENTAS_DEV[0];
export const PROFE = CUENTAS_DEV[1];
export const LAURA = CUENTAS_DEV[2];

/** A Web Push double that records what would be sent. */
export function pushFalso() {
  const enviados = [];
  return {
    activo: true, clavePublica: "BPUB-falsa", enviados, total: () => 0,
    suscribir(usuario, s) { enviados.push({ a: "suscripcion", usuario, endpoint: s.endpoint }); },
    desuscribir() {},
    async aAdmins(m) { enviados.push({ a: "admins", ...m }); },
    async aUsuarios(ids, m) { enviados.push({ a: ids, ...m }); },
  };
}

export function whatsappFalso({ configurado = true } = {}) {
  const enviados = [];
  const r = () => express.Router();
  return {
    configurado, enviados, rutasAdmin: r(), rutasWebhook: r(),
    estado: () => ({ conectado: configurado, modo: configurado ? "prueba" : "desconectado", plantillas: [], faltan: [] }),
    async enviarTexto(whatsapp, texto) { enviados.push({ tipo: "texto", whatsapp, texto }); },
    async enviarPlantilla(whatsapp, nombre, variables) { enviados.push({ tipo: "plantilla", whatsapp, nombre, variables }); },
    async enviarCodigo(whatsapp, codigo) { enviados.push({ tipo: "codigo", whatsapp, codigo }); return true; },
    resumenConversacion: () => null,
    async optIn(whatsapp, origen) { enviados.push({ tipo: "optin", whatsapp, origen }); },
  };
}

export async function arrancar({ semilla = "basica", ahora = JUEVES, latenciaMs = 0, sinColumnas, sinPestanas, whatsapp, candado, clienteConversiones, push, google, fetchCorreo, env = {} } = {}) {
  let t = ahora;
  const reloj = { ahora: () => t, avanzar: (ms) => { t += ms; }, fijar: (ms) => { t = ms; } };
  const config = leerConfig({ NODE_ENV: "test", PUBLIC_URL: "https://casalotus.studio", LOG_LEVEL: "silencio", TAREAS: "0", ...env });
  const datos = crearDriverMemoria({ latenciaMs, sinColumnas, sinPestanas });
  const sembrado = await sembrar(datos, { tipo: semilla, ahora: t });
  const ctx = await crearContexto(config, {
    ahora: reloj.ahora, datos, sqlitePath: ":memory:", cuentasDev: true, log: crearLog({ nivel: "silencio" }),
    // never the real module in tests: it would fall back to WHATSAPP_* from the shell and reach Meta
    whatsapp: whatsapp || whatsappFalso({ configurado: false }), ...(candado ? { candado } : {}),
    ...(clienteConversiones ? { clienteConversiones } : {}), ...(push ? { push } : {}),
    ...(google !== undefined ? { google } : {}), ...(fetchCorreo ? { fetchCorreo } : {}),
  });
  const app = crearApp(ctx);
  const servidor = await new Promise((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
  const base = "http://127.0.0.1:" + servidor.address().port;
  return {
    ctx, reloj, base, datos, sembrado,
    cliente: () => crearCliente(base),
    async cerrar() {
      await ctx.esperarSegundoPlano();
      servidor.closeAllConnections?.();
      await new Promise((ok) => servidor.close(ok));
      ctx.db.close();
    },
  };
}

export function crearCliente(base) {
  let cookie = "";
  async function pedir(metodo, ruta, cuerpo, { cabeceras = {}, sinCsrf = false } = {}) {
    const h = { ...cabeceras };
    if (cookie) h.cookie = cookie;
    if (cuerpo !== undefined) h["content-type"] = "application/json";
    if (!sinCsrf && metodo !== "GET") h["x-casa-lotus"] = "1";
    const r = await fetch(base + ruta, { method: metodo, headers: h, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined, redirect: "manual" });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      if (kv.slice(0, i) !== "cl_sesion") continue;
      const v = kv.slice(i + 1);
      cookie = v && !/Expires=Thu, 01 Jan 1970/i.test(c) ? "cl_sesion=" + v : "";
    }
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { json = null; }
    return { status: r.status, json, headers: r.headers, texto };
  }
  return {
    get: (ruta, o) => pedir("GET", ruta, undefined, o),
    post: (ruta, cuerpo = {}, o) => pedir("POST", ruta, cuerpo, o),
    patch: (ruta, cuerpo = {}, o) => pedir("PATCH", ruta, cuerpo, o),
    del: (ruta, cuerpo, o) => pedir("DELETE", ruta, cuerpo, o),
    get cookie() { return cookie; },
    set cookie(v) { cookie = v; },
  };
}

export async function entrarComo(c, cuenta) {
  const r = await c.post("/api/auth/entrar", { correo: cuenta.correo, password: cuenta.password });
  if (r.status !== 200) throw new Error("no pude entrar como " + cuenta.correo + ": " + r.texto);
  return r.json.usuario;
}

/** A complete public booking body. */
export function reservaWeb(clase, { nombre = "Laura Gómez", whatsapp = "312 555 0101", correo = "", plan, ref = "WEB-HERO", clickIds, salud = "Ninguna" } = {}) {
  return {
    clase, ref, plan, clickIds, website: "",
    perfil: {
      nombre, whatsapp, correo, salud, contactoEmergencia: { nombre: "Mamá", whatsapp: "300 555 9999" }, experiencia: "Primera vez", llego: "Instagram",
      intereses: ["Reducir niveles de estrés / ansiedad"],
    },
    consentimientos: { datos: { acepta: true }, descargo: { acepta: true }, imagen: { acepta: true }, sensibles: { acepta: false } },
  };
}
