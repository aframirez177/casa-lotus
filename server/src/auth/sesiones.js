// Casa Lotus · sessions: an opaque 32-byte token in the cookie `cl_sesion`, stored only as SHA-256.
// Staff: 30-day sliding expiry. Clienta: 180 days. Deactivating a staff member deletes her sessions.
import { token as nuevoToken, idCorto, sha256 } from "./claves.js";

export const COOKIE = "cl_sesion";
export const DURACION = { admin: 30 * 86400000, profe: 30 * 86400000, clienta: 180 * 86400000 };
const REFRESCO = 5 * 60000; // sliding expiry is written at most every 5 minutes

export function crearSesion(ctx, { rol, usuario = null, clienta = null, whatsapp = null, alcance = "completa", datos = {}, ua = "", ip = "" }) {
  const t = nuevoToken(32), id = idCorto(12), ahora = ctx.ahora();
  ctx.db.prepare(`INSERT INTO sesiones (id, token_hash, rol, usuario, clienta, whatsapp, alcance, datos, creada, ultimo_uso, vence, ua, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, sha256(t), rol, usuario, clienta, whatsapp, alcance, JSON.stringify(datos), ahora, ahora, ahora + DURACION[rol],
    String(ua).slice(0, 300), String(ip).slice(0, 64),
  );
  return { token: t, id, maxAge: DURACION[rol] };
}

/** The live session for a cookie token, or null. Staff sessions need an active account. */
export function leerSesion(ctx, t) {
  if (!t || t.length < 20 || t.length > 100) return null;
  const s = ctx.db.prepare("SELECT * FROM sesiones WHERE token_hash = ?").get(sha256(t));
  const ahora = ctx.ahora();
  if (!s) return null;
  if (s.vence <= ahora) {
    ctx.db.prepare("DELETE FROM sesiones WHERE id = ?").run(s.id);
    return null;
  }
  let usuario = null;
  if (s.rol !== "clienta") {
    usuario = ctx.db.prepare("SELECT * FROM usuarios WHERE id = ?").get(s.usuario);
    if (!usuario || !usuario.activa || usuario.rol !== s.rol) {
      ctx.db.prepare("DELETE FROM sesiones WHERE id = ?").run(s.id);
      return null;
    }
  }
  if (ahora - s.ultimo_uso > REFRESCO) {
    ctx.db.prepare("UPDATE sesiones SET ultimo_uso = ?, vence = ? WHERE id = ?").run(ahora, ahora + DURACION[s.rol], s.id);
    if (usuario) ctx.db.prepare("UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?").run(ahora, usuario.id);
  }
  let datos = {};
  try { datos = JSON.parse(s.datos || "{}"); } catch { datos = {}; }
  return { ...s, datos, usuarioFila: usuario };
}

export function guardarDatosSesion(ctx, id, datos) {
  ctx.db.prepare("UPDATE sesiones SET datos = ? WHERE id = ?").run(JSON.stringify(datos), id);
}

export function cerrarSesion(ctx, id) {
  ctx.db.prepare("DELETE FROM sesiones WHERE id = ?").run(id);
}

export function cerrarSesionesDeUsuario(ctx, usuario, excepto = null) {
  ctx.db.prepare("DELETE FROM sesiones WHERE usuario = ? AND id IS NOT ?").run(usuario, excepto);
}

export function cerrarSesionesDeClienta(ctx, clienta, excepto = null) {
  ctx.db.prepare("DELETE FROM sesiones WHERE clienta = ? AND rol = 'clienta' AND id IS NOT ?").run(clienta, excepto);
}

/** "iPhone · Safari" from a user agent, for the sessions list. */
export function dispositivo(ua = "") {
  const so = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac"
    : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Otro dispositivo";
  const nav = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari" : "";
  return nav ? so + " · " + nav : so;
}

export function listarSesiones(ctx, sesion) {
  const filas = sesion.rol === "clienta"
    ? ctx.db.prepare("SELECT * FROM sesiones WHERE clienta = ? AND rol = 'clienta' AND vence > ? ORDER BY ultimo_uso DESC").all(sesion.clienta, ctx.ahora())
    : ctx.db.prepare("SELECT * FROM sesiones WHERE usuario = ? AND vence > ? ORDER BY ultimo_uso DESC").all(sesion.usuario, ctx.ahora());
  return filas.map((s) => ({
    id: s.id, actual: s.id === sesion.id, creada: new Date(s.creada).toISOString(), ultimoUso: new Date(s.ultimo_uso).toISOString(), dispositivo: dispositivo(s.ua),
  }));
}

/** Cookie options. `Secure` is off only in development over plain http. */
export function opcionesCookie(ctx, req, maxAge) {
  const inseguro = ctx.config.dev && req.protocol === "http";
  const o = { httpOnly: true, secure: !inseguro, sameSite: "lax", path: "/" };
  if (maxAge !== undefined) o.maxAge = maxAge;
  return o;
}

export function ponerCookie(ctx, req, res, s) {
  res.cookie(COOKIE, s.token, opcionesCookie(ctx, req, s.maxAge));
}

export function borrarCookie(ctx, req, res) {
  res.clearCookie(COOKIE, opcionesCookie(ctx, req));
}

/** Tiny cookie reader (no dependency). */
export function leerCookie(req, nombre = COOKIE) {
  const h = req.headers.cookie;
  if (!h) return null;
  for (const parte of h.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nombre) {
      try { return decodeURIComponent(parte.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}
