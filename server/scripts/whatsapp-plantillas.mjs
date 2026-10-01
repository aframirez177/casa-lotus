#!/usr/bin/env node
// Casa Lotus · WhatsApp templates and connection from the command line.
//
//   node scripts/whatsapp-plantillas.mjs listar              catalogue + last known Meta status (no network)
//   node scripts/whatsapp-plantillas.mjs revisar             checks the catalogue against Meta's template rules (no network)
//   node scripts/whatsapp-plantillas.mjs payload <nombre>    prints the JSON Meta receives to create one template (no network)
//   node scripts/whatsapp-plantillas.mjs estado              number, verified name, quality, templates (calls Meta)
//   node scripts/whatsapp-plantillas.mjs sincronizar         reads every template from the WABA into the local cache (calls Meta)
//   node scripts/whatsapp-plantillas.mjs enviar [nombre…]    submits the templates Meta does not have yet (calls Meta)
//   node scripts/whatsapp-plantillas.mjs hola <numero>       sends Meta's sample `hello_world` template (calls Meta; test mode)
//
// Reads WHATSAPP_* from the environment (and from ./.env when present). The cache lives in the
// server's SQLite (SQLITE_PATH, default ./data/casalotus.db); pass --memoria to use a throwaway DB.

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { crearNucleo } from "../src/whatsapp/nucleo.js";
import { leerConfig } from "../src/whatsapp/config.js";
import { crearClienteGraph } from "../src/whatsapp/graph.js";
import { PLANTILLAS, buscarPlantilla, aPayloadCreacion, revisarCatalogo } from "../src/whatsapp/plantillas.js";
import { normalizaWhatsApp } from "../../shared/reglas.js";

const args = process.argv.slice(2);
const memoria = args.includes("--memoria");
const [comando = "ayuda", ...resto] = args.filter((a) => !a.startsWith("--"));

if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");

const log = { info() {}, warn: (m) => console.error(m), error: (m) => console.error(m) };

function abrirDb() {
  if (memoria) return new DatabaseSync(":memory:");
  const ruta = resolve(process.env.SQLITE_PATH || "./data/casalotus.db");
  mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  return db;
}

const tabla = (filas) => console.table(filas);
const salir = (codigo, mensaje) => { if (mensaje) console.error(mensaje); process.exit(codigo); };

async function main() {
  switch (comando) {
    case "revisar": {
      const problemas = revisarCatalogo();
      if (problemas.length) salir(1, problemas.map((p) => "✗ " + p).join("\n"));
      console.log(`✓ ${PLANTILLAS.length} plantillas cumplen las reglas que revisamos.`);
      return;
    }
    case "payload": {
      const p = buscarPlantilla(resto[0]);
      if (!p) salir(1, `No existe la plantilla «${resto[0] ?? ""}». Opciones: ${PLANTILLAS.map((x) => x.nombre).join(", ")}`);
      console.log(JSON.stringify(aPayloadCreacion(p), null, 2));
      return;
    }
    case "hola": {
      const cfg = leerConfig({}, process.env);
      // sending only needs the token and the number; the app secret is for the webhook
      if (!cfg.token || !cfg.phoneNumberId || /^PEGA_/.test(cfg.phoneNumberId)) salir(1, "Falta el token o el Phone number ID. Corre: node scripts/whatsapp-configurar.mjs");
      const to = normalizaWhatsApp(resto[0]) || String(resto[0] ?? "").replace(/\D/g, "");
      if (!/^\d{8,15}$/.test(to)) salir(1, "Uso: hola <numero>  (ej. 3001234567 o 573001234567)");
      const graph = crearClienteGraph({ cfg, log });
      const r = await graph.post(`${cfg.phoneNumberId}/messages`, {
        messaging_product: "whatsapp", to, type: "template", template: { name: "hello_world", language: { code: "en_US" } },
      });
      console.log(`✓ Meta aceptó el mensaje: ${r?.messages?.[0]?.id} (${r?.messages?.[0]?.message_status || "accepted"})`);
      return;
    }
    case "listar":
    case "estado":
    case "sincronizar":
    case "enviar": {
      const nucleo = await crearNucleo({ config: {}, db: abrirDb(), log, env: process.env });
      if (comando === "listar") {
        tabla(nucleo.listarPlantillas().map((p) => ({ nombre: p.nombre, categoria: p.categoria, variables: p.variables.join(", "), meta: p.estadoMeta, ...(p.motivo ? { motivo: p.motivo } : {}) })));
        return;
      }
      if (comando === "estado") {
        const e = await nucleo.estado();
        console.log({ conectado: e.conectado, modo: e.modo, numero: e.numero, nombreVerificado: e.nombreVerificado, calidad: e.calidad, faltan: e.faltan, ...(e.error ? { error: e.error } : {}) });
        tabla(e.plantillas.map((p) => ({ nombre: p.nombre, categoria: p.categoria, meta: p.estadoMeta })));
        return;
      }
      if (comando === "sincronizar") {
        tabla((await nucleo.sincronizarPlantillas()).map((p) => ({ nombre: p.nombre, meta: p.estadoMeta, ...(p.categoriaMeta ? { categoriaMeta: p.categoriaMeta } : {}), ...(p.motivo ? { motivo: p.motivo } : {}) })));
        return;
      }
      const problemas = revisarCatalogo();
      if (problemas.length) salir(1, "El catálogo tiene problemas; corrígelos antes de enviar:\n" + problemas.join("\n"));
      const r = await nucleo.enviarPlantillasAMeta({ nombres: resto.length ? resto : undefined });
      tabla(r);
      if (r.some((x) => x.accion === "error")) process.exitCode = 1;
      return;
    }
    default:
      console.log(`Uso: node scripts/whatsapp-plantillas.mjs <listar | revisar | payload <nombre> | estado | sincronizar | enviar [nombre…] | hola <numero>> [--memoria]`);
  }
}

main().catch((e) => salir(1, `✗ ${e?.message || e}${e?.meta?.detalle ? `\n  Meta: ${e.meta.detalle}` : ""}`));
