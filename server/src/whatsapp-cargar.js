// Casa Lotus · loads the WhatsApp module (src/whatsapp/, written separately) if it is there and
// starts; otherwise a stub keeps the platform running: configurado false, routes answer 503.
import express from "express";
import { ErrorApp } from "./errores.js";

function stub(motivo = "") {
  const r503 = () => {
    const r = express.Router();
    r.use((_req, res) => res.status(503).json(new ErrorApp("no-configurado", "WhatsApp todavía no está conectado.").cuerpo()));
    return r;
  };
  return {
    configurado: false,
    esStub: true,
    motivo,
    rutasAdmin: r503(),
    rutasWebhook: r503(),
    estado: () => ({ conectado: false, modo: "desconectado", plantillas: [], faltan: [] }),
    async enviarTexto() { throw new ErrorApp("no-configurado", "WhatsApp todavía no está conectado."); },
    async enviarPlantilla() { throw new ErrorApp("no-configurado", "WhatsApp todavía no está conectado."); },
    async enviarCodigo() { return false; },
    resumenConversacion: () => null,
  };
}

export async function cargarWhatsApp({ config, db, dominio, publicar, log, auditar }) {
  let modulo;
  try {
    modulo = await import("./whatsapp/index.js");
  } catch (e) {
    if (e?.code !== "ERR_MODULE_NOT_FOUND" || !String(e.message).includes("whatsapp/index.js")) log.error("no se pudo cargar el módulo de WhatsApp", { error: e });
    return stub("no-instalado");
  }
  try {
    const wa = await modulo.crearWhatsApp({ config: config.whatsapp, db, dominio, publicar, log, auditar });
    if (!wa?.rutasAdmin || !wa?.rutasWebhook) throw new Error("el módulo no devolvió sus rutas");
    log.info("WhatsApp cargado", { configurado: Boolean(wa.configurado) });
    return wa;
  } catch (e) {
    log.error("el módulo de WhatsApp no arrancó", { error: e });
    return stub("error");
  }
}
