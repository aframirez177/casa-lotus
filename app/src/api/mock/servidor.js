// Casa Lotus · demo adapter. Implements the platform contract (shared/CONTRATO.md §4–§6) in the browser,
// on top of the seeded studio in estudio.js and the same rules as the server (shared/reglas.js).
// It is a stand-in for showing the app without a backend; the real rules live in server/.
import {
  ESTADO, OCUPAN, CONSUMEN, ACTIVAS, ESTADO_CLASE, MEDIOS, hoyClave, sumarDias, fechaLegible, horaLegible, momentoMs,
  inicioClase, ocupados as ocupadosEn, reservable as reservableRegla, politicaCancelar, politicaReagendar, saldo as saldoRegla,
  elegirCompra, estadoCompra, siguienteId, whatsappLegible, normalizaWhatsApp, enlaceWhatsApp, primerNombre, diasParaCumple,
  fechasDeClase, festivosEntre, claseId, diaDeSemana, dinero, CONSENTIMIENTOS, fichaCompleta as fichaCompletaRegla, horaTexto,
} from "../../lib/reglas.js";
import { sembrar } from "./estudio.js";

const CLAVE = "cl_demo_estudio_v1";
const iso = (ms) => new Date(ms).toISOString();
const origen = () => (typeof location !== "undefined" ? location.origin : "https://casalotus.studio");
const sinAcentos = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

class Falla extends Error {
  constructor(status, error, mensaje, extra = {}) { super(mensaje); this.status = status; this.cuerpo = { ok: false, error, mensaje, ...extra }; }
}
const falla = (status, error, mensaje, extra) => { throw new Falla(status, error, mensaje, extra); };
const conflicto = (motivo, mensaje) => falla(409, "conflicto", mensaje, { motivo });

