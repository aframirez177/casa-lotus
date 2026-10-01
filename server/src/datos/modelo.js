// Casa Lotus · from Sheet rows to plain domain objects (and back).
// The model is rebuilt from a snapshot in memory (hundreds of rows), memoized per snapshot version.
// Nothing here reads a calculated column: balances, occupancy and expiries come from shared/reglas.js.
import { ESTADO, OCUPAN, horaTexto, normalizaWhatsApp, sumarDias, diaDeSemana } from "../../../shared/reglas.js";
import { INTERESES, CONSENTIMIENTOS } from "../../../shared/consentimientos.js";
import { AJUSTES, AJUSTES_NUMERICOS, PESTANAS, tipoColumna } from "./esquema.js";
import { aCelda, leerCelda, leerFecha } from "./celdas.js";

const filasDe = (snap, pestana) => snap.tablas[pestana]?.filas || [];

/** Reads one row by column kinds: { _fila, "ID": "C-0001", "Desde": "2026-10-01", … }. */
function leerFila(pestana, fila) {
  const o = { _fila: fila._fila };
  for (const [h, v] of Object.entries(fila)) if (h !== "_fila") o[h] = leerCelda(tipoColumna(pestana, h), v);
  return o;
}

/** Domain values → cell values for a write (by column kind). */
export function aFila(pestana, obj) {
  const out = {};
  for (const [h, v] of Object.entries(obj)) out[h] = aCelda(tipoColumna(pestana, h), v);
  return out;
}

export const sinTilde = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/* ── clientas: perfil and consents stored as readable text ── */

/** "Sí · 2026-10-01 · datos-v1" → { acepta, fecha, version }. */
export function leerConsentimiento(v, { imagen = false } = {}) {
  if (typeof v === "boolean") return imagen ? { acepta: v, fecha: "" } : { acepta: v, fecha: "", version: "" };
  if (typeof v === "number") return imagen ? { acepta: true, fecha: "" } : { acepta: true, fecha: leerFecha(v), version: "" };
  const t = String(v ?? "").trim();
  if (!t) return imagen ? { acepta: null, fecha: "" } : { acepta: false, fecha: "", version: "" };
  const no = /^no\b/i.test(t);
  const fecha = (t.match(/\d{4}-\d{2}-\d{2}/) || [""])[0];
  const version = (t.match(/\b[a-z]+-v\d+\b/i) || [""])[0];
  return imagen ? { acepta: !no, fecha } : { acepta: !no, fecha, version };
}

export function textoConsentimiento(acepta, fecha, version) {
  return [acepta ? "Sí" : "No", fecha, version].filter(Boolean).join(" · ");
}

export function leerContacto(v) {
  const t = String(v ?? "").trim();
  if (!t) return { nombre: "", whatsapp: "" };
  const partes = t.split(/\s*·\s*/);
  if (partes.length > 1) {
    const wa = normalizaWhatsApp(partes[partes.length - 1]);
    if (wa) return { nombre: partes.slice(0, -1).join(" · "), whatsapp: wa };
  }
  const m = t.match(/(\+?\d[\d\s-]{8,}\d)\s*$/);
  if (m && normalizaWhatsApp(m[1])) return { nombre: t.slice(0, m.index).replace(/[\s,·-]+$/, ""), whatsapp: normalizaWhatsApp(m[1]) };
  return { nombre: t, whatsapp: "" };
}

export function textoContacto(c) {
  if (!c) return "";
  const wa = normalizaWhatsApp(c.whatsapp);
  const legible = wa ? wa.slice(2, 5) + " " + wa.slice(5, 8) + " " + wa.slice(8) : "";
  return [String(c.nombre || "").trim(), legible].filter(Boolean).join(" · ");
}

export function leerIntereses(v) {
  const t = String(v ?? "").trim();
  if (!t) return [];
  const conocidos = INTERESES.filter((l) => t.includes(l));
  if (conocidos.length) return conocidos.slice(0, 2);
  return t.split(/\s*·\s*/).filter(Boolean).slice(0, 2);
}

const lista = (v) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Marketing opt-in lives as this tag in «Etiquetas» until the Sheet has its own column. */
export const ETIQUETA_NOVEDADES = "novedades-whatsapp";

/** «Etiquetas» cell from the visible tags plus the opt-in tag. */
export function textoEtiquetas(visibles, novedades) {
  const t = (visibles || []).filter((e) => e && e !== ETIQUETA_NOVEDADES);
  if (novedades) t.push(ETIQUETA_NOVEDADES);
  return t.join(", ");
}

