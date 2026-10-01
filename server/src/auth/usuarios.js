// Casa Lotus · staff accounts (admin, profe): invitations, sign-in, passwords, resets, the team.
// Answers never reveal whether an e-mail has an account.
import * as R from "../../../shared/reglas.js";
import { hashPassword, verificarPassword, passwordDebil, token as nuevoToken, idCorto, sha256 } from "./claves.js";
import { consumir, limpiar, MINUTO, HORA } from "./limites.js";
import { cerrarSesionesDeUsuario } from "./sesiones.js";
import { anotarRegistro } from "../dominio/registro.js";
import { conflicto, noAutenticado, noExiste, validacion, ErrorApp } from "../errores.js";
import { correoRestablecer } from "../notificaciones/plantillas.js";

const DIAS = 86400000;
export const VIGENCIA = { invitacion: 7 * DIAS, restablecer: HORA, acceso: 7 * DIAS };

export function vistaUsuario(u) {
  if (!u) return null;
  return {
    id: u.id, rol: u.rol, nombre: u.nombre, nombreHorario: u.nombre_horario, correo: u.correo, whatsapp: u.whatsapp, activa: Boolean(u.activa),
    bio: u.bio, foto: u.foto, creada: new Date(u.creada).toISOString(), ultimoAcceso: u.ultimo_acceso ? new Date(u.ultimo_acceso).toISOString() : null,
  };
}

const porCorreo = (ctx, correo) => ctx.db.prepare("SELECT * FROM usuarios WHERE correo = ? COLLATE NOCASE").get(String(correo).trim());
export const porId = (ctx, id) => ctx.db.prepare("SELECT * FROM usuarios WHERE id = ?").get(id);

function exigirPassword(password, u) {
  const debil = passwordDebil(password, { correo: u.correo, nombre: u.nombre });
  if (debil) throw validacion(debil, { password: debil });
}

/* ── tokens (invitation, reset, clienta access link) ── */

export function crearToken(ctx, tipo, { usuario = null, clienta = null } = {}) {
  const t = nuevoToken(32), ahora = ctx.ahora();
  if (usuario) ctx.db.prepare("UPDATE tokens SET usado = ? WHERE usuario = ? AND tipo = ? AND usado IS NULL").run(ahora, usuario, tipo);
  ctx.db.prepare("INSERT INTO tokens (hash, tipo, usuario, clienta, creado, vence) VALUES (?, ?, ?, ?, ?, ?)").run(sha256(t), tipo, usuario, clienta, ahora, ahora + VIGENCIA[tipo]);
  return { token: t, vence: new Date(ahora + VIGENCIA[tipo]).toISOString() };
}

export function leerToken(ctx, tipo, t) {
  if (!t || String(t).length < 20 || String(t).length > 100) return null;
  const f = ctx.db.prepare("SELECT * FROM tokens WHERE hash = ? AND tipo = ?").get(sha256(t), tipo);
  if (!f || f.usado || f.vence <= ctx.ahora()) return null;
  return f;
}

export function gastarToken(ctx, f) {
  const r = ctx.db.prepare("UPDATE tokens SET usado = ? WHERE hash = ? AND usado IS NULL").run(ctx.ahora(), f.hash);
  return r.changes === 1;
}

/* ── the team ─────────────────────────────────────────── */

export function invitacionPara(ctx, u) {
  const { token, vence } = crearToken(ctx, "invitacion", { usuario: u.id });
  const enlace = ctx.config.publicUrl + "/app/invitacion/" + token;
  const waTexto = "Hola " + R.primerNombre(u.nombre) + ", te invito al equipo de Casa Lotus. Crea tu contraseña aquí (el enlace vence en 7 días): " + enlace;
  return { enlace, waTexto, waEnlace: u.whatsapp ? R.enlaceWhatsApp(u.whatsapp, waTexto) : "https://wa.me/?text=" + encodeURIComponent(waTexto), vence };
}

