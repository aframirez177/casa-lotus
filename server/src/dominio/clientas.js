// Casa Lotus · clientas: the CRM. Segments and stage (CONTRATO §6 table), the list, the detail with
// its timeline, and every change to a profile or its agreements.
import * as R from "../../../shared/reglas.js";
import { CONSENTIMIENTOS, SALUD_SIN_DATOS } from "../../../shared/consentimientos.js";
import { modelo, transaccion } from "./base.js";
import { textoConsentimiento, textoContacto, sinTilde, textoEtiquetas } from "../datos/modelo.js";
import {
  iso, vistaClase, vistaCompra, vistaEspera, vistaReservaClienta, vistaSaldo, perfilDe, fichaDe,
} from "./vistas.js";
import { conflicto, noExiste, validacion } from "../errores.js";

export const SEGMENTOS = [
  { id: "agendadas", nombre: "Agendaron", descripcion: "Tienen una reserva pendiente o confirmada de hoy en adelante." },
  { id: "con-clases", nombre: "Con clases", descripcion: "Les quedan clases en un plan vigente." },
  { id: "poquitas", nombre: "Les quedan poquitas", descripcion: "Les quedan pocas clases: buen momento para ofrecer renovar." },
  { id: "vence-pronto", nombre: "Vence pronto", descripcion: "Tienen clases y su plan vence en los próximos días." },
  { id: "sin-clases", nombre: "Renovar", descripcion: "Compraron en los últimos 45 días y ya no les quedan clases." },
  { id: "pendiente-pago", nombre: "Deben un pago", descripcion: "Tienen una reserva esperando el comprobante." },
  { id: "prueba", nombre: "Vinieron a prueba", descripcion: "Tomaron la clase de prueba y todavía no compran un plan." },
  { id: "nuevas", nombre: "Nuevas", descripcion: "Llegaron en los últimos 14 días." },
  { id: "inactivas", nombre: "Inactivas", descripcion: "Venían a clase, no vienen hace 30 días y no tienen nada reservado." },
  { id: "cumple", nombre: "Cumpleaños", descripcion: "Cumplen años en los próximos 7 días." },
  { id: "ficha-incompleta", nombre: "Ficha incompleta", descripcion: "Les falta la respuesta de salud, el contacto de emergencia o aceptar el descargo." },
  { id: "leads", nombre: "Interesadas", descripcion: "Nunca han comprado ni venido a clase." },
];

const fechaDeReserva = (M, r) => M.clasePorId.get(r.clase)?.fecha || String(r.clase).slice(0, 10);

/** Everything the CRM knows about one clienta today. */
export function analizar(M, c, ahora) {
  const hoy = R.hoyClave(ahora);
  const aj = M.ajustes;
  const saldo = vistaSaldo(M, c.id, hoy);
  const suyas = M.reservasDeClienta(c.id);
  const compras = M.comprasDeClienta(c.id);
  const reales = compras.filter((x) => x.tipoPlan !== "Prueba");
  const futuras = suyas.filter((r) => R.ACTIVAS.includes(r.estado) && fechaDeReserva(M, r) >= hoy)
    .sort((a, b) => (a.clase < b.clase ? -1 : 1));
  const asistidas = suyas.filter((r) => r.estado === R.ESTADO.ASISTIO).map((r) => fechaDeReserva(M, r)).filter((f) => f <= hoy).sort();
  const ultimaVisita = asistidas[asistidas.length - 1] || "";
  const hace30 = R.sumarDias(hoy, -30);
  const visitas30 = asistidas.filter((f) => f >= hace30).length;
  const pruebas = suyas.filter((r) => r.estado === R.ESTADO.ASISTIO && r.compra && M.compraPorId.get(r.compra)?.tipoPlan === "Prueba");
  const primeraPrueba = pruebas.map((r) => fechaDeReserva(M, r)).sort()[0];

  const s = new Set();
  if (futuras.length) s.add("agendadas");
  if (saldo.clases > 0) s.add("con-clases");
  if (saldo.clases > 0 && saldo.clases <= aj["Aviso de saldo bajo (clases)"]) s.add("poquitas");
  if (saldo.clases > 0 && saldo.vence && saldo.vence <= R.sumarDias(hoy, aj["Días para avisar vencimiento"])) s.add("vence-pronto");
  if (saldo.clases === 0 && reales.some((x) => x.fecha >= R.sumarDias(hoy, -45))) s.add("sin-clases");
  if (suyas.some((r) => r.estado === R.ESTADO.PENDIENTE)) s.add("pendiente-pago");
  if (primeraPrueba && !reales.some((x) => x.fecha >= primeraPrueba)) s.add("prueba");
  if (c.desde && c.desde >= R.sumarDias(hoy, -14) && c.desde <= hoy) s.add("nuevas");
  if (asistidas.length && ultimaVisita < hace30 && !futuras.length) s.add("inactivas");
  const dc = R.diasParaCumple(c.nacimiento, hoy);
  if (dc !== null && dc <= 7) s.add("cumple");
  if (!fichaDe(c)) s.add("ficha-incompleta");
  if (!compras.length && !asistidas.length) s.add("leads");

  let etapa = "activa";
  if (s.has("leads")) etapa = "lead";
  else if (s.has("inactivas")) etapa = "inactiva";
  else if (s.has("poquitas") || s.has("vence-pronto") || s.has("sin-clases") || (saldo.clases === 0 && reales.length && !futuras.length)) etapa = "en-riesgo";
  else if (!reales.length) etapa = "prueba";

  return { saldo, futuras, ultimaVisita, visitas30, segmentos: SEGMENTOS.map((x) => x.id).filter((id) => s.has(id)), etapa, diasCumple: dc };
}

