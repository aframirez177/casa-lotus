// Casa Lotus · Web Push subscriptions for any staff member (mounted under /api/admin and /api/profe).
import express from "express";
import { z } from "../dominio/esquemas.js";
import { validar } from "./validar.js";
import { noConfigurado } from "../errores.js";

export function rutasPush(ctx) {
  const r = express.Router();
  r.get("/clave", (_req, res) => res.json({ activo: ctx.push.activo, clavePublica: ctx.push.clavePublica || "" }));
  r.post("/suscribir", (req, res) => {
    if (!ctx.push.activo) throw noConfigurado("Las notificaciones todavía no están activadas en el servidor.");
    const s = validar(z.object({
      endpoint: z.url().max(1000).refine((u) => u.startsWith("https://"), { error: "Suscripción inválida." }),
      keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
    }), req.body);
    ctx.push.suscribir(req.actor.id, s);
    res.status(204).end();
  });
  r.delete("/suscribir", (req, res) => {
    const { endpoint } = validar(z.object({ endpoint: z.string().max(1000) }), req.body);
    ctx.push.desuscribir(req.actor.id, endpoint);
    res.status(204).end();
  });
  return r;
}
