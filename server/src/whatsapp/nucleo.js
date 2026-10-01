// WhatsApp core, framework-agnostic: inbound processing, outbound sends, templates, status, and the
// admin / webhook handlers as plain functions returning { status, cuerpo }. `rutas.js` adapts them
// to Express; tests call them directly (no Express needed).

import { leerConfig, resumenConfig } from "./config.js";
import { crearAlmacen } from "./almacen.js";
import { crearClienteGraph } from "./graph.js";
import { firmaValida, verificarSuscripcion } from "./firma.js";
import { leerNotificacion, bsuid } from "./entrada.js";
import { intencionSuscripcion, TEXTO_BAJA_CONFIRMADA, TEXTO_ALTA_CONFIRMADA } from "./bajas.js";
import { WhatsAppError, noConfigurado, validacion, explicarErrorMeta } from "./errores.js";
import { aConversacion, aMensaje, ventanaAbierta } from "./formato.js";
import {
  PLANTILLAS, buscarPlantilla, validarVariables, renderizar, aPlantillaEnvio, aPayloadCreacion, aPlantillaContrato,
} from "./plantillas.js";
import { crearAgenteIA, agentePuedeResponder } from "./ia.js";
import { normalizaWhatsApp, whatsappLegible } from "../../../shared/reglas.js";

const ENVIABLES = new Set(["APPROVED", "FLAGGED"]); // FLAGGED = still sendable, quality warning
const AUTOR_SISTEMA = Object.freeze({ tipo: "sistema", nombre: "Casa Lotus" });
const TIPOS_AUTOR = new Set(["admin", "ia", "sistema", "profe"]);

/** Recipient as Meta wants it (digits with country code). Colombian mobiles may come without 57. */
export function destino(whatsapp) {
  const co = normalizaWhatsApp(whatsapp);
  if (co) return co;
  const d = String(whatsapp ?? "").replace(/\D/g, "");
  return /^[1-9]\d{7,14}$/.test(d) ? d : "";
}

function autorDe(autor) {
  if (!autor || typeof autor !== "object") return { ...AUTOR_SISTEMA };
  return {
    tipo: TIPOS_AUTOR.has(autor.tipo) ? autor.tipo : autor.rol === "admin" ? "admin" : "sistema",
    nombre: String(autor.nombre ?? "").slice(0, 80) || AUTOR_SISTEMA.nombre,
    ...(autor.id != null ? { id: String(autor.id) } : {}),
  };
}

const corto = (s, n = 140) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

