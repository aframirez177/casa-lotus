// Casa Lotus · the Express app (factory: tests mount it on an ephemeral port).
import express from "express";
import { cargarSesion, csrf, cabecerasSeguras, corsDev, exigir } from "./auth/middleware.js";
import { rutasPublicas, rutaEventos } from "./rutas/publico.js";
import { rutasAuth } from "./rutas/auth.js";
import { rutasYo } from "./rutas/yo.js";
import { rutasProfe } from "./rutas/profe.js";
import { rutasAdmin } from "./rutas/admin.js";
import { ErrorApp } from "./errores.js";
import { rutaSegura } from "./log.js";

export function crearApp(ctx) {
  const { config, log } = ctx;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.set("etag", false);

  app.use((req, res, next) => {
    const t0 = process.hrtime.bigint();
    res.on("finish", () => {
      if (req.path === "/api/salud") return;
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const nivel = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      log[nivel]("http", { m: req.method, ruta: rutaSegura(req.originalUrl), s: res.statusCode, ms: Math.round(ms) });
    });
    next();
  });
  app.use(cabecerasSeguras(config));
  if (config.dev && config.cors.length) app.use(corsDev(config));

  // liveness for Docker / Caddy: no data, no Sheet call
  app.get("/api/salud", (_req, res) => res.json({ ok: true, version: config.version }));

  // Meta's webhook reads the raw body to check its signature: mounted before any body parser
  app.use("/api/whatsapp", ctx.whatsapp.rutasWebhook);

  app.use(cargarSesion(ctx));
  app.use("/api", csrf(config, { exentas: ["/whatsapp/"], sinCabecera: ["/publico/eventos"] }));

  // beacons: text/plain or JSON, no custom header possible (sendBeacon)
  app.post("/api/publico/eventos", ...rutaEventos(ctx));
  app.use("/api/auth/cuenta", express.json({ limit: "256kb" }));
  app.use(express.json({ limit: "32kb" }));

  app.use("/api/publico", rutasPublicas(ctx));
  app.use("/api/auth", rutasAuth(ctx));
  app.use("/api/yo", rutasYo(ctx));
  app.use("/api/profe", rutasProfe(ctx));
  app.use("/api/admin/whatsapp", exigir("admin"), ctx.whatsapp.rutasAdmin);
  app.use("/api/admin", rutasAdmin(ctx));

  app.use("/api", (_req, res) => res.status(404).json({ ok: false, error: "no-existe", mensaje: "Esta dirección no existe." }));

  // errors → CONTRATO §4; nothing internal ever reaches the client
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (res.headersSent) return res.end();
    if (err instanceof ErrorApp) return res.status(err.status).json(err.cuerpo());
    if (err && typeof err.cuerpo === "function" && Number(err.status) >= 400 && Number(err.status) < 600) {
      return res.status(err.status).json(err.cuerpo()); // the WhatsApp module's errors share the contract shape
    }
    if (err?.type === "entity.too.large") return res.status(413).json({ ok: false, error: "validacion", mensaje: "La solicitud es demasiado grande." });
    if (err?.type === "entity.parse.failed" || err?.type === "encoding.unsupported") {
      return res.status(400).json({ ok: false, error: "validacion", mensaje: "No pudimos leer la solicitud." });
    }
    if (err?.candado) return res.status(503).json({ ok: false, error: "servidor", mensaje: err.message });
    log.error("error no controlado", { ruta: rutaSegura(req.originalUrl), error: err, pila: String(err?.stack || "").split("\n").slice(0, 4).join(" | ") });
    res.status(500).json({ ok: false, error: "servidor", mensaje: "Algo salió mal. Intenta de nuevo en un momento." });
  });

  return app;
}
