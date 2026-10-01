// The Google Sheets driver against a fake Sheets client: serial dates, typed vs calculated columns,
// writes limited to typed columns (escaped, USER_ENTERED), grid growth, missing columns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { serialAPartes, serialAMs, fechaASerial, msASerial, leerClaseId, leerHora, leerFecha, escaparTexto } from "../src/datos/celdas.js";
import { crearDriverSheets, columnasEscritas, construirTabla, letraColumna, bloques } from "../src/datos/sheets.js";
import { construirModelo, aFila } from "../src/datos/modelo.js";
import { PESTANAS } from "../src/datos/esquema.js";

test("serial dates are Bogotá wall-clock (1899-12-30 epoch)", () => {
  assert.equal(fechaASerial("2026-10-03"), 46298);
  assert.deepEqual(serialAPartes(46298), { fecha: "2026-10-03", hora: "00:00", segundos: 0 });
  assert.deepEqual(serialAPartes(46298.75), { fecha: "2026-10-03", hora: "18:00", segundos: 0 });
  assert.equal(serialAMs(46298.75), Date.parse("2026-10-03T18:00:00-05:00"));
  const ms = Date.parse("2026-10-01T23:30:15-05:00");
  assert.equal(serialAMs(msASerial(ms)), ms, "round trip to the second");
  assert.equal(leerClaseId(46298 + 8 / 24), "2026-10-03 08:00", "a class id Sheets turned into a date-time");
  assert.equal(leerClaseId("2026-10-03 8:00"), "2026-10-03 08:00");
  assert.equal(leerHora(0.385416666), "09:15");
  assert.equal(leerFecha("3/10/2026"), "2026-10-03");
  assert.equal(letraColumna(0), "A");
  assert.equal(letraColumna(26), "AA");
  assert.deepEqual(bloques([0, 1, 2, 5, 6, 9]), [[0, 2], [5, 6], [9, 9]]);
});

test("free text never becomes a formula, a number or a date", () => {
  assert.equal(escaparTexto("=IMPORTXML(\"http://x\")"), "'=IMPORTXML(\"http://x\")");
  assert.equal(escaparTexto("+57 300"), "'+57 300");
  assert.equal(escaparTexto("@arroba"), "'@arroba");
  assert.equal(escaparTexto("3-4"), "'3-4");
  assert.equal(escaparTexto("Ana Caona"), "Ana Caona");
});

test("typed columns: every header without a formula in row 1", () => {
  const h = ["ID", "Creada", "Clase", "Nombre", "WhatsApp", "Tipo"];
  const f = ["ID", "Creada", "Clase", '={"Nombre"; MAP(A2:A, LAMBDA(x, x))}', '={"WhatsApp"; MAP(A2:A, LAMBDA(x, x))}', "Tipo"];
  assert.deepEqual([...columnasEscritas(h, f)], ["ID", "Creada", "Clase", "Tipo"], "a typed column after the calculated block still counts");
  const t = construirTabla([h, ["R-0001", 46296.5, "2026-10-03 08:00", "Ana", "573…"], ["", "", "", "", ""], ["R-0002", 46296.6, "2026-10-03 09:15", "", ""]], f);
  assert.equal(t.filas.length, 2, "rows without an id are skipped");
  assert.equal(t.filas[1]._fila, 4);
  assert.equal(t.filaLibre, 5, "append after the last id in column A");
});

/** A fake Sheets v4 client over in-memory tabs. */
function hojaFalsa(pestanas) {
  const llamadas = [];
  const titulo = (rango) => rango.match(/^'((?:[^']|'')+)'/)[1].replace(/''/g, "'");
  return {
    llamadas,
    spreadsheets: {
      async get() {
        return { data: { properties: { timeZone: "America/Bogota" }, sheets: Object.entries(pestanas).map(([title, t], i) => ({ properties: { sheetId: i, title, gridProperties: { rowCount: t.filasMax || 1000, columnCount: 26 } } })) } };
      },
      async batchUpdate({ requestBody }) { llamadas.push(["estructura", requestBody]); return { data: {} }; },
      values: {
        async batchGet({ ranges, valueRenderOption, dateTimeRenderOption }) {
          llamadas.push(["leer", valueRenderOption, dateTimeRenderOption]);
          return { data: { valueRanges: ranges.map((r) => ({ range: r, values: valueRenderOption === "FORMULA" ? [pestanas[titulo(r)].formulas] : pestanas[titulo(r)].valores })) } };
        },
        async batchUpdate({ requestBody }) { llamadas.push(["escribir", requestBody]); return { data: {} }; },
      },
    },
  };
}

