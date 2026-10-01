// Google Ads conversions (Data Manager spec) and the public flow for someone who already has a plan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrancar, entrarComo, reservaWeb, ADMIN } from "./ayuda.mjs";
import { destinoHojaSeparada, isoBogota, COLUMNAS_CONVERSION } from "../src/datos/conversiones.js";

const SAB = "2026-10-03 08:00";

test("a known clienta on the public flow: same answer as a stranger, confirmed with her plan, no payment, no conversion", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const c = await ana.post("/api/admin/clientas", { nombre: "Sara Plan", whatsapp: "3155550301" });
    await ana.post("/api/admin/pagos", { clienta: c.json.id, plan: "8 clases al mes", medio: "Nequi" });

    const conocida = await s.cliente().post("/api/publico/reservas", reservaWeb(SAB, { nombre: "Sara", whatsapp: "315 555 0301", clickIds: { gclid: "G-1" } }));
    const nueva = await s.cliente().post("/api/publico/reservas", reservaWeb(SAB, { nombre: "Sara", whatsapp: "315 555 0302", clickIds: { gclid: "G-2" } }));
    assert.equal(conocida.status, 201);
    assert.equal(nueva.status, 201);
    const sinCodigo = (r) => JSON.stringify({ ...r.json, codigo: "", pago: { ...r.json.pago, waTexto: "", waEnlace: "" }, clase: { ...r.json.clase, ocupados: 0, libres: 0 } });
    assert.equal(sinCodigo(conocida), sinCodigo(nueva), "nothing in the answer depends on whether she exists");
    assert.equal(conocida.json.pago.monto, 25000, "the plan she chose (trial by default)");
    assert.equal(conocida.json.estado, "Pendiente de pago");

    const conf = await ana.post("/api/admin/reservas/" + conocida.json.codigo + "/confirmar", {});
    assert.equal(conf.status, 200, conf.texto);
    assert.equal(conf.json.reserva.estado, "Confirmada");
    assert.equal(conf.json.reserva.plan, "8 clases al mes", "charged to her active plan");
    assert.ok(!conf.json.compra, "no new purchase");
    await s.ctx.esperarSegundoPlano();
    assert.equal(s.datos._tablas["Conversiones Ads"].filas.length, 0, "no sale, no conversion");
  } finally {
    await s.cerrar();
  }
});

test("conversions: one per purchase, gclid first, only inside the 90-day window", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const r = await s.cliente().post("/api/publico/reservas", reservaWeb(SAB, { whatsapp: "3155550311", clickIds: { gbraid: "GB-1", wbraid: "WB-1" } }));
    await ana.post("/api/admin/reservas/" + r.json.codigo + "/confirmar", { pago: { plan: "Clase de prueba", medio: "Nequi" } });
    await s.ctx.esperarSegundoPlano();
    let filas = s.datos._tablas["Conversiones Ads"].filas;
    assert.equal(filas.length, 1);
    assert.equal(filas[0]["GBRAID"], "GB-1");
    assert.equal(filas[0]["WBRAID"], "", "never gbraid and wbraid together");
    assert.equal(filas[0]["Google Click ID"], "");

    // a «Saldo anterior» adjustment is not a sale
    await ana.post("/api/admin/pagos", { clienta: "C-0001", plan: "Saldo anterior", medio: "Efectivo", clases: 3 });
    // 91 days after the click, a plan bought is no longer attributable
    s.reloj.avanzar(91 * 86400000);
    await ana.post("/api/admin/pagos", { clienta: "C-0001", plan: "8 clases al mes", medio: "Nequi" });
    await s.ctx.esperarSegundoPlano();
    filas = s.datos._tablas["Conversiones Ads"].filas;
    assert.equal(filas.length, 1);
  } finally {
    await s.cerrar();
  }
});