export function filaClienta(M, c, ahora) {
  const a = analizar(M, c, ahora);
  const proxima = a.futuras.map((r) => M.clasePorId.get(r.clase)).find(Boolean);
  return {
    id: c.id, nombre: c.nombre, whatsapp: c.whatsapp, whatsappTexto: R.whatsappLegible(c.whatsapp), correo: c.correo, desde: c.desde, llego: c.llego,
    etapa: a.etapa, segmentos: a.segmentos, saldo: a.saldo, proxima: proxima ? vistaClase(M, proxima, ahora) : null,
    ultimaVisita: a.ultimaVisita, visitas30: a.visitas30, etiquetas: c.etiquetas, fichaCompleta: fichaDe(c),
  };
}

export async function segmentos(ctx) {
  const M = await modelo(ctx), ahora = ctx.ahora();
  const totales = Object.fromEntries(SEGMENTOS.map((s) => [s.id, 0]));
  for (const c of M.clientas) for (const id of analizar(M, c, ahora).segmentos) totales[id]++;
  return SEGMENTOS.map((s) => ({ ...s, total: totales[s.id] }));
}

const ORDENES = {
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es"),
  reciente: (a, b) => (a.desde < b.desde ? 1 : a.desde > b.desde ? -1 : 0),
  saldo: (a, b) => b.saldo.clases - a.saldo.clases || a.nombre.localeCompare(b.nombre, "es"),
  visita: (a, b) => (a.ultimaVisita < b.ultimaVisita ? 1 : a.ultimaVisita > b.ultimaVisita ? -1 : 0),
};

export async function listarClientas(ctx, { segmento, q, orden } = {}) {
  const M = await modelo(ctx), ahora = ctx.ahora();
  let filas = M.clientas.map((c) => filaClienta(M, c, ahora));
  if (segmento) filas = filas.filter((f) => f.segmentos.includes(segmento) || f.etapa === segmento);
  const t = sinTilde(q || "");
  if (t) {
    const digitos = t.replace(/\D/g, "");
    filas = filas.filter((f) => sinTilde(f.nombre).includes(t) || sinTilde(f.correo).includes(t) ||
      (digitos.length >= 3 && f.whatsapp.includes(digitos)) || f.etiquetas.some((e) => sinTilde(e).includes(t)) || f.id.toLowerCase() === t);
  }
  return filas.sort(ORDENES[orden] || ORDENES.nombre);
}

export async function buscarPorWhatsApp(ctx, numero) {
  const M = await modelo(ctx);
  const c = M.clientaPorWa.get(R.normalizaWhatsApp(numero));
  return c ? filaClienta(M, c, ctx.ahora()) : null;
}

export async function buscarPorId(ctx, id) {
  const M = await modelo(ctx);
  const c = M.clientaPorId.get(String(id));
  return c ? filaClienta(M, c, ctx.ahora()) : null;
}

