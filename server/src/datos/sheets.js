// Casa Lotus · Google Sheets driver (Sheets API v4 through a service account).
// The Sheet «Casa Lotus · Sistema» stays the business record. This driver:
//  - reads every tab in one values.batchGet (UNFORMATTED_VALUE + SERIAL_NUMBER) plus the header row
//    with FORMULA, to know which columns are typed (no formula in row 1) and which are calculated;
//  - keeps a ~20 s snapshot, invalidated by every write (writes also patch it, so a transaction sees
//    its own changes without another round trip);
//  - appends at the first row after the last non-empty column A, growing the grid (and copying the
//    last row's formats and dropdowns) when it runs out of rows;
//  - writes only typed columns, with USER_ENTERED, escaping free text so nothing becomes a formula.
import { PESTANAS, NOMBRES_PESTANAS, tipoColumna } from "./esquema.js";
import { escaparTexto } from "./celdas.js";
import { ErrorApp } from "../errores.js";

const ALCANCE = ["https://www.googleapis.com/auth/spreadsheets"];

/** A real Sheets client from service account credentials. */
export async function clienteGoogle(credenciales) {
  const { sheets } = await import("@googleapis/sheets");
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({ credentials: credenciales, scopes: ALCANCE });
  return sheets({ version: "v4", auth });
}