/* ── the model ─────────────────────────────────────────── */

export function ajustesDe(snap) {
  const crudo = {};
  for (const f of filasDe(snap, "Ajustes")) {
    const k = String(f["Ajuste"] ?? "").trim();
    if (k) crudo[k] = f["Valor"];
  }
  const out = {};
  for (const [k, def] of AJUSTES) {
    const v = crudo[k];
    if (AJUSTES_NUMERICOS.has(k)) {
      if (k === "Pago por clase a profes") out[k] = v === "" || v === undefined || v === null || !Number(v) ? null : Number(v);
      else out[k] = v === "" || v === undefined || v === null || !Number.isFinite(Number(v)) ? def : Number(v);
    } else {
      out[k] = v === undefined || v === null ? def : String(v).trim();
    }
  }
  if (!out["WhatsApp de reservas"]) out["WhatsApp de reservas"] = "573128720888";
  out["WhatsApp de reservas"] = normalizaWhatsApp(out["WhatsApp de reservas"]) || String(out["WhatsApp de reservas"]).replace(/\D/g, "");
  return { valores: out, crudo, presentes: new Set(Object.keys(crudo)) };
}

export function construirModelo(snap) {
  const aj = ajustesDe(snap);
  const ajustes = aj.valores;

  const planes = filasDe(snap, "Planes").map((f) => leerFila("Planes", f)).filter((p) => p["Plan"]).map((p) => ({
    nombre: p["Plan"], clases: p["Clases"], precio: p["Precio"], vigencia: p["Vigencia (días)"] || 30, tipo: p["Tipo"] || "Mensual",
    activo: String(p["Activo"]).trim() !== "No", _fila: p._fila,
  }));
  const planPorNombre = new Map(planes.map((p) => [p.nombre, p]));

  const clases = filasDe(snap, "Clases").map((f) => leerFila("Clases", f)).filter((c) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(c["ID"])).map((c) => {
    const fecha = c["Fecha"] || c["ID"].slice(0, 10);
    const hora = c["Hora"] || c["ID"].slice(11);
    return {
      id: c["ID"], fecha, dia: c["Día"] || diaDeSemana(fecha), hora: horaTexto(hora), clase: c["Clase"], profe: c["Profe"],
      cupos: c["Cupos"] || ajustes["Cupos por clase"], estado: c["Estado"] === "Cancelada" ? "Cancelada" : "Programada",
      notas: c["Notas"] || "", tipo: c["Tipo"] === "Extra" ? "Extra" : "Regular", _fila: c._fila,
    };
  }).sort((a, b) => (a.id < b.id ? -1 : 1));

  const reservas = filasDe(snap, "Reservas").map((f) => leerFila("Reservas", f)).filter((r) => r["ID"]).map((r) => {
    let atribucion = {};
    if (r["Atribución"]) try { atribucion = JSON.parse(r["Atribución"]) || {}; } catch { atribucion = {}; }
    return {
      id: r["ID"], creada: r["Creada"], clase: r["Clase"], clienta: r["Clienta"], estado: r["Estado"] || ESTADO.PENDIENTE,
      compra: r["Compra"] || "", origen: r["Origen"] || "", vence: r["Vence apartado"], notas: r["Notas"] || "",
      reagendadaDe: r["Reagendada de"] || "", atribucion, _fila: r._fila,
    };
  });

  const clientas = filasDe(snap, "Clientas").map((f) => leerFila("Clientas", f)).filter((c) => c["ID"]).map((c) => {
    const tags = lista(c["Etiquetas"]);
    const novedades = tags.includes(ETIQUETA_NOVEDADES);
    return {
    id: c["ID"], nombre: c["Nombre"] || "", whatsapp: normalizaWhatsApp(c["WhatsApp"]) || c["WhatsApp"] || "", correo: c["Correo"] || "",
    desde: c["Desde"] || "", llego: c["Cómo llegó"] || "", notas: c["Notas"] || "", nacimiento: c["Nacimiento"] || "",
    barrio: c["Barrio"] || "", intereses: leerIntereses(c["Intereses"]), salud: c["Salud"] || "", eps: c["EPS"] || "",
    contacto: leerContacto(c["Contacto de emergencia"]), experiencia: c["Experiencia"] || "",
    consentimientos: {
      datos: leerConsentimiento(c["Acepta datos"]),
      sensibles: leerConsentimiento(c["Datos sensibles"]),
      descargo: leerConsentimiento(c["Descargo"]),
      imagen: leerConsentimiento(c["Autoriza imagen"], { imagen: true }),
      novedades: { acepta: novedades, fecha: "", version: novedades ? CONSENTIMIENTOS.novedades.version : "" },
    },
    novedades, etiquetas: tags.filter((t) => t !== ETIQUETA_NOVEDADES), _fila: c._fila,
    };
  });

  const compras = filasDe(snap, "Compras").map((f) => leerFila("Compras", f)).filter((c) => c["ID"]).map((c) => {
    const plan = planPorNombre.get(c["Plan"]);
    const inicio = c["Inicio"] || c["Fecha"];
    return {
      id: c["ID"], fecha: c["Fecha"] || inicio, clienta: c["Clienta"], plan: c["Plan"] || "", clases: c["Clases"] || plan?.clases || 0,
      valor: c["Valor"], medio: c["Medio de pago"] || "", inicio, vence: inicio ? sumarDias(inicio, (plan?.vigencia || 30) - 1) : "",
      notas: c["Notas"] || "", tipoPlan: plan?.tipo || "", _fila: c._fila,
    };
  });

  const espera = filasDe(snap, "Espera").map((f) => leerFila("Espera", f)).filter((e) => e["ID"]).map((e) => ({
    id: e["ID"], creada: e["Creada"], clase: e["Clase"], clienta: e["Clienta"], estado: e["Estado"] || "Esperando", notas: e["Notas"] || "", _fila: e._fila,
  }));

  const horario = filasDe(snap, "Horario").map((f) => leerFila("Horario", f)).filter((h) => h["Día"] && h["Hora"]).map((h) => ({
    id: h["Día"] + " " + horaTexto(h["Hora"]), dia: h["Día"], hora: horaTexto(h["Hora"]), clase: h["Clase"] || "", profe: h["Profe"] || "",
    cupos: h["Cupos"] || ajustes["Cupos por clase"], activa: String(h["Activa"]).trim() === "Sí", _fila: h._fila,
  }));

  // indexes
  const clasePorId = new Map(clases.map((c) => [c.id, c]));
  const clientaPorId = new Map(clientas.map((c) => [c.id, c]));
  const clientaPorWa = new Map();
  for (const c of clientas) if (c.whatsapp && !clientaPorWa.has(c.whatsapp)) clientaPorWa.set(c.whatsapp, c);
  const reservaPorId = new Map(reservas.map((r) => [r.id, r]));
  const compraPorId = new Map(compras.map((c) => [c.id, c]));
  const porClase = new Map(), porClienta = new Map(), comprasPorClienta = new Map(), esperaPorClase = new Map();
  for (const r of reservas) {
    if (!porClase.has(r.clase)) porClase.set(r.clase, []);
    porClase.get(r.clase).push(r);
    if (!porClienta.has(r.clienta)) porClienta.set(r.clienta, []);
    porClienta.get(r.clienta).push(r);
  }
  for (const c of compras) {
    if (!comprasPorClienta.has(c.clienta)) comprasPorClienta.set(c.clienta, []);
    comprasPorClienta.get(c.clienta).push(c);
  }
  for (const e of espera) {
    if (!esperaPorClase.has(e.clase)) esperaPorClase.set(e.clase, []);
    esperaPorClase.get(e.clase).push(e);
  }

  return {
    version: snap.version, ajustes, ajustesPresentes: aj.presentes, ajustesCrudo: aj.crudo,
    planes, planPorNombre, clases, reservas, clientas, compras, espera, horario,
    clasePorId, clientaPorId, clientaPorWa, reservaPorId, compraPorId,
    reservasDeClase: (id) => porClase.get(id) || [],
    reservasDeClienta: (id) => porClienta.get(id) || [],
    comprasDeClienta: (id) => comprasPorClienta.get(id) || [],
    esperaDeClase: (id) => esperaPorClase.get(id) || [],
    ocupados: (id) => (porClase.get(id) || []).filter((r) => OCUPAN.includes(r.estado)).length,
    tienePestana: (p) => Boolean(snap.tablas[p]),
    tieneColumna: (p, h) => Boolean(snap.tablas[p]?.escritas?.has(h)),
    faltan: snap.faltan || [],
  };
}

/** Typed columns that exist in the snapshot (for reporting). */
export function columnasEsperadas() {
  return Object.fromEntries(Object.entries(PESTANAS).map(([p, d]) => [p, d.columnas.map(([h]) => h)]));
}