export function crearUsuario(ctx, actor, { rol, nombre, nombreHorario = "", correo, whatsapp = "" }) {
  if (porCorreo(ctx, correo)) throw conflicto("estado", "Ya hay alguien del equipo con ese correo.");
  const id = "U-" + idCorto(6);
  ctx.db.prepare(`INSERT INTO usuarios (id, rol, nombre, nombre_horario, correo, whatsapp, activa, creada) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
    .run(id, rol, nombre, nombreHorario || (rol === "profe" ? R.primerNombre(nombre) : ""), correo, whatsapp || "", ctx.ahora());
  const u = porId(ctx, id);
  anotarRegistro(ctx, actor, "equipo.crear", id, { rol, nombre, correo });
  return { usuario: vistaUsuario(u), invitacion: invitacionPara(ctx, u) };
}

export function nuevaInvitacion(ctx, actor, id) {
  const u = porId(ctx, id);
  if (!u) throw noExiste("No encontramos a esa persona del equipo.");
  anotarRegistro(ctx, actor, "equipo.invitacion", id, {});
  return invitacionPara(ctx, u);
}

export function editarEquipo(ctx, actor, id, cambios) {
  const u = porId(ctx, id);
  if (!u) throw noExiste("No encontramos a esa persona del equipo.");
  const quitaAdmin = (cambios.activa === false || (cambios.rol && cambios.rol !== "admin")) && u.rol === "admin";
  if (quitaAdmin) {
    if (id === actor.id) throw validacion("No puedes quitarte a ti misma el acceso de administradora.");
    const otros = ctx.db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activa = 1 AND id != ?").get(id).n;
    if (!otros) throw validacion("Debe quedar al menos una persona administradora activa.");
  }
  const sets = [], vals = [];
  if (cambios.nombre !== undefined) { sets.push("nombre = ?"); vals.push(cambios.nombre); }
  if (cambios.nombreHorario !== undefined) { sets.push("nombre_horario = ?"); vals.push(cambios.nombreHorario); }
  if (cambios.whatsapp !== undefined) { sets.push("whatsapp = ?"); vals.push(cambios.whatsapp); }
  if (cambios.rol !== undefined) { sets.push("rol = ?"); vals.push(cambios.rol); }
  if (cambios.activa !== undefined) { sets.push("activa = ?"); vals.push(cambios.activa ? 1 : 0); }
  if (sets.length) ctx.db.prepare("UPDATE usuarios SET " + sets.join(", ") + " WHERE id = ?").run(...vals, id);
  // a deactivated account (or a changed role) loses every open session at once
  if (cambios.activa === false || (cambios.rol && cambios.rol !== u.rol)) cerrarSesionesDeUsuario(ctx, id);
  anotarRegistro(ctx, actor, "equipo.editar", id, cambios);
  return vistaUsuario(porId(ctx, id));
}

export function listarUsuarios(ctx) {
  return ctx.db.prepare("SELECT * FROM usuarios ORDER BY activa DESC, rol, nombre").all().map(vistaUsuario);
}

/* ── signing in ───────────────────────────────────────── */

const ERROR_ENTRAR = "Correo o contraseña incorrectos.";

export async function entrar(ctx, { correo, password }, { ip = "" } = {}) {
  const clave = "entrar:" + String(correo).toLowerCase() + "|" + ip;
  consumir(ctx, clave, 5, 15 * MINUTO, "Demasiados intentos. Espera 15 minutos y vuelve a intentarlo.");
  consumir(ctx, "entrar-ip:" + ip, 30, 15 * MINUTO, "Demasiados intentos desde esta conexión. Espera 15 minutos.");
  const u = porCorreo(ctx, correo);
  const ok = await verificarPassword(password, u?.hash || null);
  if (!u || !ok || !u.activa) {
    anotarRegistro(ctx, { tipo: "publico", nombre: "" }, "auth.entrar-fallido", u ? u.id : "", { motivo: !u ? "desconocido" : !u.activa ? "inactiva" : "clave" });
    throw noAutenticado(ERROR_ENTRAR);
  }
  limpiar(ctx, clave);
  ctx.db.prepare("UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?").run(ctx.ahora(), u.id);
  anotarRegistro(ctx, { tipo: u.rol, id: u.id, nombre: u.nombre }, "auth.entrar", u.id, {});
  return porId(ctx, u.id);
}

export async function cambiarPassword(ctx, usuarioId, { actual, nueva }, sesionActual) {
  const u = porId(ctx, usuarioId);
  consumir(ctx, "password:" + usuarioId, 5, 15 * MINUTO);
  if (!u || !(await verificarPassword(actual, u.hash))) throw validacion("La contraseña actual no es correcta.", { actual: "La contraseña actual no es correcta." });
  exigirPassword(nueva, u);
  ctx.db.prepare("UPDATE usuarios SET hash = ? WHERE id = ?").run(await hashPassword(nueva), u.id);
  cerrarSesionesDeUsuario(ctx, u.id, sesionActual);
  anotarRegistro(ctx, { tipo: u.rol, id: u.id, nombre: u.nombre }, "auth.password", u.id, {});
}

/**
 * POST /api/auth/recuperar. Always 204, at once: the lookup and the e-mail happen after the answer, so
 * neither the body nor the timing reveals whether the e-mail has an account.
 */
export function recuperar(ctx, { correo }, { ip = "" } = {}) {
  consumir(ctx, "recuperar-ip:" + ip, 10, HORA);
  ctx.enSegundoPlano(async () => {
    try {
      consumir(ctx, "recuperar:" + String(correo).toLowerCase(), 3, HORA);
    } catch {
      return;
    }
    const u = porCorreo(ctx, correo);
    if (!u || !u.activa) return;
    const { token } = crearToken(ctx, "restablecer", { usuario: u.id });
    const enlace = ctx.config.publicUrl + "/app/restablecer/" + token;
    const m = correoRestablecer({ nombre: u.nombre, enlace, publicUrl: ctx.config.publicUrl });
    anotarRegistro(ctx, { tipo: "publico" }, "auth.recuperar", u.id, {});
    await ctx.correo.enviar({ para: u.correo, asunto: m.asunto, html: m.html, texto: m.texto });
  });
}

export async function restablecer(ctx, { token, nueva }) {
  const f = leerToken(ctx, "restablecer", token);
  if (!f) throw noExiste("Este enlace ya no sirve. Pide uno nuevo desde «¿Olvidaste tu contraseña?».");
  const u = porId(ctx, f.usuario);
  if (!u || !u.activa) throw noExiste("Este enlace ya no sirve.");
  exigirPassword(nueva, u);
  if (!gastarToken(ctx, f)) throw noExiste("Este enlace ya no sirve.");
  ctx.db.prepare("UPDATE usuarios SET hash = ?, ultimo_acceso = ? WHERE id = ?").run(await hashPassword(nueva), ctx.ahora(), u.id);
  cerrarSesionesDeUsuario(ctx, u.id);
  anotarRegistro(ctx, { tipo: u.rol, id: u.id, nombre: u.nombre }, "auth.restablecer", u.id, {});
  return porId(ctx, u.id);
}

export function verInvitacion(ctx, token) {
  const f = leerToken(ctx, "invitacion", token);
  const u = f && porId(ctx, f.usuario);
  if (!u || !u.activa) throw noExiste("Esta invitación ya no sirve. Pídele una nueva a Ana.");
  return { nombre: u.nombre, correo: u.correo, rol: u.rol };
}

export async function aceptarInvitacion(ctx, token, { password }) {
  const f = leerToken(ctx, "invitacion", token);
  const u = f && porId(ctx, f.usuario);
  if (!u || !u.activa) throw noExiste("Esta invitación ya no sirve. Pídele una nueva a Ana.");
  exigirPassword(password, u);
  if (!gastarToken(ctx, f)) throw noExiste("Esta invitación ya no sirve.");
  ctx.db.prepare("UPDATE usuarios SET hash = ?, ultimo_acceso = ? WHERE id = ?").run(await hashPassword(password), ctx.ahora(), u.id);
  anotarRegistro(ctx, { tipo: u.rol, id: u.id, nombre: u.nombre }, "auth.invitacion", u.id, {});
  return porId(ctx, u.id);
}

export function editarCuenta(ctx, usuarioId, cambios) {
  const sets = [], vals = [];
  for (const [k, col] of [["nombre", "nombre"], ["whatsapp", "whatsapp"], ["bio", "bio"], ["foto", "foto"]]) {
    if (cambios[k] !== undefined) { sets.push(col + " = ?"); vals.push(cambios[k]); }
  }
  if (sets.length) ctx.db.prepare("UPDATE usuarios SET " + sets.join(", ") + " WHERE id = ?").run(...vals, usuarioId);
  const u = porId(ctx, usuarioId);
  anotarRegistro(ctx, { tipo: u.rol, id: u.id, nombre: u.nombre }, "cuenta.editar", u.id, { campos: Object.keys(cambios) });
  return vistaUsuario(u);
}

/** CLI bootstrap (scripts/crear-admin.mjs): an admin and her one-time setup link. */
export function crearAdminInicial(ctx, { correo, nombre }) {
  let u = porCorreo(ctx, correo);
  if (u && u.rol !== "admin") throw new ErrorApp("conflicto", "Ese correo ya es de una profe.");
  if (!u) {
    const id = "U-" + idCorto(6);
    ctx.db.prepare("INSERT INTO usuarios (id, rol, nombre, correo, activa, creada) VALUES (?, 'admin', ?, ?, 1, ?)").run(id, nombre, correo, ctx.ahora());
    u = porId(ctx, id);
  } else {
    ctx.db.prepare("UPDATE usuarios SET activa = 1 WHERE id = ?").run(u.id);
  }
  anotarRegistro(ctx, { tipo: "sistema", nombre: "crear-admin" }, "equipo.admin-inicial", u.id, { correo });
  return { usuario: vistaUsuario(u), invitacion: invitacionPara(ctx, u) };
}

/** Dev only: an account with a known password (used by the memory seed). */
export async function crearUsuarioConPassword(ctx, { rol, nombre, nombreHorario = "", correo, whatsapp = "", password }) {
  const id = "U-" + idCorto(6);
  ctx.db.prepare(`INSERT INTO usuarios (id, rol, nombre, nombre_horario, correo, whatsapp, activa, hash, creada) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .run(id, rol, nombre, nombreHorario, correo, whatsapp, await hashPassword(password), ctx.ahora());
  return porId(ctx, id);
}
