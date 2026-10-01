// Casa Lotus · the context every domain function receives: config, clock, data driver, SQLite, the
// write lock, novedades, e-mail, push and WhatsApp. Tests build it with a fixed clock and the memory driver.
import { abrirBase } from "./db/sqlite.js";
import { crearCandado } from "./candado.js";
import { crearLog } from "./log.js";
import { crearDriverMemoria } from "./datos/memoria.js";
import { crearDriverSheets, clienteGoogle } from "./datos/sheets.js";
import { sembrar, CUENTAS_DEV } from "./datos/semilla.js";
import { crearNovedades } from "./dominio/novedades.js";
import { anotarRegistro } from "./dominio/registro.js";
import { crearCorreo } from "./notificaciones/correo.js";
import { crearPush } from "./notificaciones/push.js";
import { cargarWhatsApp } from "./whatsapp-cargar.js";
import { buscarPorWhatsApp, buscarPorId, crearLead, registrarBaja } from "./dominio/clientas.js";
import { crearUsuarioConPassword } from "./auth/usuarios.js";
import { SISTEMA } from "./dominio/base.js";
import { destinoHojaSeparada, destinoPestana } from "./datos/conversiones.js";

/**
 * opciones.ahora: () => ms (a fixed or movable clock for tests).
 * opciones.datos: an already built driver (tests); otherwise from config.
 * opciones.cuentasDev: create the dev staff accounts (memory driver, development).
 */
export async function crearContexto(config, opciones = {}) {
  const log = opciones.log || crearLog({ nivel: config.logLevel });
  const ahora = opciones.ahora || (() => Date.now());
  const db = abrirBase(opciones.sqlitePath ?? config.sqlitePath, { log });

  let datos = opciones.datos;
  let google = null; // one Sheets client for the operating Sheet and the conversions spreadsheet
  let sembrado = null;
  if (!datos) {
    if (config.datos === "memoria") {
      datos = crearDriverMemoria();
      sembrado = await sembrar(datos, { tipo: config.semilla, ahora: ahora() });
    } else {
      if (!config.sheets.credenciales) throw new Error("Faltan las credenciales de la cuenta de servicio de Google (GOOGLE_SERVICE_ACCOUNT_JSON).");
      google = await clienteGoogle(config.sheets.credenciales);
      datos = crearDriverSheets({ cliente: google, sheetId: config.sheets.id, log, ahora });
    }
  }

  const pendientes = new Set();
  const ctx = {
    config, log, db, datos, ahora,
    /** open Server-Sent Events streams: closed on shutdown */
    streams: new Set(),
    candado: opciones.candado || crearCandado(),
    /** Fire-and-forget work (e-mail, push, WhatsApp) that must never fail a request. */
    enSegundoPlano(fn, arg) {
      const p = Promise.resolve().then(() => fn(arg)).catch((e) => log.error("tarea en segundo plano falló", { error: e }));
      pendientes.add(p);
      p.finally(() => pendientes.delete(p));
      return p;
    },
    async esperarSegundoPlano() {
      while (pendientes.size) await Promise.allSettled([...pendientes]);
    },
  };
  ctx.novedades = crearNovedades(ctx);
  // Google Ads conversions: the first tab of a separate spreadsheet, or the «Conversiones Ads» tab
  if (opciones.conversiones) {
    ctx.conversiones = opciones.conversiones;
  } else if (config.conversiones.sheetId) {
    const cliente = opciones.clienteConversiones || google || (config.sheets.credenciales ? await clienteGoogle(config.sheets.credenciales) : null);
    if (cliente) {
      ctx.conversiones = destinoHojaSeparada({ cliente, sheetId: config.conversiones.sheetId, log, ahora });
    } else {
      log.warn("CONVERSIONES_SHEET_ID sin credenciales de Google: uso la pestaña «Conversiones Ads»");
      ctx.conversiones = destinoPestana(ctx);
    }
  } else {
    ctx.conversiones = destinoPestana(ctx);
  }
  ctx.correo = opciones.correo || crearCorreo(config, log);
  ctx.push = opciones.push || (await crearPush(ctx));

  // what the WhatsApp module may ask of the domain (all async)
  const dominioWa = {
    buscarClientaPorWhatsApp: (numero) => buscarPorWhatsApp(ctx, numero),
    buscarClientaPorId: (id) => buscarPorId(ctx, id),
    crearLead: ({ nombre, whatsapp }) => crearLead(ctx, { tipo: "sistema", id: "whatsapp", nombre: "WhatsApp" }, { nombre, whatsapp }),
    registrarBaja: (numero) => registrarBaja(ctx, { tipo: "sistema", id: "whatsapp", nombre: "WhatsApp" }, numero),
  };
  ctx.whatsapp = opciones.whatsapp || (await cargarWhatsApp({
    config, db, log, dominio: dominioWa,
    publicar: (evento) => ctx.novedades.publicar(evento),
    auditar: ({ accion, objeto, detalle, actor }) => anotarRegistro(ctx, actor || SISTEMA, accion, objeto, detalle),
  }));
  ctx.dominioWhatsApp = dominioWa;

  if (opciones.cuentasDev ?? (config.datos === "memoria" && config.dev)) {
    for (const c of CUENTAS_DEV) {
      if (!db.prepare("SELECT 1 FROM usuarios WHERE correo = ?").get(c.correo)) await crearUsuarioConPassword(ctx, c);
    }
    // the demo studio also has a substitute request: the profe of the full class cannot teach it
    const llena = sembrado?.clases?.llena;
    const quien = sembrado?.profeLlena && db.prepare("SELECT id FROM usuarios WHERE nombre_horario = ?").get(sembrado.profeLlena);
    if (llena && quien) {
      db.prepare("INSERT OR REPLACE INTO reemplazos (clase, profe, usuario, motivo, fecha) VALUES (?, ?, ?, 'Cita médica', ?)").run(llena, sembrado.profeLlena, quien.id, ahora());
    }
  }
  return ctx;
}
