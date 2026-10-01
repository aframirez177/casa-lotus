// Casa Lotus · /api/admin: Ana's back office. Thin routes: validate, call the domain, shape.
import express from "express";
import * as E from "../dominio/esquemas.js";
import { validar } from "./validar.js";
import { exigir } from "../auth/middleware.js";
import { tablero } from "../dominio/tablero.js";
import { agenda, verClase, crearClaseExtra, editarClase, cancelarClase, horario, crearSlot, editarSlot, desactivarSlot } from "../dominio/clases.js";
import { listarClientas, segmentos, verClienta, crearClienta, editarClienta } from "../dominio/clientas.js";
import { reservar, confirmar, asistencia, cancelar, liberar, reagendar, listarEspera, tomarCupo, estadoEspera } from "../dominio/reservas.js";
import { pagosDelMes, registrarPago, planes, editarPlan } from "../dominio/pagos.js";
import { verAjustes, editarAjustes } from "../dominio/ajustes.js";
import { listarRegistro } from "../dominio/registro.js";
import { reporteAtribucion } from "../dominio/atribucion.js";
import { equipo, salud } from "../dominio/equipo.js";
import { enlaceDeAcceso } from "../auth/clientas.js";
import { crearUsuario, nuevaInvitacion, editarEquipo } from "../auth/usuarios.js";
import { rutasPush } from "./push.js";
import { listarProfes } from "../dominio/asignacion.js";

const { z } = E;
const MAX_STREAMS = 20;

