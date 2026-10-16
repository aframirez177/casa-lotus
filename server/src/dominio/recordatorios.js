// Casa Lotus · class reminders: the day before each class, at «Hora del recordatorio» (Ajustes, default 18:00
// Bogotá), every clienta with a Confirmada or Pendiente de pago booking in it hears about it: by e-mail when she
// has one, and by the WhatsApp template `recordatorio_clase` when WhatsApp is connected and she opted in.
//  - Skipped: bookings made less than 24 h before the class (they just got their confirmation), anything not
//    active, and clientas tagged «sin-recordatorios».
//  - One reminder per booking, ever: the row in `recordatorios` (SQLite) is claimed before sending.
//  - The job checks every 10 minutes; after a restart it catches up for up to 4 hours past the reminder hour
//    (never after midnight, never less than 2 hours before the class), so nobody gets one at 3 a.m.
//  - «No puedo ir» opens a session that sees only that booking until the class starts (GET /api/auth/reserva/:t);
//    «No quiero recordatorios» (GET /api/publico/recordatorios/baja/:t) asks first; only a POST to the same
//    address tags her (the page's button, or a mail client's RFC 8058 one-click: List-Unsubscribe-Post).
import * as R from "../../../shared/reglas.js";
import { modelo, transaccion, SISTEMA } from "./base.js";
import { vistaPago, nombreClase, CLASE_GENERICA, fijoDeReserva, duracionDe, esPasada } from "./vistas.js";
import { claseParaCorreo, esCorreo, venceTexto } from "./avisos.js";
import { anotarRegistro } from "./registro.js";
import { ETIQUETA_SIN_RECORDATORIOS, etiquetasConRecordatorios, textoEtiquetas } from "../datos/modelo.js";
import { correoRecordatorio } from "../notificaciones/plantillas.js";
import { intervalo, enlaceGoogleCalendar } from "../notificaciones/calendario.js";
import { token as nuevoToken, sha256 } from "../auth/claves.js";

const AJUSTE_HORA = "Hora del recordatorio";
const HORA = 3600000;
const VENTANA_MS = 4 * HORA; // catch-up after a restart
const ANTES_MS = 2 * HORA; // never closer than this to the class
const RECIENTE_MS = 24 * HORA; // a booking this fresh already got its confirmation e-mail
const BAJA_MS = 365 * 86400000;
const pad = (n) => String(n).padStart(2, "0");

/** «Hora del recordatorio» as "HH:mm" (also when the Sheet turned it into a time value), 18:00 when unusable. */
export function horaRecordatorio(M) {
  const v = M.ajustesCrudo?.[AJUSTE_HORA] ?? M.ajustes[AJUSTE_HORA];
  if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1) {
    const min = Math.round(v * 1440) % 1440;
    return pad(Math.floor(min / 60)) + ":" + pad(min % 60);
  }
  const m = String(v ?? "").trim().match(/^([01]?\d|2[0-3]):([0-5]\d)/);
  return m ? pad(Number(m[1])) + ":" + m[2] : "18:00";
}

/**
 * When a class's reminder may go out: from the reminder hour the day before, for up to 4 hours, never past the
 * end of that day and never less than 2 hours before the class. { desde, hasta } in epoch ms.
 */
export function ventanaRecordatorio(c, hora) {
  const dia = R.sumarDias(c.fecha, -1);
  const desde = R.momentoMs(dia, hora);
  return { desde, hasta: Math.min(desde + VENTANA_MS, R.momentoMs(c.fecha, "00:00"), R.inicioClase(c) - ANTES_MS) };
}

/* ── links ───────────────────────────────────────────── */

function crearEnlace(ctx, tipo, { clienta, reserva = null, vence }) {
  const t = nuevoToken(32);
  ctx.db.prepare("INSERT INTO enlaces (hash, tipo, clienta, reserva, creado, vence) VALUES (?, ?, ?, ?, ?, ?)").run(sha256(t), tipo, clienta, reserva, ctx.ahora(), vence);
  return t;
}

/** A live link of that kind, or null. Links in a reminder work again and again until they expire. */
export function leerEnlace(ctx, tipo, t, { marcar = true } = {}) {
  if (!t || String(t).length < 20 || String(t).length > 100) return null;
  const f = ctx.db.prepare("SELECT * FROM enlaces WHERE hash = ? AND tipo = ?").get(sha256(t), tipo);
  if (!f || f.vence <= ctx.ahora()) return null;
  if (marcar) ctx.db.prepare("UPDATE enlaces SET usado = ? WHERE hash = ?").run(ctx.ahora(), f.hash);
  return f;
}

