// Casa Lotus · Google Ads offline conversions, in the shape Google Ads Data Manager imports:
//   Google Click ID | GBRAID | WBRAID | Order ID | Conversion Name | Conversion Time | Conversion Value | Conversion Currency
// - A conversion is a SALE: one row per purchase (Order ID = the purchase id P-xxxx, so re-uploads dedupe),
//   for a clienta whose first ad click (a booking carrying gclid / gbraid / wbraid) is at most 90 days old.
//   «Clase de prueba pagada» for a trial purchase, «Plan comprado» for any other plan.
//   Confirming a booking with a plan she already had creates no purchase, so no row.
// - gclid wins; gbraid only without gclid; wbraid only without both (never two click ids in one row).
// - Conversion Time is ISO 8601 with the Bogotá offset: 2026-10-03T08:00:00-05:00.
// - Destination: CONVERSIONES_SHEET_ID → the FIRST tab of that separate spreadsheet (Data Manager only reads
//   the first tab), kept to a rolling 90 days. Unset → the «Conversiones Ads» tab of the operating Sheet.
import { partesBogota } from "../../../shared/reglas.js";
import { transaccion, SISTEMA } from "../dominio/base.js";
import { citar } from "./sheets.js";

export const COLUMNAS_CONVERSION = ["Google Click ID", "GBRAID", "WBRAID", "Order ID", "Conversion Name", "Conversion Time", "Conversion Value", "Conversion Currency"];
export const NOMBRE_PRUEBA = "Clase de prueba pagada";
export const NOMBRE_PLAN = "Plan comprado";
export const PESTANA_RESPALDO = "Conversiones Ads";
const VENTANA_MS = 90 * 86400000;

const pad = (n) => String(n).padStart(2, "0");

/** "2026-10-03T08:00:00-05:00" for an epoch ms. */
export function isoBogota(ms) {
  const p = partesBogota(ms);
  return p.fecha + "T" + p.hora + ":" + pad(Math.floor(((Number(ms) % 60000) + 60000) % 60000 / 1000)) + "-05:00";
}

/** Her first ad click still inside Google's 90-day window, or null. */
export function clicDe(M, idClienta, ahora) {
  const clics = M.reservasDeClienta(idClienta)
    .filter((r) => r.creada && r.creada <= ahora && ahora - r.creada <= VENTANA_MS)
    .filter((r) => r.atribucion?.gclid || r.atribucion?.gbraid || r.atribucion?.wbraid)
    .sort((a, b) => a.creada - b.creada);
  return clics[0]?.atribucion || null;
}

/** The conversion row for a purchase, or null when it is not an ad-attributed sale. */
export function filaConversion(M, compra, ahora) {
  if (!compra || !(Number(compra.valor) > 0) || compra.tipoPlan === "Ajuste") return null;
  const a = clicDe(M, compra.clienta, ahora);
  if (!a) return null;
  return {
    "Google Click ID": a.gclid || "",
    "GBRAID": !a.gclid && a.gbraid ? a.gbraid : "",
    "WBRAID": !a.gclid && !a.gbraid && a.wbraid ? a.wbraid : "",
    "Order ID": compra.id,
    "Conversion Name": compra.tipoPlan === "Prueba" ? NOMBRE_PRUEBA : NOMBRE_PLAN,
    "Conversion Time": isoBogota(ahora),
    "Conversion Value": String(Math.round(Number(compra.valor))),
    "Conversion Currency": "COP",
  };
}