export function crearServidorDemo({ ahora = () => Date.now(), persistir = true, latencia = [220, 520], db: dbInicial } = {}) {
  let db = dbInicial || cargar() || sembrar(ahora());
  const oyentes = new Set();
  let codigoPendiente = null;
  let timbreDemo = false;

  function cargar() {
    if (!persistir || typeof sessionStorage === "undefined") return null;
    try {
      const d = JSON.parse(sessionStorage.getItem(CLAVE) || "null");
      return d && d.version === 1 && d.dia === hoyClave(ahora()) ? d : null;
    } catch { return null; }
  }
  function guardar() {
    if (!persistir || typeof sessionStorage === "undefined") return;
    try { sessionStorage.setItem(CLAVE, JSON.stringify(db)); } catch { /* full: the demo keeps working in memory */ }
  }

  /* ── settings ─────────────────────────────────────────── */
  const ajuste = (nombre, defecto) => {
    const a = db.ajustes.find((x) => x.ajuste === nombre);
    return a && a.valor !== "" ? a.valor : defecto;
  };
  const num = (nombre, defecto) => Number(ajuste(nombre, defecto)) || Number(defecto);
  const politicas = () => ({
    horasReservar: num("Horas mínimas para reservar", 3), horasCancelar: num("Horas mínimas para cancelar", 6),
    horasPagar: num("Horas para pagar una reserva web", 12), cambiosPrueba: num("Cambios permitidos clase de prueba", 1),
  });
  const waReservas = () => ajuste("WhatsApp de reservas", "573128720888");
  const llave = () => ajuste("Llave de pago", "319 328 8469");

  /* ── lookups ──────────────────────────────────────────── */
  const hoy = () => hoyClave(ahora());
  const clase = (id) => db.clases.find((c) => c.id === id);
  const clienta = (id) => db.clientas.find((c) => c.id === id);
  const reserva = (id) => db.reservas.find((r) => r.id === id);
  const plan = (nombre) => db.planes.find((p) => p.nombre === nombre);
  const usuario = (id) => db.equipo.find((u) => u.id === id);
  const ocupados = (idClase) => ocupadosEn(db.reservas, idClase);
  const esPruebaCompra = (idCompra) => { const c = db.compras.find((x) => x.id === idCompra); return c && plan(c.plan)?.tipo === "Prueba"; };

  /* ── shapes (contract §5) ─────────────────────────────── */
  function claseVista(c) {
    const ocu = ocupados(c.id);
    const r = reservableRegla(c, ocu, ahora(), politicas().horasReservar);
    return {
      id: c.id, fecha: c.fecha, dia: c.dia, hora: c.hora, fechaTexto: fechaLegible(c.fecha), horaTexto: horaLegible(c.hora),
      clase: c.clase || "", tipo: c.tipo || "Regular", cupos: Number(c.cupos), ocupados: ocu, libres: Math.max(0, c.cupos - ocu),
      reservable: r.ok, ...(r.ok ? {} : { motivo: r.motivo }), estado: c.estado,
    };
  }
  function contactoTexto(cl) {
    const ce = cl.contactoEmergencia || {};
    return ce.nombre ? `${ce.nombre}${ce.whatsapp ? " · " + whatsappLegible(ce.whatsapp) : ""}` : "";
  }
  function primeraVez(idClienta, c) {
    // the demo only seeds 60 days of history: someone who joined long before is not new
    if ((clienta(idClienta)?.desde || "") < sumarDias(c.fecha, -30)) return false;
    return !db.reservas.some((r) => r.clienta === idClienta && [ESTADO.ASISTIO, ESTADO.CONFIRMADA, ESTADO.NO_VINO].includes(r.estado) && r.clase < c.id);
  }
  function asistente(r) {
    const cl = clienta(r.clienta) || {};
    const d = diasParaCumple(cl.nacimiento, hoy());
    return {
      reserva: r.id, clienta: r.clienta, nombre: cl.nombre, whatsapp: cl.whatsapp, whatsappTexto: whatsappLegible(cl.whatsapp), estado: r.estado,
      primeraVez: primeraVez(r.clienta, clase(r.clase)), experiencia: cl.experiencia || "", salud: cl.salud || "",
      cumple: d !== null && (d <= 3 || d >= 362), autorizaImagen: typeof cl.consentimientos?.imagen?.acepta === "boolean" ? cl.consentimientos.imagen.acepta : null,
      contactoEmergencia: contactoTexto(cl), origen: r.origen || "",
    };
  }
  function esperaItem(e) {
    const cl = clienta(e.clienta) || {};
    return { id: e.id, clienta: e.clienta, nombre: cl.nombre, whatsapp: cl.whatsapp, creada: e.creada, estado: e.estado };
  }
  function claseEquipo(c) {
    const v = claseVista(c);
    const t = ahora(), ini = inicioClase(c);
    const gente = db.reservas.filter((r) => r.clase === c.id).map(asistente)
      .sort((a, b) => (OCUPAN.includes(b.estado) - OCUPAN.includes(a.estado)) || String(a.nombre).localeCompare(b.nombre));
    return {
      ...v, profe: c.profe || "", notas: c.notas || "", esHoy: c.fecha === hoy(), pasada: ini < t,
      pocaGente: c.estado !== ESTADO_CLASE.CANCELADA && ini > t && v.ocupados < num("Mínimo de personas", 2),
      reemplazoPedido: c.reemplazoPedido || null, asistenciaEditable: t >= momentoMs(c.fecha, "00:00") && t - ini < 48 * 3600000,
      gente, espera: db.espera.filter((e) => e.clase === c.id && ["Esperando", "Avisada"].includes(e.estado)).map(esperaItem),
    };
  }
  function cambiosHechos(r) {
    let n = 0, x = r;
    while (x && x.reagendadaDe) { n++; x = reserva(x.reagendadaDe); }
    return n;
  }
  function pagoDe(r, nombrePlan) {
    const cl = clienta(r.clienta);
    const c = clase(r.clase);
    const p = plan(nombrePlan) || plan("Clase de prueba");
    const texto = `Hola Casa Lotus, soy ${cl.nombre}. Te envío el comprobante de ${p.nombre === "Clase de prueba" ? "mi clase de prueba" : "mi plan " + p.nombre} para el ${fechaLegible(c.fecha)} a las ${horaLegible(c.hora)} (código ${r.id}).`;
    return { monto: p.precio, plan: p.nombre, llave: llave(), medios: ["Nequi", "DaviPlata", "Bre-B"], whatsapp: waReservas(), venceApartado: r.venceApartado, waTexto: texto, waEnlace: enlaceWhatsApp(waReservas(), texto) };
  }
  function reservaClienta(r) {
    const c = clase(r.clase), pol = politicas(), t = ahora();
    const can = politicaCancelar(r, c, t, pol.horasCancelar);
    const prueba = r.compra ? esPruebaCompra(r.compra) : r.planPedido === "Clase de prueba";
    const reag = politicaReagendar(r, c, t, pol.horasCancelar, cambiosHechos(r), prueba ? pol.cambiosPrueba : Infinity);
    const compra = db.compras.find((x) => x.id === r.compra);
    return {
      id: r.id, estado: r.estado, clase: claseVista(c), compra: r.compra || undefined, plan: compra?.plan || r.planPedido || undefined,
      puedeCancelar: can.ok, cancelarSinCosto: Boolean(can.ok && (can.devuelveClase || r.estado === ESTADO.PENDIENTE)), limiteCancelar: iso(can.limiteMs),
      puedeReagendar: reag.ok, limiteReagendar: iso(reag.limiteMs), reagendadaDe: r.reagendadaDe || undefined,
      pago: r.estado === ESTADO.PENDIENTE ? pagoDe(r, r.planPedido || "Clase de prueba") : undefined,
    };
  }
  function saldoDe(idClienta) {
    const s = saldoRegla(db.compras, db.reservas, idClienta, hoy());
    return { clases: s.clases, vence: s.vence, venceTexto: s.vence ? fechaLegible(s.vence) : "" };
  }
  function compraVista(c) {
    const e = estadoCompra(c, db.reservas, hoy());
    return { id: c.id, fecha: c.fecha, clienta: c.clienta, nombre: clienta(c.clienta)?.nombre || "", plan: c.plan, clases: Number(c.clases), valor: Number(c.valor), medio: c.medio, inicio: c.inicio, vence: c.vence, ...e };
  }
  function perfilDe(cl) {
    return {
      nombre: cl.nombre, whatsapp: cl.whatsapp, correo: cl.correo || "", nacimiento: cl.nacimiento || "", barrio: cl.barrio || "",
      intereses: cl.intereses || [], salud: cl.salud || "", eps: cl.eps || "",
      contactoEmergencia: { nombre: cl.contactoEmergencia?.nombre || "", whatsapp: cl.contactoEmergencia?.whatsapp || "" },
      experiencia: cl.experiencia || "", llego: cl.llego || "",
    };
  }
  const fichaCompleta = (cl) => fichaCompletaRegla(perfilDe(cl), cl.consentimientos || {});

  /* ── CRM: segments and stage ──────────────────────────── */
  function segmentosDe(cl) {
    const h = hoy(), s = saldoDe(cl.id);
    const suyas = db.reservas.filter((r) => r.clienta === cl.id);
    const compras = db.compras.filter((c) => c.clienta === cl.id);
    const agendadas = suyas.some((r) => ACTIVAS.includes(r.estado) && clase(r.clase).fecha >= h);
    const asistio = suyas.filter((r) => r.estado === ESTADO.ASISTIO);
    const ultima = asistio.map((r) => clase(r.clase).fecha).sort().pop() || "";
    const aviso = num("Aviso de saldo bajo (clases)", 2), dias = num("Días para avisar vencimiento", 7);
    const pruebas = compras.filter((c) => plan(c.plan)?.tipo === "Prueba");
    const otras = compras.filter((c) => !["Prueba", "Ajuste"].includes(plan(c.plan)?.tipo));
    const segs = [];
    if (agendadas) segs.push("agendadas");
    if (s.clases > 0) segs.push("con-clases");
    if (s.clases > 0 && s.clases <= aviso) segs.push("poquitas");
    if (s.clases > 0 && s.vence && s.vence <= sumarDias(h, dias)) segs.push("vence-pronto");
    if (s.clases === 0 && otras.some((c) => c.fecha >= sumarDias(h, -45))) segs.push("sin-clases");
    if (suyas.some((r) => r.estado === ESTADO.PENDIENTE)) segs.push("pendiente-pago");
    if (pruebas.length && asistio.some((r) => esPruebaCompra(r.compra)) && !otras.some((c) => c.fecha >= pruebas[0].fecha)) segs.push("prueba");
    if (cl.desde >= sumarDias(h, -14)) segs.push("nuevas");
    if (asistio.length && ultima < sumarDias(h, -30) && !agendadas) segs.push("inactivas");
    const dc = diasParaCumple(cl.nacimiento, h);
    if (dc !== null && dc <= 7) segs.push("cumple");
    const cons = cl.consentimientos || {};
    if (!cl.salud || !cl.contactoEmergencia?.nombre || !cons.descargo?.acepta) segs.push("ficha-incompleta");
    if (!compras.length && !asistio.length) segs.push("leads");
    let etapa = "lead";
    if (segs.includes("inactivas")) etapa = "inactiva";
    else if (["poquitas", "vence-pronto", "sin-clases"].some((x) => segs.includes(x))) etapa = "en-riesgo";
    else if (otras.length) etapa = "activa";
    else if (pruebas.length) etapa = "prueba";
    return { segs, etapa, ultima, visitas30: asistio.filter((r) => clase(r.clase).fecha >= sumarDias(h, -30)).length };
  }
  function clientaFila(cl) {
    const { segs, etapa, ultima, visitas30 } = segmentosDe(cl);
    const prox = db.reservas.filter((r) => r.clienta === cl.id && ACTIVAS.includes(r.estado) && inicioClase(clase(r.clase)) >= ahora())
      .map((r) => clase(r.clase)).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    return {
      id: cl.id, nombre: cl.nombre, whatsapp: cl.whatsapp, whatsappTexto: whatsappLegible(cl.whatsapp), correo: cl.correo || "", desde: cl.desde,
      llego: cl.llego || "", etapa, segmentos: segs, saldo: saldoDe(cl.id), proxima: prox ? claseVista(prox) : null, ultimaVisita: ultima,
      visitas30, etiquetas: cl.etiquetas || [], fichaCompleta: fichaCompleta(cl),
    };
  }
  function lineaDe(cl) {
    const ev = [];
    for (const r of db.reservas.filter((x) => x.clienta === cl.id)) {
      const c = clase(r.clase);
      const cuando = `${fechaLegible(c.fecha)}, ${horaLegible(c.hora)}`;
      ev.push({ id: "L-" + r.id, ts: r.creada, tipo: /^Web/.test(r.origen) ? "reserva-web" : "reserva", titulo: `Reservó ${c.clase || "una clase"}`, detalle: `${cuando} · ${r.estado}`, clienta: cl.id, clase: c.id, actor: { tipo: "clienta", nombre: cl.nombre } });
      if ([ESTADO.ASISTIO, ESTADO.NO_VINO].includes(r.estado)) ev.push({ id: "LA-" + r.id, ts: iso(inicioClase(c) + 3600000), tipo: "asistencia", titulo: r.estado === ESTADO.ASISTIO ? "Vino a clase" : "No vino a clase", detalle: cuando, clienta: cl.id, clase: c.id, actor: { tipo: "profe", nombre: c.profe } });
    }
    for (const c of db.compras.filter((x) => x.clienta === cl.id)) ev.push({ id: "LP-" + c.id, ts: iso(momentoMs(c.fecha, "10:00")), tipo: "pago", titulo: `Pagó ${c.plan}`, detalle: `${dinero(c.valor)} · ${c.medio}`, clienta: cl.id, actor: { tipo: "admin", nombre: "Ana" } });
    const conv = db.conversaciones.find((x) => x.clienta?.id === cl.id);
    if (conv) for (const m of conv.mensajes.slice(-3)) ev.push({ id: "LM-" + m.ts, ts: m.ts, tipo: "mensaje", titulo: m.direccion === "entrante" ? "Escribió por WhatsApp" : "Le escribiste por WhatsApp", detalle: m.texto || "(imagen)", clienta: cl.id, actor: { tipo: m.direccion === "entrante" ? "clienta" : "admin", nombre: m.direccion === "entrante" ? cl.nombre : "Ana" } });
    return ev.filter((e) => Date.parse(e.ts) <= ahora() + 60000).sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 40);
  }
  /** Admin only: where a web booking came from (never the click id itself). */
  function atribucionDe(r) {
    if (!/^Web · /.test(r.origen)) return null;
    let a = {};
    try { a = JSON.parse(r.atribucion || "{}"); } catch { a = {}; }
    const clic = ["gclid", "gbraid", "wbraid", "fbclid"].find((k) => a.clickIds?.[k]) || null;
    return { ref: a.ref || r.origen.slice(6), utm: a.utm || null, clic };
  }
  function clientaDetalle(cl) {
    const conv = db.conversaciones.find((x) => x.clienta?.id === cl.id);
    return {
      ...clientaFila(cl), perfil: perfilDe(cl), consentimientos: cl.consentimientos || {}, notas: cl.notas || "",
      compras: db.compras.filter((c) => c.clienta === cl.id).map(compraVista).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
      reservas: db.reservas.filter((r) => r.clienta === cl.id).map((r) => ({ ...reservaClienta(r), atribucion: atribucionDe(r) })).sort((a, b) => (a.clase.id < b.clase.id ? 1 : -1)),
      espera: db.espera.filter((e) => e.clienta === cl.id && e.estado === "Esperando").map(esperaItem),
      conversacion: conv ? { id: conv.id, noLeidos: conv.noLeidos, ultimoMensaje: ultimoMensaje(conv) } : undefined,
      linea: lineaDe(cl),
    };
  }

  /* ── events, audit, live stream ───────────────────────── */
  let actorActual = { tipo: "sistema", id: "", nombre: "Casa Lotus" };
  function emitir(tipo, titulo, detalle, extra = {}) {
    db.contadores.EV = (db.contadores.EV || 0) + 1;
    const e = { id: "EV-" + Date.now().toString(36) + "-" + db.contadores.EV, ts: iso(ahora()), tipo, titulo, detalle, actor: { ...actorActual }, ...extra };
    db.eventos.unshift(e);
    db.eventos = db.eventos.slice(0, 200);
    for (const fn of oyentes) setTimeout(() => fn(e), 0);
    return e;
  }
  function auditar(accion, objeto, detalle) {
    db.registro.unshift({ ts: iso(ahora()), actor: { ...actorActual }, accion, objeto, detalle });
  }

  /* ── sessions ─────────────────────────────────────────── */
  function sesionActual() {
    try { return JSON.parse(sessionStorage.getItem("cl_demo_sesion") || "null"); } catch { return db._sesion || null; }
  }
  function abrirSesion(s) {
    db._sesion = s;
    try { sessionStorage.setItem("cl_demo_sesion", JSON.stringify(s)); } catch { /* memory only */ }
    const sid = "S-" + Math.random().toString(36).slice(2, 8);
    db.sesiones = [
      { id: sid, actual: true, creada: iso(ahora()), ultimoUso: iso(ahora()), dispositivo: "Este navegador" },
      { id: "S-otro1", actual: false, creada: iso(ahora() - 9 * 86400000), ultimoUso: iso(ahora() - 2 * 86400000), dispositivo: "iPhone · Safari" },
      { id: "S-otro2", actual: false, creada: iso(ahora() - 30 * 86400000), ultimoUso: iso(ahora() - 12 * 86400000), dispositivo: "Mac · Chrome" },
      ...Array.from({ length: 11 }, (_, i) => ({ id: "S-viejo" + i, actual: false, creada: iso(ahora() - (40 + i) * 86400000), ultimoUso: iso(ahora() - (20 + i) * 86400000), dispositivo: i % 2 ? "Android · Chrome" : "iPhone · Safari" })),
    ];
  }
  function cerrarSesion() {
    db._sesion = null;
    try { sessionStorage.removeItem("cl_demo_sesion"); } catch { /* ignore */ }
  }
  function yoUsuario(s) {
    if (!s) return null;
    if (s.rol === "clienta") {
      const cl = clienta(s.id);
      return cl ? { id: cl.id, rol: "clienta", nombre: cl.nombre, whatsapp: cl.whatsapp, correo: cl.correo, clienta: cl.id, limitada: Boolean(s.limitada) } : null;
    }
    const u = usuario(s.id);
    return u && u.activa ? { id: u.id, rol: u.rol, nombre: u.nombre, correo: u.correo, whatsapp: u.whatsapp, metodo: s.metodo || "password" } : null;
  }
  function exigir(ctx, ...roles) {
    const u = yoUsuario(sesionActual());
    if (!u) falla(401, "no-autenticado", "Tu sesión se cerró. Entra de nuevo.");
    if (!roles.includes(u.rol)) falla(403, "sin-permiso", "No tienes permiso para esto.");
    ctx.u = u;
    actorActual = { tipo: u.rol, id: u.id, nombre: u.nombre };
    return u;
  }

  /* ── writes used by several routes ────────────────────── */
  function crearReserva({ idClienta, idClase, origen, plan: planPedido, atribucion = "", forzarPendiente = false, admin = false }) {
    const c = clase(idClase);
    if (!c) falla(404, "no-existe", "Esa clase no existe.");
    const ocu = ocupados(c.id);
    const r0 = reservableRegla(c, ocu, ahora(), admin ? 0 : politicas().horasReservar);
    if (!r0.ok && !(admin && r0.motivo === "tarde" && inicioClase(c) > ahora() - 3 * 3600000)) conflicto(r0.motivo, r0.motivo === "llena" ? "La clase se llenó hace un momento." : r0.motivo === "tarde" ? `Se reserva hasta ${politicas().horasReservar} horas antes.` : "Esta clase se canceló.");
    if (db.reservas.some((r) => r.clienta === idClienta && r.clase === c.id && ACTIVAS.includes(r.estado))) conflicto("ya-reservada", "Ya tiene esta clase reservada.");
    if (!admin && db.reservas.filter((r) => r.clienta === idClienta && r.estado === ESTADO.PENDIENTE).length >= 2) conflicto("muchas-pendientes", "Tienes reservas esperando pago. Paga una antes de apartar otra.");
    const compra = forzarPendiente ? null : elegirCompra(db.compras, db.reservas, idClienta, c.fecha);
    const pol = politicas();
    const r = {
      id: siguienteId("R", db.reservas.map((x) => x.id)), creada: iso(ahora()), clase: c.id, clienta: idClienta,
      estado: compra ? ESTADO.CONFIRMADA : ESTADO.PENDIENTE, compra: compra ? compra.id : "", origen,
      venceApartado: compra ? "" : iso(Math.min(ahora() + pol.horasPagar * 3600000, inicioClase(c))), notas: "", reagendadaDe: "", atribucion,
      planPedido: compra ? "" : planPedido || (db.compras.some((x) => x.clienta === idClienta) ? ultimoPlan(idClienta) : "Clase de prueba"),
    };
    db.reservas.push(r);
    // she was waiting for this class: she took the swing
    for (const e of db.espera) if (e.clase === c.id && e.clienta === idClienta && e.estado !== "Ya no") e.estado = "Tomó el cupo";
    return r;
  }
  const ultimoPlan = (idClienta) => db.compras.filter((c) => c.clienta === idClienta && plan(c.plan)?.tipo !== "Ajuste").sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0]?.plan || "Clase de prueba";
  function cancelarReserva(r, { sinCosto = false } = {}) {
    const c = clase(r.clase);
    const pol = politicaCancelar(r, c, ahora(), politicas().horasCancelar);
    if (!pol.ok) conflicto(pol.motivo, pol.motivo === "empezo" ? "La clase ya empezó." : "Esta reserva ya cambió de estado.");
    const devuelve = pol.devuelveClase || sinCosto;
    r.estado = r.estado === ESTADO.PENDIENTE ? ESTADO.CANCELADA : devuelve ? ESTADO.CANCELADA : ESTADO.CANCELADA_TARDE;
    if (r.estado === ESTADO.CANCELADA) r.venceApartado = "";
    const enEspera = db.espera.filter((e) => e.clase === c.id && e.estado === "Esperando");
    if (enEspera.length) emitir("espera", "Se liberó un columpio", `${fechaLegible(c.fecha)}, ${horaLegible(c.hora)} · ${enEspera.length} en espera`, { clase: c.id });
    return { devolvioClase: devuelve && r.compra !== "" };
  }
  function clienteSegunWhatsApp(wa) { return db.clientas.find((c) => c.whatsapp === wa); }
  function nuevaClienta(perfil, extra = {}) {
    const id = siguienteId("C", db.clientas.map((c) => c.id));
    const cl = {
      id, nombre: String(perfil.nombre || "").trim(), whatsapp: normalizaWhatsApp(perfil.whatsapp), correo: perfil.correo || "", desde: hoy(), llego: perfil.llego || "",
      nacimiento: perfil.nacimiento || "", barrio: perfil.barrio || "", intereses: (perfil.intereses || []).slice(0, 2), salud: perfil.salud || "", eps: perfil.eps || "",
      contactoEmergencia: { nombre: perfil.contactoEmergencia?.nombre || "", whatsapp: normalizaWhatsApp(perfil.contactoEmergencia?.whatsapp) || "" },
      experiencia: perfil.experiencia || "", consentimientos: {}, notas: extra.notas || "", etiquetas: [],
    };
    db.clientas.push(cl);
    return cl;
  }
  function aplicarPerfil(cl, p, { soloVacios = false } = {}) {
    const poner = (k, v) => { if (v === undefined) return; if (soloVacios && cl[k] && (typeof cl[k] !== "object" || Object.values(cl[k]).some(Boolean))) return; cl[k] = v; };
    poner("nombre", p.nombre?.trim());
    if (p.whatsapp !== undefined) { const w = normalizaWhatsApp(p.whatsapp); if (!w) falla(422, "validacion", "Revisa el WhatsApp.", { campos: { whatsapp: "Escribe un celular colombiano de 10 dígitos." } }); poner("whatsapp", w); }
    poner("correo", p.correo); poner("nacimiento", p.nacimiento); poner("barrio", p.barrio);
    if (p.intereses) poner("intereses", p.intereses.slice(0, 2));
    poner("salud", p.salud); poner("eps", p.eps); poner("experiencia", p.experiencia); poner("llego", p.llego);
    if (p.contactoEmergencia) poner("contactoEmergencia", { nombre: p.contactoEmergencia.nombre || "", whatsapp: normalizaWhatsApp(p.contactoEmergencia.whatsapp) || "" });
  }
  function firmar(cl, cons = {}) {
    cl.consentimientos = cl.consentimientos || {};
    for (const k of ["datos", "sensibles", "descargo", "imagen", "novedades"]) {
      if (!cons[k] || typeof cons[k].acepta !== "boolean") continue;
      cl.consentimientos[k] = { acepta: cons[k].acepta, fecha: iso(ahora()), ...(CONSENTIMIENTOS[k].version && k !== "imagen" ? { version: CONSENTIMIENTOS[k].version } : {}) };
    }
  }
  function validarPerfilPublico(p) {
    const campos = {};
    if (!p?.nombre || p.nombre.trim().length < 2) campos.nombre = "Escribe tu nombre.";
    if (!normalizaWhatsApp(p?.whatsapp)) campos.whatsapp = "Escribe un celular colombiano de 10 dígitos.";
    if (p?.correo && !/^\S+@\S+\.\S+$/.test(p.correo)) campos.correo = "Revisa el correo.";
    if (Object.keys(campos).length) falla(422, "validacion", "Revisa los datos marcados.", { campos });
  }

  /* ── tablero ──────────────────────────────────────────── */
  function lunes(f) { const d = new Date(Date.UTC(...f.split("-").map((x, i) => (i === 1 ? x - 1 : +x)))).getUTCDay(); return sumarDias(f, d === 0 ? -6 : 1 - d); }
  function alertas() {
    const t = ahora(), h = hoy(), lista = [];
    const wa = (cl, texto) => ({ tipo: "whatsapp", texto, enlace: enlaceWhatsApp(cl.whatsapp, texto) });
    for (const r of db.reservas.filter((x) => x.estado === ESTADO.PENDIENTE && x.venceApartado)) {
      const ms = Date.parse(r.venceApartado) - t, cl = clienta(r.clienta), c = clase(r.clase);
      if (ms < 2 * 3600000) lista.push({ id: "A-pago-" + r.id, tipo: "pago-por-vencer", prioridad: 1, titulo: `El apartado de ${primerNombre(cl.nombre)} vence pronto`, detalle: `${fechaLegible(c.fecha)}, ${horaLegible(c.hora)} · si no paga, el columpio se libera solo`, clienta: { id: cl.id, nombre: cl.nombre }, clase: claseVista(c), accion: wa(cl, `Hola ${primerNombre(cl.nombre)}, te escribo de Casa Lotus. Tu columpio del ${fechaLegible(c.fecha)} sigue apartado: ¿me envías el comprobante para confirmarlo?`) });
    }
    for (const c of db.clases.filter((k) => k.estado !== "Cancelada" && inicioClase(k) < t && k.fecha >= sumarDias(h, -7))) {
      const n = db.reservas.filter((r) => r.clase === c.id && r.estado === ESTADO.CONFIRMADA).length;
      if (n) lista.push({ id: "A-marcar-" + c.id, tipo: "sin-marcar", prioridad: 1, titulo: `Falta marcar la clase del ${fechaLegible(c.fecha)}`, detalle: `${horaLegible(c.hora)} · ${n === 1 ? "1 persona" : n + " personas"} sin marcar`, clase: claseVista(c), accion: { tipo: "abrir", ruta: "/app/admin/agenda/" + encodeURIComponent(c.id) } });
    }
    for (const c of db.clases.filter((k) => k.estado !== "Cancelada" && inicioClase(k) > t)) {
      const libres = c.cupos - ocupados(c.id), esp = db.espera.filter((e) => e.clase === c.id && e.estado === "Esperando");
      if (libres > 0 && esp.length) lista.push({ id: "A-cupo-" + c.id, tipo: "cupo-liberado", prioridad: 1, titulo: "Se liberó un columpio", detalle: `${fechaLegible(c.fecha)}, ${horaLegible(c.hora)} · ${esp.length === 1 ? primerNombre(clienta(esp[0].clienta).nombre) + " está" : esp.length + " personas están"} en espera`, clase: claseVista(c), accion: { tipo: "abrir", ruta: "/app/admin/agenda/" + encodeURIComponent(c.id) } });
      if (inicioClase(c) - t < 72 * 3600000 && ocupados(c.id) < num("Mínimo de personas", 2)) lista.push({ id: "A-poca-" + c.id, tipo: "poca-gente", prioridad: 2, titulo: "Clase con poca gente", detalle: `${fechaLegible(c.fecha)}, ${horaLegible(c.hora)} · ${ocupados(c.id) === 1 ? "1 persona" : ocupados(c.id) + " personas"}`, clase: claseVista(c), accion: { tipo: "abrir", ruta: "/app/admin/agenda/" + encodeURIComponent(c.id) } });
    }
    for (const c of db.clases.filter((k) => k.estado !== "Cancelada" && inicioClase(k) > t && k.fecha <= sumarDias(h, 14))) {
      const ruta = "/app/admin/agenda/" + encodeURIComponent(c.id);
      if (c.reemplazoPedido) lista.push({ id: "A-reemplazo-" + c.id, tipo: "necesita-reemplazo", prioridad: 1, titulo: `${primerNombre(c.profe) || "Tu profe"} no puede dictar`, detalle: `${fechaLegible(c.fecha)}, ${horaLegible(c.hora)}${c.reemplazoPedido.motivo ? " · " + c.reemplazoPedido.motivo : ""}`, clase: claseVista(c), accion: { tipo: "abrir", ruta: ruta + "?profe=1" } });
      else if (!c.profe) lista.push({ id: "A-sinprofe-" + c.id, tipo: "sin-profe", prioridad: 2, titulo: "Clase sin profe", detalle: `${fechaLegible(c.fecha)}, ${horaLegible(c.hora)} · ${c.clase || "clase"}`, clase: claseVista(c), accion: { tipo: "abrir", ruta } });
    }
    for (const r of db.reservas.filter((x) => x.estado === ESTADO.ASISTIO && !x.compra && clase(x.clase).fecha >= sumarDias(h, -14))) {
      const cl = clienta(r.clienta), c = clase(r.clase);
      const texto = `Hola ${primerNombre(cl.nombre)}, ¡qué bueno verte en clase el ${fechaLegible(c.fecha)}! Te escribo para el pago de esa clase. ¿Me envías el comprobante a la llave ${llave()}?`;
      lista.push({ id: "A-sinplan-" + r.id, tipo: "vino-sin-plan", prioridad: 1, titulo: `${primerNombre(cl.nombre)} vino sin plan`, detalle: `${fechaLegible(c.fecha)} · cóbrale la clase o registra su pago`, clienta: { id: cl.id, nombre: cl.nombre }, clase: claseVista(c), accion: wa(cl, texto) });
    }
    for (const cl of db.clientas) {
      const { segs } = segmentosDe(cl), s = saldoDe(cl.id), n = primerNombre(cl.nombre);
      if (segs.includes("poquitas")) lista.push({ id: "A-saldo-" + cl.id, tipo: "saldo-bajo", prioridad: 2, titulo: `A ${n} le ${s.clases === 1 ? "queda 1 clase" : "quedan " + s.clases + " clases"}`, detalle: "Buen momento para ofrecerle renovar", clienta: { id: cl.id, nombre: cl.nombre }, accion: wa(cl, `Hola ${n}, te escribo de Casa Lotus. Te ${s.clases === 1 ? "queda 1 clase" : "quedan " + s.clases + " clases"} en tu plan. ¿Quieres que te aparte el siguiente?`) });
      else if (segs.includes("vence-pronto")) lista.push({ id: "A-vence-" + cl.id, tipo: "vence-pronto", prioridad: 2, titulo: `El plan de ${n} vence el ${s.venceTexto}`, detalle: `Le ${s.clases === 1 ? "queda 1 clase" : "quedan " + s.clases + " clases"} por usar`, clienta: { id: cl.id, nombre: cl.nombre }, accion: wa(cl, `Hola ${n}, tu plan en Casa Lotus vence el ${s.venceTexto} y aún tienes clases. ¡Agéndalas para no perderlas!`) });
      if (segs.includes("sin-clases")) lista.push({ id: "A-sin-" + cl.id, tipo: "sin-clases", prioridad: 2, titulo: `${n} se quedó sin clases`, detalle: "Ofrécele renovar su plan", clienta: { id: cl.id, nombre: cl.nombre }, accion: wa(cl, `Hola ${n}, se acabaron las clases de tu plan en Casa Lotus. ¿Te lo renuevo?`) });
      if (segs.includes("prueba")) lista.push({ id: "A-prueba-" + cl.id, tipo: "prueba-sin-plan", prioridad: 2, titulo: `${n} vino a su clase de prueba`, detalle: "Todavía no ha tomado un plan", clienta: { id: cl.id, nombre: cl.nombre }, accion: wa(cl, `Hola ${n}, ¿cómo te sentiste en tu clase de prueba en Casa Lotus? Si quieres seguir, te cuento los planes.`) });
      const dc = diasParaCumple(cl.nacimiento, h);
      if (dc !== null && dc <= 3) lista.push({ id: "A-cumple-" + cl.id, tipo: "cumple", prioridad: 3, titulo: dc === 0 ? `Hoy cumple años ${n}` : `${n} cumple años en ${dc === 1 ? "1 día" : dc + " días"}`, detalle: "Un mensaje cálido siempre suma", clienta: { id: cl.id, nombre: cl.nombre }, accion: wa(cl, `¡Feliz cumpleaños, ${n}! Todo el equipo de Casa Lotus te abraza 💚`) });
      if (segs.includes("ficha-incompleta") && segs.includes("agendadas")) lista.push({ id: "A-ficha-" + cl.id, tipo: "ficha-incompleta", prioridad: 3, titulo: `A ${n} le falta completar su ficha`, detalle: "Viene pronto: su profe necesita su contacto de emergencia", clienta: { id: cl.id, nombre: cl.nombre }, accion: { tipo: "abrir", ruta: "/app/admin/clientas/" + cl.id } });
    }
    return lista.sort((a, b) => a.prioridad - b.prioridad);
  }
  function tablero() {
    const t = ahora(), h = hoy(), lu = lunes(h), mes = h.slice(0, 7);
    const semana = db.clases.filter((c) => c.estado !== "Cancelada" && c.fecha >= lu && c.fecha <= sumarDias(lu, 6));
    const cupos = semana.reduce((s, c) => s + Number(c.cupos), 0), ocu = semana.reduce((s, c) => s + ocupados(c.id), 0);
    const comprasMes = db.compras.filter((c) => c.fecha.startsWith(mes));
    const clasesMes = db.clases.filter((c) => c.fecha.startsWith(mes) && c.estado !== "Cancelada" && inicioClase(c) < t);
    const pago = Number(ajuste("Pago por clase a profes", "")) || 0;
    const pend = db.reservas.filter((r) => r.estado === ESTADO.PENDIENTE).map((r) => {
      const cl = clienta(r.clienta), c = clase(r.clase);
      const texto = `Hola ${primerNombre(cl.nombre)}, te escribo de Casa Lotus por tu reserva del ${fechaLegible(c.fecha)} a las ${horaLegible(c.hora)}: ¿me envías el comprobante del pago para confirmarla?`;
      return { reserva: r.id, clienta: cl.id, nombre: cl.nombre, whatsapp: cl.whatsapp, clase: claseVista(c), creada: r.creada, venceApartado: r.venceApartado, saldo: saldoDe(cl.id).clases, origen: r.origen, plan: r.planPedido || "", waTexto: texto, waEnlace: enlaceWhatsApp(cl.whatsapp, texto) };
    }).sort((a, b) => (a.venceApartado < b.venceApartado ? -1 : 1));
    const hora = Number(new Date(t - 5 * 3600000).getUTCHours());
    const segs = segmentosLista();
    return {
      hoy: h, hoyTexto: fechaLegible(h), saludo: hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches",
      kpis: {
        semana: { clases: semana.length, cupos, ocupados: ocu, pct: cupos ? Math.round((ocu / cupos) * 100) : 0 },
        mes: { ingresos: comprasMes.reduce((s, c) => s + Number(c.valor), 0), compras: comprasMes.length, clasesDictadas: clasesMes.length, pagoProfes: pago ? pago * clasesMes.length : null, asistentes: db.reservas.filter((r) => r.estado === ESTADO.ASISTIO && r.clase.startsWith(mes)).length },
        clientasActivas: db.clientas.filter((cl) => saldoDe(cl.id).clases > 0).length, pendientesPago: pend.length,
        enEspera: db.espera.filter((e) => e.estado === "Esperando").length,
      },
      hoyClases: db.clases.filter((c) => c.fecha === h).map(claseEquipo),
      manana: db.clases.filter((c) => c.fecha === sumarDias(h, 1)).map(claseEquipo),
      porMarcar: db.clases.filter((c) => c.estado !== "Cancelada" && inicioClase(c) < t && c.fecha >= sumarDias(h, -7) && db.reservas.some((r) => r.clase === c.id && r.estado === ESTADO.CONFIRMADA)).map(claseEquipo),
      pendientes: pend, alertas: alertas(), segmentos: segs.map(({ id, nombre, total }) => ({ id, nombre, total })),
    };
  }
  const SEGMENTOS = [
    ["agendadas", "Agendaron", "Tienen una clase reservada desde hoy"], ["con-clases", "Con clases", "Les quedan clases en su plan"],
    ["poquitas", "Les quedan poquitas", "Una o dos clases por usar"], ["vence-pronto", "Vence pronto", "Su plan vence en menos de una semana"],
    ["sin-clases", "Renovar", "Compraron hace poco y ya no tienen clases"], ["pendiente-pago", "Deben un pago", "Tienen una reserva esperando pago"],
    ["prueba", "Vinieron a prueba", "Hicieron la clase de prueba y no han tomado plan"], ["nuevas", "Nuevas", "Llegaron en las últimas dos semanas"],
    ["inactivas", "Inactivas", "No vienen hace más de 30 días"], ["cumple", "Cumpleaños", "Cumplen años esta semana"],
    ["ficha-incompleta", "Ficha incompleta", "Les falta salud, contacto de emergencia o el descargo"], ["leads", "Interesadas", "Nunca han comprado ni venido"],
  ];
  function segmentosLista() {
    const todos = db.clientas.map((cl) => segmentosDe(cl).segs);
    return SEGMENTOS.map(([id, nombre, descripcion]) => ({ id, nombre, descripcion, total: todos.filter((s) => s.includes(id)).length }));
  }

  /* ── WhatsApp ─────────────────────────────────────────── */
  const ultimoMensaje = (conv) => { const m = conv.mensajes[conv.mensajes.length - 1]; return m ? { texto: m.texto || (m.tipo === "imagen" ? "📷 Imagen" : ""), ts: m.ts, direccion: m.direccion } : null; };
  function conversacionVista(conv) {
    const cl = conv.clienta ? clienta(conv.clienta.id) : null;
    return { id: conv.id, whatsapp: conv.whatsapp, nombre: conv.nombre, clienta: cl ? { id: cl.id, nombre: cl.nombre, etapa: segmentosDe(cl).etapa } : undefined, ultimoMensaje: ultimoMensaje(conv), noLeidos: conv.noLeidos, ventanaHasta: conv.ventanaHasta, estado: conv.estado, etiquetas: conv.etiquetas || [] };
  }
  function mensajeVista(conv, m, i) {
    return { id: conv.id + "-" + i, conversacion: conv.id, direccion: m.direccion, tipo: m.tipo || "texto", texto: m.texto || "", plantilla: m.plantilla, media: m.media, estado: m.estado || (m.direccion === "entrante" ? "recibido" : "enviado"), ts: m.ts, autor: m.autor || { tipo: m.direccion === "entrante" ? "clienta" : "admin", nombre: m.direccion === "entrante" ? conv.nombre : "Ana" } };
  }
  const waModo = () => { try { return sessionStorage.getItem("cl_demo_wa") === "off" ? "desconectado" : "prueba"; } catch { return "prueba"; } };

  /* ── routes ───────────────────────────────────────────── */
  const R = [];
  const ruta = (metodo, patron, fn) => {
    const claves = [];
    const re = new RegExp("^" + patron.replace(/:(\w+)/g, (_, k) => { claves.push(k); return "([^/]+)"; }) + "$");
    R.push({ metodo, re, claves, fn });
  };

  // public
  ruta("GET", "/api/publico/disponibilidad", ({ q }) => {
    const desde = q.desde || hoy(), dias = Math.min(Number(q.dias) || 21, 60), hasta = sumarDias(desde, dias - 1);
    return { actualizado: iso(ahora()), horasParaPagar: politicas().horasPagar, clases: db.clases.filter((c) => c.fecha >= desde && c.fecha <= hasta && c.estado !== "Cancelada" && inicioClase(c) > ahora()).map(claseVista) };
  });
  ruta("GET", "/api/publico/planes", () => db.planes.filter((p) => p.activo && p.tipo !== "Ajuste"));
  ruta("GET", "/api/publico/estudio", () => ({ whatsapp: waReservas(), llavePago: llave(), mediosPago: ["Nequi", "DaviPlata", "Bre-B"], politicas: politicas() }));
  ruta("POST", "/api/publico/reservas", ({ b }) => {
    if (b.website) falla(422, "validacion", "No pudimos procesar la reserva.");
    validarPerfilPublico(b.perfil);
    if (!b.consentimientos?.datos?.acepta || !b.consentimientos?.descargo?.acepta) falla(422, "validacion", "Para reservar necesitamos tu autorización de datos y que aceptes el descargo.", { campos: { consentimientos: "Acepta los acuerdos para seguir." } });
    const wa = normalizaWhatsApp(b.perfil.whatsapp);
    let cl = clienteSegunWhatsApp(wa), limitada = false;
    if (cl) { aplicarPerfil(cl, b.perfil, { soloVacios: true }); limitada = true; } else cl = nuevaClienta(b.perfil);
    firmar(cl, b.consentimientos);
    const at = JSON.stringify({ ref: b.ref, utm: b.utm, clickIds: b.clickIds });
    actorActual = { tipo: "clienta", id: cl.id, nombre: cl.nombre };
    const r = crearReserva({ idClienta: cl.id, idClase: b.clase, origen: "Web · " + (b.ref || "APP"), plan: b.plan || "Clase de prueba", atribucion: at, forzarPendiente: true });
    abrirSesion({ rol: "clienta", id: cl.id, limitada, reservas: limitada ? [r.id] : undefined });
    const c = clase(r.clase);
    emitir("reserva-web", "Nueva reserva web", `${cl.nombre} · ${fechaLegible(c.fecha)}, ${horaLegible(c.hora)}`, { clienta: cl.id, clase: c.id });
    auditar("reserva-web", r.id, `${cl.nombre} · ${c.id}`);
    return { status: 201, cuerpo: { codigo: r.id, estado: r.estado, clase: claseVista(c), pago: pagoDe(r, r.planPedido), sesion: true } };
  });
  ruta("POST", "/api/publico/espera", ({ b }) => {
    validarPerfilPublico({ nombre: b.nombre, whatsapp: b.whatsapp });
    const wa = normalizaWhatsApp(b.whatsapp);
    const cl = clienteSegunWhatsApp(wa) || nuevaClienta({ nombre: b.nombre, whatsapp: wa });
    firmar(cl, b.consentimientos || {});
    const e = { id: "E-" + String(++db.contadores.E).padStart(4, "0"), creada: iso(ahora()), clase: b.clase, clienta: cl.id, estado: "Esperando", notas: "" };
    db.espera.push(e);
    const c = clase(b.clase);
    emitir("espera", "Lista de espera", `${cl.nombre} espera un columpio el ${fechaLegible(c.fecha)}`, { clienta: cl.id, clase: c.id });
    return { status: 201, cuerpo: { id: e.id } };
  });
  ruta("POST", "/api/publico/eventos", () => ({ status: 204 }));

  // auth
  ruta("GET", "/api/auth/yo", () => {
    const u = yoUsuario(sesionActual());
    if (!u) falla(401, "no-autenticado", "No has entrado.");
    return { usuario: u };
  });
  ruta("POST", "/api/auth/entrar", ({ b }) => {
    const u = db.equipo.find((x) => x.correo.toLowerCase() === String(b.correo || "").trim().toLowerCase());
    if (!u || !u.activa || String(b.password || "").length < 4) falla(401, "no-autenticado", "El correo o la contraseña no coinciden.");
    abrirSesion({ rol: u.rol, id: u.id });
    u.ultimoAcceso = iso(ahora());
    return { usuario: yoUsuario({ rol: u.rol, id: u.id }) };
  });
  // Google sign-in for the team. The demo has no Google: its stand-in button sends "demo:<correo>".
  ruta("GET", "/api/auth/config", () => ({ google: { clientId: "demo" } }));
  const correoDeGoogle = (credential) => String(credential || "").replace(/^demo:/, "").trim().toLowerCase();
  ruta("POST", "/api/auth/google", ({ b }) => {
    const u = db.equipo.find((x) => x.activa && x.correo.toLowerCase() === correoDeGoogle(b.credential));
    if (!u) falla(403, "sin-permiso", "Esta cuenta de Google no está en el equipo de Casa Lotus. Pídele a Ana que te invite con ese correo.");
    abrirSesion({ rol: u.rol, id: u.id, metodo: "google" });
    u.ultimoAcceso = iso(ahora());
    return { usuario: yoUsuario({ rol: u.rol, id: u.id, metodo: "google" }) };
  });
  ruta("POST", "/api/auth/invitacion/:token/google", ({ p, b }) => {
    const u = db.invitaciones[p.token] ? usuario(db.invitaciones[p.token]) : usuario("U-3");
    if (correoDeGoogle(b.credential) !== u.correo.toLowerCase()) falla(403, "sin-permiso", `Usa la cuenta de Google de ${u.correo}, el correo de tu invitación.`);
    abrirSesion({ rol: u.rol, id: u.id, metodo: "google" });
    return { usuario: yoUsuario({ rol: u.rol, id: u.id, metodo: "google" }) };
  });
  ruta("POST", "/api/auth/codigo", ({ b }) => {
    const wa = b.whatsapp ? normalizaWhatsApp(b.whatsapp) : "";
    const cl = wa ? clienteSegunWhatsApp(wa) : db.clientas.find((c) => c.correo && c.correo.toLowerCase() === String(b.correo || "").toLowerCase());
    codigoPendiente = cl ? { id: cl.id, codigo: "123456" } : null;
    return { ok: true }; // never reveals whether she exists
  });
  ruta("POST", "/api/auth/verificar", ({ b }) => {
    if (!codigoPendiente || String(b.codigo) !== codigoPendiente.codigo) falla(422, "validacion", "Ese código no coincide. Revisa el mensaje e intenta otra vez.", { campos: { codigo: "Código incorrecto." } });
    abrirSesion({ rol: "clienta", id: codigoPendiente.id });
    const u = yoUsuario({ rol: "clienta", id: codigoPendiente.id });
    codigoPendiente = null;
    return { usuario: u };
  });
  ruta("GET", "/api/auth/enlace/:token", ({ p }) => {
    const cl = clienta(p.token) || db.clientas[0];
    abrirSesion({ rol: "clienta", id: cl.id });
    return { usuario: yoUsuario({ rol: "clienta", id: cl.id }) };
  });
  ruta("POST", "/api/auth/salir", () => { cerrarSesion(); return { status: 204 }; });
  ruta("POST", "/api/auth/password", (ctx) => {
    exigir(ctx, "admin", "profe");
    if (String(ctx.b.nueva || "").length < 10) falla(422, "validacion", "La contraseña nueva necesita al menos 10 caracteres.", { campos: { nueva: "Mínimo 10 caracteres." } });
    return { status: 204 };
  });
  ruta("POST", "/api/auth/recuperar", () => ({ status: 204 }));
  ruta("POST", "/api/auth/restablecer", ({ b }) => {
    if (String(b.nueva || "").length < 10) falla(422, "validacion", "Mínimo 10 caracteres.", { campos: { nueva: "Mínimo 10 caracteres." } });
    abrirSesion({ rol: "admin", id: "U-1" });
    return { usuario: yoUsuario({ rol: "admin", id: "U-1" }) };
  });
  ruta("GET", "/api/auth/invitacion/:token", ({ p }) => {
    const u = db.invitaciones[p.token] ? usuario(db.invitaciones[p.token]) : usuario("U-3");
    if (p.token === "vencida") falla(404, "no-existe", "Esta invitación venció o ya se usó. Pídele a Ana una nueva.");
    return { nombre: u.nombre, correo: u.correo, rol: u.rol };
  });
  ruta("POST", "/api/auth/invitacion/:token", ({ p, b }) => {
    if (String(b.password || "").length < 10) falla(422, "validacion", "Mínimo 10 caracteres.", { campos: { password: "Mínimo 10 caracteres." } });
    const u = db.invitaciones[p.token] ? usuario(db.invitaciones[p.token]) : usuario("U-3");
    abrirSesion({ rol: u.rol, id: u.id });
    return { usuario: yoUsuario({ rol: u.rol, id: u.id }) };
  });
  ruta("GET", "/api/auth/sesiones", (ctx) => {
    exigir(ctx, "admin", "profe", "clienta");
    const orden = [...db.sesiones].sort((a, b) => (b.actual - a.actual) || (a.ultimoUso < b.ultimoUso ? 1 : -1));
    return { sesiones: orden.slice(0, 10), total: db.sesiones.length };
  });
  ruta("DELETE", "/api/auth/sesiones/:id", (ctx) => {
    exigir(ctx, "admin", "profe", "clienta");
    db.sesiones = ctx.p.id === "otras" ? db.sesiones.filter((s) => s.actual) : db.sesiones.filter((s) => s.id !== ctx.p.id);
    return { status: 204 };
  });
  ruta("PATCH", "/api/auth/cuenta", (ctx) => {
    const u = exigir(ctx, "admin", "profe");
    const x = usuario(u.id);
    for (const k of ["nombre", "whatsapp", "bio", "foto"]) if (ctx.b[k] !== undefined) x[k] = k === "whatsapp" ? normalizaWhatsApp(ctx.b[k]) || x[k] : ctx.b[k];
    return { usuario: yoUsuario({ rol: x.rol, id: x.id }) };
  });

  // clienta
  function yoClienta(ctx) {
    const u = exigir(ctx, "clienta");
    const s = sesionActual();
    return { cl: clienta(u.clienta), limitada: Boolean(s?.limitada), propias: s?.reservas || [] };
  }
  ruta("GET", "/api/yo", (ctx) => {
    const { cl, limitada, propias } = yoClienta(ctx);
    const suyas = db.reservas.filter((r) => r.clienta === cl.id && (!limitada || propias.includes(r.id)));
    const t = ahora();
    const proximas = suyas.filter((r) => ACTIVAS.includes(r.estado) && inicioClase(clase(r.clase)) > t - 3600000).sort((a, b) => (a.clase < b.clase ? -1 : 1)).map(reservaClienta);
    const historial = limitada ? [] : suyas.filter((r) => !proximas.some((p) => p.id === r.id)).sort((a, b) => (a.clase < b.clase ? 1 : -1)).slice(0, 20).map(reservaClienta);
    const perfil = limitada ? { ...perfilDe(cl), nacimiento: "", barrio: "", intereses: [], salud: "", eps: "", contactoEmergencia: { nombre: "", whatsapp: "" } } : perfilDe(cl);
    return {
      clienta: { id: cl.id, perfil, consentimientos: limitada ? {} : cl.consentimientos || {}, fichaCompleta: limitada ? false : fichaCompleta(cl), limitada },
      saldo: limitada ? { clases: 0, vence: "", venceTexto: "" } : saldoDe(cl.id),
      compras: limitada ? [] : db.compras.filter((c) => c.clienta === cl.id).map(compraVista).filter((c) => c.estado === "Vigente"),
      proximas, historial,
      espera: limitada ? [] : db.espera.filter((e) => e.clienta === cl.id && e.estado === "Esperando").map((e) => ({ ...esperaItem(e), clase: claseVista(clase(e.clase)) })),
      politicas: politicas(), pago: { llave: llave(), medios: ["Nequi", "DaviPlata", "Bre-B"], whatsapp: waReservas() },
    };
  });
  ruta("PATCH", "/api/yo/perfil", (ctx) => {
    const { cl, limitada } = yoClienta(ctx);
    if (limitada) falla(403, "sin-permiso", "Confirma tu WhatsApp para editar tu ficha.");
    aplicarPerfil(cl, ctx.b);
    return { perfil: perfilDe(cl), fichaCompleta: fichaCompleta(cl) };
  });
  ruta("POST", "/api/yo/consentimientos", (ctx) => {
    const { cl } = yoClienta(ctx);
    firmar(cl, ctx.b);
    return { consentimientos: cl.consentimientos };
  });
  ruta("POST", "/api/yo/reservas", (ctx) => {
    const { cl, limitada } = yoClienta(ctx);
    if (limitada) falla(403, "sin-permiso", "Confirma tu WhatsApp con un código para reservar desde tu cuenta.");
    actorActual = { tipo: "clienta", id: cl.id, nombre: cl.nombre };
    const r = crearReserva({ idClienta: cl.id, idClase: ctx.b.clase, origen: "App" });
    const s = sesionActual();
    if (s?.limitada) abrirSesion({ ...s, reservas: [...(s.reservas || []), r.id] });
    const c = clase(r.clase);
    emitir("reserva", r.estado === ESTADO.CONFIRMADA ? "Reservó con su plan" : "Reservó y espera el pago", `${cl.nombre} · ${fechaLegible(c.fecha)}, ${horaLegible(c.hora)}`, { clienta: cl.id, clase: c.id });
    return { status: 201, cuerpo: reservaClienta(r) };
  });
  ruta("POST", "/api/yo/reservas/:id/cancelar", (ctx) => {
    const { cl } = yoClienta(ctx);
    const r = reserva(ctx.p.id);
    if (!r || r.clienta !== cl.id) falla(404, "no-existe", "No encontramos esa reserva.");
    const { devolvioClase } = cancelarReserva(r);
    const c = clase(r.clase);
    emitir("cancelacion", devolvioClase ? "Canceló a tiempo" : "Canceló tarde", `${cl.nombre} · ${fechaLegible(c.fecha)}, ${horaLegible(c.hora)}`, { clienta: cl.id, clase: c.id });
    const mensaje = r.estado === ESTADO.CANCELADA_TARDE ? `Cancelaste tu clase. Como faltaban menos de ${politicas().horasCancelar} horas, se descontó de tu plan.` : devolvioClase ? "Listo, cancelaste tu clase. Volvió a tu plan." : "Listo, liberamos tu columpio.";
    return { reserva: reservaClienta(r), devolvioClase, mensaje };
  });
  ruta("POST", "/api/yo/reservas/:id/reagendar", (ctx) => {
    const { cl } = yoClienta(ctx);
    const r = reserva(ctx.p.id);
    if (!r || r.clienta !== cl.id) falla(404, "no-existe", "No encontramos esa reserva.");
    return reagendar(r, ctx.b.clase, false);
  });
  function reagendar(r, idNueva, admin) {
    const c = clase(r.clase), pol = politicas();
    const prueba = r.compra ? esPruebaCompra(r.compra) : r.planPedido === "Clase de prueba";
    const p = politicaReagendar(r, c, ahora(), admin ? 0 : pol.horasCancelar, cambiosHechos(r), admin ? Infinity : prueba ? pol.cambiosPrueba : Infinity);
    if (!p.ok) conflicto(p.motivo, p.motivo === "tarde" ? `Los cambios se hacen con ${pol.horasCancelar} horas de anticipación.` : p.motivo === "cambios" ? "La clase de prueba se puede cambiar una sola vez." : "Esta reserva ya cambió de estado.");
    const nc = clase(idNueva);
    if (!nc) falla(404, "no-existe", "Esa clase no existe.");
    if (nc.id === c.id) conflicto("ya-reservada", "Ya estás en esa clase.");
    const ok = reservableRegla(nc, ocupados(nc.id), ahora(), admin ? 0 : pol.horasReservar);
    if (!ok.ok) conflicto(ok.motivo, ok.motivo === "llena" ? "Esa clase se llenó." : "Esa clase ya no se puede reservar.");
    const estadoAntes = r.estado;
    r.estado = ESTADO.CANCELADA;
    const n = {
      ...r, id: siguienteId("R", db.reservas.map((x) => x.id)), creada: iso(ahora()), clase: nc.id, estado: estadoAntes, reagendadaDe: r.id,
      compra: estadoAntes === ESTADO.PENDIENTE ? "" : (elegirCompra(db.compras, db.reservas, r.clienta, nc.fecha)?.id || r.compra),
    };
    db.reservas.push(n);
    const cl = clienta(r.clienta);
    emitir("reagenda", "Cambió de clase", `${cl.nombre} · ahora el ${fechaLegible(nc.fecha)}, ${horaLegible(nc.hora)}`, { clienta: cl.id, clase: nc.id });
    return { anterior: reservaClienta(r), nueva: reservaClienta(n), mensaje: `Listo: te esperamos el ${fechaLegible(nc.fecha)} a las ${horaLegible(nc.hora)}` };
  }
  ruta("POST", "/api/yo/espera", (ctx) => {
    const { cl, limitada } = yoClienta(ctx);
    if (limitada) falla(403, "sin-permiso", "Confirma tu WhatsApp con un código para ver toda tu cuenta.");
    const c = clase(ctx.b.clase);
    if (!c) falla(404, "no-existe", "Esa clase no existe.");
    if (db.espera.some((e) => e.clase === c.id && e.clienta === cl.id && e.estado === "Esperando")) conflicto("ya-reservada", "Ya estás en la lista de espera de esta clase.");
    const e = { id: "E-" + String(++db.contadores.E).padStart(4, "0"), creada: iso(ahora()), clase: c.id, clienta: cl.id, estado: "Esperando", notas: "" };
    db.espera.push(e);
    emitir("espera", "Lista de espera", `${cl.nombre} espera un columpio el ${fechaLegible(c.fecha)}`, { clienta: cl.id, clase: c.id });
    return { status: 201, cuerpo: { ...esperaItem(e), clase: claseVista(c) } };
  });
  ruta("DELETE", "/api/yo/espera/:id", (ctx) => {
    const { cl } = yoClienta(ctx);
    const e = db.espera.find((x) => x.id === ctx.p.id && x.clienta === cl.id);
    if (e) e.estado = "Ya no";
    return { status: 204 };
  });

  // profe
  const esSuya = (u, c) => u.rol === "admin" || sinAcentos(c.profe) === sinAcentos(usuario(u.id)?.nombreHorario || u.nombre);
  ruta("GET", "/api/profe/clases", (ctx) => {
    const u = exigir(ctx, "profe", "admin");
    const h = hoy(), desde = ctx.q.desde || h, hasta = ctx.q.hasta || sumarDias(h, 14), t = ahora();
    return db.clases.filter((c) => esSuya(u, c) && ((c.fecha >= desde && c.fecha <= hasta) || (c.fecha >= sumarDias(h, -7) && inicioClase(c) < t && db.reservas.some((r) => r.clase === c.id && r.estado === ESTADO.CONFIRMADA)))).map(claseEquipo);
  });
  ruta("GET", "/api/profe/clases/:id", (ctx) => {
    const u = exigir(ctx, "profe", "admin");
    const c = clase(ctx.p.id);
    if (!c) falla(404, "no-existe", "Esa clase no existe.");
    if (!esSuya(u, c)) falla(403, "sin-permiso", "Esta clase no está a tu nombre.");
    return claseEquipo(c);
  });
  function marcar(ctx) {
    const r = reserva(ctx.p.id);
    if (!r) falla(404, "no-existe", "No encontramos esa reserva.");
    const c = clase(r.clase);
    if (!esSuya(ctx.u, c)) falla(403, "sin-permiso", "Esta clase no está a tu nombre.");
    if (![ESTADO.CONFIRMADA, ESTADO.ASISTIO, ESTADO.NO_VINO].includes(r.estado)) conflicto("estado", "Esta reserva no está confirmada.");
    if (ahora() < momentoMs(c.fecha, "00:00")) conflicto("tarde", "La asistencia se marca desde el día de la clase.");
    if (ctx.u.rol === "profe" && ahora() - inicioClase(c) > 48 * 3600000) conflicto("fuera-de-plazo", "Pasaron 48 horas: pídele a Ana que lo corrija.");
    r.estado = ctx.b.vino ? ESTADO.ASISTIO : ESTADO.NO_VINO;
    if (!r.compra) r.compra = elegirCompra(db.compras, db.reservas, r.clienta, c.fecha)?.id || "";
    auditar("asistencia", r.id, `${clienta(r.clienta).nombre}: ${r.estado}`);
    return c;
  }
  ruta("POST", "/api/profe/reservas/:id/asistencia", (ctx) => { exigir(ctx, "profe", "admin"); return claseEquipo(marcar(ctx)); });
  ruta("POST", "/api/profe/clases/:id/notas", (ctx) => {
    const u = exigir(ctx, "profe", "admin");
    const c = clase(ctx.p.id);
    if (!c || !esSuya(u, c)) falla(404, "no-existe", "Esa clase no existe.");
    c.notas = String(ctx.b.texto || "").slice(0, 2000);
    return claseEquipo(c);
  });
  ruta("GET", "/api/profe/clientas", (ctx) => {
    exigir(ctx, "profe", "admin");
    const t = sinAcentos(ctx.q.q || "");
    if (t.length < 2) return [];
    const hoyC = { id: hoy() + " 23:59", fecha: hoy() };
    return db.clientas.filter((c) => sinAcentos(c.nombre).includes(t)).sort((a, b) => a.nombre.localeCompare(b.nombre)).slice(0, 10)
      .map((c) => ({ id: c.id, nombre: c.nombre, primeraVez: primeraVez(c.id, hoyC), fichaCompleta: fichaCompleta(c) }));
  });
  ruta("POST", "/api/profe/clases/:id/asistentes", (ctx) => {
    const u = exigir(ctx, "profe", "admin");
    const c = clase(ctx.p.id);
    if (!c || !esSuya(u, c)) falla(404, "no-existe", "Esa clase no existe.");
    if (inicioClase(c) - ahora() > 3600000) conflicto("tarde", "Se agrega cuando la clase ya empezó.");
    if (u.rol === "profe" && ahora() - inicioClase(c) > 48 * 3600000) conflicto("fuera-de-plazo", "Pasaron 48 horas: pídele a Ana que lo corrija.");
    const cl = clienta(ctx.b.clienta);
    if (!cl) falla(422, "validacion", "Elige a la persona.");
    if (db.reservas.some((r) => r.clase === c.id && r.clienta === cl.id && OCUPAN.includes(r.estado))) conflicto("ya-reservada", "Ya está en la lista.");
    const compra = elegirCompra(db.compras, db.reservas, cl.id, c.fecha);
    db.reservas.push({ id: siguienteId("R", db.reservas.map((x) => x.id)), creada: iso(ahora()), clase: c.id, clienta: cl.id, estado: ESTADO.ASISTIO, compra: compra ? compra.id : "", origen: "Profe", venceApartado: "", notas: "", reagendadaDe: "", atribucion: "" });
    if (c.cupos < ocupados(c.id)) c.cupos = ocupados(c.id);
    emitir("asistencia", compra ? "Vino sin reserva" : "Vino sin plan", `${cl.nombre} · ${fechaLegible(c.fecha)}, ${horaLegible(c.hora)}${compra ? "" : " · cóbrale"}`, { clienta: cl.id, clase: c.id });
    return { status: 201, cuerpo: { clase: claseEquipo(c), reserva: { id: db.reservas[db.reservas.length - 1].id, clienta: cl.id, estado: ESTADO.ASISTIO }, sinPlan: !compra } };
  });
  ruta("POST", "/api/profe/clases/:id/cerrar", (ctx) => {
    const u = exigir(ctx, "profe", "admin");
    const c = clase(ctx.p.id);
    if (!c || !esSuya(u, c)) falla(404, "no-existe", "Esa clase no existe.");
    if (ahora() < inicioClase(c)) conflicto("no-ha-empezado", "La lista se cierra cuando la clase empieza.");
    if (u.rol === "profe" && ahora() - inicioClase(c) > 48 * 3600000) conflicto("fuera-de-plazo", "Pasaron 48 horas: pídele a Ana que lo corrija.");
    let marcadas = 0;
    for (const r of db.reservas.filter((x) => x.clase === c.id && x.estado === ESTADO.CONFIRMADA)) { r.estado = ESTADO.NO_VINO; marcadas++; }
    auditar("asistencia", c.id, "lista cerrada");
    return { ...claseEquipo(c), marcadas };
  });
  ruta("POST", "/api/profe/clases/:id/reemplazo", (ctx) => {
    const u = exigir(ctx, "profe");
    const c = clase(ctx.p.id);
    if (!c || !esSuya(u, c)) falla(404, "no-existe", "Esa clase no existe.");
    if (inicioClase(c) < ahora()) conflicto("empezo", "La clase ya empezó.");
    c.reemplazoPedido = { motivo: String(ctx.b.motivo || "").slice(0, 300), fecha: iso(ahora()), pedidoPor: u.id };
    emitir("clase", "Necesita reemplazo", `${u.nombre} no puede dictar ${fechaLegible(c.fecha)}, ${horaLegible(c.hora)}`, { clase: c.id });
    return claseEquipo(c);
  });
  ruta("GET", "/api/profe/push/clave", (ctx) => { exigir(ctx, "profe", "admin"); return { activo: false, clavePublica: "" }; });
  ruta("POST", "/api/profe/push/suscribir", (ctx) => { exigir(ctx, "profe", "admin"); return { status: 204 }; });
  ruta("GET", "/api/profe/resumen", (ctx) => {
    const u = exigir(ctx, "profe", "admin");
    const mes = ctx.q.mes || hoy().slice(0, 7), t = ahora();
    const suyas = db.clases.filter((c) => esSuya(u, c) && c.fecha.startsWith(mes) && c.estado !== "Cancelada");
    const dictadas = suyas.filter((c) => inicioClase(c) < t);
    const cupos = dictadas.reduce((s, c) => s + c.cupos, 0), ocu = dictadas.reduce((s, c) => s + ocupados(c.id), 0);
    return { mes, clasesDictadas: dictadas.length, asistentes: db.reservas.filter((r) => r.estado === ESTADO.ASISTIO && dictadas.some((c) => c.id === r.clase)).length, proximas: suyas.length - dictadas.length, ocupacionPct: cupos ? Math.round((ocu / cupos) * 100) : 0 };
  });

  // admin
  const A = (fn) => (ctx) => { exigir(ctx, "admin"); return fn(ctx); };
  ruta("GET", "/api/admin/tablero", A(() => tablero()));
  ruta("GET", "/api/admin/novedades", A(({ q }) => ({ ahora: iso(ahora()), eventos: db.eventos.filter((e) => !q.desde || e.ts > q.desde) })));
  ruta("GET", "/api/admin/agenda", A(({ q }) => {
    const desde = q.desde || hoy(), hasta = q.hasta || sumarDias(desde, 6);
    return db.clases.filter((c) => c.fecha >= desde && c.fecha <= hasta).map(claseEquipo);
  }));
  ruta("POST", "/api/admin/clases", A(({ b }) => {
    const hora = horaTexto(b.hora);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || "") || !hora) falla(422, "validacion", "Elige el día y la hora.", { campos: { fecha: !b.fecha ? "Elige el día." : undefined, hora: !hora ? "Elige la hora." : undefined } });
    const id = claseId(b.fecha, hora);
    if (clase(id)) conflicto("ya-reservada", "Ya hay una clase ese día a esa hora.");
    const fest = festivosEntre(b.fecha, b.fecha)[b.fecha];
    if (fest && !b.forzar) falla(409, "conflicto", `El ${fechaLegible(b.fecha)} es festivo (${fest}). ¿Crearla igual?`, { motivo: "festivo" });
    const c = { id, fecha: b.fecha, dia: diaDeSemana(b.fecha), hora, clase: b.clase || "", profe: b.profe || "", cupos: Number(b.cupos) || num("Cupos por clase", 8), estado: "Programada", notas: b.notas || "", tipo: "Extra" };
    db.clases.push(c);
    db.clases.sort((a, x) => (a.id < x.id ? -1 : 1));
    emitir("clase", "Clase extra creada", `${c.clase || "Clase"} · ${fechaLegible(c.fecha)}, ${horaLegible(c.hora)}`, { clase: c.id });
    auditar("clase-extra", c.id, c.clase);
    return { status: 201, cuerpo: claseEquipo(c) };
  }));
  ruta("GET", "/api/admin/clases/:id", A(({ p }) => { const c = clase(p.id); if (!c) falla(404, "no-existe", "Esa clase no existe."); return claseEquipo(c); }));
  ruta("GET", "/api/admin/push/clave", A(() => ({ activo: false, clavePublica: "" })));
  ruta("PATCH", "/api/admin/clases/:id", A(({ p, b }) => {
    const c = clase(p.id);
    if (!c) falla(404, "no-existe", "Esa clase no existe.");
    if (b.cupos !== undefined && Number(b.cupos) < ocupados(c.id)) falla(422, "validacion", `Ya hay ${ocupados(c.id)} personas: los cupos no pueden ser menos.`, { campos: { cupos: "Menos que las reservas." } });
    for (const k of ["clase", "profe", "notas"]) if (b[k] !== undefined) c[k] = b[k];
    if (b.profe !== undefined && c.reemplazoPedido && sinAcentos(b.profe) !== sinAcentos(usuario(c.reemplazoPedido.pedidoPor)?.nombreHorario)) c.reemplazoPedido = null;
    if (b.cupos !== undefined) c.cupos = Number(b.cupos);
    auditar("clase-editada", c.id, JSON.stringify(b));
    return claseEquipo(c);
  }));
  ruta("POST", "/api/admin/clases/:id/cancelar", A(({ p, b }) => {
    const c = clase(p.id);
    if (!c) falla(404, "no-existe", "Esa clase no existe.");
    const afectadas = [];
    for (const r of db.reservas.filter((x) => x.clase === c.id && ACTIVAS.includes(x.estado))) {
      r.estado = ESTADO.CANCELADA;
      const a = asistente(r), cl = clienta(r.clienta);
      const texto = `Hola ${primerNombre(cl.nombre)}, te escribo de Casa Lotus. Tuvimos que cancelar la clase del ${fechaLegible(c.fecha)} a las ${horaLegible(c.hora)}${b.motivo ? " (" + b.motivo + ")" : ""}. La clase volvió a tu plan. ¿Te aparto otro horario?`;
      afectadas.push({ ...a, waTexto: texto, waEnlace: enlaceWhatsApp(cl.whatsapp, texto) });
    }
    c.estado = "Cancelada";
    c.notas = [c.notas, b.motivo ? "Cancelada: " + b.motivo : "Cancelada"].filter(Boolean).join(" · ");
    emitir("clase", "Clase cancelada", `${fechaLegible(c.fecha)}, ${horaLegible(c.hora)} · ${afectadas.length} personas por avisar`, { clase: c.id });
    auditar("clase-cancelada", c.id, b.motivo || "");
    return { clase: claseEquipo(c), afectadas };
  }));
  ruta("GET", "/api/admin/horario", A(() => db.horario.map((h) => ({ ...h, proximas: db.clases.filter((c) => c.dia === h.dia && c.hora === h.hora && c.estado !== "Cancelada" && inicioClase(c) > ahora()).length }))));
  ruta("POST", "/api/admin/horario", A(({ b }) => {
    const hora = horaTexto(b.hora);
    if (!b.dia || !hora) falla(422, "validacion", "Elige el día y la hora.", { campos: { dia: !b.dia ? "Elige el día." : undefined, hora: !hora ? "Elige la hora." : undefined } });
    const id = b.dia + " " + hora;
    if (db.horario.some((h) => h.id === id)) conflicto("ya-reservada", "Esa franja ya existe.");
    const slot = { id, dia: b.dia, hora, clase: b.clase || "", profe: b.profe || "", cupos: Number(b.cupos) || 8, activa: b.activa !== false };
    db.horario.push(slot);
    const desde = b.desde || hoy();
    const nuevas = fechasDeClase([slot], desde, num("Semanas de clases hacia adelante", 4)).filter((c) => !clase(c.id) && inicioClase(c) > ahora());
    for (const c of nuevas) db.clases.push({ ...c, estado: "Programada", notas: "", tipo: "Regular" });
    db.clases.sort((a, x) => (a.id < x.id ? -1 : 1));
    auditar("franja-nueva", id, `${slot.clase} · ${nuevas.length} clases`);
    return { status: 201, cuerpo: { slot: { ...slot, proximas: nuevas.length }, clasesCreadas: nuevas.length } };
  }));
  ruta("PATCH", "/api/admin/horario/:id", A(({ p, b }) => {
    const id = decodeURIComponent(p.id);
    const s = db.horario.find((h) => h.id === id);
    if (!s) falla(404, "no-existe", "Esa franja no existe.");
    for (const k of ["clase", "profe", "cupos", "activa"]) if (b[k] !== undefined) s[k] = k === "cupos" ? Number(b[k]) : b[k];
    let n = 0;
    if (b.aplicarAFuturas) for (const c of db.clases.filter((c) => c.dia === s.dia && c.hora === s.hora && inicioClase(c) > ahora() && c.estado !== "Cancelada")) {
      if (b.clase !== undefined) c.clase = s.clase;
      if (b.profe !== undefined) c.profe = s.profe;
      if (b.cupos !== undefined) c.cupos = Math.max(s.cupos, ocupados(c.id));
      n++;
    }
    return { slot: { ...s }, clasesActualizadas: n };
  }));
  ruta("DELETE", "/api/admin/horario/:id", A(({ p }) => {
    const id = decodeURIComponent(p.id);
    const s = db.horario.find((h) => h.id === id);
    if (!s) falla(404, "no-existe", "Esa franja no existe.");
    s.activa = false;
    let canceladas = 0; const conReservas = [];
    for (const c of db.clases.filter((c) => c.dia === s.dia && c.hora === s.hora && inicioClase(c) > ahora() && c.estado !== "Cancelada")) {
      if (ocupados(c.id)) conReservas.push(claseEquipo(c)); else { c.estado = "Cancelada"; canceladas++; }
    }
    return { canceladas, conReservas };
  }));
  ruta("GET", "/api/admin/clientas", A(({ q }) => {
    let lista = db.clientas.map(clientaFila);
    if (q.segmento) lista = lista.filter((c) => c.segmentos.includes(q.segmento));
    if (q.q) { const t = sinAcentos(q.q), d = q.q.replace(/\D/g, ""); lista = lista.filter((c) => sinAcentos(c.nombre).includes(t) || (d.length >= 3 && c.whatsapp.includes(d)) || sinAcentos(c.correo).includes(t)); }
    const orden = q.orden || "nombre";
    lista.sort(orden === "saldo" ? (a, b) => b.saldo.clases - a.saldo.clases : orden === "reciente" ? (a, b) => (a.desde < b.desde ? 1 : -1) : orden === "proxima" ? (a, b) => ((a.proxima?.id || "~") < (b.proxima?.id || "~") ? -1 : 1) : orden === "visita" ? (a, b) => ((b.ultimaVisita || "") > (a.ultimaVisita || "") ? 1 : (b.ultimaVisita || "") < (a.ultimaVisita || "") ? -1 : 0) : (a, b) => a.nombre.localeCompare(b.nombre));
    return lista;
  }));
  ruta("GET", "/api/admin/segmentos", A(() => segmentosLista()));
  ruta("GET", "/api/admin/clientas/:id", A(({ p }) => { const cl = clienta(p.id); if (!cl) falla(404, "no-existe", "No encontramos a esa clienta."); return clientaDetalle(cl); }));
  ruta("POST", "/api/admin/clientas", A(({ b }) => {
    validarPerfilPublico(b);
    if (clienteSegunWhatsApp(normalizaWhatsApp(b.whatsapp))) falla(409, "conflicto", "Ya hay una clienta con ese WhatsApp.", { motivo: "ya-reservada" });
    const cl = nuevaClienta(b, { notas: b.notas });
    if (b.consentimientos) firmar(cl, b.consentimientos);
    auditar("clienta-nueva", cl.id, cl.nombre);
    return { status: 201, cuerpo: clientaDetalle(cl) };
  }));
  ruta("PATCH", "/api/admin/clientas/:id", A(({ p, b }) => {
    const cl = clienta(p.id);
    if (!cl) falla(404, "no-existe", "No encontramos a esa clienta.");
    aplicarPerfil(cl, b);
    if (b.notas !== undefined) cl.notas = b.notas;
    if (b.etiquetas) cl.etiquetas = b.etiquetas.map((x) => String(x).trim()).filter(Boolean);
    auditar("clienta-editada", cl.id, Object.keys(b).join(", "));
    return clientaDetalle(cl);
  }));
  ruta("POST", "/api/admin/clientas/:id/acceso", A(({ p }) => {
    const cl = clienta(p.id);
    const enlace = `${origen()}/app/acceso/${cl.id}`;
    const texto = `Hola ${primerNombre(cl.nombre)}, este es tu enlace para entrar a la app de Casa Lotus y ver o cambiar tus clases: ${enlace}`;
    return { enlace, waTexto: texto, waEnlace: enlaceWhatsApp(cl.whatsapp, texto) };
  }));
  ruta("POST", "/api/admin/reservas", A(({ b }) => {
    const r = crearReserva({ idClienta: b.clienta, idClase: b.clase, origen: "Panel", admin: true });
    const cl = clienta(b.clienta), c = clase(b.clase);
    emitir("reserva", "Reservaste una clase", `${cl.nombre} · ${fechaLegible(c.fecha)}, ${horaLegible(c.hora)}`, { clienta: cl.id, clase: c.id });
    return { status: 201, cuerpo: { reserva: reservaClienta(r), clase: claseEquipo(c) } };
  }));
  ruta("POST", "/api/admin/reservas/:id/confirmar", A(({ p, b }) => {
    const r = reserva(p.id);
    if (!r) falla(404, "no-existe", "No encontramos esa reserva.");
    if (r.estado !== ESTADO.PENDIENTE) conflicto("estado", "Esta reserva ya no espera pago.");
    let compra = null;
    if (b.pago) {
      const pl = plan(b.pago.plan);
      if (!pl) falla(422, "validacion", "Elige el plan.", { campos: { plan: "Elige el plan." } });
      if (!MEDIOS.includes(b.pago.medio)) falla(422, "validacion", "Elige por dónde pagó.", { campos: { medio: "Elige el medio." } });
      const c = clase(r.clase);
      const inicio = c.fecha < hoy() ? c.fecha : hoy();
      compra = { id: siguienteId("P", db.compras.map((x) => x.id)), fecha: hoy(), clienta: r.clienta, plan: pl.nombre, clases: Number(b.pago.clases) || pl.clases, valor: b.pago.valor ?? pl.precio, medio: b.pago.medio, inicio, vence: sumarDias(inicio, pl.vigencia - 1), notas: "" };
      db.compras.push(compra);
    }
    const elegida = elegirCompra(db.compras, db.reservas, r.clienta, clase(r.clase).fecha);
    if (!elegida) falla(422, "validacion", "No tiene clases en su plan para esta fecha. Registra el pago.", { campos: { plan: "Registra el pago." } });
    r.estado = ESTADO.CONFIRMADA; r.compra = elegida.id; r.venceApartado = "";
    const cl = clienta(r.clienta);
    emitir("pago", compra ? "Pago confirmado" : "Confirmada con su plan", `${cl.nombre}${compra ? " · " + compra.plan + " · " + dinero(compra.valor) : ""}`, { clienta: cl.id, clase: r.clase });
    auditar("confirmar", r.id, compra ? `${compra.plan} ${compra.medio} ${compra.valor}` : "con su plan");
    return { reserva: reservaClienta(r), compra: compra ? compraVista(compra) : undefined, clase: claseEquipo(clase(r.clase)) };
  }));
  ruta("POST", "/api/admin/reservas/:id/asistencia", (ctx) => { exigir(ctx, "admin"); const c = marcar(ctx); return { reserva: reservaClienta(reserva(ctx.p.id)), clase: claseEquipo(c) }; });
  ruta("POST", "/api/admin/reservas/:id/cancelar", A(({ p, b }) => {
    const r = reserva(p.id);
    if (!r) falla(404, "no-existe", "No encontramos esa reserva.");
    const { devolvioClase } = cancelarReserva(r, { sinCosto: Boolean(b.sinCosto) });
    const cl = clienta(r.clienta), c = clase(r.clase);
    emitir("cancelacion", "Cancelaste una reserva", `${cl.nombre} · ${fechaLegible(c.fecha)}`, { clienta: cl.id, clase: c.id });
    return { reserva: reservaClienta(r), clase: claseEquipo(c), devolvioClase };
  }));
  ruta("POST", "/api/admin/reservas/:id/liberar", A(({ p }) => {
    const r = reserva(p.id);
    if (!r || r.estado !== ESTADO.PENDIENTE) conflicto("estado", "Esta reserva ya no espera pago.");
    r.estado = ESTADO.VENCIDA;
    auditar("liberar", r.id, clienta(r.clienta).nombre);
    return { reserva: reservaClienta(r), clase: claseEquipo(clase(r.clase)) };
  }));
  ruta("POST", "/api/admin/reservas/:id/reagendar", A(({ p, b }) => { const r = reserva(p.id); if (!r) falla(404, "no-existe", "No encontramos esa reserva."); const x = reagendar(r, b.clase, true); return { anterior: x.anterior, nueva: x.nueva }; }));
  ruta("GET", "/api/admin/pagos", A(({ q }) => {
    const mes = q.mes || hoy().slice(0, 7);
    const compras = db.compras.filter((c) => c.fecha.startsWith(mes)).map(compraVista).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const porMedio = {}, porPlan = {};
    for (const c of compras) { porMedio[c.medio] = (porMedio[c.medio] || 0) + c.valor; porPlan[c.plan] = (porPlan[c.plan] || 0) + c.valor; }
    return { mes, total: compras.reduce((s, c) => s + c.valor, 0), porMedio, porPlan, compras };
  }));
  ruta("POST", "/api/admin/pagos", A(({ b }) => {
    const cl = clienta(b.clienta), pl = plan(b.plan);
    if (!cl) falla(422, "validacion", "Elige a la clienta.", { campos: { clienta: "Elige a la clienta." } });
    if (!pl) falla(422, "validacion", "Elige el plan.", { campos: { plan: "Elige el plan." } });
    if (pl.tipo === "Ajuste" && !(Number(b.clases) > 0)) falla(422, "validacion", "¿Cuántas clases le quedaban?", { campos: { clases: "Escribe cuántas clases." } });
    const inicio = b.inicio || hoy();
    const compra = { id: siguienteId("P", db.compras.map((x) => x.id)), fecha: hoy(), clienta: cl.id, plan: pl.nombre, clases: Number(b.clases) || pl.clases, valor: b.valor ?? pl.precio, medio: b.medio || "Nequi", inicio, vence: sumarDias(inicio, pl.vigencia - 1), notas: "" };
    db.compras.push(compra);
    emitir("pago", "Pago registrado", `${cl.nombre} · ${pl.nombre} · ${dinero(compra.valor)}`, { clienta: cl.id });
    auditar("pago", compra.id, `${cl.nombre} ${pl.nombre}`);
    return { status: 201, cuerpo: { compra: compraVista(compra), saldo: saldoDe(cl.id) } };
  }));
  ruta("GET", "/api/admin/espera", A(() => db.espera.filter((e) => e.estado === "Esperando" || e.estado === "Avisada").map((e) => ({ ...esperaItem(e), clase: claseVista(clase(e.clase)) }))));
  ruta("POST", "/api/admin/espera/:id/tomar", A(({ p }) => {
    const e = db.espera.find((x) => x.id === p.id);
    if (!e) falla(404, "no-existe", "No encontramos ese registro.");
    const r = crearReserva({ idClienta: e.clienta, idClase: e.clase, origen: "Lista de espera", admin: true });
    e.estado = "Tomó el cupo";
    return { reserva: reservaClienta(r), clase: claseEquipo(clase(e.clase)) };
  }));
  ruta("PATCH", "/api/admin/espera/:id", A(({ p, b }) => { const e = db.espera.find((x) => x.id === p.id); if (!e) falla(404, "no-existe", "No encontramos ese registro."); e.estado = b.estado; return esperaItem(e); }));
  function staffVista(u) {
    const mes = hoy().slice(0, 7), pago = Number(ajuste("Pago por clase a profes", "")) || 0;
    const clasesMes = db.clases.filter((c) => c.fecha.startsWith(mes) && c.estado !== "Cancelada" && inicioClase(c) < ahora() && sinAcentos(c.profe) === sinAcentos(u.nombreHorario)).length;
    return { id: u.id, rol: u.rol, nombre: u.nombre, nombreHorario: u.nombreHorario, correo: u.correo, whatsapp: u.whatsapp, activa: u.activa, bio: u.bio, foto: u.foto, creada: u.creada, ultimoAcceso: u.ultimoAcceso, clasesMes, pagoMes: pago ? pago * clasesMes : null };
  }
  function invitacionPara(u) {
    const token = "inv-" + u.id.toLowerCase();
    db.invitaciones[token] = u.id;
    const enlace = `${origen()}/app/invitacion/${token}`;
    const texto = `Hola ${primerNombre(u.nombre)}, te invito a la app del equipo de Casa Lotus. Entra aquí y crea tu contraseña: ${enlace}`;
    return { enlace, waTexto: texto, waEnlace: u.whatsapp ? enlaceWhatsApp(u.whatsapp, texto) : `https://wa.me/?text=${encodeURIComponent(texto)}`, vence: iso(ahora() + 7 * 86400000) };
  }
  ruta("GET", "/api/admin/equipo", A(() => db.equipo.map(staffVista)));
  ruta("GET", "/api/admin/profes", A(() => db.equipo.filter((u) => u.rol === "profe").map((u) => ({ id: u.id, nombre: u.nombre, nombreHorario: u.nombreHorario, activa: u.activa }))));
  ruta("POST", "/api/admin/equipo", A(({ b }) => {
    if (!b.nombre || !/^\S+@\S+\.\S+$/.test(b.correo || "")) falla(422, "validacion", "Escribe el nombre y un correo válido.", { campos: { nombre: !b.nombre ? "Escribe el nombre." : undefined, correo: "Revisa el correo." } });
    if (db.equipo.some((u) => u.correo === b.correo)) falla(409, "conflicto", "Ya hay alguien con ese correo.", { motivo: "ya-reservada" });
    const u = { id: "U-" + (db.equipo.length + 1), rol: b.rol || "profe", nombre: b.nombre, nombreHorario: b.nombreHorario || primerNombre(b.nombre), correo: b.correo, whatsapp: normalizaWhatsApp(b.whatsapp), activa: true, bio: "", foto: "", creada: hoy(), ultimoAcceso: "" };
    db.equipo.push(u);
    auditar("equipo-invitacion", u.id, u.nombre);
    return { status: 201, cuerpo: { usuario: staffVista(u), invitacion: invitacionPara(u) } };
  }));
  ruta("PATCH", "/api/admin/equipo/:id", A(({ p, b }) => {
    const u = usuario(p.id);
    if (!u) falla(404, "no-existe", "No encontramos a esa persona.");
    for (const k of ["activa", "rol", "nombre", "nombreHorario", "whatsapp"]) if (b[k] !== undefined) u[k] = b[k];
    return staffVista(u);
  }));
  ruta("POST", "/api/admin/equipo/:id/invitacion", A(({ p }) => invitacionPara(usuario(p.id))));
  ruta("GET", "/api/admin/ajustes", A(() => db.ajustes));
  ruta("PATCH", "/api/admin/ajustes", A(({ b }) => {
    for (const [k, v] of Object.entries(b)) { const a = db.ajustes.find((x) => x.ajuste === k); if (a) a.valor = String(v); }
    auditar("ajustes", "", Object.keys(b).join(", "));
    return db.ajustes;
  }));
  ruta("GET", "/api/admin/planes", A(() => db.planes));
  ruta("PATCH", "/api/admin/planes", A(({ b }) => {
    let p = plan(b.nombre);
    if (!p) { p = { nombre: b.nombre, clases: 0, precio: 0, vigencia: 30, tipo: "Mensual", activo: true }; db.planes.push(p); }
    for (const k of ["precio", "clases", "vigencia", "activo", "tipo"]) if (b[k] !== undefined) p[k] = typeof p[k] === "number" ? Number(b[k]) : b[k];
    auditar("plan", p.nombre, JSON.stringify(b));
    return db.planes;
  }));
  ruta("GET", "/api/admin/registro", A(({ q }) => db.registro.filter((x) => !q.antes || x.ts < q.antes).slice(0, Number(q.limite) || 100)));
  ruta("GET", "/api/admin/atribucion", A(({ q }) => {
    const h = q.hasta || hoy(), d = q.desde || sumarDias(h, -30);
    const desdeMs = momentoMs(d, "00:00"), hastaMs = momentoMs(sumarDias(h, 1), "00:00");
    const porRef = new Map(), porCampana = new Map();
    const fila = (mapa, clave, extra) => { if (!mapa.has(clave)) mapa.set(clave, { ...extra, clics: 0, reservas: 0, confirmadas: 0, ingresos: 0 }); return mapa.get(clave); };
    const contadas = new Set();
    for (const r of db.reservas) {
      const t = Date.parse(r.creada);
      if (!/^Web · /.test(r.origen) || t < desdeMs || t >= hastaMs || r.reagendadaDe) continue;
      const ref = r.origen.slice(6) || "(sin ref)";
      let a = {};
      try { a = JSON.parse(r.atribucion || "{}").utm || {}; } catch { a = {}; }
      const camp = a.campaign || "(sin campaña)";
      const filas = [fila(porRef, ref, { ref }), fila(porCampana, camp + "|" + (a.source || "") + "|" + (a.medium || ""), { campana: camp, source: a.source || "", medium: a.medium || "" })];
      let final = r;
      for (let i = 0; i < 20; i++) { const sig = db.reservas.find((x) => x.reagendadaDe === final.id); if (!sig) break; final = sig; }
      const confirmada = CONSUMEN.includes(final.estado);
      let ingreso = 0;
      if (confirmada && final.compra && !contadas.has(final.compra)) { contadas.add(final.compra); ingreso = Number(db.compras.find((c) => c.id === final.compra)?.valor) || 0; }
      for (const f of filas) { f.reservas++; if (confirmada) f.confirmadas++; f.ingresos += ingreso; }
    }
    // invented clicks: each booking came from a handful of visits, plus refs that only got clicks
    const dias = Math.max(1, Math.round((hastaMs - desdeMs) / 86400000));
    for (const f of porRef.values()) f.clics += f.reservas * 6 + 3;
    for (const f of porCampana.values()) f.clics += f.reservas * 6 + 3;
    for (const [ref, n] of [["WEB-HERO", 1.6], ["WEB-PRUEBA", 0.9], ["WEB-HORARIO-SAB-0800", 0.5], ["WEB-PLAN-8", 0.3], ["WEB-BARRA-MOVIL", 0.4]]) fila(porRef, ref, { ref }).clics += Math.round(n * dias);
    fila(porCampana, "octubre|instagram|social", { campana: "octubre", source: "instagram", medium: "social" }).clics += Math.round(2.2 * dias);
    const orden = (x, y) => y.ingresos - x.ingresos || y.reservas - x.reservas || y.clics - x.clics;
    return { desde: d, hasta: h, porRef: [...porRef.values()].sort(orden), porCampana: [...porCampana.values()].sort(orden) };
  }));
  ruta("POST", "/api/admin/espera", A(({ b }) => {
    const c = clase(b.clase), cl = clienta(b.clienta);
    if (!c || !cl) falla(422, "validacion", "Elige la clase y la persona.");
    if (db.espera.some((e) => e.clase === c.id && e.clienta === cl.id && e.estado === "Esperando")) conflicto("ya-reservada", "Ya está en la lista de espera de esta clase.");
    const e = { id: "E-" + String(++db.contadores.E).padStart(4, "0"), creada: iso(ahora()), clase: c.id, clienta: cl.id, estado: "Esperando", notas: "" };
    db.espera.push(e);
    auditar("espera", e.id, `${cl.nombre} · ${c.id}`);
    return { status: 201, cuerpo: esperaItem(e) };
  }));
  ruta("GET", "/api/admin/salud", A(() => ({ datos: "memoria", hoja: { ok: true, faltan: [] }, whatsapp: { modo: waModo() }, correo: { ok: true }, push: { activo: false, clavePublica: "", suscripciones: 0 }, version: "demo" })));
  ruta("POST", "/api/admin/push/suscribir", A(() => ({ status: 204 })));
  ruta("DELETE", "/api/admin/push/suscribir", A(() => ({ status: 204 })));
  ruta("GET", "/api/admin/whatsapp/estado", A(() => {
    const modo = waModo();
    return { conectado: modo !== "desconectado", modo, numero: modo === "desconectado" ? undefined : "+57 312 872 0888", nombreVerificado: modo === "desconectado" ? undefined : "Casa Lotus", plantillas: db.plantillas, faltan: modo === "desconectado" ? ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET"] : [] };
  }));
  ruta("GET", "/api/admin/whatsapp/conversaciones", A(({ q }) => {
    if (waModo() === "desconectado") falla(503, "no-configurado", "WhatsApp todavía no está conectado.");
    let l = db.conversaciones.map(conversacionVista);
    if (q.filtro === "sin-leer") l = l.filter((c) => c.noLeidos > 0);
    if (q.filtro === "abiertas" || !q.filtro) l = l.filter((c) => c.estado === "abierta");
    if (q.q) l = l.filter((c) => sinAcentos(c.nombre).includes(sinAcentos(q.q)) || c.whatsapp.includes(q.q.replace(/\D/g, "") || "~"));
    return l.sort((a, b) => ((a.ultimoMensaje?.ts || "") < (b.ultimoMensaje?.ts || "") ? 1 : -1));
  }));
  ruta("GET", "/api/admin/whatsapp/conversaciones/:id", A(({ p }) => {
    const conv = db.conversaciones.find((c) => c.id === p.id);
    if (!conv) falla(404, "no-existe", "No encontramos esa conversación.");
    conv.noLeidos = 0;
    const cl = conv.clienta ? clienta(conv.clienta.id) : null;
    return { conversacion: conversacionVista(conv), mensajes: conv.mensajes.map((m, i) => mensajeVista(conv, m, i)), clienta: cl ? clientaFila(cl) : undefined };
  }));
  ruta("POST", "/api/admin/whatsapp/conversaciones/:id/mensajes", A(({ p, b }) => {
    const conv = db.conversaciones.find((c) => c.id === p.id);
    if (!conv) falla(404, "no-existe", "No encontramos esa conversación.");
    const abierta = conv.ventanaHasta && Date.parse(conv.ventanaHasta) > ahora();
    if (b.texto && !abierta) falla(409, "conflicto", "Pasaron más de 24 horas desde su último mensaje: usa una plantilla.", { motivo: "ventana" });
    let texto = b.texto;
    if (b.plantilla) {
      const pl = db.plantillas.find((x) => x.nombre === b.plantilla);
      if (!pl) falla(422, "validacion", "Elige una plantilla.");
      texto = pl.cuerpo.replace(/\{\{(\d+)\}\}/g, (_, i) => (b.variables || [])[i - 1] ?? "");
    }
    const m = { direccion: "saliente", texto, ts: iso(ahora()), tipo: b.plantilla ? "plantilla" : "texto", plantilla: b.plantilla, estado: "enviado", autor: { tipo: "admin", nombre: actorActual.nombre } };
    conv.mensajes.push(m);
    setTimeout(() => { m.estado = "entregado"; }, 1500);
    return { status: 201, cuerpo: mensajeVista(conv, m, conv.mensajes.length - 1) };
  }));
  ruta("PATCH", "/api/admin/whatsapp/conversaciones/:id", A(({ p, b }) => {
    const conv = db.conversaciones.find((c) => c.id === p.id);
    if (!conv) falla(404, "no-existe", "No encontramos esa conversación.");
    if (b.estado) conv.estado = b.estado;
    if (b.etiquetas) conv.etiquetas = b.etiquetas;
    if (b.clienta) { const cl = clienta(b.clienta); conv.clienta = cl ? { id: cl.id, nombre: cl.nombre } : null; if (cl) conv.nombre = cl.nombre; }
    return conversacionVista(conv);
  }));
  ruta("GET", "/api/admin/whatsapp/plantillas", A(() => db.plantillas));

  /* ── dispatcher ───────────────────────────────────────── */
  function manejar(metodo, url, cuerpo) {
    const u = new URL(url, "http://demo.local");
    const q = Object.fromEntries(u.searchParams.entries());
    actorActual = { tipo: "sistema", id: "", nombre: "Casa Lotus" };
    for (const r of R) {
      if (r.metodo !== metodo) continue;
      const m = u.pathname.match(r.re);
      if (!m) continue;
      const p = Object.fromEntries(r.claves.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      try {
        const out = r.fn({ p, q, b: cuerpo || {} });
        guardar();
        if (out && typeof out === "object" && "status" in out && Object.keys(out).every((k) => k === "status" || k === "cuerpo")) return { status: out.status, cuerpo: out.cuerpo ?? null };
        return { status: 200, cuerpo: out };
      } catch (e) {
        if (e instanceof Falla) return { status: e.status, cuerpo: e.cuerpo };
        console.error("[demo]", e);
        return { status: 500, cuerpo: { ok: false, error: "servidor", mensaje: "Algo falló en la demo." } };
      }
    }
    return { status: 404, cuerpo: { ok: false, error: "no-existe", mensaje: "Esa ruta no existe en la demo." } };
  }

  async function transporte(url, init = {}) {
    const [min, max] = latencia;
    if (max > 0) await new Promise((res) => setTimeout(res, min + Math.random() * (max - min)));
    const cuerpo = init.body ? JSON.parse(init.body) : undefined;
    const { status, cuerpo: salida } = manejar(init.method || "GET", url, cuerpo);
    return new Response(status === 204 || salida == null ? null : JSON.stringify(salida), { status, headers: { "Content-Type": "application/json" } });
  }

  /** Live events (the SSE stand-in). In the demo, a new web booking arrives ~25 s after Ana opens the app. */
  function abrirStream(alEvento) {
    oyentes.add(alEvento);
    if (!timbreDemo) {
      timbreDemo = true;
      setTimeout(() => {
        try {
          const isa = db.clientas.find((c) => c.nombre.startsWith("Isabela"));
          const c = db.clases.find((k) => k.estado !== "Cancelada" && inicioClase(k) > ahora() + 72 * 3600000 && ocupados(k.id) < k.cupos && !db.espera.some((e) => e.clase === k.id && e.estado === "Esperando"));
          if (!isa || !c || db.reservas.some((r) => r.clienta === isa.id && ACTIVAS.includes(r.estado))) return;
          actorActual = { tipo: "clienta", id: isa.id, nombre: isa.nombre };
          const r = crearReserva({ idClienta: isa.id, idClase: c.id, origen: "Web · WEB-CLASE-YOGA", plan: "Clase de prueba", forzarPendiente: true });
          r.venceApartado = iso(ahora() + 12 * 3600000);
          emitir("reserva-web", "Nueva reserva web", `${isa.nombre} · ${fechaLegible(c.fecha)}, ${horaLegible(c.hora)}`, { clienta: isa.id, clase: c.id });
          guardar();
        } catch (e) { console.error(e); }
      }, 25000);
    }
    return () => oyentes.delete(alEvento);
  }

  return {
    transporte, manejar, abrirStream,
    get db() { return db; },
    reiniciar() { db = sembrar(ahora()); cerrarSesion(); guardar(); },
    /** Demo shortcut: open a session for a role without a password. */
    entrarComo(rol) {
      const id = rol === "admin" ? "U-1" : rol === "profe" ? "U-2" : "C-0001";
      abrirSesion({ rol, id });
      guardar();
    },
  };
}
