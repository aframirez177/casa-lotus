// Class identity in the UI: colour code, name, and availability words (never a seat count).
export function claveColor(nombre = "") {
  const n = nombre.toLowerCase();
  if (n.includes("multinivel")) return "multinivel";
  if (n.includes("pilates")) return "pilates";
  if (n.includes("stretch")) return "stretch";
  if (n.includes("yoga")) return "yoga";
  return "neutra";
}
export const COLOR = { multinivel: "var(--color-multinivel)", yoga: "var(--color-yoga)", pilates: "var(--color-pilates)", stretch: "var(--color-stretch)", neutra: "var(--color-mist)" };
export const colorClase = (nombre) => COLOR[claveColor(nombre)];
export const nombreClase = (c) => (c?.clase && c.clase !== "Por confirmar" ? c.clase : "Clase por confirmar");

/** Words for the public: never a number. */
export function disponibilidad(c) {
  if (!c) return { texto: "", tono: "neutra" };
  if (c.estado === "Cancelada" || c.motivo === "cancelada") return { texto: "Cancelada", tono: "no" };
  if (c.motivo === "tarde") return { texto: "Ya cerró la reserva", tono: "no" };
  if (c.libres <= 0 || c.motivo === "llena") return { texto: "Llena · únete a la lista de espera", tono: "llena" };
  if (c.libres <= 2) return { texto: "Quedan pocos cupos", tono: "pocos" };
  return { texto: "Hay cupo", tono: "ok" };
}

/** Group classes by date, keeping order. */
export function porDia(clases) {
  const grupos = new Map();
  for (const c of clases) {
    if (!grupos.has(c.fecha)) grupos.set(c.fecha, []);
    grupos.get(c.fecha).push(c);
  }
  return [...grupos.entries()].map(([fecha, lista]) => ({ fecha, lista }));
}