/** GET of «No quiero recordatorios»: is the link alive? (Nothing changes on a GET.) */
export const enlaceBajaVivo = (ctx, t) => Boolean(leerEnlace(ctx, "baja-recordatorios", t, { marcar: false }));

/** GET /api/auth/reserva/:token → { clienta, reserva, vence } for a session scoped to that booking, or null. */
export async function usarEnlaceReserva(ctx, t) {
  const f = leerEnlace(ctx, "reserva", t);
  if (!f) return null;
  const M = await modelo(ctx);
  const r = M.reservaPorId.get(f.reserva);
  const c = M.clientaPorId.get(f.clienta);
  if (!r || !c || r.clienta !== c.id) return null;
  anotarRegistro(ctx, { tipo: "clienta", id: c.id, nombre: c.nombre }, "auth.recordatorio", r.id, {});
  return { clienta: c, reserva: r.id, vence: f.vence };
}

/**
 * POST /api/publico/recordatorios/baja/:token: tags her «sin-recordatorios» (activar: false) or takes the tag off
 * again («Volver a recibirlos», activar: true). true when the link worked.
 */
export async function bajaRecordatorios(ctx, t, { activar = false, origen = "correo" } = {}) {
  const f = leerEnlace(ctx, "baja-recordatorios", t);
  if (!f) return false;
  const actor = { tipo: "clienta", id: f.clienta, nombre: "" };
  return transaccion(ctx, actor, async (tx) => {
    const c = tx.M.clientaPorId.get(f.clienta);
    if (!c) return false;
    if ((c.recordatorios !== false) !== activar) {
      await tx.actualizar("Clientas", c._fila, { "Etiquetas": textoEtiquetas(etiquetasConRecordatorios(c.etiquetas, activar), c.novedades) });
    }
    tx.auditar(activar ? "recordatorios.alta" : "recordatorios.baja", c.id, { origen });
    return true;
  });
}

/* ── the job ─────────────────────────────────────────── */

/** "sábado a las 2:00 a. m." */
const diaYHora = (ms) => R.diaDeSemana(R.hoyClave(ms)).toLowerCase() + " a las " + R.horaLegible(R.ahoraHora(ms));

/** The reminder e-mail of one booking (links created here) and its opt-out address. */
function correoDe(ctx, M, r, c, p, ahora) {
  const publicUrl = ctx.config.publicUrl;
  const confirmada = r.estado === R.ESTADO.CONFIRMADA;
  const k = claseParaCorreo(M, c);
  const { inicio, fin } = intervalo(c, duracionDe(M));
  const horas = M.ajustes["Horas mínimas para cancelar"];
  const limite = R.inicioClase(c) - horas * HORA;
  const fijo = fijoDeReserva(r) ? M.fijoPorId?.get(fijoDeReserva(r)) : null;
  const diaFijo = (fijo?.dia || c.dia || R.diaDeSemana(c.fecha)).toLowerCase();
  let pago;
  if (!confirmada) {
    const v = vistaPago(M, r, { nombre: p.nombre });
    pago = { monto: v.monto, llave: v.llave, medios: v.medios, whatsappTexto: R.whatsappLegible(v.whatsapp), venceTexto: venceTexto(r.vence), waEnlace: v.waEnlace };
  }
  const noPuedoIr = publicUrl + "/api/auth/reserva/" + crearEnlace(ctx, "reserva", { clienta: p.id, reserva: r.id, vence: R.inicioClase(c) });
  const baja = publicUrl + "/api/publico/recordatorios/baja/" + crearEnlace(ctx, "baja-recordatorios", { clienta: p.id, vence: ahora + BAJA_MS });
  const titulo = k.nombre + " · Casa Lotus";
  const m = correoRecordatorio({
    nombre: p.nombre, codigo: r.id, publicUrl, horasCancelar: horas, clase: k, dia: R.diaDeSemana(c.fecha).toLowerCase(), hora: R.horaLegible(c.hora),
    fijo: fijoDeReserva(r) ? (diaFijo.endsWith("s") ? diaFijo : diaFijo + "s") : undefined,
    confirmada, limiteTexto: limite > ahora ? diaYHora(limite) : "", pago, noPuedoIr, baja,
    calendario: enlaceGoogleCalendar({ titulo, descripcion: k.nombre + (k.profe ? " con tu profe " + k.profe : "") + "\nTus clases: " + publicUrl + "/app/mi", inicio, fin }),
  });
  return { ...m, baja };
}