export async function crearNucleo({
  config, db, dominio = {}, publicar = () => {}, log = console, auditar = null,
  fetch, esperar, ahora = () => Date.now(), ia = null, env = process.env,
} = {}) {
  const cfg = leerConfig(config, env);
  const almacen = crearAlmacen(db, { ahora });
  const graph = crearClienteGraph({ cfg, fetch: fetch ?? globalThis.fetch, esperar, log });
  const agente = crearAgenteIA({ agente: ia });
  const iso = () => new Date(ahora()).toISOString();

  if (!cfg.configurado) log?.info?.(`[whatsapp] sin conectar; faltan: ${cfg.faltan.join(", ") || "nada"}`);
  else log?.info?.(`[whatsapp] ${JSON.stringify(resumenConfig(cfg))}`);

  /* ── helpers ───────────────────────────────────────── */

  const emitir = (evento) => { try { const r = publicar?.(evento); if (r?.catch) r.catch((e) => log?.warn?.(`[whatsapp] publicar: ${e?.message}`)); } catch (e) { log?.warn?.(`[whatsapp] publicar: ${e?.message}`); } };
  const registrar = (accion, objeto, detalle, actor) => {
    if (typeof auditar !== "function") return;
    try { const r = auditar({ accion, objeto, detalle, actor }); if (r?.catch) r.catch((e) => log?.warn?.(`[whatsapp] auditar: ${e?.message}`)); } catch (e) { log?.warn?.(`[whatsapp] auditar: ${e?.message}`); }
  };
  const exigirConfigurado = () => { if (!cfg.configurado) throw noConfigurado(); };
  const exigirWaba = () => { exigirConfigurado(); if (!cfg.wabaId) throw new WhatsAppError("no-configurado", "Falta WHATSAPP_WABA_ID para manejar las plantillas."); };
  const nombreDe = (conv) =>
    conv?.clienta_nombre || conv?.nombre || conv?.perfil || (conv?.whatsapp ? whatsappLegible(conv.whatsapp) : conv?.usuario ? "@" + conv.usuario : "Contacto de WhatsApp");
  const etiquetaDe = (d) => (d.whatsapp ? whatsappLegible(d.whatsapp) : "@" + (d.conv?.usuario || "usuario"));

  // Opt-outs are keyed by number, or by BSUID for a username-only contact; a conversation may have both.
  const bajaDe = (d) => (d.whatsapp && almacen.baja(d.whatsapp)) || (d.usuarioId && almacen.baja(d.usuarioId)) || null;
  const quitarBajas = (d) => [d.whatsapp, d.usuarioId].filter(Boolean).map((k) => almacen.quitarBaja(k)).some(Boolean);

  /** { whatsapp?, usuarioId?, conv } for a number or a BSUID, or null when it is neither. */
  function resolverDestino(x) {
    const wa = destino(x);
    if (wa) {
      const conv = almacen.conversacionPorWhatsApp(wa);
      return { whatsapp: wa, usuarioId: conv?.usuario_id || null, conv };
    }
    const u = bsuid(x);
    if (u) {
      const conv = almacen.conversacionPorUsuarioId(u);
      return { whatsapp: conv?.whatsapp || null, usuarioId: u, conv };
    }
    return null;
  }
  const destinoDeConv = (conv) => ({ whatsapp: conv.whatsapp || null, usuarioId: conv.usuario_id || null, conv });
  /** Recipient field for Meta: the number when known, else the BSUID (`recipient`, 2026 username support). */
  const paraMeta = (d) => (d.whatsapp ? { to: d.whatsapp } : { recipient: d.usuarioId });

  /** Links a conversation to its clienta (or creates the lead) when it has none. Never throws. */
  async function vincularClienta(conv, { crearSiNoExiste }) {
    if (!conv || conv.clienta || !conv.vincular || !conv.whatsapp) return conv; // the Sheet knows people by number
    try {
      let c = typeof dominio.buscarClientaPorWhatsApp === "function" ? await dominio.buscarClientaPorWhatsApp(conv.whatsapp) : null;
      if (!c && crearSiNoExiste && typeof dominio.crearLead === "function") {
        const id = await dominio.crearLead({ nombre: conv.perfil || whatsappLegible(conv.whatsapp), whatsapp: conv.whatsapp });
        if (id) c = { id: String(id), nombre: conv.perfil || "", etapa: "lead" };
      }
      if (c?.id) return almacen.actualizarConversacion(conv.id, { clienta: String(c.id), clientaNombre: c.nombre || null, clientaEtapa: c.etapa || null });
    } catch (e) {
      log?.warn?.(`[whatsapp] no se pudo vincular la clienta de ${conv.id}: ${e?.message}`);
    }
    return conv;
  }

  /**
   * Mirrors an opt-out in the Sheet (her «novedades» / marketing consent goes off). Best effort:
   * the local BAJA is already recorded and is what blocks templates. Needs a phone number.
   */
  async function bajaEnDominio(whatsapp) {
    if (!whatsapp || typeof dominio.registrarBaja !== "function") return;
    try { await dominio.registrarBaja(whatsapp); } catch (e) { log?.warn?.(`[whatsapp] no se pudo registrar la baja en la hoja: ${e?.message}`); }
  }

  /** Sends one message body to Meta. Returns Meta's message id. */
  async function postMensaje(cuerpo) {
    const r = await graph.post(`${cfg.phoneNumberId}/messages`, { messaging_product: "whatsapp", recipient_type: "individual", ...cuerpo });
    const metaId = r?.messages?.[0]?.id;
    if (!metaId) throw new WhatsAppError("servidor", "WhatsApp no confirmó el envío. Revisa el chat antes de reenviarlo.");
    return { metaId: String(metaId), estadoMeta: r.messages[0].message_status || "accepted" };
  }

  /* ── inbound ───────────────────────────────────────── */

  const esNuestroNumero = (id) => !cfg.phoneNumberId || !id || id === cfg.phoneNumberId;

  async function procesarMensaje(m) {
    let { fila: conv } = almacen.obtenerOCrearConversacion({ whatsapp: m.de || null, usuarioId: m.usuarioId || null, usuario: m.usuario, perfil: m.perfil });
    if (m.perfil && m.perfil !== conv.perfil) {
      conv = almacen.actualizarConversacion(conv.id, { perfil: m.perfil, ...(conv.clienta ? {} : { nombre: m.perfil }) });
    }
    const { nuevo, fila } = almacen.registrarEntrante(conv, { ...m, autorNombre: conv.clienta_nombre || m.perfil || "" });
    if (!nuevo) return { duplicado: true };

    const intencion = m.tipo === "texto" || m.tipo === "interactivo" ? intencionSuscripcion(m.texto) : null;
    if (intencion !== "baja") conv = await vincularClienta(conv, { crearSiNoExiste: true });
    conv = almacen.conversacion(conv.id);
    const nombre = nombreDe(conv);
    const actor = { tipo: "clienta", ...(conv.clienta ? { id: conv.clienta } : {}), nombre };

    if (intencion === "baja") {
      almacen.registrarBaja({ whatsapp: conv.whatsapp || conv.usuario_id, alcance: "todo", motivo: "palabra", texto: corto(m.texto, 60) });
      await bajaEnDominio(conv.whatsapp);
      emitir({ tipo: "mensaje", titulo: `${nombre} pidió no recibir más mensajes`, detalle: "Ya no le llegarán recordatorios ni avisos automáticos por WhatsApp.", clienta: conv.clienta || undefined, conversacion: conv.id, ts: iso(), actor });
      await responderSistema(conv, TEXTO_BAJA_CONFIRMADA);
      return { nuevo: true, baja: true };
    }
    if (intencion === "alta" && bajaDe(destinoDeConv(conv))) {
      quitarBajas(destinoDeConv(conv));
      await responderSistema(conv, TEXTO_ALTA_CONFIRMADA);
    }

    if (m.cuentaComoNoLeido !== false) {
      emitir({ tipo: "mensaje", titulo: `Mensaje de ${nombre}`, detalle: corto(m.vistaPrevia ?? m.texto), clienta: conv.clienta || undefined, conversacion: conv.id, ts: new Date(m.tsMs).toISOString(), actor });
    }

    if (agente) {
      const c = aConversacion(conv, ahora());
      if (agentePuedeResponder(c)) {
        try { await agente.alRecibirMensaje({ conversacion: c, mensaje: aMensaje(fila), clienta: null }); } catch (e) { log?.warn?.(`[whatsapp] agente IA: ${e?.message}`); }
      }
    }
    return { nuevo: true };
  }

  /** Coexistence: a message Ana sent from the Business app on her phone. Stored as hers, read, no ring. */
  function procesarEco(m) {
    if (almacen.mensajePorMetaId(m.metaId)) return { duplicado: true };
    const { fila: conv } = almacen.obtenerOCrearConversacion({ whatsapp: m.de || null, usuarioId: m.usuarioId || null });
    almacen.registrarSaliente(conv, {
      metaId: m.metaId, tipo: m.tipo, texto: m.texto, vistaPrevia: m.vistaPrevia ?? m.texto, media: m.media, datos: m.datos,
      tsMs: m.tsMs, estado: "enviado", autor: { tipo: "admin", nombre: "Desde el celular" },
    });
    almacen.marcarLeida(conv.id); // she answered from the phone, so she read it
    return { nuevo: true };
  }

  /** Automatic reply inside the window (BAJA / ALTA confirmations). Never throws. */
  async function responderSistema(conv, texto) {
    if (!cfg.configurado) return null;
    try {
      const { metaId } = await postMensaje({ ...paraMeta(destinoDeConv(conv)), type: "text", text: { body: texto, preview_url: false } });
      return almacen.registrarSaliente(conv, { metaId, tipo: "texto", texto, autor: AUTOR_SISTEMA });
    } catch (e) {
      log?.warn?.(`[whatsapp] respuesta automática no enviada a ${conv.id}: ${e?.message}`);
      return null;
    }
  }

  async function procesarEstado(e) {
    const explicado = e.estado === "fallido" && e.errorCodigo ? explicarErrorMeta({ code: e.errorCodigo }) : null;
    const error = e.estado === "fallido" ? (explicado?.mensaje || e.errorTitulo || "WhatsApp no pudo entregar el mensaje.") : null;
    const r = almacen.aplicarEstado({ ...e, error });
    if (!r.nuevo || e.estado !== "fallido") return;
    log?.warn?.(`[whatsapp] mensaje ${e.metaId} fallido, código ${e.errorCodigo ?? "?"} ${e.errorDetalle || ""}`);
    const clave = e.destinatario || e.destinatarioUsuario;
    if (e.errorCodigo === 131050 && clave) {
      almacen.registrarBaja({ whatsapp: clave, alcance: "marketing", motivo: "meta-131050" });
      await bajaEnDominio(e.destinatario);
    }
    if (r.mensaje) {
      const conv = almacen.conversacion(r.mensaje.conversacion);
      emitir({
        tipo: "sistema", titulo: `No le llegó un mensaje a ${nombreDe(conv)}`, detalle: error, clienta: conv?.clienta || undefined,
        conversacion: conv?.id, ts: iso(), actor: { ...AUTOR_SISTEMA },
      });
    }
  }

  /** «Stop / resume marketing messages» chosen inside WhatsApp (user_preferences webhook). */
  async function procesarPreferencia(p) {
    const clave = p.whatsapp || p.usuarioId;
    if (!clave) return;
    if (p.valor === "stop") {
      almacen.registrarBaja({ whatsapp: clave, alcance: "marketing", motivo: "meta-preferencias" });
      await bajaEnDominio(p.whatsapp);
    }
    else if (almacen.baja(clave)?.alcance === "marketing") almacen.quitarBaja(clave);
  }

  function procesarPlantilla(p) {
    if (p.tipo === "categoria") {
      almacen.guardarPlantilla({ nombre: p.nombre, idioma: p.idioma, metaId: p.metaId, categoria: p.categoria });
      const local = buscarPlantilla(p.nombre);
      if (local && p.categoria && p.categoria !== local.categoria) log?.warn?.(`[whatsapp] Meta cambió la categoría de ${p.nombre} a ${p.categoria}`);
      return;
    }
    const estado = p.estado === "REINSTATED" || p.estado === "UNARCHIVED" ? "APPROVED" : p.estado;
    almacen.guardarPlantilla({ nombre: p.nombre, idioma: p.idioma, metaId: p.metaId, estado, motivo: p.motivo });
    log?.info?.(`[whatsapp] plantilla ${p.nombre} (${p.idioma}) → ${estado}${p.motivo ? " · " + p.motivo : ""}`);
  }

  async function procesarNotificacion(payload) {
    const n = leerNotificacion(payload, ahora());
    const resumen = { mensajes: 0, duplicados: 0, ecos: 0, estados: 0, plantillas: 0, ignorados: 0 };
    for (const m of n.mensajes) {
      if (!esNuestroNumero(m.phoneNumberId)) { resumen.ignorados++; log?.warn?.(`[whatsapp] mensaje para otro número (${m.phoneNumberId}) ignorado`); continue; }
      try {
        const r = await procesarMensaje(m);
        if (r.duplicado) resumen.duplicados++; else resumen.mensajes++;
      } catch (e) {
        log?.error?.(`[whatsapp] error procesando ${m.metaId}: ${e?.stack || e}`);
      }
    }
    for (const m of n.ecos) {
      if (!esNuestroNumero(m.phoneNumberId)) { resumen.ignorados++; continue; }
      try { if (!procesarEco(m).duplicado) resumen.ecos++; } catch (e) { log?.error?.(`[whatsapp] error en eco ${m.metaId}: ${e?.stack || e}`); }
    }
    for (const e of n.estados) {
      if (!esNuestroNumero(e.phoneNumberId)) { resumen.ignorados++; continue; }
      try { await procesarEstado(e); resumen.estados++; } catch (err) { log?.error?.(`[whatsapp] error en estado ${e.metaId}: ${err?.stack || err}`); }
    }
    for (const p of n.plantillas) {
      try { procesarPlantilla(p); resumen.plantillas++; } catch (err) { log?.error?.(`[whatsapp] error en plantilla ${p.nombre}: ${err?.stack || err}`); }
    }
    for (const p of n.preferencias) {
      try { await procesarPreferencia(p); } catch (err) { log?.error?.(`[whatsapp] error en preferencia: ${err?.stack || err}`); }
    }
    for (const e of n.errores) log?.warn?.(`[whatsapp] error de Meta ${e.codigo}: ${e.titulo} ${e.detalle}`);
    for (const o of n.otros) log?.info?.(`[whatsapp] webhook «${o.campo}» recibido (sin acción)`);
    return resumen;
  }

  // One notification at a time, in arrival order: two quick messages from a new number must not
  // create two leads. Processing starts on the next turn of the event loop, after the 200 is sent.
  let cola = Promise.resolve();
  function encolar(payload) {
    const tarea = cola.then(() => new Promise((r) => setImmediate(r))).then(() => procesarNotificacion(payload));
    cola = tarea.catch((e) => log?.error?.(`[whatsapp] cola: ${e?.stack || e}`));
    return tarea;
  }

  /* ── outbound ──────────────────────────────────────── */

  function textoValido(texto) {
    const t = String(texto ?? "").trim();
    if (!t) throw validacion("Escribe un mensaje.", { texto: "Escribe un mensaje." });
    if (t.length > 4096) throw validacion("El mensaje es muy largo (máximo 4.096 caracteres).", { texto: "Máximo 4.096 caracteres." });
    return t;
  }

  async function enviarTextoA(d, t, autor) {
    if (!d.conv || !ventanaAbierta(d.conv.ventana_desde_ms, ahora())) {
      throw new WhatsAppError(
        "conflicto",
        "Pasaron más de 24 horas desde su último mensaje (o todavía no te ha escrito). WhatsApp solo deja escribirle con una plantilla aprobada.",
        { motivo: "ventana" },
      );
    }
    const quien = autorDe(autor);
    const { metaId } = await postMensaje({ ...paraMeta(d), type: "text", text: { body: t, preview_url: /https?:\/\//i.test(t) } });
    const fila = almacen.registrarSaliente(d.conv, { metaId, tipo: "texto", texto: t, autor: quien });
    registrar("whatsapp.texto", d.conv.id, `Texto a ${etiquetaDe(d)}`, quien);
    return aMensaje(fila);
  }

  /** Free text. `whatsapp` is a number (or a BSUID for a username-only contact). Refuses outside the 24 h window. */
  async function enviarTexto(whatsapp, texto, autor) {
    exigirConfigurado();
    const d = resolverDestino(whatsapp);
    if (!d) throw validacion("El número de WhatsApp no es válido.", { whatsapp: "Número inválido." });
    return enviarTextoA(d, textoValido(texto), autor);
  }

  function estadoEnCache(p) {
    return almacen.plantillasCache().get(`${p.nombre}|${p.idioma}`) || null;
  }

  async function enviarPlantillaA(d, nombre, variables, autor) {
    const p = buscarPlantilla(nombre);
    if (!p) throw validacion(`No existe la plantilla «${String(nombre ?? "")}».`, { plantilla: "No existe." });
    if (p.categoria === "AUTHENTICATION") throw validacion("Los códigos de acceso se envían solos desde la app.", { plantilla: "No se envía a mano." });
    const v = validarVariables(p, variables);
    if (!v.ok) throw validacion("Faltan datos para la plantilla.", v.campos);

    const baja = bajaDe(d);
    if (baja && (baja.alcance === "todo" || p.categoria === "MARKETING")) {
      throw new WhatsAppError(
        "conflicto",
        baja.alcance === "todo"
          ? "Esta persona pidió no recibir más mensajes automáticos. Puedes responderle cuando ella te escriba."
          : "Esta persona pidió no recibir mensajes de promoción.",
        { motivo: "baja" },
      );
    }
    const cache = estadoEnCache(p);
    if (cache && !ENVIABLES.has(cache.estado)) {
      throw new WhatsAppError("conflicto", `La plantilla «${p.nombre}» no está aprobada por WhatsApp (estado: ${cache.estado}).`, { motivo: "plantilla" });
    }

    const quien = autorDe(autor);
    const { metaId } = await postMensaje({ ...paraMeta(d), type: "template", template: aPlantillaEnvio(p, v.valores) });
    let conv = d.conv || almacen.obtenerOCrearConversacion({ whatsapp: d.whatsapp, usuarioId: d.usuarioId }).fila;
    conv = await vincularClienta(conv, { crearSiNoExiste: false });
    const texto = renderizar(p, v.valores);
    const fila = almacen.registrarSaliente(conv, { metaId, tipo: "plantilla", plantilla: p.nombre, variables: v.valores, texto, vistaPrevia: texto, autor: quien });
    registrar("whatsapp.plantilla", conv.id, `Plantilla ${p.nombre} a ${etiquetaDe(d)}`, quien);
    return aMensaje(fila);
  }

  /** Approved template to a number (or BSUID). Variables: object by name, or array in catalogue order. */
  async function enviarPlantilla(whatsapp, nombre, variables, autor) {
    exigirConfigurado();
    const d = resolverDestino(whatsapp);
    if (!d) throw validacion("El número de WhatsApp no es válido.", { whatsapp: "Número inválido." });
    return enviarPlantillaA(d, nombre, variables, autor);
  }

  /** Login code through the AUTHENTICATION template. Never throws, never logs the code. */
  async function enviarCodigo(whatsapp, codigo) {
    if (!cfg.configurado) return false;
    try {
      const p = buscarPlantilla("codigo_acceso");
      const wa = destino(whatsapp);
      const v = validarVariables(p, { codigo });
      if (!wa || !v.ok) return false;
      const cache = estadoEnCache(p);
      if (cache && !ENVIABLES.has(cache.estado)) return false;
      const { metaId } = await postMensaje({ to: wa, type: "template", template: aPlantillaEnvio(p, v.valores) });
      const conv = almacen.conversacionPorWhatsApp(wa);
      if (conv) {
        almacen.registrarSaliente(conv, { metaId, tipo: "plantilla", plantilla: p.nombre, texto: "Código de acceso a la app (oculto por seguridad).", autor: AUTOR_SISTEMA });
      }
      return true;
    } catch (e) {
      log?.warn?.(`[whatsapp] código de acceso no enviado: ${e?.message}`);
      return false;
    }
  }

  /** Clears a previous BAJA when she accepts messages again (e.g. a new web booking). */
  function optIn(whatsapp, origen = "") {
    const d = resolverDestino(whatsapp);
    if (!d) return false;
    const habia = quitarBajas({ whatsapp: d.whatsapp, usuarioId: d.usuarioId || d.conv?.usuario_id });
    if (habia) log?.info?.(`[whatsapp] un contacto volvió a aceptar mensajes (${origen || "sin origen"})`); // no numbers in logs
    return habia;
  }

  function resumenConversacion(whatsapp) {
    const conv = resolverDestino(whatsapp)?.conv;
    if (!conv) return null;
    const c = aConversacion(conv, ahora());
    return { id: c.id, noLeidos: c.noLeidos, ultimoMensaje: c.ultimoMensaje };
  }

  /* ── templates and status ──────────────────────────── */

  const listarPlantillas = () => {
    const cache = almacen.plantillasCache();
    return PLANTILLAS.map((p) => aPlantillaContrato(p, cache.get(`${p.nombre}|${p.idioma}`)));
  };

  async function sincronizarPlantillas() {
    exigirWaba();
    const items = await graph.todas(`${cfg.wabaId}/message_templates`, { fields: "id,name,status,category,language,rejected_reason", limit: 100 });
    const enMeta = new Set();
    for (const t of items) {
      if (!t?.name || !t?.language) continue;
      enMeta.add(`${t.name}|${t.language}`);
      almacen.guardarPlantilla({
        nombre: String(t.name), idioma: String(t.language), metaId: t.id ? String(t.id) : null, estado: String(t.status || "PENDING").toUpperCase(),
        categoria: t.category ? String(t.category).toUpperCase() : null, motivo: t.rejected_reason && t.rejected_reason !== "NONE" ? String(t.rejected_reason) : null,
      });
    }
    // A catalogue template deleted in WhatsApp Manager goes back to «NO_ENVIADA».
    for (const p of PLANTILLAS) if (!enMeta.has(`${p.nombre}|${p.idioma}`)) almacen.borrarPlantilla(p.nombre, p.idioma);
    return listarPlantillas();
  }

  /**
   * Submits catalogue templates that Meta does not have yet. `nombres` limits the set;
   * `forzar` re-submits even when Meta already has them (Meta will refuse duplicates by name).
   * Returns [{ nombre, accion: "existe"|"enviada"|"error", estado?, error? }].
   */
  async function enviarPlantillasAMeta({ nombres, forzar = false } = {}) {
    exigirWaba();
    await sincronizarPlantillas();
    const cache = almacen.plantillasCache();
    const lista = Array.isArray(nombres) && nombres.length ? PLANTILLAS.filter((p) => nombres.includes(p.nombre)) : PLANTILLAS;
    const out = [];
    for (const p of lista) {
      const c = cache.get(`${p.nombre}|${p.idioma}`);
      if (c && !forzar) { out.push({ nombre: p.nombre, accion: "existe", estado: c.estado }); continue; }
      try {
        const r = await graph.post(`${cfg.wabaId}/message_templates`, aPayloadCreacion(p));
        const estado = String(r?.status || "PENDING").toUpperCase();
        almacen.guardarPlantilla({ nombre: p.nombre, idioma: p.idioma, metaId: r?.id ? String(r.id) : null, estado, categoria: r?.category ? String(r.category).toUpperCase() : p.categoria });
        out.push({ nombre: p.nombre, accion: "enviada", estado, ...(r?.category && String(r.category).toUpperCase() !== p.categoria ? { categoriaMeta: String(r.category).toUpperCase() } : {}) });
      } catch (e) {
        out.push({ nombre: p.nombre, accion: "error", error: e.message, ...(e.meta?.detalle ? { detalle: e.meta.detalle } : {}) });
      }
    }
    return out;
  }

  let infoCache = null; // { hasta, datos }
  async function infoNumero() {
    if (infoCache && infoCache.hasta > ahora()) return infoCache.datos;
    const datos = await graph.get(cfg.phoneNumberId, { fields: "display_phone_number,verified_name,quality_rating,name_status,code_verification_status" });
    infoCache = { hasta: ahora() + 5 * 60 * 1000, datos };
    return datos;
  }

  async function estado() {
    const base = { conectado: false, modo: cfg.modo, plantillas: listarPlantillas(), faltan: cfg.faltan };
    if (!cfg.configurado) return base;
    try {
      const info = await infoNumero();
      return {
        ...base,
        conectado: true,
        numero: info?.display_phone_number || undefined,
        nombreVerificado: info?.verified_name || undefined,
        calidad: info?.quality_rating || undefined,
        estadoNombre: info?.name_status || undefined,
        cobrables30d: almacen.cobrosDesde(new Date(ahora() - 30 * 86400000).toISOString()),
      };
    } catch (e) {
      return { ...base, error: e.message };
    }
  }

  /* ── handlers (framework-agnostic) ─────────────────── */

  const ok = (cuerpo, status = 200) => ({ status, cuerpo });
  const FILTROS = new Set(["abiertas", "sin-leer", "todas"]);

  async function marcarLeidoEnMeta(conv) {
    if (!cfg.configurado) return;
    const metaId = almacen.ultimoEntranteMetaId(conv.id);
    if (!metaId) return;
    try { await graph.post(`${cfg.phoneNumberId}/messages`, { messaging_product: "whatsapp", status: "read", message_id: metaId }); }
    catch (e) { log?.warn?.(`[whatsapp] no se pudo marcar como leído: ${e?.message}`); }
  }

  async function clientaDe(conv) {
    try {
      if (conv.clienta && typeof dominio.buscarClientaPorId === "function") return (await dominio.buscarClientaPorId(conv.clienta)) || null;
      if (typeof dominio.buscarClientaPorWhatsApp === "function") return (await dominio.buscarClientaPorWhatsApp(conv.whatsapp)) || null;
    } catch (e) { log?.warn?.(`[whatsapp] clienta de ${conv.id}: ${e?.message}`); }
    return null;
  }

  const admin = {
    async estado() { return ok(await estado()); },

    async conversaciones({ query = {} } = {}) {
      const filtro = FILTROS.has(query.filtro) ? query.filtro : "abiertas";
      const q = typeof query.q === "string" ? query.q.slice(0, 100) : "";
      return ok(almacen.listarConversaciones({ filtro, q }).map((f) => aConversacion(f, ahora())));
    },

    async conversacion({ params = {}, query = {} } = {}) {
      let conv = almacen.conversacion(params.id);
      if (!conv) throw new WhatsAppError("no-existe", "Esa conversación no existe.");
      const antes = typeof query.antes === "string" && /^\d{4}-\d{2}-\d{2}T/.test(query.antes) ? query.antes : undefined;
      const mensajes = almacen.mensajes(conv.id, { antes, limite: query.limite }).map(aMensaje);
      const clienta = await clientaDe(conv);
      if (clienta?.id && conv.vincular && (clienta.id !== conv.clienta || clienta.nombre !== conv.clienta_nombre || clienta.etapa !== conv.clienta_etapa)) {
        almacen.actualizarConversacion(conv.id, { clienta: String(clienta.id), clientaNombre: clienta.nombre || null, clientaEtapa: clienta.etapa || null });
      }
      if (conv.no_leidos > 0) {
        almacen.marcarLeida(conv.id);
        void marcarLeidoEnMeta(conv);
      }
      conv = almacen.conversacion(conv.id);
      return ok({ conversacion: aConversacion(conv, ahora()), mensajes, ...(clienta ? { clienta } : {}) });
    },

    async enviar({ params = {}, body = {}, actor } = {}) {
      const conv = almacen.conversacion(params.id);
      if (!conv) throw new WhatsAppError("no-existe", "Esa conversación no existe.");
      exigirConfigurado();
      const quien = { ...autorDe(actor), tipo: "admin" };
      if (body && typeof body.plantilla === "string") return ok(await enviarPlantillaA(destinoDeConv(conv), body.plantilla, body.variables ?? {}, quien), 201);
      if (body && typeof body.texto === "string") return ok(await enviarTextoA(destinoDeConv(conv), textoValido(body.texto), quien), 201);
      throw validacion("Envía un texto o una plantilla.", { texto: "Escribe un mensaje." });
    },

    async actualizar({ params = {}, body = {}, actor } = {}) {
      const conv = almacen.conversacion(params.id);
      if (!conv) throw new WhatsAppError("no-existe", "Esa conversación no existe.");
      const cambios = {};
      const campos = {};
      if (body && "estado" in body) {
        if (body.estado === "abierta" || body.estado === "cerrada") cambios.estado = body.estado;
        else campos.estado = "Debe ser «abierta» o «cerrada».";
      }
      if (body && "etiquetas" in body) {
        if (!Array.isArray(body.etiquetas) || body.etiquetas.length > 20) campos.etiquetas = "Máximo 20 etiquetas.";
        else {
          const vistas = new Map();
          for (const e of body.etiquetas) {
            const t = String(e ?? "").replace(/\s+/g, " ").trim();
            if (!t) continue;
            if (t.length > 40) { campos.etiquetas = "Cada etiqueta tiene máximo 40 caracteres."; break; }
            if (!vistas.has(t.toLowerCase())) vistas.set(t.toLowerCase(), t);
          }
          if (!campos.etiquetas) cambios.etiquetas = [...vistas.values()];
        }
      }
      if (body && "clienta" in body) {
        if (body.clienta === null || body.clienta === "") {
          Object.assign(cambios, { clienta: null, clientaNombre: null, clientaEtapa: null, vincular: false });
        } else if (typeof body.clienta === "string" && /^C-\d{1,8}$/.test(body.clienta)) {
          let c = { id: body.clienta, nombre: null, etapa: null };
          if (typeof dominio.buscarClientaPorId === "function") {
            const encontrada = await dominio.buscarClientaPorId(body.clienta);
            if (!encontrada) throw new WhatsAppError("no-existe", "Esa clienta no existe.");
            c = encontrada;
          }
          Object.assign(cambios, { clienta: String(c.id), clientaNombre: c.nombre || null, clientaEtapa: c.etapa || null, vincular: true });
        } else campos.clienta = "Debe ser un id de clienta (C-0001) o null.";
      }
      if (Object.keys(campos).length) throw validacion("Revisa los datos.", campos);
      if (!Object.keys(cambios).length) throw validacion("No hay nada que cambiar.");
      const fila = almacen.actualizarConversacion(conv.id, cambios);
      registrar("whatsapp.conversacion", conv.id, `Cambió ${Object.keys(cambios).filter((k) => !["clientaNombre", "clientaEtapa", "vincular"].includes(k)).join(", ")}`, { ...autorDe(actor), tipo: "admin" });
      return ok(aConversacion(fila, ahora()));
    },

    async plantillas() { return ok(listarPlantillas()); },
  };

  const webhook = {
    verificar({ query = {} } = {}) { return verificarSuscripcion(query, cfg.verifyToken); },

    /** Raw body (Buffer) + signature header → { status, procesando? }. Answers fast; work happens after. */
    recibir({ cuerpoCrudo, firma } = {}) {
      if (!cfg.appSecret) { log?.warn?.("[whatsapp] webhook rechazado: falta WHATSAPP_APP_SECRET"); return { status: 401 }; }
      if (!firmaValida(cuerpoCrudo, firma, cfg.appSecret)) { log?.warn?.("[whatsapp] webhook con firma inválida"); return { status: 401 }; }
      let payload;
      try { payload = JSON.parse(cuerpoCrudo.toString("utf8")); } catch { return { status: 400 }; }
      return { status: 200, procesando: encolar(payload) };
    },
  };

  return {
    configurado: cfg.configurado,
    /** What is configured, without secrets (for /api/admin/salud and logs). */
    resumenConfig: () => resumenConfig(cfg),
    almacen,
    estado,
    enviarTexto,
    enviarPlantilla,
    enviarCodigo,
    resumenConversacion,
    optIn,
    listarPlantillas,
    sincronizarPlantillas,
    enviarPlantillasAMeta,
    procesarNotificacion,
    esperarPendientes: () => cola,
    admin,
    webhook,
  };
}