/** A fake separate spreadsheet: one tab, values.append, deleteDimension. */
function hojaConversiones(inicial = []) {
  const tab = { titulo: "Conversiones", valores: inicial.map((f) => [...f]) };
  const llamadas = [];
  return {
    tab, llamadas,
    spreadsheets: {
      async get() { return { data: { sheets: [{ properties: { sheetId: 7, title: "Otra", index: 1 } }, { properties: { sheetId: 3, title: tab.titulo, index: 0 } }] } }; },
      async batchUpdate({ requestBody }) {
        llamadas.push(["estructura", requestBody]);
        for (const q of requestBody.requests) {
          const { startIndex, endIndex } = q.deleteDimension.range;
          tab.valores.splice(startIndex, endIndex - startIndex);
        }
        return { data: {} };
      },
      values: {
        async batchGet({ ranges }) { llamadas.push(["leer", ranges]); return { data: { valueRanges: [{ values: tab.valores.map((f) => [...f]) }] } }; },
        async batchUpdate({ requestBody }) { llamadas.push(["encabezados", requestBody]); tab.valores[0] = requestBody.data[0].values[0]; return { data: {} }; },
        async append(o) { llamadas.push(["agregar", o]); tab.valores.push(o.requestBody.values[0]); return { data: {} }; },
      },
    },
  };
}

test("separate spreadsheet: first tab, headers, RAW append, dedupe by Order ID, rolling 90 days", async () => {
  let ahora = Date.parse("2026-10-01T10:00:00-05:00");
  const cliente = hojaConversiones();
  const d = destinoHojaSeparada({ cliente, sheetId: "c".repeat(30), ahora: () => ahora });
  const fila = {
    "Google Click ID": "G-9", "GBRAID": "", "WBRAID": "", "Order ID": "P-0007", "Conversion Name": "Plan comprado",
    "Conversion Time": isoBogota(ahora), "Conversion Value": "263000", "Conversion Currency": "COP",
  };
  assert.equal(await d.registrar(fila), "ok");
  assert.deepEqual(cliente.tab.valores[0], COLUMNAS_CONVERSION, "headers written on an empty first tab");
  assert.deepEqual(cliente.tab.valores[1], ["G-9", "", "", "P-0007", "Plan comprado", "2026-10-01T10:00:00-05:00", "263000", "COP"]);
  const ag = cliente.llamadas.find((l) => l[0] === "agregar")[1];
  assert.equal(ag.valueInputOption, "RAW", "text stays text: the ISO time is never re-parsed");
  assert.equal(ag.range, "'Conversiones'!A1", "the first tab by index, not by list order");
  assert.equal(await d.registrar(fila), "repetida");
  assert.equal(cliente.tab.valores.length, 2);

  await d.registrar({ ...fila, "Order ID": "P-0008", "Conversion Time": isoBogota(ahora + 5 * 86400000) });
  ahora += 92 * 86400000;
  assert.equal(await d.podar(), 1, "the 92-day-old row goes, the 87-day-old one stays");
  assert.deepEqual(cliente.tab.valores.map((f) => f[3]), ["Order ID", "P-0008"]);
  const sal = await d.describir();
  assert.deepEqual(sal, { destino: "hoja-separada", sheetId: "c".repeat(30), pestana: "Conversiones", ok: true });
});

test("with CONVERSIONES_SHEET_ID the API writes there and /api/admin/salud says so", async () => {
  const cliente = hojaConversiones();
  const s = await arrancar({ env: { CONVERSIONES_SHEET_ID: "c".repeat(30) }, clienteConversiones: cliente });
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const r = await s.cliente().post("/api/publico/reservas", reservaWeb(SAB, { whatsapp: "3155550321", clickIds: { gclid: "G-77" } }));
    const conf = await ana.post("/api/admin/reservas/" + r.json.codigo + "/confirmar", { pago: { plan: "Clase de prueba", medio: "Nequi" } });
    assert.equal(conf.status, 200);
    await s.ctx.esperarSegundoPlano();
    assert.equal(cliente.tab.valores[1][0], "G-77");
    assert.equal(cliente.tab.valores[1][4], "Clase de prueba pagada");
    assert.equal(s.datos._tablas["Conversiones Ads"].filas.length, 0, "the operating Sheet is not touched");
    const sal = (await ana.get("/api/admin/salud")).json;
    assert.equal(sal.conversiones.destino, "hoja-separada");
    assert.equal(sal.conversiones.sheetId, "c".repeat(30));
    assert.equal(sal.conversiones.ok, true);
  } finally {
    await s.cerrar();
  }
});
