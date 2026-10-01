// Casa Lotus · HTTP guards: session loading, roles (admin ⊇ profe), CSRF, security headers.
import { leerCookie, leerSesion } from "./sesiones.js";
import { noAutenticado, sinPermiso } from "../errores.js";

/** Reads the `cl_sesion` cookie into req.sesion and req.actor (and req.usuario for staff). */
export function cargarSesion(ctx) {
  return (req, _res, next) => {
    const s = leerSesion(ctx, leerCookie(req));
    if (s) {
      req.sesion = s;
      if (s.rol === "clienta") {
        req.actor = {
          tipo: "clienta", id: s.clienta, nombre: s.datos?.nombre || "", whatsapp: s.whatsapp || "",
          limitada: s.alcance === "reserva", reservas: s.datos?.reservas || [],
        };
      } else {
        const u = s.usuarioFila;
        req.usuario = { id: u.id, rol: u.rol, nombre: u.nombre, nombreHorario: u.nombre_horario, correo: u.correo };
        req.actor = { tipo: u.rol, id: u.id, nombre: u.nombre, nombreHorario: u.nombre_horario };
      }
    }
    next();
  };
}

/** Requires one of the roles. Admin may use everything a profe can. */
export function exigir(...roles) {
  return (req, _res, next) => {
    if (!req.actor) return next(noAutenticado());
    const rol = req.actor.tipo;
    if (roles.includes(rol) || (rol === "admin" && roles.includes("profe"))) return next();
    next(sinPermiso());
  };
}

const SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF: every non-GET carries `X-Casa-Lotus: 1` (a header a cross-site form cannot send) and, when the
 * browser sends Origin, it must be ours. `sinCabecera` lists paths exempt from the header (sendBeacon
 * cannot set headers) — they still need a same-site Origin.
 */
export function csrf(config, { exentas = [], sinCabecera = [] } = {}) {
  const permitidos = new Set(config.origenesPermitidos);
  return (req, _res, next) => {
    if (SEGUROS.has(req.method)) return next();
    if (exentas.some((p) => req.path.startsWith(p))) return next();
    const origen = req.get("origin");
    if (origen && !permitidos.has(origen)) return next(sinPermiso("Solicitud no permitida."));
    if (req.get("sec-fetch-site") === "cross-site") return next(sinPermiso("Solicitud no permitida."));
    if (sinCabecera.some((p) => req.path.startsWith(p))) return next();
    if (req.get("x-casa-lotus") !== "1") return next(sinPermiso("Solicitud no permitida."));
    next();
  };
}

/** Strict headers for a JSON API. */
export function cabecerasSeguras(config) {
  return (req, res, next) => {
    res.set({
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "X-Robots-Tag": "noindex, nofollow",
    });
    if (config.produccion) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    if (!res.get("Cache-Control")) res.set("Cache-Control", "no-store");
    next();
  };
}

/** Dev only: CORS for the app (5180) and the site (4321) when they call the API directly. */
export function corsDev(config) {
  const permitidos = new Set(config.cors);
  return (req, res, next) => {
    const o = req.get("origin");
    if (o && permitidos.has(o)) {
      res.set({
        "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true", Vary: "Origin",
        "Access-Control-Allow-Headers": "Content-Type, X-Casa-Lotus", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      });
      if (req.method === "OPTIONS") return res.status(204).end();
    }
    next();
  };
}