function hojaBase({ sinBarrio = false, filasMax } = {}) {
  const enc = (p) => [...PESTANAS[p].columnas.map(([h]) => h), ...PESTANAS[p].calculadas];
  const form = (p) => enc(p).map((h) => (PESTANAS[p].calculadas.includes(h) ? '={"' + h + '"; MAP(A2:A, LAMBDA(x, IF(x="",, x)))}' : h));
  const tab = (p, filas) => ({ valores: [enc(p), ...filas], formulas: form(p) });
  const clientas = tab("Clientas", [["C-0001", "Valentina Ruiz", 573005550101, "", 46200, "Instagram", "Sí · 2026-06-25 · datos-v1"]]);
  if (sinBarrio) {
    const j = clientas.valores[0].indexOf("Barrio");
    clientas.valores[0].splice(j, 1);
    clientas.formulas.splice(j, 1);
  }
  return {
    Clases: { ...tab("Clases", [[46298 + 8 / 24, 46298, "Sábado", "08:00", "Stretch Aéreo", "Geral", 8, "Programada", "", "Regular"]]), filasMax },
    Reservas: { ...tab("Reservas", [["R-0001", 46296.5, "2026-10-03 08:00", "C-0001", "Confirmada", "P-0001", "Panel", "", "", "", ""]]), filasMax },
    Clientas: clientas,
    Compras: tab("Compras", [["P-0001", 46290, "C-0001", "8 clases al mes", 8, 263000, "Nequi", 46290, ""]]),
    Espera: tab("Espera", []),
    Horario: tab("Horario", [["Sábado", "08:00", "Stretch Aéreo", "Geral", 8, "Sí"]]),
    Planes: tab("Planes", [["8 clases al mes", 8, 263000, 30, "Mensual", "Sí"]]),
    Ajustes: tab("Ajustes", [["Horas mínimas para cancelar", 6, ""], ["WhatsApp de reservas", 573128720888, ""]]),
  };
}

test("the driver reads every tab in one batch and the model understands serials", async () => {
  const cliente = hojaFalsa(hojaBase());
  const d = crearDriverSheets({ cliente, sheetId: "x".repeat(30) });
  const snap = await d.leer();
  const lecturas = cliente.llamadas.filter((l) => l[0] === "leer");
  assert.equal(lecturas.length, 2, "one batchGet for values, one for header formulas");
  assert.deepEqual(lecturas[0].slice(1), ["UNFORMATTED_VALUE", "SERIAL_NUMBER"]);
  assert.deepEqual(snap.faltan, ["Conversiones Ads"], "the optional tab is reported, nothing else");
  const M = construirModelo(snap);
  assert.equal(M.clases[0].id, "2026-10-03 08:00");
  assert.equal(M.clases[0].fecha, "2026-10-03");
  assert.equal(M.reservas[0].creada, Date.parse("2026-10-01T12:00:00-05:00"));
  assert.equal(M.clientas[0].whatsapp, "573005550101");
  assert.equal(M.clientas[0].desde, "2026-06-27");
  assert.equal(M.compras[0].inicio, "2026-09-25");
  assert.equal(M.compras[0].vence, "2026-10-24", "start + validity − 1, computed, never read from the Sheet");
  assert.equal(M.ajustes["WhatsApp de reservas"], "573128720888");
  assert.equal(M.ajustes["Horas mínimas para reservar"], 3, "missing settings fall back to defaults");
  // cached: a second read within the TTL makes no call
  await d.leer();
  assert.equal(cliente.llamadas.filter((l) => l[0] === "leer").length, 2);
  await d.leer({ fresco: true });
  assert.equal(cliente.llamadas.filter((l) => l[0] === "leer").length, 4);
});

test("appending writes only typed columns, USER_ENTERED, escaped, and grows the grid", async () => {
  const cliente = hojaFalsa(hojaBase({ filasMax: 2 }));
  const d = crearDriverSheets({ cliente, sheetId: "x".repeat(30) });
  await d.leer({ fresco: true });
  const fila = await d.agregar("Reservas", [aFila("Reservas", {
    "ID": "R-0002", "Creada": Date.parse("2026-10-01T10:00:00-05:00"), "Clase": "2026-10-03 08:00", "Clienta": "C-0001",
    "Estado": "Pendiente de pago", "Origen": "Web · WEB-HERO", "Notas": "=HYPERLINK(\"x\")", "Atribución": "{\"gclid\":\"abc\"}",
  })]);
  assert.deepEqual(fila, [3]);
  const estructura = cliente.llamadas.find((l) => l[0] === "estructura")[1].requests;
  assert.ok(estructura[0].appendDimension, "the grid grows");
  assert.equal(estructura[1].copyPaste.pasteType, "PASTE_FORMAT", "with the formats and dropdowns of the last row");
  const escritura = cliente.llamadas.find((l) => l[0] === "escribir")[1];
  assert.equal(escritura.valueInputOption, "USER_ENTERED");
  assert.equal(escritura.data.length, 1);
  assert.equal(escritura.data[0].range, "'Reservas'!A3:K3", "A..K: the 11 typed columns, never the calculated Nombre/WhatsApp");
  const v = escritura.data[0].values[0];
  assert.equal(v.length, 11);
  assert.equal(v[1], fechaASerial("2026-10-01") + 10 / 24, "instants as Bogotá serials");
  assert.equal(v[8], "'=HYPERLINK(\"x\")", "free text is escaped");
  assert.equal(v[10], "{\"gclid\":\"abc\"}", "plain-text columns are written as is");
  // the transaction sees its own write without another read
  assert.equal(construirModelo(d.instantanea()).reservaPorId.get("R-0002").estado, "Pendiente de pago");
});

test("a column missing in the Sheet is skipped on write and reported", async () => {
  const cliente = hojaFalsa(hojaBase({ sinBarrio: true }));
  const d = crearDriverSheets({ cliente, sheetId: "x".repeat(30) });
  const snap = await d.leer({ fresco: true });
  assert.ok(snap.faltan.includes("Clientas.Barrio"));
  await d.actualizar("Clientas", 2, { "Barrio": "Chapinero", "Notas": "Hola" });
  const w = cliente.llamadas.filter((l) => l[0] === "escribir").pop()[1];
  assert.equal(w.data.length, 1);
  assert.match(w.data[0].range, /^'Clientas'!H2:H2$/);
  assert.deepEqual(w.data[0].values, [["Hola"]]);
  assert.ok((await d.describir()).faltan.includes("Clientas.Barrio"));
});
