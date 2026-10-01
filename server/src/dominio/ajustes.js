// Casa Lotus · the studio's settings (tab Ajustes). Missing rows are appended with their default the
// first time the server sees the Sheet; Ana's values are never overwritten by the server on its own.
import * as R from "../../../shared/reglas.js";
import { modelo, transaccion, SISTEMA } from "./base.js";
import { AJUSTES, AJUSTES_NUMERICOS } from "../datos/esquema.js";
import { validacion } from "../errores.js";

const AYUDA = Object.fromEntries(AJUSTES.map(([k, , a]) => [k, a]));

export async function asegurarAjustes(ctx) {
  const M = await modelo(ctx, { fresco: true });
  if (!M.tienePestana("Ajustes")) return 0;
  if (AJUSTES.every(([k]) => M.ajustesPresentes.has(k))) return 0;
  return transaccion(ctx, SISTEMA, async (tx) => {
    const faltan = AJUSTES.filter(([k]) => !tx.M.ajustesPresentes.has(k));
    await tx.agregarVarios("Ajustes", faltan.map(([k, v, a]) => ({ "Ajuste": k, "Valor": v, "Para qué sirve": a })));
    if (faltan.length) tx.auditar("ajustes.completar", "", { agregados: faltan.map(([k]) => k) });
    return faltan.length;
  });
}

function listar(M) {
  const vistos = new Set();
  const out = [];
  for (const [k] of AJUSTES) {
    vistos.add(k);
    const crudo = M.ajustesCrudo[k];
    out.push({ ajuste: k, valor: crudo === undefined ? M.ajustes[k] ?? "" : crudo, ayuda: AYUDA[k] });
  }
  for (const [k, v] of Object.entries(M.ajustesCrudo)) if (!vistos.has(k)) out.push({ ajuste: k, valor: v, ayuda: "" });
  return out;
}

export async function verAjustes(ctx) {
  return listar(await modelo(ctx));
}

function normalizar(k, v) {
  if (k === "Pago por clase a profes" && (v === "" || v === null)) return "";
  if (AJUSTES_NUMERICOS.has(k)) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 10000000) throw validacion("Revisa el valor de «" + k + "».", { [k]: "Escribe un número." });
    return n;
  }
  const t = String(v ?? "").trim().slice(0, 200);
  if (k === "WhatsApp de reservas") {
    const wa = R.normalizaWhatsApp(t);
    if (!wa) throw validacion("Revisa el WhatsApp de reservas.", { [k]: "Escribe un celular de 10 dígitos." });
    return wa;
  }
  if (k === "Correo para avisos" && t && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) throw validacion("Revisa el correo.", { [k]: "Escribe un correo válido o déjalo vacío." });
  if (k === "Llave de pago" && /\d{11,}/.test(t.replace(/\s/g, "")) && !R.normalizaWhatsApp(t)) {
    throw validacion("La llave de pago no puede ser un número de cuenta.", { [k]: "Usa la llave de Nequi / DaviPlata / Bre-B." });
  }
  return t;
}

export async function editarAjustes(ctx, actor, cambios) {
  const entradas = Object.entries(cambios || {});
  if (!entradas.length) throw validacion("No hay cambios.");
  if (entradas.length > 30) throw validacion("Demasiados cambios a la vez.");
  return transaccion(ctx, actor, async (tx) => {
    const filas = new Map();
    const snapFilas = ctx.datos.instantanea().tablas["Ajustes"]?.filas || [];
    for (const f of snapFilas) filas.set(String(f["Ajuste"] ?? "").trim(), f._fila);
    const nuevos = [];
    for (const [k, v] of entradas) {
      const clave = String(k).trim().slice(0, 80);
      if (!clave) continue;
      const valor = normalizar(clave, v);
      if (filas.has(clave)) await tx.actualizar("Ajustes", filas.get(clave), { "Valor": valor });
      else nuevos.push({ "Ajuste": clave, "Valor": valor, "Para qué sirve": AYUDA[clave] || "" });
    }
    if (nuevos.length) await tx.agregarVarios("Ajustes", nuevos);
    tx.auditar("ajustes.editar", "", Object.fromEntries(entradas.map(([k, v]) => [k, k === "Pago por clase a profes" ? "(oculto)" : v])));
    return listar(tx.M);
  });
}
