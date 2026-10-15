// Casa Lotus · /api/publico: no session. Counts only, never names or phones.
import express from "express";
import {
  z, reservaPublica as esqReserva, esperaPublica as esqEspera, eventoPublico as esqEvento, identificar as esqIdentificar, fecha,
} from "../dominio/esquemas.js";
import { validar } from "./validar.js";
import { disponibilidad } from "../dominio/clases.js";
import { planes } from "../dominio/pagos.js";
import { estudio, reservaPublica, esperaPublica, eventoPublico, identificar } from "../dominio/publico.js";
import { consumir, HORA } from "../auth/limites.js";
import { crearSesion, ponerCookie, guardarDatosSesion, leerCookie, leerSesion } from "../auth/sesiones.js";

const cachePublica = (res) => res.set("Cache-Control", "public, max-age=20, stale-while-revalidate=40");

/** sendBeacon / keepalive bodies arrive as application/json or text/plain. Mounted before express.json(). */
export function rutaEventos(ctx) {
  return [
    express.text({ type: () => true, limit: "8kb" }),
    (req, res) => {
      try {
        consumir(ctx, "eventos:" + req.ip, 600, HORA);
        const datos = validar(esqEvento, typeof req.body === "string" && req.body ? JSON.parse(req.body) : {});
        eventoPublico(ctx, datos, { ip: req.ip });
      } catch {
        // a beacon never gets an error back: bad or excessive beacons are simply dropped
      }
      res.status(204).end();
    },
  ];
}

export function rutasPublicas(ctx) {
  const r = express.Router();

  r.get("/disponibilidad", async (req, res) => {
    const q = validar(z.object({ desde: fecha.optional(), dias: z.coerce.number().int().min(1).max(60).optional() }), req.query);
    cachePublica(res);
    res.json(await disponibilidad(ctx, q));
  });

  r.get("/planes", async (_req, res) => {
    cachePublica(res);
    res.json(await planes(ctx, { soloActivos: true }));
  });

  r.get("/estudio", async (_req, res) => {
    cachePublica(res);
    res.json(await estudio(ctx));
  });

  // a returning student: name + WhatsApp → what the booking still needs (never who she is)
  r.post("/identificar", async (req, res) => {
    const nadie = { conocida: false, pideFicha: true, pideAcuerdos: true };
    if (typeof req.body?.website === "string" && req.body.website.trim()) return res.json(nadie);
    consumir(ctx, "identificar-ip:" + req.ip, 10, HORA, "Demasiados intentos. Espera un rato o escríbenos por WhatsApp.");
    const datos = validar(esqIdentificar, req.body);
    consumir(ctx, "identificar-wa:" + datos.whatsapp, 5, HORA, "Demasiados intentos con ese número. Espera un rato o escríbenos por WhatsApp.");
    res.json(await identificar(ctx, datos));
  });

  r.post("/reservas", async (req, res) => {
    consumir(ctx, "reserva-web:" + req.ip, 10, HORA, "Hiciste muchas reservas seguidas. Escríbenos por WhatsApp y te ayudamos.");
    // honeypot: a bot gets a believable answer and nothing is stored
    if (typeof req.body?.website === "string" && req.body.website.trim()) {
      return res.status(201).json({ codigo: "R-0000", estado: "Pendiente de pago", clase: null, pago: null, sesion: false, conPlan: false, saldo: null, correo: false });
    }
    const datos = validar(esqReserva, req.body);
    const r0 = await reservaPublica(ctx, datos);
    const { clienta, nueva, destinoCorreo, ...cuerpo } = r0;

    // the session on this device: full for someone new; limited (only this booking) for a known number.
    // A staff member trying the form on her own device keeps her staff session.
    const actual = leerSesion(ctx, leerCookie(req));
    if (actual && actual.rol !== "clienta") {
      cuerpo.sesion = false;
    } else if (actual && actual.clienta === clienta) {
      if (actual.alcance === "reserva") {
        guardarDatosSesion(ctx, actual.id, {
          ...actual.datos, reservas: [...(actual.datos.reservas || []), cuerpo.codigo].slice(-20), ...(destinoCorreo ? { correo: destinoCorreo } : {}),
        });
      }
    } else {
      const s = crearSesion(ctx, {
        rol: "clienta", clienta, whatsapp: datos.perfil.whatsapp, alcance: nueva ? "completa" : "reserva",
        // a limited session keeps the address its e-mails go to (the one typed here, never the owner's)
        datos: { nombre: datos.perfil.nombre, reservas: [cuerpo.codigo], ...(destinoCorreo ? { correo: destinoCorreo } : {}) },
        ua: req.get("user-agent") || "", ip: req.ip,
      });
      ponerCookie(ctx, req, res, s);
    }
    res.status(201).json(cuerpo);
  });

  r.post("/espera", async (req, res) => {
    consumir(ctx, "espera-web:" + req.ip, 10, HORA, "Demasiados intentos. Escríbenos por WhatsApp y te ayudamos.");
    if (typeof req.body?.website === "string" && req.body.website.trim()) return res.status(201).json({ id: "E-0000" });
    const datos = validar(esqEspera, req.body);
    res.status(201).json(await esperaPublica(ctx, datos));
  });

  return r;
}
