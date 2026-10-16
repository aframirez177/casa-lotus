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
/** The class has no type yet (Clase empty or «Por confirmar» in the Sheet). */
export const sinTipo = (c) => !(typeof c === "string" ? c : c?.clase) || (typeof c === "string" ? c : c.clase) === "Por confirmar";
/** What a person reads: the type, or «Clase aérea» while Ana has not set it (never «por confirmar»). */
export const nombreClase = (c) => (sinTipo(c) ? "Clase aérea" : typeof c === "string" ? c : c.clase);
export const NOTA_SIN_TIPO = "Yoga, pilates o stretch: te confirmamos cuál";

/** A booking's state in her words. */
export const ESTADO_PALABRAS = {
  "Pendiente de pago": "Falta tu pago", Confirmada: "Confirmada", Asistió: "Viniste", "No vino": "No viniste",
  Cancelada: "Cancelada", "Cancelada tarde": "Cancelada tarde", Vencida: "Apartado vencido",
};
export const estadoPalabras = (estado) => ESTADO_PALABRAS[estado] || estado;

/** The booking's state in ONE sentence, for the ticket: reserved with her plan (and what is left) or held until she pays. */
export function estadoTicket(r) {
  if (r.estado === "Pendiente de pago") return "Apartada: falta tu pago";
  const n = r.saldo?.clases;
  if (!Number.isFinite(n)) return "Reservada con tu plan";
  return `Reservada con tu plan · ${n === 0 ? "era la última clase de tu plan" : n === 1 ? "te queda 1 clase" : `te quedan ${n} clases`}`;
}

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

/** «Tu clase del sábado 8:00» — the calm header when she arrives from a reminder's «No puedo ir». */
export function tituloTuClase(c) {
  if (!c?.fecha) return "Tu clase";
  const dia = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][new Date(c.fecha + "T12:00:00Z").getUTCDay()];
  const [h, m = "00"] = String(c.hora || "").split(":");
  return `Tu clase del ${dia} ${Number(h) % 12 || 12}:${m}`;
}
