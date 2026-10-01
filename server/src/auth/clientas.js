// Casa Lotus · how a clienta signs in, without a password:
//  - a 6-digit code to her WhatsApp (when the Meta API is live) or her e-mail;
//  - a private access link Ana sends;
//  - a booking on the site opens a session on that device (limited when the number was already known).
import * as R from "../../../shared/reglas.js";
import { codigo6, sha256, igualesSeguro } from "./claves.js";
import { consumir, HORA } from "./limites.js";
import { crearToken, leerToken, gastarToken } from "./usuarios.js";
import { anotarRegistro } from "../dominio/registro.js";
import { modelo } from "../dominio/base.js";
import { correoCodigo } from "../notificaciones/plantillas.js";
import { noExiste, validacion } from "../errores.js";

const VIGENCIA_CODIGO = 10 * 60000;
const INTENTOS = 5;

const claveDestino = ({ whatsapp, correo }) => (whatsapp ? "wa:" + whatsapp : "correo:" + String(correo).toLowerCase());

function guardarCodigo(ctx, destino, clienta, whatsapp) {
  const codigo = codigo6(), ahora = ctx.ahora();
  ctx.db.prepare("UPDATE codigos SET usado = ? WHERE destino = ? AND usado IS NULL").run(ahora, destino);
  ctx.db.prepare("INSERT INTO codigos (destino, clienta, whatsapp, hash, creado, vence) VALUES (?, ?, ?, ?, ?, ?)")
    .run(destino, clienta, whatsapp || "", sha256(destino + ":" + codigo), ahora, ahora + VIGENCIA_CODIGO);
  return codigo;
}

async function porCorreo(ctx, codigo, correo) {
  const m = correoCodigo({ codigo, publicUrl: ctx.config.publicUrl });
  await ctx.correo.enviar({ para: correo, asunto: m.asunto, html: m.html, texto: m.texto });
}

/**
 * POST /api/auth/codigo. Answers `{ ok: true }` for every input, at once: whether she exists, which
 * channel was used and whether anything was sent are decided after the answer, in the background, so
 * neither the body nor the timing tells anything. Rate limits depend only on what was typed and the IP.
 */
export function pedirCodigo(ctx, entrada, { ip = "" } = {}) {
  const destino = claveDestino(entrada);
  consumir(ctx, "codigo-ip:" + ip, 10, HORA, "Pediste muchos códigos. Espera una hora y vuelve a intentarlo.");
  consumir(ctx, "codigo:" + destino, 3, HORA, "Pediste muchos códigos. Espera una hora y vuelve a intentarlo.");
  ctx.enSegundoPlano(() => enviarCodigoA(ctx, entrada, destino));
  return { ok: true };
}

/** WhatsApp when the Meta API is live, otherwise (or if Meta refuses) her e-mail; nobody unknown gets anything. */
async function enviarCodigoA(ctx, entrada, destino) {
  const M = await modelo(ctx);
  if (entrada.correo) {
    const correo = entrada.correo.toLowerCase();
    const c = M.clientas.find((x) => x.correo && x.correo.toLowerCase() === correo);
    if (!c) return;
    const codigo = guardarCodigo(ctx, destino, c.id, c.whatsapp);
    anotarRegistro(ctx, { tipo: "clienta", id: c.id, nombre: c.nombre }, "auth.codigo", c.id, { canal: "correo" });
    await porCorreo(ctx, codigo, c.correo);
    return;
  }
  const wa = entrada.whatsapp;
  const c = M.clientaPorWa.get(wa);
  if (!c) return;
  if (!ctx.whatsapp?.configurado && !c.correo) return;
  const codigo = guardarCodigo(ctx, destino, c.id, wa);
  let ok = false;
  if (ctx.whatsapp?.configurado) {
    try { ok = await ctx.whatsapp.enviarCodigo(wa, codigo); } catch { ok = false; }
  }
  anotarRegistro(ctx, { tipo: "clienta", id: c.id, nombre: c.nombre }, "auth.codigo", c.id, { canal: ok ? "whatsapp" : c.correo ? "correo" : "ninguno" });
  if (!ok && c.correo) await porCorreo(ctx, codigo, c.correo);
}

/** POST /api/auth/verificar → the clienta's id (the route opens a full session). */
export async function verificarCodigo(ctx, entrada, { ip = "" } = {}) {
  consumir(ctx, "verificar-ip:" + ip, 30, HORA, "Demasiados intentos. Espera un rato y vuelve a intentarlo.");
  const destino = claveDestino(entrada);
  const f = ctx.db.prepare("SELECT * FROM codigos WHERE destino = ? AND usado IS NULL AND vence > ? ORDER BY creado DESC LIMIT 1").get(destino, ctx.ahora());
  const malo = validacion("El código no es válido o ya venció. Pide uno nuevo.", { codigo: "El código no es válido o ya venció." });
  if (!f) throw malo;
  if (!igualesSeguro(sha256(destino + ":" + String(entrada.codigo).trim()), f.hash)) {
    const intentos = f.intentos + 1;
    ctx.db.prepare("UPDATE codigos SET intentos = ?, usado = ? WHERE id = ?").run(intentos, intentos >= INTENTOS ? ctx.ahora() : null, f.id);
    throw malo;
  }
  const r = ctx.db.prepare("UPDATE codigos SET usado = ? WHERE id = ? AND usado IS NULL").run(ctx.ahora(), f.id);
  if (r.changes !== 1) throw malo;
  const M = await modelo(ctx);
  const c = M.clientaPorId.get(f.clienta);
  if (!c) throw malo;
  anotarRegistro(ctx, { tipo: "clienta", id: c.id, nombre: c.nombre }, "auth.verificar", c.id, {});
  return { id: c.id, nombre: c.nombre, whatsapp: c.whatsapp };
}

/** POST /api/admin/clientas/:id/acceso → a private link for her (7 days, single use). */
export async function enlaceDeAcceso(ctx, actor, idClienta) {
  const M = await modelo(ctx);
  const c = M.clientaPorId.get(idClienta);
  if (!c) throw noExiste("No encontramos a esa clienta.");
  const { token, vence } = crearToken(ctx, "acceso", { clienta: c.id });
  const enlace = ctx.config.publicUrl + "/app/acceso/" + token;
  const waTexto = "Hola " + R.primerNombre(c.nombre) + ", este es tu enlace personal para ver tus clases y reservar en Casa Lotus: " + enlace +
    " Es solo para ti: no lo compartas. Vence en 7 días.";
  anotarRegistro(ctx, actor, "clienta.acceso", c.id, {});
  return { enlace, waTexto, waEnlace: c.whatsapp ? R.enlaceWhatsApp(c.whatsapp, waTexto) : "", vence };
}

/** GET /api/auth/enlace/:token → the clienta, or null if the link no longer works. */
export async function usarEnlace(ctx, token) {
  const f = leerToken(ctx, "acceso", token);
  if (!f) return null;
  const M = await modelo(ctx);
  const c = M.clientaPorId.get(f.clienta);
  if (!c || !gastarToken(ctx, f)) return null;
  anotarRegistro(ctx, { tipo: "clienta", id: c.id, nombre: c.nombre }, "auth.enlace", c.id, {});
  return { id: c.id, nombre: c.nombre, whatsapp: c.whatsapp };
}