/** A separate spreadsheet: its first tab, RAW writes (text stays text: the ISO time is never re-parsed). */
export function destinoHojaSeparada({ cliente, sheetId, log, ahora = () => Date.now() }) {
  let cola = Promise.resolve();
  const enCola = (fn) => { const p = cola.then(fn, fn); cola = p.catch(() => {}); return p; };

  async function primera() {
    const r = await cliente.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets(properties(sheetId,title,index))" });
    const p = (r.data.sheets || []).map((s) => s.properties).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0];
    if (!p) throw new Error("la hoja de conversiones no tiene pestañas");
    return { id: p.sheetId, titulo: p.title };
  }

  async function leer(titulo) {
    const r = await cliente.spreadsheets.values.batchGet({ spreadsheetId: sheetId, ranges: [citar(titulo)], majorDimension: "ROWS", valueRenderOption: "UNFORMATTED_VALUE" });
    return r.data.valueRanges?.[0]?.values || [];
  }

  /** Row 1 = the spec's headers (missing ones are added at the end, nothing is moved). */
  async function encabezados(titulo, filas) {
    const enc = (filas[0] || []).map((h) => String(h ?? "").trim());
    const faltan = COLUMNAS_CONVERSION.filter((c) => !enc.includes(c));
    if (!faltan.length) return enc;
    const nuevos = enc.some(Boolean) ? [...enc, ...faltan] : [...COLUMNAS_CONVERSION];
    await cliente.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId, requestBody: { valueInputOption: "RAW", data: [{ range: citar(titulo) + "!A1", majorDimension: "ROWS", values: [nuevos] }] },
    });
    return nuevos;
  }

  return {
    destino: "hoja-separada",
    registrar(fila) {
      return enCola(async () => {
        const { titulo } = await primera();
        const filas = await leer(titulo);
        const enc = await encabezados(titulo, filas);
        const iOrden = enc.indexOf("Order ID");
        if (filas.slice(1).some((f) => String(f[iOrden] ?? "") === fila["Order ID"])) return "repetida";
        await cliente.spreadsheets.values.append({
          spreadsheetId: sheetId, range: citar(titulo) + "!A1", valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
          requestBody: { values: [enc.map((h) => fila[h] ?? "")] },
        });
        log?.info("conversión registrada", { orden: fila["Order ID"], nombre: fila["Conversion Name"] });
        return "ok";
      });
    },
    /** Rolling 90 days: rows whose Conversion Time is older are deleted (bottom-up, one request). */
    podar() {
      return enCola(async () => {
        const { id, titulo } = await primera();
        const filas = await leer(titulo);
        const iT = (filas[0] || []).map((h) => String(h ?? "").trim()).indexOf("Conversion Time");
        if (iT < 0) return 0;
        const limite = ahora() - VENTANA_MS;
        const viejas = [];
        filas.forEach((f, i) => {
          if (i === 0) return;
          const t = Date.parse(String(f[iT] ?? ""));
          if (Number.isFinite(t) && t < limite) viejas.push(i);
        });
        if (!viejas.length) return 0;
        const tramos = [];
        for (const i of viejas) {
          const u = tramos[tramos.length - 1];
          if (u && u[1] === i - 1) u[1] = i; else tramos.push([i, i]);
        }
        const requests = tramos.reverse().map(([a, b]) => ({ deleteDimension: { range: { sheetId: id, dimension: "ROWS", startIndex: a, endIndex: b + 1 } } }));
        await cliente.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests } });
        log?.info("conversiones viejas borradas", { filas: viejas.length });
        return viejas.length;
      });
    },
    async describir() {
      try {
        const { titulo } = await primera();
        return { destino: "hoja-separada", sheetId, pestana: titulo, ok: true };
      } catch (e) {
        return { destino: "hoja-separada", sheetId, ok: false, error: "No pude abrir la hoja de conversiones: ¿la cuenta de servicio es Editora?" };
      }
    },
  };
}

/** The «Conversiones Ads» tab of the operating Sheet (fallback). Writes only the columns the tab has. */
export function destinoPestana(ctx) {
  return {
    destino: "pestaña",
    async registrar(fila) {
      return transaccion(ctx, SISTEMA, async (tx) => {
        const M = tx.M, p = PESTANA_RESPALDO;
        if (!M.tienePestana(p)) return "sin-pestana";
        const t = ctx.datos.instantanea().tablas[p];
        if (M.tieneColumna(p, "Order ID") && t.filas.some((f) => String(f["Order ID"] ?? "") === fila["Order ID"])) return "repetida";
        const util = Object.fromEntries(Object.entries(fila).filter(([h]) => M.tieneColumna(p, h)));
        if (!util["Google Click ID"] && !util["GBRAID"] && !util["WBRAID"]) return "sin-columna-de-clic";
        await tx.agregar(p, util);
        return "ok";
      });
    },
    async podar() { return 0; }, // never delete rows from the operating Sheet
    async describir() {
      const d = await ctx.datos.describir();
      return { destino: "pestaña", sheetId: "", pestana: PESTANA_RESPALDO, ok: !(d.faltan || []).includes(PESTANA_RESPALDO) };
    },
  };
}
