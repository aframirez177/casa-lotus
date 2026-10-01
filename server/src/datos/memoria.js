// Casa Lotus · in-memory data driver: the same interface as the Sheets driver, for dev and tests.
// Cells hold what the Sheet would hand back with UNFORMATTED_VALUE (dates as serial numbers), so the
// domain reads both drivers through the same code path.
import { PESTANAS } from "./esquema.js";

/**
 * opciones.sinColumnas: { Clientas: ["Barrio"] } simulates a Sheet that lacks columns.
 * opciones.sinPestanas: ["Conversiones Ads"] simulates a missing tab.
 * opciones.latenciaMs: delay every call, so concurrency tests see real interleaving.
 */
export function crearDriverMemoria({ sinColumnas = {}, sinPestanas = [], latenciaMs = 0 } = {}) {
  const tablas = {};
  for (const [nombre, def] of Object.entries(PESTANAS)) {
    if (sinPestanas.includes(nombre)) continue;
    const quitar = new Set(sinColumnas[nombre] || []);
    const escritas = def.columnas.map(([h]) => h).filter((h) => !quitar.has(h));
    tablas[nombre] = { columnas: [...escritas, ...def.calculadas], escritas: new Set(escritas), filas: [], filaLibre: 2 };
  }
  let version = 1;
  const faltanEscritura = new Set();
  const espera = () => (latenciaMs ? new Promise((ok) => setTimeout(ok, latenciaMs)) : null);

  let copia = null;
  /** The current snapshot, cloned once per version (the domain never mutates it). */
  function instantanea() {
    if (!copia || copia.version !== version) copia = { version, leidoEn: Date.now(), tablas: structuredClone(tablas), faltan: faltantes() };
    return copia;
  }

  function faltantes() {
    const out = [];
    for (const [nombre, def] of Object.entries(PESTANAS)) {
      const t = tablas[nombre];
      if (!t) { out.push(nombre); continue; }
      for (const [h] of def.columnas) if (!t.escritas.has(h)) out.push(nombre + "." + h);
    }
    for (const f of faltanEscritura) if (!out.includes(f)) out.push(f);
    return out;
  }

  return {
    tipo: "memoria",
    async leer() {
      await espera();
      return instantanea();
    },
    instantanea,
    version: () => version,
    invalidar() {},
    async agregar(pestana, objetos) {
      await espera();
      const t = tablas[pestana];
      if (!t) throw new Error("No existe la pestaña «" + pestana + "».");
      const filas = [];
      for (const o of objetos) {
        const fila = { _fila: t.filaLibre++ };
        for (const [k, v] of Object.entries(o)) {
          if (t.escritas.has(k)) fila[k] = v;
          else faltanEscritura.add(pestana + "." + k);
        }
        t.filas.push(fila);
        filas.push(fila._fila);
      }
      version++;
      return filas;
    },
    async actualizar(pestana, numFila, cambios) {
      await espera();
      const t = tablas[pestana];
      const fila = t?.filas.find((f) => f._fila === numFila);
      if (!fila) throw new Error("No existe la fila " + numFila + " en «" + pestana + "».");
      for (const [k, v] of Object.entries(cambios)) {
        if (t.escritas.has(k)) fila[k] = v;
        else faltanEscritura.add(pestana + "." + k);
      }
      version++;
    },
    async describir() {
      return { tipo: "memoria", ok: true, faltan: faltantes() };
    },
    /** Test helper: what the Sheet holds right now (no clone). */
    _tablas: tablas,
  };
}
