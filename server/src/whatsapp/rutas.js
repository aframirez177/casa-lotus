// Express adapters for the framework-agnostic handlers in nucleo.js.
//   rutasWebhook → mount at /api/whatsapp BEFORE express.json(): the signature is checked on raw bytes.
//   rutasAdmin   → mount at /api/admin/whatsapp after admin auth (req.usuario).

import express from "express";
import { WhatsAppError } from "./errores.js";

function enviarError(res, e, log) {
  if (e instanceof WhatsAppError) return res.status(e.status).json(e.cuerpo());
  if (e?.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "validacion", mensaje: "El cuerpo no es JSON válido." });
  if (e?.type === "entity.too.large") return res.status(413).json({ ok: false, error: "validacion", mensaje: "El mensaje es demasiado grande." });
  log?.error?.(`[whatsapp] ${e?.stack || e}`);
  return res.status(500).json({ ok: false, error: "servidor", mensaje: "Algo falló en el servidor. Intenta de nuevo." });
}

const usuarioDe = (req, res) => req.usuario ?? res.locals?.usuario ?? req.sesion?.usuario ?? null;

export function crearRutasAdmin(nucleo, { log = console } = {}) {
  const r = express.Router();
  r.use(express.json({ limit: "64kb" }));

  // Defense in depth: the server already ran admin auth before this router.
  r.use((req, res, next) => {
    const u = usuarioDe(req, res);
    if (!u) return res.status(401).json({ ok: false, error: "no-autenticado", mensaje: "Inicia sesión para continuar." });
    if (u.rol && u.rol !== "admin") return res.status(403).json({ ok: false, error: "sin-permiso", mensaje: "No tienes permiso para ver los mensajes." });
    next();
  });

  const h = (fn) => async (req, res) => {
    try {
      const u = usuarioDe(req, res);
      const { status, cuerpo } = await fn({ params: req.params, query: req.query || {}, body: req.body || {}, actor: { tipo: "admin", id: u?.id, nombre: u?.nombre } });
      res.status(status).json(cuerpo);
    } catch (e) {
      enviarError(res, e, log);
    }
  };

  r.get("/estado", h(nucleo.admin.estado));
  r.get("/plantillas", h(nucleo.admin.plantillas));
  r.get("/conversaciones", h(nucleo.admin.conversaciones));
  r.get("/conversaciones/:id", h(nucleo.admin.conversacion));
  r.post("/conversaciones/:id/mensajes", h(nucleo.admin.enviar));
  r.patch("/conversaciones/:id", h(nucleo.admin.actualizar));

  r.use((err, req, res, _next) => enviarError(res, err, log));
  return r;
}

export function crearRutasWebhook(nucleo, { log = console } = {}) {
  const r = express.Router();

  r.get("/webhook", (req, res) => {
    const { status, texto } = nucleo.webhook.verificar({ query: req.query || {} });
    res.status(status).set("X-Content-Type-Options", "nosniff").type("text/plain").send(texto);
  });

  r.post("/webhook", express.raw({ type: () => true, limit: "3mb" }), (req, res) => {
    let cuerpo = req.body;
    if (!Buffer.isBuffer(cuerpo)) {
      if (cuerpo && typeof cuerpo === "object" && Object.keys(cuerpo).length) {
        // A JSON parser ran first: the original bytes are gone, so the signature cannot be checked.
        log?.error?.("[whatsapp] el webhook necesita el cuerpo crudo: monta rutasWebhook antes de express.json()");
        return res.sendStatus(500);
      }
      cuerpo = Buffer.alloc(0);
    }
    const { status } = nucleo.webhook.recibir({ cuerpoCrudo: cuerpo, firma: req.get("x-hub-signature-256") });
    res.sendStatus(status);
  });

  r.use((err, req, res, _next) => {
    if (err?.type === "entity.too.large") return res.sendStatus(413);
    log?.error?.(`[whatsapp] webhook: ${err?.stack || err}`);
    res.sendStatus(400);
  });
  return r;
}