export function rutasAdmin(ctx) {
  const r = express.Router();
  r.use(exigir("admin"));
  let streams = 0;

  r.get("/tablero", async (_req, res) => res.json(await tablero(ctx)));

  r.get("/novedades", (req, res) => {
    const { desde } = validar(z.object({ desde: z.string().max(40).optional() }), req.query);
    res.json({ ahora: new Date(ctx.ahora()).toISOString(), eventos: ctx.novedades.listar({ desde }) });
  });

  r.get("/stream", (req, res) => {
    if (streams >= MAX_STREAMS) return res.status(503).json({ ok: false, error: "servidor", mensaje: "Demasiadas conexiones abiertas." });
    streams++;
    res.set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    res.write("retry: 5000\n\n");
    const idSesion = req.sesion.id;
    const quitar = ctx.novedades.suscribir((e) => res.write("event: evento\ndata: " + JSON.stringify(e) + "\n\n"));
    const latido = setInterval(() => {
      // a revoked session (signed out, deactivated) closes its stream
      const viva = ctx.db.prepare("SELECT 1 FROM sesiones WHERE id = ? AND vence > ?").get(idSesion, ctx.ahora());
      if (!viva) return res.end();
      res.write(": ping\n\n");
    }, 25000);
    latido.unref?.();
    // shutdown ends every stream at once (see index.js), so Docker and --watch never wait for them
    const stream = {
      cerrar() {
        clearInterval(latido);
        if (!res.writableEnded) { res.write("event: adios\ndata: {}\n\n"); res.end(); }
      },
    };
    ctx.streams.add(stream);
    req.on("close", () => { clearInterval(latido); quitar(); streams--; ctx.streams.delete(stream); });
  });

  /* ── agenda and classes ── */
  r.get("/agenda", async (req, res) => {
    const q = validar(z.object({ desde: E.fecha.optional(), hasta: E.fecha.optional() }), req.query);
    res.json(await agenda(ctx, q));
  });
  r.get("/clases/:id", async (req, res) => res.json(await verClase(ctx, req.params.id)));
  r.post("/clases", async (req, res) => res.status(201).json(await crearClaseExtra(ctx, req.actor, validar(E.claseExtra, req.body))));
  r.patch("/clases/:id", async (req, res) => res.json(await editarClase(ctx, req.actor, req.params.id, validar(E.claseEditar, req.body))));
  r.post("/clases/:id/cancelar", async (req, res) => {
    const { motivo } = validar(z.object({ motivo: E.texto(200).optional().default("") }), req.body);
    res.json(await cancelarClase(ctx, req.actor, req.params.id, { motivo }));
  });

  /* ── weekly template ── */
  r.get("/horario", async (_req, res) => res.json(await horario(ctx)));
  r.post("/horario", async (req, res) => res.status(201).json(await crearSlot(ctx, req.actor, validar(E.slot, req.body))));
  r.patch("/horario/:id", async (req, res) => res.json(await editarSlot(ctx, req.actor, req.params.id, validar(E.slotEditar, req.body))));
  r.delete("/horario/:id", async (req, res) => res.json(await desactivarSlot(ctx, req.actor, req.params.id)));

  /* ── clientas ── */
  r.get("/clientas", async (req, res) => {
    const q = validar(z.object({ segmento: z.string().max(40).optional(), q: z.string().max(80).optional(), orden: z.enum(["nombre", "reciente", "saldo", "visita"]).optional() }), req.query);
    res.json(await listarClientas(ctx, q));
  });
  r.get("/segmentos", async (_req, res) => res.json(await segmentos(ctx)));
  r.get("/clientas/:id", async (req, res) => res.json(await verClienta(ctx, req.params.id)));
  r.post("/clientas", async (req, res) => {
    const d = validar(E.perfilNuevo.extend({ notas: E.texto(1000).optional(), etiquetas: z.array(E.texto(40)).max(20).optional(), consentimientos: E.consentimientos.optional() }), req.body);
    res.status(201).json(await crearClienta(ctx, req.actor, d));
  });
  r.patch("/clientas/:id", async (req, res) => {
    const d = validar(E.perfilParcial.extend({ notas: E.texto(1000).optional(), etiquetas: z.array(E.texto(40)).max(20).optional(), consentimientos: E.consentimientos.optional() }), req.body);
    res.json(await editarClienta(ctx, req.actor, req.params.id, d));
  });
  r.post("/clientas/:id/acceso", async (req, res) => res.json(await enlaceDeAcceso(ctx, req.actor, req.params.id)));

  /* ── bookings ── */
  r.post("/reservas", async (req, res) => {
    const d = validar(z.object({ clienta: E.idClienta, clase: E.claseId }), req.body);
    res.status(201).json(await reservar(ctx, req.actor, d));
  });
  r.post("/reservas/:id/confirmar", async (req, res) => {
    const d = validar(z.object({ pago: E.pago.optional() }), req.body);
    res.json(await confirmar(ctx, req.actor, req.params.id, d));
  });
  r.post("/reservas/:id/asistencia", async (req, res) => {
    const { vino } = validar(z.object({ vino: z.boolean({ error: "Indica si vino o no." }) }), req.body);
    res.json(await asistencia(ctx, req.actor, req.params.id, vino));
  });
  r.post("/reservas/:id/cancelar", async (req, res) => {
    const d = validar(z.object({ sinCosto: z.boolean().optional() }), req.body);
    const out = await cancelar(ctx, req.actor, req.params.id, d);
    res.json({ reserva: out.reserva, clase: out.clase, devolvioClase: out.devolvioClase, mensaje: out.mensaje });
  });
  r.post("/reservas/:id/liberar", async (req, res) => res.json(await liberar(ctx, req.actor, req.params.id)));
  r.post("/reservas/:id/reagendar", async (req, res) => {
    const { clase } = validar(z.object({ clase: E.claseId }), req.body);
    res.json(await reagendar(ctx, req.actor, req.params.id, clase));
  });

  /* ── payments and plans ── */
  r.get("/pagos", async (req, res) => {
    const q = validar(z.object({ mes: E.mes.optional() }), req.query);
    res.json(await pagosDelMes(ctx, q.mes));
  });
  r.post("/pagos", async (req, res) => {
    const d = validar(E.pago.extend({ clienta: E.idClienta }), req.body);
    res.status(201).json(await registrarPago(ctx, req.actor, d));
  });
  r.get("/planes", async (_req, res) => res.json(await planes(ctx)));
  r.patch("/planes", async (req, res) => res.json(await editarPlan(ctx, req.actor, validar(E.planEditar, req.body))));

  /* ── waiting list ── */
  r.get("/espera", async (_req, res) => res.json(await listarEspera(ctx)));
  r.post("/espera/:id/tomar", async (req, res) => res.json(await tomarCupo(ctx, req.actor, req.params.id)));
  r.patch("/espera/:id", async (req, res) => {
    const { estado } = validar(z.object({ estado: E.estadoEspera }), req.body);
    res.json(await estadoEspera(ctx, req.actor, req.params.id, estado));
  });

  /* ── team ── */
  r.get("/equipo", async (_req, res) => res.json(await equipo(ctx)));
  r.get("/profes", (_req, res) => res.json(listarProfes(ctx)));
  r.post("/equipo", (req, res) => {
    const d = validar(z.object({
      rol: z.enum(["admin", "profe"], { error: "Elige el rol." }), nombre: E.texto(80, { min: 2 }), nombreHorario: E.texto(60).optional(),
      correo: E.correo, whatsapp: z.union([z.literal(""), E.whatsapp]).optional(),
    }), req.body);
    res.status(201).json(crearUsuario(ctx, req.actor, d));
  });
  r.patch("/equipo/:id", (req, res) => {
    const d = validar(z.object({
      activa: z.boolean().optional(), rol: z.enum(["admin", "profe"]).optional(), nombre: E.texto(80, { min: 2 }).optional(),
      nombreHorario: E.texto(60).optional(), whatsapp: z.union([z.literal(""), E.whatsapp]).optional(),
    }), req.body);
    res.json(editarEquipo(ctx, req.actor, req.params.id, d));
  });
  r.post("/equipo/:id/invitacion", (req, res) => res.json(nuevaInvitacion(ctx, req.actor, req.params.id)));

  /* ── settings, audit, attribution, health ── */
  r.get("/ajustes", async (_req, res) => res.json(await verAjustes(ctx)));
  r.patch("/ajustes", async (req, res) => {
    const d = validar(z.record(z.string().max(80), z.union([z.string().max(200), z.number(), z.null()])), req.body);
    res.json(await editarAjustes(ctx, req.actor, d));
  });
  r.get("/registro", (req, res) => {
    const q = validar(z.object({ limite: z.coerce.number().int().min(1).max(500).optional(), antes: z.string().max(40).optional() }), req.query);
    res.json(listarRegistro(ctx, q));
  });
  r.get("/atribucion", async (req, res) => {
    const q = validar(z.object({ desde: E.fecha.optional(), hasta: E.fecha.optional() }), req.query);
    res.json(await reporteAtribucion(ctx, q));
  });
  r.get("/salud", async (_req, res) => res.json(await salud(ctx)));

  /* ── Web Push for Ana's installed app ── */
  r.use("/push", rutasPush(ctx));

  return r;
}
