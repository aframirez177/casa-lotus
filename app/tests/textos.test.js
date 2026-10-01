// Copy rules: teachers are never gendered, and server values never reach the screen as raw objects.
import { describe, test, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { textoDetalle } from "../src/lib/texto.js";

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.(jsx?|mjs)$/.test(n) ? [p] : [];
  });
}

describe("«profe», never gendered", () => {
  const fuentes = archivos(new URL("../src", import.meta.url).pathname);
  test.each(fuentes.map((f) => [f.split("/src/")[1], f]))("%s", (_nombre, f) => {
    const texto = readFileSync(f, "utf8");
    expect(texto.match(/\b(la|una|el|un) profe\b/gi) || []).toEqual([]);
    expect(texto.match(/profesora|profesor\b/gi) || []).toEqual([]);
  });
});

describe("textoDetalle", () => {
  test("strings and numbers pass through, empty is empty", () => {
    expect(textoDetalle("Pago de Nequi")).toBe("Pago de Nequi");
    expect(textoDetalle(25000)).toBe("25000");
    expect(textoDetalle(null)).toBe("");
    expect(textoDetalle({})).toBe("");
    expect(textoDetalle([])).toBe("");
  });
  test("objects become «clave: valor» pairs, skipping empty values", () => {
    expect(textoDetalle({ plan: "8 clases al mes", medio: "Nequi", notas: "" })).toBe("plan: 8 clases al mes · medio: Nequi");
    expect(textoDetalle({ cambios: ["profe", "cupos"], antes: { cupos: 8 } })).toBe("cambios: profe, cupos · antes: (cupos: 8)");
    expect(textoDetalle({ vino: false, nueva: true })).toBe("vino: no · nueva: sí");
  });
});

import { textoDia } from "../src/pantallas/reservar/SelectorClase.jsx";
describe("day strip words", () => {
  const c = (x) => ({ reservable: false, estado: "Programada", libres: 3, ...x });
  test.each([
    [[], "sin clases"],
    [[c({ reservable: true }), c({ motivo: "llena", libres: 0 })], "hay cupo"],
    [[c({ motivo: "llena", libres: 0 })], "sin cupo"],
    [[c({ motivo: "tarde" })], "reservas cerradas"],
    [[c({ estado: "Cancelada", motivo: "cancelada" })], "clases canceladas"],
    [[c({ estado: "Cancelada", motivo: "cancelada" }), c({ motivo: "tarde" })], "reservas cerradas"],
  ])("%j → %s", (clases, texto) => expect(textoDia(clases)).toBe(texto));
});
