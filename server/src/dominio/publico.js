// Casa Lotus · what anyone can do without an account: see the plans and free swings (counts only),
// recognise a returning student, book a class from the site, join a waiting list, send attribution beacons.
// A known WhatsApp books as that clienta. Only when the first name matches too («reconocida») does the booking
// use her own agreements and plan; otherwise nothing in the answer reveals that she exists, her profile only
// gets its blanks filled, and the booking never spends her plan.
import { createHash } from "node:crypto";
import * as R from "../../../shared/reglas.js";
import { SALUD_SIN_DATOS } from "../../../shared/consentimientos.js";
import { modelo, transaccion } from "./base.js";
import { crearEnTx, columnasPerfil, columnasConsentimientos, soloVacios } from "./clientas.js";
import { reservarEnTx, unirseEsperaEnTx } from "./reservas.js";
import {
  vistaClase, vistaPago, vistaSaldo, planDePrueba, perfilDe, respuestasDeSeguridad, acuerdosCompletos, duracionDe, MEDIOS_LLAVE,
} from "./vistas.js";
import { avisarReservaPorCorreo, esCorreo } from "./avisos.js";
import { noExiste, validacion } from "../errores.js";
import { correoReservaWeb } from "../notificaciones/plantillas.js";
import { leerMeta, guardarMeta } from "../db/sqlite.js";
import { sinTilde } from "../datos/modelo.js";
import { randomBytes } from "node:crypto";

export const PUBLICO = Object.freeze({ tipo: "publico", id: "web", nombre: "Sitio web" });

export async function estudio(ctx) {
  const M = await modelo(ctx);
  const aj = M.ajustes;
  return {
    whatsapp: aj["WhatsApp de reservas"], llavePago: aj["Llave de pago"], mediosPago: MEDIOS_LLAVE, duracion: duracionDe(M),
    politicas: {
      horasReservar: aj["Horas mínimas para reservar"], horasCancelar: aj["Horas mínimas para cancelar"],
      horasPagar: aj["Horas para pagar una reserva web"], cambiosPrueba: aj["Cambios permitidos clase de prueba"],
    },
  };
}

/** utm + click ids as the compact JSON stored in «Atribución». */
export function atribucionDe(utm = {}, clickIds = {}) {
  const o = {};
  for (const k of ["source", "medium", "campaign", "term", "content"]) if (utm?.[k]) o[k] = utm[k];
  for (const k of ["gclid", "gbraid", "wbraid", "fbclid"]) if (clickIds?.[k]) o[k] = clickIds[k];
  return o;
}

const hayDatoDeSalud = (s) => Boolean(s && !SALUD_SIN_DATOS.includes(s));

/** First words compared without accents, case or punctuation: «maría» = «María Fernanda». */
const primeraPalabra = (t) => sinTilde(R.primerNombre(t)).replace(/[^a-z0-9]/g, "");
export function mismoNombre(escrito, registrado) {
  const a = primeraPalabra(escrito);
  return Boolean(a) && a === primeraPalabra(registrado);
}

/** The clienta this name + WhatsApp belong to, or null (both must match). */
export function reconocer(M, nombre, whatsapp) {
  const p = M.clientaPorWa.get(whatsapp);
  return p && mismoNombre(nombre, p.nombre) ? p : null;
}

/**
 * POST /api/publico/identificar: is this a returning student, and what does the booking still need from her?
 * Returns none of her data. pideFicha: the safety answers are missing (health, emergency contact);
 * pideAcuerdos: the agreements are missing (data, disclaimer, photos). Together they are !fichaCompleta.
 */
export async function identificar(ctx, { nombre, whatsapp }) {
  const M = await modelo(ctx);
  const p = reconocer(M, nombre, whatsapp);
  if (!p) return { conocida: false, pideFicha: true, pideAcuerdos: true };
  return { conocida: true, pideFicha: !respuestasDeSeguridad(perfilDe(p)), pideAcuerdos: !acuerdosCompletos(p.consentimientos) };
}

/** A recognised student's agreements: what she accepted before, plus anything accepted now. */
function consentimientosEfectivos(guardados, nuevos = {}) {
  const o = {};
  for (const k of ["datos", "descargo", "sensibles"]) o[k] = { acepta: nuevos[k]?.acepta === true || guardados?.[k]?.acepta === true };
  o.imagen = typeof nuevos.imagen?.acepta === "boolean" ? nuevos.imagen : guardados?.imagen || { acepta: null };
  return o;
}