/** Timeline: bookings and payments from the Sheet, messages and other events from SQLite. */
function linea(ctx, M, c) {
  const out = [];
  for (const r of M.reservasDeClienta(c.id)) {
    const k = M.clasePorId.get(r.clase);
    const cuando = k ? R.fechaCorta(k.fecha) + " · " + R.horaLegible(k.hora) : r.clase;
    out.push({
      id: "reserva-" + r.id, ts: iso(r.creada) || (k ? new Date(R.inicioClase(k)).toISOString() : null),
      tipo: /^web/i.test(r.origen) ? "reserva-web" : "reserva", titulo: "Reserva " + cuando, detalle: r.estado + (r.origen ? " · " + r.origen : ""),
      clienta: c.id, clase: r.clase, actor: { tipo: "sistema", nombre: "" },
    });
  }
  for (const p of M.comprasDeClienta(c.id)) {
    out.push({
      id: "pago-" + p.id, ts: new Date(R.momentoMs(p.fecha, "12:00")).toISOString(), tipo: "pago", titulo: "Pagó " + p.plan,
      detalle: R.dinero(p.valor) + (p.medio ? " · " + p.medio : ""), clienta: c.id, actor: { tipo: "sistema", nombre: "" },
    });
  }
  for (const e of ctx.novedades.deClienta(c.id, 100)) if (!["reserva-web", "reserva", "pago"].includes(e.tipo)) out.push(e);
  return out.filter((e) => e.ts).sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 100);
}

export function detalleClienta(ctx, M, c) {
  const ahora = ctx.ahora(), hoy = R.hoyClave(ahora);
  const f = filaClienta(M, c, ahora);
  const reservas = M.reservasDeClienta(c.id).slice().sort((a, b) => (a.clase < b.clase ? 1 : -1)).map((r) => vistaReservaClienta(M, r, ahora));
  const d = {
    ...f, perfil: perfilDe(c), consentimientos: c.consentimientos, notas: c.notas,
    compras: M.comprasDeClienta(c.id).slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).map((p) => vistaCompra(M, p, hoy)),
    reservas, espera: M.espera.filter((e) => e.clienta === c.id && (e.estado === "Esperando" || e.estado === "Avisada")).map((e) => vistaEspera(M, e)),
    linea: linea(ctx, M, c),
  };
  try {
    const conv = ctx.whatsapp?.configurado && c.whatsapp ? ctx.whatsapp.resumenConversacion?.(c.whatsapp) : null;
    if (conv && typeof conv.then !== "function") d.conversacion = conv;
  } catch { /* the CRM inbox is optional */ }
  return d;
}

export async function verClienta(ctx, id) {
  const M = await modelo(ctx);
  const c = M.clientaPorId.get(id);
  if (!c) throw noExiste("No encontramos a esa clienta.");
  const d = detalleClienta(ctx, M, c);
  if (ctx.whatsapp?.configurado && c.whatsapp) {
    try { d.conversacion = (await ctx.whatsapp.resumenConversacion(c.whatsapp)) || undefined; } catch { /* optional */ }
  }
  return d;
}

/* ── writing a profile ─────────────────────────────────── */

const hayDatoDeSalud = (s) => Boolean(s && !SALUD_SIN_DATOS.includes(s));

/** Sheet columns for a (partial) profile. Only keys present in `perfil` are returned. */
export function columnasPerfil(perfil) {
  const o = {};
  if ("nombre" in perfil) o["Nombre"] = perfil.nombre;
  if ("whatsapp" in perfil) o["WhatsApp"] = perfil.whatsapp;
  if ("correo" in perfil) o["Correo"] = perfil.correo;
  if ("nacimiento" in perfil) o["Nacimiento"] = perfil.nacimiento;
  if ("barrio" in perfil) o["Barrio"] = perfil.barrio;
  if ("intereses" in perfil) o["Intereses"] = (perfil.intereses || []).join(" · ");
  if ("salud" in perfil) o["Salud"] = perfil.salud;
  if ("eps" in perfil) o["EPS"] = perfil.eps;
  if ("contactoEmergencia" in perfil) o["Contacto de emergencia"] = textoContacto(perfil.contactoEmergencia);
  if ("experiencia" in perfil) o["Experiencia"] = perfil.experiencia;
  if ("llego" in perfil) o["Cómo llegó"] = perfil.llego;
  return o;
}

/** Sheet columns for accepted agreements (the version is always the one this server serves). */
export function columnasConsentimientos(cons, hoy) {
  const o = {};
  if (cons?.datos) o["Acepta datos"] = textoConsentimiento(cons.datos.acepta, hoy, CONSENTIMIENTOS.datos.version);
  if (cons?.sensibles) o["Datos sensibles"] = textoConsentimiento(cons.sensibles.acepta, hoy, CONSENTIMIENTOS.sensibles.version);
  if (cons?.descargo) o["Descargo"] = textoConsentimiento(cons.descargo.acepta, hoy, CONSENTIMIENTOS.descargo.version);
  if (cons?.imagen) o["Autoriza imagen"] = cons.imagen.acepta ? "Sí" : "No";
  return o;
}

