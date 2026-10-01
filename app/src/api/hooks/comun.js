// Cache helpers shared by the hooks: every write returns fresh objects (contract §4), so we patch
// the caches that show them instead of refetching the world.
import { K } from "../claves.js";

/** Replace a ClaseEquipo everywhere it is cached (class detail, agenda, profe lists, dashboard). */
export function ponerClase(qc, clase) {
  if (!clase?.id) return;
  qc.setQueryData(K.profeClase(clase.id), clase);
  const cambiar = (lista) => (Array.isArray(lista) ? lista.map((c) => (c.id === clase.id ? clase : c)) : lista);
  qc.setQueriesData({ queryKey: ["admin", "agenda"] }, cambiar);
  qc.setQueriesData({ queryKey: ["profe", "clases"] }, cambiar);
  qc.setQueryData(K.tablero, (t) => t && { ...t, hoyClases: cambiar(t.hoyClases), manana: cambiar(t.manana), porMarcar: cambiar(t.porMarcar) });
}

/** Optimistic attendance on a ClaseEquipo (returns the patched copy). */
export function conAsistencia(clase, reserva, vino) {
  if (!clase) return clase;
  return { ...clase, gente: clase.gente.map((g) => (g.reserva === reserva ? { ...g, estado: vino ? "Asistió" : "No vino" } : g)) };
}

/** Snapshot every cache that could show a class, for rollback. */
export function foto(qc) {
  return qc.getQueriesData({ predicate: (q) => ["admin", "profe"].includes(q.queryKey[0]) });
}
export function restaurar(qc, instantanea) {
  for (const [clave, datos] of instantanea || []) qc.setQueryData(clave, datos);
}

export const MIN = 60000;