/**
 * Sends what is due now. Returns { enviados, correos, whatsapps }. Never throws for one failed send: the
 * booking is marked anyway (no double sends), and the error is kept in its row.
 */
export async function enviarRecordatorios(ctx) {
  const M = await modelo(ctx), ahora = ctx.ahora(), hoy = R.hoyClave(ahora);
  const hora = horaRecordatorio(M);
  const out = { enviados: 0, correos: 0, whatsapps: 0 };
  const clases = M.clases.filter((c) => c.estado === "Programada" && (c.fecha === hoy || c.fecha === R.sumarDias(hoy, 1)) && !esPasada(c, ahora))
    .filter((c) => { const v = ventanaRecordatorio(c, hora); return ahora >= v.desde && ahora < v.hasta; });
  const wa = ctx.whatsapp?.configurado;
  for (const c of clases) {
    for (const r of M.reservasDeClase(c.id)) {
      if (r.estado !== R.ESTADO.CONFIRMADA && r.estado !== R.ESTADO.PENDIENTE) continue;
      if (r.creada && r.creada > R.inicioClase(c) - RECIENTE_MS) continue;
      const p = M.clientaPorId.get(r.clienta);
      if (!p || p.recordatorios === false || p.etiquetas?.includes(ETIQUETA_SIN_RECORDATORIOS)) continue;
      const porCorreo = esCorreo(p.correo) && Boolean(ctx.correo);
      const porWhatsApp = Boolean(wa && p.whatsapp && p.novedades);
      if (!porCorreo && !porWhatsApp) continue;
      // claim it first: a second run (or a restart) finds the row and sends nothing
      const reclamo = ctx.db.prepare("INSERT OR IGNORE INTO recordatorios (reserva, clienta, clase, enviado) VALUES (?, ?, ?, ?)").run(r.id, p.id, c.id, ahora);
      if (reclamo.changes !== 1) continue;
      const canales = [], errores = [];
      if (porCorreo) {
        try {
          const m = correoDe(ctx, M, r, c, p, ahora);
          // RFC 8058: mail clients show «Cancelar suscripción» and POST to it in one click
          const ok = await ctx.correo.enviar({
            para: p.correo.trim(), asunto: m.asunto, html: m.html, texto: m.texto, nombreRemitente: "Casa Lotus",
            cabeceras: { "List-Unsubscribe": "<" + m.baja + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          });
          if (ok !== false) { canales.push("correo"); out.correos++; } else errores.push("correo sin configurar");
        } catch (e) {
          errores.push("correo: " + String(e?.message || e).slice(0, 120));
        }
      }
      if (porWhatsApp) {
        try {
          await ctx.whatsapp.enviarPlantilla(p.whatsapp, "recordatorio_clase", {
            nombre: R.primerNombre(p.nombre), cuando: R.fechaLegible(c.fecha) + " a las " + R.horaLegible(c.hora), clase: nombreClase(c) || CLASE_GENERICA,
          }, SISTEMA);
          canales.push("whatsapp");
          out.whatsapps++;
        } catch (e) {
          errores.push("whatsapp: " + String(e?.message || e).slice(0, 120));
        }
      }
      ctx.db.prepare("UPDATE recordatorios SET canales = ?, error = ? WHERE reserva = ?").run(canales.join(","), errores.join(" · "), r.id);
      anotarRegistro(ctx, SISTEMA, "recordatorio.enviar", r.id, { clase: c.id, canales, ...(errores.length ? { errores } : {}) });
      if (canales.length) out.enviados++;
      else ctx.log.warn("recordatorio sin enviar", { reserva: r.id, errores: errores.join(" · ") });
    }
  }
  return out;
}

/** Daily cleanup: reminder rows of old classes and expired links. */
export function purgarRecordatorios(ctx) {
  const ahora = ctx.ahora();
  ctx.db.prepare("DELETE FROM recordatorios WHERE enviado < ?").run(ahora - 90 * 86400000);
  ctx.db.prepare("DELETE FROM enlaces WHERE vence < ?").run(ahora - 30 * 86400000);
}