/** Only the blanks of an existing profile get filled (a web booking never overwrites anyone). */
export function soloVacios(c, columnas) {
  const actual = {
    "Nombre": c.nombre, "WhatsApp": c.whatsapp, "Correo": c.correo, "Nacimiento": c.nacimiento, "Barrio": c.barrio,
    "Intereses": c.intereses.join(" · "), "Salud": c.salud, "EPS": c.eps, "Contacto de emergencia": textoContacto(c.contacto),
    "Experiencia": c.experiencia, "Cómo llegó": c.llego,
    "Acepta datos": c.consentimientos.datos.fecha || c.consentimientos.datos.acepta ? "x" : "",
    "Datos sensibles": c.consentimientos.sensibles.fecha || c.consentimientos.sensibles.acepta ? "x" : "",
    "Descargo": c.consentimientos.descargo.fecha || c.consentimientos.descargo.acepta ? "x" : "",
    "Autoriza imagen": c.consentimientos.imagen.acepta === null ? "" : "x",
  };
  const o = {};
  for (const [k, v] of Object.entries(columnas)) if (v !== "" && v !== undefined && !actual[k]) o[k] = v;
  return o;
}

function exigirConsentimientoSalud(salud, sensiblesAcepta) {
  if (hayDatoDeSalud(salud) && !sensiblesAcepta) {
    throw validacion("Para guardar información de salud necesitamos tu autorización de datos sensibles.", {
      "consentimientos.sensibles": "Autoriza el uso de tus datos de salud o elige «" + SALUD_SIN_DATOS[1] + "».",
    });
  }
}

/** Creates a clienta row inside a transaction. Returns her id. */
export async function crearEnTx(tx, { perfil, consentimientos, notas = "", etiquetas = [], desde }) {
  const M = tx.M;
  const id = R.siguienteId("C", M.clientas.map((c) => c.id));
  const hoy = R.hoyClave(tx.ahora);
  await tx.agregar("Clientas", {
    "ID": id, "Desde": desde || hoy, ...columnasPerfil(perfil), ...columnasConsentimientos(consentimientos, hoy),
    "Notas": notas, "Etiquetas": textoEtiquetas(etiquetas, consentimientos?.novedades?.acepta === true),
  });
  return id;
}

/** Admin: a new clienta. */
export async function crearClienta(ctx, actor, input) {
  return transaccion(ctx, actor, async (tx) => {
    const otra = tx.M.clientaPorWa.get(input.whatsapp);
    if (otra) throw conflicto("estado", "Ese WhatsApp ya es de " + otra.nombre + " (" + otra.id + ").");
    exigirConsentimientoSalud(input.salud, input.consentimientos?.sensibles?.acepta);
    const { notas, etiquetas, consentimientos: cons, ...perfil } = input;
    const id = await crearEnTx(tx, { perfil, consentimientos: cons, notas: notas || "", etiquetas: etiquetas || [] });
    tx.auditar("clienta.crear", id, { campos: Object.keys(perfil) });
    tx.publicar({ tipo: "sistema", titulo: "Nueva clienta: " + perfil.nombre, clienta: id });
    return detalleClienta(ctx, tx.M, tx.M.clientaPorId.get(id));
  });
}

/** Admin: edit a profile, notes and tags. */
export async function editarClienta(ctx, actor, id, input) {
  return transaccion(ctx, actor, async (tx) => {
    const c = tx.M.clientaPorId.get(id);
    if (!c) throw noExiste("No encontramos a esa clienta.");
    if (input.whatsapp && input.whatsapp !== c.whatsapp) {
      const otra = tx.M.clientaPorWa.get(input.whatsapp);
      if (otra && otra.id !== id) throw conflicto("estado", "Ese WhatsApp ya es de " + otra.nombre + " (" + otra.id + ").");
    }
    if ("salud" in input) exigirConsentimientoSalud(input.salud, c.consentimientos.sensibles.acepta || input.consentimientos?.sensibles?.acepta);
    const { notas, etiquetas, consentimientos: cons, ...perfil } = input;
    const cambios = { ...columnasPerfil(perfil), ...columnasConsentimientos(cons, R.hoyClave(tx.ahora)) };
    if (notas !== undefined) cambios["Notas"] = notas;
    if (etiquetas !== undefined || cons?.novedades) {
      cambios["Etiquetas"] = textoEtiquetas(etiquetas ?? c.etiquetas, cons?.novedades ? cons.novedades.acepta === true : c.novedades);
    }
    if (Object.keys(cambios).length) await tx.actualizar("Clientas", c._fila, cambios);
    tx.auditar("clienta.editar", id, { campos: Object.keys(cambios).filter((k) => k !== "Salud") });
    return detalleClienta(ctx, tx.M, tx.M.clientaPorId.get(id));
  });
}

