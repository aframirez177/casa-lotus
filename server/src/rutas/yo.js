// Casa Lotus · /api/yo: the clienta's own account. Every handler acts as her, on her data only.
import express from "express";
import { z, perfilParcial, consentimientos, claseId, idEspera } from "../dominio/esquemas.js";
import { validar } from "./validar.js";
import { exigir } from "../auth/middleware.js";
import { miCuenta } from "../dominio/yo.js";
import { actualizarMiPerfil, actualizarMisConsentimientos } from "../dominio/clientas.js";
import { reservar, cancelar, reagendar, unirseEspera, salirEspera } from "../dominio/reservas.js";
import { sinPermiso } from "../errores.js";
import { guardarDatosSesion } from "../auth/sesiones.js";

/** A limited session (public booking with a known number) may only see and change what it booked. */
const soloCompleta = (req, _res, next) => next(req.actor.limitada ? sinPermiso("Confirma tu WhatsApp con un código para ver toda tu cuenta.") : undefined);

export function rutasYo(ctx) {
  const r = express.Router();
  r.use(exigir("clienta"));

  r.get("/", async (req, res) => res.json(await miCuenta(ctx, req.actor)));

  r.patch("/perfil", soloCompleta, async (req, res) => {
    const d = validar(perfilParcial, req.body);
    res.json(await actualizarMiPerfil(ctx, req.actor, d));
  });

  r.post("/consentimientos", soloCompleta, async (req, res) => {
    const d = validar(consentimientos, req.body);
    res.json(await actualizarMisConsentimientos(ctx, req.actor, d));
  });

  r.post("/reservas", async (req, res) => {
    const { clase } = validar(z.object({ clase: claseId }), req.body);
    if (req.actor.limitada) throw sinPermiso("Confirma tu WhatsApp con un código para reservar desde tu cuenta.");
    res.status(201).json(await reservar(ctx, req.actor, { clase }));
  });

  r.post("/reservas/:id/cancelar", async (req, res) => {
    res.json(await cancelar(ctx, req.actor, req.params.id));
  });

  r.post("/reservas/:id/reagendar", async (req, res) => {
    const { clase } = validar(z.object({ clase: claseId }), req.body);
    const out = await reagendar(ctx, req.actor, req.params.id, clase);
    if (req.actor.limitada) {
      // the moved booking stays reachable from this device
      guardarDatosSesion(ctx, req.sesion.id, { ...req.sesion.datos, reservas: [...(req.sesion.datos.reservas || []), out.nueva.id].slice(-20) });
    }
    res.json(out);
  });

  r.post("/espera", soloCompleta, async (req, res) => {
    const { clase } = validar(z.object({ clase: claseId }), req.body);
    res.status(201).json(await unirseEspera(ctx, req.actor, { clase }));
  });

  r.delete("/espera/:id", soloCompleta, async (req, res) => {
    validar(z.object({ id: idEspera }), req.params);
    await salirEspera(ctx, req.actor, req.params.id);
    res.status(204).end();
  });

  return r;
}
