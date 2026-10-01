// Casa Lotus · /api/auth: staff sign-in (e-mail + password), clienta codes and access links,
// invitations, password reset, sessions and the staff's own account.
import express from "express";
import { z, correo, whatsapp, texto } from "../dominio/esquemas.js";
import { validar } from "./validar.js";
import { exigir } from "../auth/middleware.js";
import {
  crearSesion, ponerCookie, borrarCookie, cerrarSesion, cerrarSesionesDeUsuario, cerrarSesionesDeClienta, listarSesiones,
} from "../auth/sesiones.js";
import {
  entrar, cambiarPassword, recuperar, restablecer, verInvitacion, aceptarInvitacion, editarCuenta, vistaUsuario, porId,
} from "../auth/usuarios.js";
import { pedirCodigo, verificarCodigo, usarEnlace } from "../auth/clientas.js";
import { nombreDeSesion } from "../dominio/yo.js";
import { noAutenticado, noExiste, validacion } from "../errores.js";
import { consumir, HORA } from "../auth/limites.js";

const BOTS = /(WhatsApp|facebookexternalhit|Facebot|TelegramBot|Slackbot|Twitterbot|Discordbot|LinkedInBot|Googlebot|bingbot|Applebot|SkypeUriPreview|preview)/i;

const yoStaff = (u) => ({ usuario: { ...vistaUsuario(u) } });

function abrirSesionStaff(ctx, req, res, u) {
  if (req.sesion) cerrarSesion(ctx, req.sesion.id); // never reuse a session id across a sign-in
  const s = crearSesion(ctx, { rol: u.rol, usuario: u.id, ua: req.get("user-agent") || "", ip: req.ip });
  ponerCookie(ctx, req, res, s);
}

function abrirSesionClienta(ctx, req, res, c) {
  if (req.sesion) cerrarSesion(ctx, req.sesion.id);
  const s = crearSesion(ctx, { rol: "clienta", clienta: c.id, whatsapp: c.whatsapp, datos: { nombre: c.nombre }, ua: req.get("user-agent") || "", ip: req.ip });
  ponerCookie(ctx, req, res, s);
}

const clientaUsuario = (actor, nombre) => ({
  usuario: { id: actor.id, rol: "clienta", nombre, whatsapp: actor.whatsapp, clienta: actor.id, limitada: Boolean(actor.limitada) },
});

export function rutasAuth(ctx) {
  const r = express.Router();

  r.get("/yo", async (req, res) => {
    if (!req.actor) throw noAutenticado("No has entrado.");
    if (req.actor.tipo === "clienta") return res.json(clientaUsuario(req.actor, await nombreDeSesion(ctx, req.actor)));
    res.json(yoStaff(porId(ctx, req.actor.id)));
  });

  r.post("/entrar", async (req, res) => {
    const d = validar(z.object({ correo, password: z.string().min(1).max(200) }), req.body);
    const u = await entrar(ctx, d, { ip: req.ip });
    abrirSesionStaff(ctx, req, res, u);
    res.json(yoStaff(u));
  });

  r.post("/codigo", async (req, res) => {
    const d = validar(z.union([z.object({ whatsapp }), z.object({ correo })]), req.body);
    res.json(pedirCodigo(ctx, d, { ip: req.ip }));
  });

  r.post("/verificar", async (req, res) => {
    const codigo = z.string().trim().regex(/^\d{6}$/, { error: "El código tiene 6 números." });
    const d = validar(z.union([z.object({ whatsapp, codigo }), z.object({ correo, codigo })]), req.body);
    const c = await verificarCodigo(ctx, d, { ip: req.ip });
    abrirSesionClienta(ctx, req, res, c);
    res.json(clientaUsuario({ id: c.id, whatsapp: c.whatsapp, limitada: false }, c.nombre));
  });

  r.get("/enlace/:token", async (req, res) => {
    // link previews (WhatsApp, Telegram…) must not burn the link
    if (BOTS.test(req.get("user-agent") || "")) {
      return res.status(200).type("html").set("Cache-Control", "no-store").send("<!doctype html><meta name=robots content=noindex><title>Casa Lotus</title>");
    }
    try {
      consumir(ctx, "enlace-ip:" + req.ip, 20, HORA);
    } catch {
      return res.redirect(302, "/app/entrar?enlace=limite");
    }
    const c = await usarEnlace(ctx, req.params.token);
    if (!c) return res.redirect(302, "/app/entrar?enlace=vencido");
    abrirSesionClienta(ctx, req, res, c);
    res.redirect(302, "/app/mi");
  });

  r.post("/salir", (req, res) => {
    if (req.sesion) cerrarSesion(ctx, req.sesion.id);
    borrarCookie(ctx, req, res);
    res.status(204).end();
  });

  r.post("/password", exigir("admin", "profe"), async (req, res) => {
    const d = validar(z.object({ actual: z.string().min(1).max(200), nueva: z.string().max(200) }), req.body);
    await cambiarPassword(ctx, req.actor.id, d, req.sesion.id);
    res.status(204).end();
  });

  r.post("/recuperar", async (req, res) => {
    const d = validar(z.object({ correo }), req.body);
    recuperar(ctx, d, { ip: req.ip });
    res.status(204).end();
  });

  r.post("/restablecer", async (req, res) => {
    const d = validar(z.object({ token: z.string().min(20).max(100), nueva: z.string().max(200) }), req.body);
    const u = await restablecer(ctx, d);
    abrirSesionStaff(ctx, req, res, u);
    res.json(yoStaff(u));
  });

  r.get("/invitacion/:token", (req, res) => {
    res.json(verInvitacion(ctx, req.params.token));
  });

  r.post("/invitacion/:token", async (req, res) => {
    consumir(ctx, "invitacion-ip:" + req.ip, 20, HORA);
    const d = validar(z.object({ password: z.string().max(200) }), req.body);
    const u = await aceptarInvitacion(ctx, req.params.token, d);
    abrirSesionStaff(ctx, req, res, u);
    res.json(yoStaff(u));
  });

  r.get("/sesiones", (req, res) => {
    if (!req.sesion) throw noAutenticado();
    res.json(listarSesiones(ctx, req.sesion));
  });

  r.delete("/sesiones/:id", (req, res) => {
    if (!req.sesion) throw noAutenticado();
    const s = req.sesion;
    if (req.params.id === "otras") {
      if (s.rol === "clienta") cerrarSesionesDeClienta(ctx, s.clienta, s.id);
      else cerrarSesionesDeUsuario(ctx, s.usuario, s.id);
      return res.status(204).end();
    }
    const mias = listarSesiones(ctx, s).map((x) => x.id);
    if (!mias.includes(req.params.id)) throw noExiste("Esa sesión no existe.");
    cerrarSesion(ctx, req.params.id);
    if (req.params.id === s.id) borrarCookie(ctx, req, res);
    res.status(204).end();
  });

  r.patch("/cuenta", exigir("admin", "profe"), (req, res) => {
    const foto = z.union([
      z.literal(""),
      z.string().max(300).regex(/^https:\/\/[^\s"'<>]+$/, { error: "Usa un enlace https." }),
      z.string().max(200000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, { error: "Usa una imagen PNG, JPG o WebP." }),
    ]);
    const d = validar(z.object({
      nombre: texto(80, { min: 2 }).optional(), whatsapp: z.union([z.literal(""), whatsapp]).optional(), bio: texto(500).optional(), foto: foto.optional(),
    }), req.body);
    if (!Object.keys(d).length) throw validacion("No hay cambios.");
    res.json({ usuario: editarCuenta(ctx, req.actor.id, d) });
  });

  return r;
}