/** Clienta: her own profile. Her WhatsApp is her identity, so it changes only through Ana. */
export async function actualizarMiPerfil(ctx, actor, parcial) {
  if ("whatsapp" in parcial) throw validacion("Para cambiar tu WhatsApp escríbenos.", { whatsapp: "Para cambiar tu WhatsApp escríbenos." });
  return transaccion(ctx, actor, async (tx) => {
    const c = tx.M.clientaPorId.get(actor.id);
    if (!c) throw noExiste("No encontramos tu ficha.");
    if ("salud" in parcial) exigirConsentimientoSalud(parcial.salud, c.consentimientos.sensibles.acepta);
    const cambios = columnasPerfil(parcial);
    if (Object.keys(cambios).length) await tx.actualizar("Clientas", c._fila, cambios);
    tx.auditar("perfil.editar", c.id, { campos: Object.keys(cambios).filter((k) => k !== "Salud") });
    const n = tx.M.clientaPorId.get(c.id);
    return { perfil: perfilDe(n), fichaCompleta: fichaDe(n) };
  });
}

/** Clienta: accept or revoke agreements. Revoking the health consent also erases the health answer. */
export async function actualizarMisConsentimientos(ctx, actor, parcial) {
  return transaccion(ctx, actor, async (tx) => {
    const c = tx.M.clientaPorId.get(actor.id);
    if (!c) throw noExiste("No encontramos tu ficha.");
    const cambios = columnasConsentimientos(parcial, R.hoyClave(tx.ahora));
    if (parcial.sensibles && parcial.sensibles.acepta === false && hayDatoDeSalud(c.salud)) cambios["Salud"] = "";
    if (parcial.novedades) {
      cambios["Etiquetas"] = textoEtiquetas(c.etiquetas, parcial.novedades.acepta === true);
      if (parcial.novedades.acepta === true && ctx.whatsapp?.configurado && c.whatsapp) {
        tx.despues(() => ctx.whatsapp.optIn?.(c.whatsapp, "app"));
      }
    }
    if (Object.keys(cambios).length) await tx.actualizar("Clientas", c._fila, cambios);
    tx.auditar("consentimientos.editar", c.id, Object.fromEntries(Object.entries(parcial).map(([k, v]) => [k, Boolean(v?.acepta)])));
    return { consentimientos: tx.M.clientaPorId.get(c.id).consentimientos };
  });
}

/** For the WhatsApp module: she wrote «BAJA», so marketing messages stop (the tag goes away). */
export async function registrarBaja(ctx, actor, whatsapp) {
  const wa = R.normalizaWhatsApp(whatsapp);
  if (!wa) return false;
  const M0 = await modelo(ctx);
  if (!M0.clientaPorWa.get(wa)?.novedades) return false;
  return transaccion(ctx, actor, async (tx) => {
    const c = tx.M.clientaPorWa.get(wa);
    if (!c?.novedades) return false;
    await tx.actualizar("Clientas", c._fila, { "Etiquetas": textoEtiquetas(c.etiquetas, false) });
    tx.auditar("consentimientos.baja", c.id, { novedades: false, origen: "whatsapp" });
    return true;
  });
}

/** For the WhatsApp module: someone who wrote in becomes a lead (or is found). */
export async function crearLead(ctx, actor, { nombre, whatsapp }) {
  const wa = R.normalizaWhatsApp(whatsapp);
  if (!wa) throw validacion("WhatsApp inválido.");
  return transaccion(ctx, actor, async (tx) => {
    const ya = tx.M.clientaPorWa.get(wa);
    if (ya) return ya.id;
    const limpio = String(nombre || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Sin nombre";
    const id = await crearEnTx(tx, { perfil: { nombre: limpio, whatsapp: wa, llego: "Otro" }, consentimientos: {}, notas: "Escribió por WhatsApp" });
    tx.auditar("clienta.lead", id, { origen: "whatsapp" });
    return id;
  });
}