function revisarConsentimientos(perfil, cons) {
  const campos = {};
  if (cons?.datos?.acepta !== true) campos["consentimientos.datos"] = "Para reservar necesitamos tu autorización de tratamiento de datos.";
  if (cons?.descargo?.acepta !== true) campos["consentimientos.descargo"] = "Para reservar necesitas aceptar el descargo de responsabilidad.";
  if (typeof cons?.imagen?.acepta !== "boolean") campos["consentimientos.imagen"] = "Cuéntanos si podemos incluirte en fotos y videos.";
  if (hayDatoDeSalud(perfil.salud) && cons?.sensibles?.acepta !== true) {
    campos["consentimientos.sensibles"] = "Para guardar lo que nos cuentas de tu salud necesitamos tu autorización de datos sensibles.";
  }
  if (Object.keys(campos).length) throw validacion("Faltan algunas autorizaciones.", campos);
}

/**
 * POST /api/publico/reservas. Returns { codigo, estado, clase, pago, sesion, conPlan, saldo, correo } plus the
 * internal { clienta, nueva, destinoCorreo }, which the route turns into the session (full for someone new,
 * limited for a known number) and strips from the answer. The keys are the same for everyone.
 */
export async function reservaPublica(ctx, input) {
  const { perfil } = input;
  const cons = input.consentimientos || {};
  const atribucion = atribucionDe(input.utm, input.clickIds);
  const ref = input.ref || "WEB";
  let aviso = null;

  const res = await transaccion(ctx, PUBLICO, async (tx) => {
    const M = tx.M, hoy = R.hoyClave(tx.ahora);
    const c = M.clasePorId.get(input.clase);
    if (!c) throw noExiste("Esa clase no existe.");
    if (input.plan && !M.planPorNombre.get(input.plan)?.activo) throw validacion("Ese plan no existe.", { plan: "Elige un plan de la lista." });
    let p = M.clientaPorWa.get(perfil.whatsapp);
    const reconocida = Boolean(p && mismoNombre(perfil.nombre, p.nombre));
    // a returning student's own agreements count; anyone else accepts them here
    const efectivos = reconocida ? consentimientosEfectivos(p.consentimientos, cons) : cons;
    revisarConsentimientos(perfil, efectivos);
    const datosPerfil = { ...perfil };
    if (hayDatoDeSalud(perfil.salud) && efectivos?.sensibles?.acepta !== true) delete datosPerfil.salud;
    let nueva = false;
    if (p) {
      const cambios = soloVacios(p, { ...columnasPerfil(datosPerfil), ...columnasConsentimientos(cons, hoy) });
      // her number and her e-mail are how she signs in: a public form never sets them on an existing
      // clienta (whoever typed her number could otherwise receive her login code)
      delete cambios["WhatsApp"];
      delete cambios["Correo"];
      if (Object.keys(cambios).length) await tx.actualizar("Clientas", p._fila, cambios);
    } else {
      const id = await crearEnTx(tx, { perfil: { ...datosPerfil, llego: datosPerfil.llego || "Otro" }, consentimientos: cons });
      p = tx.M.clientaPorId.get(id);
      nueva = true;
    }
    const plan = input.plan || planDePrueba(tx.M)?.nombre;
    // the plan she asked for rides in «Atribución» (no new column): Ana's «Confirmar» preselects it.
    // Only a recognised student books on her own plan; anyone else holds a swing until the payment arrives.
    const r = await reservarEnTx(tx, {
      clienta: p.id, clase: c.id, origen: "Web · " + ref, atribucion: { ...atribucion, ...(plan ? { plan } : {}) }, soloPendiente: !reconocida,
    });
    const conPlan = r.estado === R.ESTADO.CONFIRMADA;
    tx.auditar("reserva.web", r.id, { clienta: p.id, clase: c.id, ref, nueva, reconocida, conPlan });
    const cv = vistaClase(tx.M, c, tx.ahora);
    const quien = reconocida ? tx.M.clientaPorId.get(p.id).nombre : perfil.nombre;
    tx.publicar({
      tipo: "reserva-web", titulo: (conPlan ? "Reservó con su plan: " : "Apartó un columpio: ") + quien,
      detalle: R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora) + (cv.clase ? " · " + cv.clase : "") + " · código " + r.id,
      clienta: p.id, clase: c.id, ruta: "/app/admin",
    });
    const pago = conPlan ? null : vistaPago(tx.M, r, { plan, nombre: perfil.nombre });
    const saldo = conPlan ? vistaSaldo(tx.M, p.id, hoy) : null;
    // her confirmation: her own e-mail when recognised, otherwise only the address typed here (never the owner's)
    const escrito = esCorreo(perfil.correo) ? perfil.correo.trim() : "";
    const destinoCorreo = reconocida && esCorreo(p.correo) ? p.correo.trim() : escrito;
    const correo = avisarReservaPorCorreo(tx, r.id, { para: destinoCorreo, nombre: quien, plan, mostrarSaldo: reconocida });
    const correoAna = String(tx.M.ajustes["Correo para avisos"] || "").trim();
    aviso = {
      correo: esCorreo(correoAna) ? correoAna : "", nombre: quien, whatsapp: perfil.whatsapp, codigo: r.id,
      clase: cv, venceTexto: r.vence ? R.fechaLegible(R.hoyClave(r.vence)) + " a las " + R.horaLegible(R.ahoraHora(r.vence)) : "",
      pago, claseNombre: cv.clase, conPlan, saldo: saldo ? saldo.clases : null, horasCancelar: tx.M.ajustes["Horas mínimas para cancelar"],
    };
    aviso.optIn = nueva && cons?.novedades?.acepta === true;
    return { codigo: r.id, estado: r.estado, clase: cv, pago, sesion: true, conPlan, saldo, correo, clienta: p.id, nueva, destinoCorreo };
  });

  // outside the lock: a slow or failed e-mail / WhatsApp never costs the booking
  if (aviso?.correo) {
    ctx.enSegundoPlano(async () => {
      const m = correoReservaWeb({ ...aviso, publicUrl: ctx.config.publicUrl });
      await ctx.correo.enviar({ para: aviso.correo, asunto: m.asunto, html: m.html, texto: m.texto, nombreRemitente: "Casa Lotus · Reservas" });
    });
  }
  if (ctx.whatsapp?.configurado) {
    ctx.enSegundoPlano(async () => {
      // marketing opt-in only from someone new who ticked it (a known number cannot be opted in by others)
      if (aviso.optIn) try { await ctx.whatsapp.optIn?.(aviso.whatsapp, "web"); } catch { /* optional */ }
      const cuando = aviso.clase.fechaTexto + " a las " + aviso.clase.horaTexto;
      if (aviso.conPlan) {
        await ctx.whatsapp.enviarPlantilla(aviso.whatsapp, "reserva_confirmada", {
          nombre: R.primerNombre(aviso.nombre), clase: aviso.claseNombre || "tu clase", cuando, horas: String(aviso.horasCancelar),
        }, { tipo: "sistema", nombre: "Casa Lotus" });
        return;
      }
      await ctx.whatsapp.enviarPlantilla(aviso.whatsapp, "reserva_recibida", {
        nombre: R.primerNombre(aviso.nombre), clase: aviso.claseNombre || "tu clase", cuando,
        vence: aviso.venceTexto, monto: R.dinero(aviso.pago.monto), codigo: aviso.codigo, // key and number are literal in the template
      }, { tipo: "sistema", nombre: "Casa Lotus" });
    });
  }
  return res;
}

