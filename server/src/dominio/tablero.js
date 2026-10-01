// Casa Lotus · Ana's «Hoy»: the KPIs (weekly occupancy is the number that governs every decision),
// today's and tomorrow's classes, attendance to mark, pending payments and alerts by urgency.
import * as R from "../../../shared/reglas.js";
import { modelo } from "./base.js";
import { vistaClase, vistaClaseEquipo, esPasada, iso, nombreClase, reemplazoDe } from "./vistas.js";
import { sinProfe } from "./asignacion.js";
import { NOTA_SIN_PLAN } from "./asistencia.js";
import { analizar, SEGMENTOS } from "./clientas.js";
import { porMarcar, dictada } from "./profes.js";

function saludo(ahora) {
  const h = Number(R.ahoraHora(ahora).slice(0, 2));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

/** Monday of the week of a date key. */
function lunesDe(fecha) {
  const d = R.fechaUTC(fecha).getUTCDay();
  return R.sumarDias(fecha, d === 0 ? -6 : 1 - d);
}

const wa = (numero, texto) => (numero ? { tipo: "whatsapp", texto, enlace: R.enlaceWhatsApp(numero, texto) } : null);

export function pendientePago(M, r, ahora) {
  const c = M.clasePorId.get(r.clase);
  const p = M.clientaPorId.get(r.clienta) || { nombre: "(sin nombre)", whatsapp: "" };
  const s = R.saldo(M.compras, M.reservas, r.clienta, c?.fecha || R.hoyClave(ahora));
  const texto = "Hola " + R.primerNombre(p.nombre) + ", recibimos tu reserva para el " + (c ? R.fechaLegible(c.fecha) + " a las " + R.horaLegible(c.hora) : "") +
    " en Casa Lotus. Para confirmarla, envíanos por aquí el comprobante de pago. ¡Te esperamos!";
  return {
    reserva: r.id, clienta: r.clienta, nombre: p.nombre, whatsapp: p.whatsapp, clase: c ? vistaClase(M, c, ahora) : null,
    creada: iso(r.creada), venceApartado: iso(r.vence), saldo: s.clases, origen: r.origen, waTexto: texto,
    waEnlace: p.whatsapp ? R.enlaceWhatsApp(p.whatsapp, texto) : "",
  };
}

export async function tablero(ctx) {
  const M = await modelo(ctx), ahora = ctx.ahora(), hoy = R.hoyClave(ahora), manana = R.sumarDias(hoy, 1);
  const aj = M.ajustes;

  // occupancy of this week (Monday to Sunday), classes not cancelled
  const lunes = lunesDe(hoy), domingo = R.sumarDias(lunes, 6);
  const semana = M.clases.filter((c) => c.fecha >= lunes && c.fecha <= domingo && c.estado === "Programada");
  const cupos = semana.reduce((s, c) => s + c.cupos, 0);
  const ocupados = semana.reduce((s, c) => s + M.ocupados(c.id), 0);

  // this month
  const mes = hoy.slice(0, 7);
  const comprasMes = M.compras.filter((c) => c.fecha.startsWith(mes));
  const dictadas = M.clases.filter((c) => c.fecha.startsWith(mes) && dictada(M, c, ahora));
  const asistentes = dictadas.reduce((s, c) => s + M.reservasDeClase(c.id).filter((r) => r.estado === R.ESTADO.ASISTIO).length, 0);
  const pago = aj["Pago por clase a profes"];

  const analisis = new Map(M.clientas.map((c) => [c.id, analizar(M, c, ahora)]));
  const sinVence = Number.MAX_SAFE_INTEGER; // a walk-in without a plan has no hold to expire: it goes last
  const pendientesR = M.reservas.filter((r) => r.estado === R.ESTADO.PENDIENTE).sort((a, b) => (a.vence || sinVence) - (b.vence || sinVence));
  const futurasEspera = M.espera.filter((e) => (e.estado === "Esperando" || e.estado === "Avisada") && String(e.clase).slice(0, 10) >= hoy);

  const hoyClases = M.clases.filter((c) => c.fecha === hoy).map((c) => vistaClaseEquipo(M, c, ahora));
  const mananaClases = M.clases.filter((c) => c.fecha === manana).map((c) => vistaClaseEquipo(M, c, ahora));
  const marcar = M.clases.filter((c) => c.fecha >= R.sumarDias(hoy, -14) && porMarcar(M, c, ahora)).map((c) => vistaClaseEquipo(M, c, ahora));

  /* ── alerts ── */
  const alertas = [];
  const add = (a) => alertas.push(a);
  const clienta = (p) => ({ id: p.id, nombre: p.nombre });

  for (const r of pendientesR.filter((x) => x.notas.includes(NOTA_SIN_PLAN))) {
    const p = M.clientaPorId.get(r.clienta);
    const c = M.clasePorId.get(r.clase);
    const texto = "Hola " + R.primerNombre(p?.nombre) + ", ¡gracias por venir a la clase del " + (c ? R.fechaLegible(c.fecha) : "") +
      " en Casa Lotus! Ya no te quedaban clases en tu plan: ¿te paso los planes para registrar esta clase?";
    add({
      id: "vino-sin-plan:" + r.id, tipo: "vino-sin-plan", prioridad: 1, titulo: (p?.nombre || r.clienta) + " vino sin plan",
      detalle: (c ? R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora) : "") + ": falta cobrarle la clase.",
      clienta: p ? clienta(p) : undefined, clase: c ? vistaClase(M, c, ahora) : undefined,
      accion: wa(p?.whatsapp, texto) || { tipo: "abrir", ruta: "/app/admin/clientas/" + r.clienta },
    });
  }
  for (const r of pendientesR) {
    const horas = r.vence ? (r.vence - ahora) / 3600000 : Infinity;
    if (horas > 6) continue;
    const pp = pendientePago(M, r, ahora);
    const p = M.clientaPorId.get(r.clienta);
    add({
      id: "pago-por-vencer:" + r.id, tipo: "pago-por-vencer", prioridad: 1,
      titulo: (p?.nombre || r.clienta) + " no ha enviado el comprobante",
      detalle: "El cupo del " + (pp.clase ? pp.clase.fechaTexto + " · " + pp.clase.horaTexto : "") + " se libera " + (horas <= 0 ? "ya" : "en " + Math.max(1, Math.round(horas)) + " h") + ".",
      clienta: p ? clienta(p) : undefined, clase: pp.clase || undefined, accion: wa(p?.whatsapp, pp.waTexto) || { tipo: "abrir", ruta: "/app/admin" },
    });
  }
  for (const c of marcar) {
    const n = c.gente.filter((g) => g.estado === R.ESTADO.CONFIRMADA).length;
    add({
      id: "sin-marcar:" + c.id, tipo: "sin-marcar", prioridad: 1, titulo: "Falta marcar la asistencia",
      detalle: c.fechaTexto + " · " + c.horaTexto + (c.clase ? " · " + c.clase : "") + ": " + n + (n === 1 ? " persona" : " personas") + " por marcar.",
      clase: vistaClase(M, M.clasePorId.get(c.id), ahora), accion: { tipo: "abrir", ruta: "/app/admin/agenda/" + encodeURIComponent(c.id) },
    });
  }
  for (const c of M.clases) {
    if (c.estado !== "Programada" || esPasada(c, ahora)) continue;
    const ruta = "/app/admin/agenda/" + encodeURIComponent(c.id);
    const rp = reemplazoDe(M, c);
    if (rp) {
      add({
        id: "necesita-reemplazo:" + c.id, tipo: "necesita-reemplazo", prioridad: 1, titulo: "Buscar reemplazo: " + R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora),
        detalle: (c.profe || "La profe") + " no puede dar esta clase" + (rp.motivo ? ": " + rp.motivo : "."), clase: vistaClase(M, c, ahora),
        accion: { tipo: "abrir", ruta: ruta + "?profe=1" },
      });
    } else if (sinProfe(c.profe) && R.inicioClase(c) - ahora <= 7 * 86400000) {
      add({
        id: "sin-profe:" + c.id, tipo: "sin-profe", prioridad: 2, titulo: "Clase sin profe: " + R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora),
        detalle: (nombreClase(c) || "Clase") + ": asígnale una profe.", clase: vistaClase(M, c, ahora), accion: { tipo: "abrir", ruta },
      });
    }
    const n = M.ocupados(c.id);
    if (n < aj["Mínimo de personas"] && R.inicioClase(c) - ahora <= 72 * 3600000) {
      add({
        id: "poca-gente:" + c.id, tipo: "poca-gente", prioridad: 2, titulo: "Poca gente en la clase del " + R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora),
        detalle: (n === 0 ? "Nadie ha reservado" : n === 1 ? "Solo 1 persona" : "Solo " + n + " personas") + ". El mínimo es " + aj["Mínimo de personas"] + ".",
        clase: vistaClase(M, c, ahora), accion: { tipo: "abrir", ruta: "/app/admin/agenda/" + encodeURIComponent(c.id) },
      });
    }
    const espera = M.esperaDeClase(c.id).filter((e) => e.estado === "Esperando" || e.estado === "Avisada").sort((a, b) => (a.creada || 0) - (b.creada || 0));
    if (espera.length && n < c.cupos) {
      const p = M.clientaPorId.get(espera[0].clienta);
      const texto = "Hola " + R.primerNombre(p?.nombre) + ", ¡se liberó un cupo en la clase del " + R.fechaLegible(c.fecha) + " a las " + R.horaLegible(c.hora) +
        " en Casa Lotus! ¿Te lo reservo?";
      add({
        id: "cupo-liberado:" + c.id, tipo: "cupo-liberado", prioridad: 1, titulo: "Se liberó un cupo y hay lista de espera",
        detalle: R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora) + ": " + (p?.nombre || espera[0].clienta) + " es la primera en la lista" +
          (espera[0].estado === "Avisada" ? " (ya le avisamos por WhatsApp)." : "."),
        clienta: p ? clienta(p) : undefined, clase: vistaClase(M, c, ahora), accion: wa(p?.whatsapp, texto) || { tipo: "abrir", ruta: "/app/admin/agenda/" + encodeURIComponent(c.id) },
      });
    }
  }
  for (const p of M.clientas) {
    const a = analisis.get(p.id);
    const nombre = R.primerNombre(p.nombre);
    if (a.segmentos.includes("poquitas")) {
      const t = "Hola " + nombre + ", te " + (a.saldo.clases === 1 ? "queda 1 clase" : "quedan " + a.saldo.clases + " clases") + " en tu plan" +
        (a.saldo.venceTexto ? " (vence el " + a.saldo.venceTexto + ")" : "") + ". ¿Quieres que te ayude a renovarlo para seguir con tu horario?";
      add({ id: "saldo-bajo:" + p.id, tipo: "saldo-bajo", prioridad: 2, titulo: p.nombre + (a.saldo.clases === 1 ? ": le queda 1 clase" : ": le quedan " + a.saldo.clases + " clases"),
        detalle: "Buen momento para ofrecerle renovar.", clienta: clienta(p), accion: wa(p.whatsapp, t) || { tipo: "abrir", ruta: "/app/admin/clientas/" + p.id } });
    }
    if (a.segmentos.includes("vence-pronto")) {
      const t = "Hola " + nombre + ", tu plan en Casa Lotus vence el " + a.saldo.venceTexto + " y aún tienes " + (a.saldo.clases === 1 ? "1 clase" : a.saldo.clases + " clases") +
        ". ¿Te ayudo a reservarlas?";
      add({ id: "vence-pronto:" + p.id, tipo: "vence-pronto", prioridad: 2, titulo: p.nombre + ": su plan vence el " + R.fechaCorta(a.saldo.vence),
        detalle: "Le " + (a.saldo.clases === 1 ? "queda 1 clase" : "quedan " + a.saldo.clases + " clases") + " sin usar.", clienta: clienta(p),
        accion: wa(p.whatsapp, t) || { tipo: "abrir", ruta: "/app/admin/clientas/" + p.id } });
    }
    if (a.segmentos.includes("sin-clases")) {
      const t = "Hola " + nombre + ", ya usaste todas las clases de tu plan. ¿Quieres que te ayude a renovarlo para seguir con tu horario?";
      add({ id: "sin-clases:" + p.id, tipo: "sin-clases", prioridad: 2, titulo: p.nombre + " ya no tiene clases", detalle: "Compró hace poco y usó todo su plan.",
        clienta: clienta(p), accion: wa(p.whatsapp, t) || { tipo: "abrir", ruta: "/app/admin/clientas/" + p.id } });
    }
    if (a.segmentos.includes("prueba")) {
      const t = "Hola " + nombre + ", ¡gracias por venir a tu clase de prueba en Casa Lotus! ¿Cómo te sentiste? Si quieres seguir, te cuento los planes y te reservo tu próxima clase.";
      add({ id: "prueba-sin-plan:" + p.id, tipo: "prueba-sin-plan", prioridad: 2, titulo: p.nombre + " vino a la clase de prueba", detalle: "Todavía no tiene plan.",
        clienta: clienta(p), accion: wa(p.whatsapp, t) || { tipo: "abrir", ruta: "/app/admin/clientas/" + p.id } });
    }
    if (a.segmentos.includes("cumple")) {
      const t = "¡Feliz cumpleaños, " + nombre + "! Todo el equipo de Casa Lotus te desea un año lleno de bienestar.";
      add({ id: "cumple:" + p.id, tipo: "cumple", prioridad: 3, titulo: p.nombre + (a.diasCumple === 0 ? " cumple años hoy" : a.diasCumple === 1 ? " cumple años mañana" : " cumple años en " + a.diasCumple + " días"),
        detalle: R.fechaLegible(R.sumarDias(hoy, a.diasCumple)), clienta: clienta(p), accion: wa(p.whatsapp, t) || { tipo: "abrir", ruta: "/app/admin/clientas/" + p.id } });
    }
    if (a.segmentos.includes("ficha-incompleta") && a.futuras.length) {
      add({ id: "ficha-incompleta:" + p.id, tipo: "ficha-incompleta", prioridad: 3, titulo: "A " + p.nombre + " le falta completar su ficha",
        detalle: "Tiene clase pronto y falta su respuesta de salud, el contacto de emergencia o el descargo.", clienta: clienta(p),
        accion: { tipo: "abrir", ruta: "/app/admin/clientas/" + p.id } });
    }
  }
  alertas.sort((a, b) => a.prioridad - b.prioridad);

  const totales = Object.fromEntries(SEGMENTOS.map((s) => [s.id, 0]));
  for (const a of analisis.values()) for (const id of a.segmentos) totales[id]++;
  const activas = [...analisis.values()].filter((a) => a.etapa === "activa" || a.etapa === "en-riesgo").length;

  return {
    hoy, hoyTexto: R.fechaLegible(hoy), saludo: saludo(ahora),
    kpis: {
      semana: { desde: lunes, hasta: domingo, clases: semana.length, cupos, ocupados, pct: cupos ? Math.round((ocupados / cupos) * 100) : 0 },
      mes: {
        mes, ingresos: comprasMes.reduce((s, c) => s + (Number(c.valor) || 0), 0), compras: comprasMes.length, clasesDictadas: dictadas.length,
        pagoProfes: pago ? dictadas.length * pago : null, asistentes,
      },
      clientasActivas: activas, pendientesPago: pendientesR.length, enEspera: futurasEspera.filter((e) => e.estado === "Esperando").length,
    },
    hoyClases, manana: mananaClases, porMarcar: marcar,
    pendientes: pendientesR.map((r) => pendientePago(M, r, ahora)),
    alertas,
    segmentos: SEGMENTOS.map((s) => ({ id: s.id, nombre: s.nombre, total: totales[s.id] })),
  };
}

export { nombreClase };
