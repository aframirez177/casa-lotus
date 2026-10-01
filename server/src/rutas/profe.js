// Casa Lotus · /api/profe: a profe's classes, roster with ficha, attendance and notes (admin may call it).
import express from "express";
import { z, fecha, mes, texto } from "../dominio/esquemas.js";
import { validar } from "./validar.js";
import { exigir } from "../auth/middleware.js";
import { clasesDeProfe, claseDeProfe, notaDeClase, resumenProfe } from "../dominio/profes.js";
import { asistencia } from "../dominio/reservas.js";
import { buscarParaProfe, registrarAsistente, cerrarLista } from "../dominio/asistencia.js";
import { pedirReemplazo } from "../dominio/asignacion.js";
import { idClienta } from "../dominio/esquemas.js";
import { rutasPush } from "./push.js";

export function rutasProfe(ctx) {
  const r = express.Router();
  r.use(exigir("profe"));

  r.get("/clases", async (req, res) => {
    const q = validar(z.object({ desde: fecha.optional(), hasta: fecha.optional() }), req.query);
    res.json(await clasesDeProfe(ctx, req.actor, q));
  });

  r.get("/clases/:id", async (req, res) => res.json(await claseDeProfe(ctx, req.actor, req.params.id)));

  r.post("/reservas/:id/asistencia", async (req, res) => {
    const { vino } = validar(z.object({ vino: z.boolean({ error: "Indica si vino o no." }) }), req.body);
    const out = await asistencia(ctx, req.actor, req.params.id, vino);
    res.json(out.clase);
  });

  r.post("/clases/:id/notas", async (req, res) => {
    const { texto: t } = validar(z.object({ texto: texto(500) }), req.body);
    res.json(await notaDeClase(ctx, req.actor, req.params.id, t));
  });

  r.get("/resumen", async (req, res) => {
    const q = validar(z.object({ mes: mes.optional() }), req.query);
    res.json(await resumenProfe(ctx, req.actor, q));
  });

  // walk-ins: find her by name, then register her as attended
  r.get("/clientas", async (req, res) => {
    const { q } = validar(z.object({ q: z.string().max(80).optional().default("") }), req.query);
    res.json(await buscarParaProfe(ctx, q));
  });
  r.post("/clases/:id/asistentes", async (req, res) => {
    const { clienta } = validar(z.object({ clienta: idClienta }), req.body);
    res.status(201).json(await registrarAsistente(ctx, req.actor, req.params.id, clienta));
  });
  r.post("/clases/:id/cerrar", async (req, res) => res.json(await cerrarLista(ctx, req.actor, req.params.id)));
  r.post("/clases/:id/reemplazo", async (req, res) => {
    const { motivo } = validar(z.object({ motivo: texto(300).optional().default("") }), req.body);
    res.json(await pedirReemplazo(ctx, req.actor, req.params.id, motivo));
  });

  // Web Push about her classes (assignments, new bookings)
  r.use("/push", rutasPush(ctx));

  return r;
}