export const citar = (pestana) => "'" + String(pestana).replace(/'/g, "''") + "'";

/** 0 → A, 25 → Z, 26 → AA. */
export function letraColumna(i) {
  let s = "", n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Headers whose row-1 cell holds no formula. formulas: row 1 read with valueRenderOption FORMULA. */
export function columnasEscritas(encabezados, formulas = []) {
  const out = new Set();
  encabezados.forEach((h, j) => {
    const f = formulas[j];
    if (h && !(typeof f === "string" && f.trim().startsWith("="))) out.add(h);
  });
  return out;
}

/** Contiguous runs [desde, hasta] (0-based, inclusive) of the given column indexes. */
export function bloques(indices) {
  const orden = [...new Set(indices)].sort((a, b) => a - b);
  const out = [];
  for (const i of orden) {
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo[1] === i - 1) ultimo[1] = i;
    else out.push([i, i]);
  }
  return out;
}

/** Builds a table from a values block (rows of cells) and its row-1 formulas. */
export function construirTabla(valores = [], formulas = []) {
  const encabezados = (valores[0] || []).map((h) => String(h ?? "").trim());
  const escritas = columnasEscritas(encabezados, formulas);
  const filas = [];
  let ultima = 1;
  for (let i = 1; i < valores.length; i++) {
    const v = valores[i] || [];
    if (v[0] === "" || v[0] === null || v[0] === undefined) continue;
    ultima = i + 1;
    const fila = { _fila: i + 1 };
    encabezados.forEach((h, j) => { if (h) fila[h] = v[j] === undefined ? "" : v[j]; });
    filas.push(fila);
  }
  return { columnas: encabezados, escritas, filas, filaLibre: ultima + 1 };
}

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

function errorGoogle(e, log, que) {
  const status = e?.response?.status || e?.code;
  log?.error("Sheets API falló", { que, status, error: e?.message });
  return new ErrorApp("servidor", "No pudimos conectar con la hoja del estudio. Intenta de nuevo en un momento.", { status: 502 });
}

/**
 * cliente: a googleapis Sheets v4 client (or a fake with the same methods, in tests).
 * ttlMs: snapshot lifetime.
 */
export function crearDriverSheets({ cliente, sheetId, log, ttlMs = 20000, ahora = () => Date.now() }) {
  let meta = null; // { zona, pestanas: { title: { id, filas, columnas } } }
  let snap = null;
  let vence = 0;
  let cargando = null;
  let version = 1;
  let ultimoError = null;
  const faltanEscritura = new Set();

  async function conReintentos(fn, que) {
    let ultimo;
    for (let intento = 0; intento < 3; intento++) {
      try {
        return await fn();
      } catch (e) {
        ultimo = e;
        const status = e?.response?.status || e?.code;
        if (![429, 500, 502, 503, 504, "ECONNRESET", "ETIMEDOUT"].includes(status)) break;
        await esperar(400 * (intento + 1) ** 2);
      }
    }
    throw errorGoogle(ultimo, log, que);
  }

  async function cargarMeta() {
    const r = await conReintentos(() => cliente.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: "properties(timeZone),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))",
    }), "metadatos");
    const pestanas = {};
    for (const s of r.data.sheets || []) {
      const p = s.properties;
      pestanas[p.title] = { id: p.sheetId, filas: p.gridProperties?.rowCount || 1000, columnas: p.gridProperties?.columnCount || 26 };
    }
    meta = { zona: r.data.properties?.timeZone || "", pestanas };
    return meta;
  }

  async function cargar() {
    const m = await cargarMeta();
    const presentes = NOMBRES_PESTANAS.filter((t) => m.pestanas[t]);
    const [vals, forms] = await Promise.all([
      conReintentos(() => cliente.spreadsheets.values.batchGet({
        spreadsheetId: sheetId, ranges: presentes.map(citar), majorDimension: "ROWS",
        valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER",
      }), "valores"),
      conReintentos(() => cliente.spreadsheets.values.batchGet({
        spreadsheetId: sheetId, ranges: presentes.map((t) => citar(t) + "!1:1"), majorDimension: "ROWS", valueRenderOption: "FORMULA",
      }), "encabezados"),
    ]);
    const tablas = {};
    presentes.forEach((t, i) => {
      tablas[t] = construirTabla(vals.data.valueRanges?.[i]?.values || [], forms.data.valueRanges?.[i]?.values?.[0] || []);
    });
    const faltan = [];
    for (const [nombre, def] of Object.entries(PESTANAS)) {
      if (!tablas[nombre]) { faltan.push(nombre); continue; }
      for (const [h] of def.columnas) if (!tablas[nombre].escritas.has(h)) faltan.push(nombre + "." + h);
    }
    for (const f of faltanEscritura) if (!faltan.includes(f)) faltan.push(f);
    snap = { version: ++version, leidoEn: ahora(), tablas, faltan, zona: m.zona };
    vence = ahora() + ttlMs;
    ultimoError = null;
    return snap;
  }

  async function leer({ fresco = false } = {}) {
    if (!fresco && snap && ahora() < vence) return snap;
    if (!fresco && cargando) return cargando;
    const p = cargar().catch((e) => { ultimoError = e.message; throw e; });
    if (!fresco) cargando = p.finally(() => { cargando = null; });
    return p;
  }

  function tabla(pestana) {
    const t = snap?.tablas[pestana];
    if (!t) throw new ErrorApp("servidor", "A la hoja le falta la pestaña «" + pestana + "».", { status: 500 });
    return t;
  }

  /** Cell value as sent with USER_ENTERED. */
  function valorEnviado(pestana, h, v) {
    if (v === undefined || v === null) return "";
    const tipo = tipoColumna(pestana, h);
    if ((tipo === "texto" || tipo === "valor") && typeof v === "string") return escaparTexto(v);
    return v;
  }

  async function crecer(pestana, hastaFila) {
    const p = meta.pestanas[pestana];
    if (hastaFila <= p.filas) return;
    const mas = hastaFila - p.filas + 100;
    await conReintentos(() => cliente.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [
          { appendDimension: { sheetId: p.id, dimension: "ROWS", length: mas } },
          {
            copyPaste: {
              source: { sheetId: p.id, startRowIndex: p.filas - 1, endRowIndex: p.filas, startColumnIndex: 0, endColumnIndex: p.columnas },
              destination: { sheetId: p.id, startRowIndex: p.filas, endRowIndex: p.filas + mas, startColumnIndex: 0, endColumnIndex: p.columnas },
              pasteType: "PASTE_FORMAT",
            },
          },
        ],
      },
    }), "crecer");
    p.filas += mas;
    log?.info("hoja ampliada", { pestana, filas: p.filas });
  }

  async function escribirCeldas(data, que) {
    if (!data.length) return;
    try {
      await cliente.spreadsheets.values.batchUpdate({ spreadsheetId: sheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
    } catch (e) {
      vence = 0;
      throw errorGoogle(e, log, que);
    }
  }

  return {
    tipo: "sheets",
    leer,
    instantanea: () => snap,
    version: () => snap?.version ?? 0,
    invalidar() { vence = 0; },

    async agregar(pestana, objetos) {
      if (!objetos.length) return [];
      if (!snap) await leer({ fresco: true });
      const t = tabla(pestana);
      const desde = t.filaLibre, hasta = desde + objetos.length - 1;
      await crecer(pestana, hasta);
      for (const o of objetos) for (const k of Object.keys(o)) if (!t.escritas.has(k)) faltanEscritura.add(pestana + "." + k);
      const indices = t.columnas.map((h, j) => (h && t.escritas.has(h) ? j : -1)).filter((j) => j >= 0);
      const data = bloques(indices).map(([a, b]) => ({
        range: citar(pestana) + "!" + letraColumna(a) + desde + ":" + letraColumna(b) + hasta,
        majorDimension: "ROWS",
        values: objetos.map((o) => t.columnas.slice(a, b + 1).map((h) => valorEnviado(pestana, h, o[h]))),
      }));
      await escribirCeldas(data, "agregar " + pestana);
      const filas = objetos.map((o, i) => {
        const fila = { _fila: desde + i };
        for (const h of t.columnas) if (h) fila[h] = t.escritas.has(h) && o[h] !== undefined ? o[h] : "";
        t.filas.push(fila);
        return fila._fila;
      });
      t.filaLibre = hasta + 1;
      snap.version = ++version;
      vence = 0;
      return filas;
    },

    async actualizar(pestana, numFila, cambios) {
      if (!snap) await leer({ fresco: true });
      const t = tabla(pestana);
      const indices = [];
      for (const k of Object.keys(cambios)) {
        const j = t.columnas.indexOf(k);
        if (j < 0 || !t.escritas.has(k)) { faltanEscritura.add(pestana + "." + k); continue; }
        indices.push(j);
      }
      const data = bloques(indices).map(([a, b]) => ({
        range: citar(pestana) + "!" + letraColumna(a) + numFila + ":" + letraColumna(b) + numFila,
        majorDimension: "ROWS",
        values: [t.columnas.slice(a, b + 1).map((h) => valorEnviado(pestana, h, cambios[h]))],
      }));
      await escribirCeldas(data, "actualizar " + pestana);
      const fila = t.filas.find((f) => f._fila === numFila);
      if (fila) for (const j of indices) fila[t.columnas[j]] = cambios[t.columnas[j]];
      snap.version = ++version;
      vence = 0;
    },

    async describir() {
      try {
        const s = await leer();
        return { tipo: "sheets", ok: true, faltan: s.faltan, zona: s.zona };
      } catch {
        return { tipo: "sheets", ok: false, faltan: [], error: ultimoError || "No se pudo leer la hoja." };
      }
    },
  };
}