/** POST /api/publico/espera: someone joins the waiting list of a full class. Returns { id }. */
export async function esperaPublica(ctx, input) {
  if (input.consentimientos?.datos?.acepta !== true) {
    throw validacion("Para anotarte necesitamos tu autorización de tratamiento de datos.", { "consentimientos.datos": "Autoriza el tratamiento de tus datos." });
  }
  return transaccion(ctx, PUBLICO, async (tx) => {
    const hoy = R.hoyClave(tx.ahora);
    let p = tx.M.clientaPorWa.get(input.whatsapp);
    if (p) {
      const cambios = soloVacios(p, { "Nombre": input.nombre, ...columnasConsentimientos({ datos: input.consentimientos.datos }, hoy) });
      if (Object.keys(cambios).length) await tx.actualizar("Clientas", p._fila, cambios);
    } else {
      const id = await crearEnTx(tx, { perfil: { nombre: input.nombre, whatsapp: input.whatsapp, llego: "Otro" }, consentimientos: { datos: input.consentimientos.datos } });
      p = tx.M.clientaPorId.get(id);
    }
    const { item, nueva } = await unirseEsperaEnTx(tx, { clienta: p.id, clase: input.clase });
    if (nueva) {
      const c = tx.M.clasePorId.get(input.clase);
      tx.auditar("espera.web", item.id, { clienta: p.id, clase: input.clase });
      tx.publicar({ tipo: "espera", titulo: "Lista de espera (web): " + input.nombre, detalle: R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora), clienta: p.id, clase: input.clase });
    }
    return { id: item.id };
  });
}

function salIp(ctx) {
  let s = leerMeta(ctx.db, "sal_ip");
  if (!s) { s = randomBytes(16).toString("hex"); guardarMeta(ctx.db, "sal_ip", s); }
  return s;
}

/** POST /api/publico/eventos: a first-party attribution beacon (no personal data; the IP is hashed). */
export function eventoPublico(ctx, input, { ip = "" } = {}) {
  const u = input.utm || {}, k = input.clickIds || {};
  const ipHash = ip ? createHash("sha256").update(salIp(ctx) + ip).digest("hex").slice(0, 32) : "";
  ctx.db.prepare(`INSERT INTO atribucion (ts, tipo, ref, pagina, utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, gbraid, wbraid, fbclid, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    ctx.ahora(), input.tipo, input.ref || "", String(input.pagina || "").replace(/[?#].*$/, "").slice(0, 200), u.source || "", u.medium || "", u.campaign || "",
    u.term || "", u.content || "", k.gclid || "", k.gbraid || "", k.wbraid || "", k.fbclid || "", ipHash,
  );
}
