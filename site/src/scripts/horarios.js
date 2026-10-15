// Casa Lotus · live availability from GET /api/publico/disponibilidad (shared/CONTRATO.md §6).
// The page ships the weekly grid as static HTML; when the studio answers, the same markup is
// repainted with the next date of each slot, the class, and swings that fill as bookings arrive.
// Never a number in text: the swings show the state, the words say «Hay cupo», «Últimos cupos», «Llena».
// Without an answer (offline, server down) the static grid stays and every slot still books.
// The «Próximas clases» strip (proximas.js) reads the same answer: one request per page, shared.
import { hoyClave, fechaCorta, fechaLegible, horaLegible } from "../../../shared/reglas.js";

const API = "/api/publico/disponibilidad";
const GUARDADA = "casalotus:disponibilidad";
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const ABREV = { Lunes: "LUN", Martes: "MAR", Miércoles: "MIE", Jueves: "JUE", Viernes: "VIE", Sábado: "SAB", Domingo: "DOM" };
export const ICONOS = 8; // the room shows eight swings; the fill is proportional, so the class size never shows
/** What a class is called while the Sheet still says «Por confirmar» (the API sends ""). */
export const CLASE_AEREA = "Clase aérea";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const refDe = (c) => `WEB-HORARIO-${ABREV[c.dia] ?? "DIA"}-${c.hora.replace(":", "")}`;

/** The name to show: the Sheet's, or «Clase aérea» when it is empty or «Por confirmar». */
export const nombreClase = (c) => {
  const n = String(c?.clase ?? "").trim();
  return n && n.toLowerCase() !== "por confirmar" ? n : CLASE_AEREA;
};

/** "multinivel" | "stretch" | "pilates" | "yoga" from a Sheet name, "" for anything else (Acro, Therapy, empty). */
export function tipoClase(nombre) {
  const n = String(nombre || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (n.includes("multinivel")) return "multinivel";
  if (n.includes("stretch")) return "stretch";
  if (n.includes("pilates")) return "pilates";
  if (n.includes("yoga") && n.includes("aereo")) return "yoga";
  return "";
}

export function colorDe(nombre) {
  const t = tipoClase(nombre);
  return t ? `var(--c-${t})` : "";
}

export function estado(c) {
  if (c.estado === "Cancelada" || c.motivo === "cancelada") return { texto: "Cancelada", lleno: false, off: true };
  if (c.motivo === "llena" || c.libres <= 0) return { texto: "Llena · únete a la lista de espera", lleno: true };
  if (c.motivo === "tarde" || !c.reservable) return { texto: "Ya no se reserva en línea", off: true };
  return { texto: c.libres <= 2 ? "Últimos cupos" : "Hay cupo" };
}

export const tomados = (c) => {
  if (c.motivo === "llena" || c.libres <= 0) return ICONOS;
  const cupos = Number(c.cupos) || ICONOS;
  return Math.min(ICONOS - 1, Math.round((Number(c.ocupados) || 0) / cupos * ICONOS));
};

export function marcarColumpios(s) {
  s.querySelectorAll("i").forEach((i, n) => {
    i.style.setProperty("--n", n);
    i.classList.toggle("is-taken", n < (+s.dataset.taken || 0));
  });
}

function enlace(c, est) {
  const q = new URLSearchParams({ ref: refDe(c), clase: c.id });
  if (est.lleno) q.set("espera", "1");
  return `/app/reservar?${q}`;
}

function slot(c, { conFecha }) {
  const est = estado(c);
  const color = colorDe(c.clase);
  const legible = horaLegible(c.hora), corte = legible.indexOf(" ");
  const hora = legible.slice(0, corte), sufijo = legible.slice(corte + 1);
  const cuando = conFecha ? `${fechaCorta(c.fecha)} · ` : "";
  const inner = `
    <span class="slot__time">${esc(hora)}<small>${esc(sufijo)}</small></span>
    <span class="slot__meta"><span class="slot__class">${esc(nombreClase(c))}</span><span class="slot__next">${esc(cuando + est.texto)}</span><span class="swings" data-taken="${tomados(c)}" aria-hidden="true">${"<i></i>".repeat(ICONOS)}</span></span>
    <span class="slot__go" aria-hidden="true"></span>`;
  const style = color ? ` style="--c: ${color}"` : "";
  if (est.off) return `<div class="slot is-off"${style} aria-disabled="true">${inner}</div>`;
  return `<a class="slot${est.lleno ? " is-full" : ""}"${style} href="${esc(enlace(c, est))}" data-cta="${esc(refDe(c))}" data-cursor="${est.lleno ? "Lista de espera" : "Reservar"}">${inner}</a>`;
}

/** Home and class pages: one row per weekly slot, showing its next bookable date. */
function pintarSemana(el, clases) {
  const franjas = new Map();
  for (const c of clases) {
    if (c.tipo === "Extra") continue;
    const k = `${c.dia} ${c.hora}`;
    if (!franjas.has(k)) franjas.set(k, []);
    franjas.get(k).push(c);
  }
  if (!franjas.size) return false;
  const porDia = new Map();
  for (const [, lista] of franjas) {
    const c = lista.find((x) => x.reservable) || lista.find((x) => estado(x).lleno) || lista[0];
    if (!porDia.has(c.dia)) porDia.set(c.dia, []);
    porDia.get(c.dia).push(c);
  }
  const dias = [...porDia.keys()].sort((a, b) => DIAS.indexOf(a) - DIAS.indexOf(b));
  el.innerHTML = dias.map((d) => `
    <div class="day" data-reveal>
      <h3 class="day__name">${esc(d)}</h3>
      ${porDia.get(d).sort((a, b) => (a.hora < b.hora ? -1 : 1)).map((c) => slot(c, { conFecha: true })).join("")}
    </div>`).join("");
  return true;
}

/** /horarios/: every class in the window, by date. */
function pintarLista(el, clases) {
  const porFecha = new Map();
  for (const c of clases) {
    if (!porFecha.has(c.fecha)) porFecha.set(c.fecha, []);
    porFecha.get(c.fecha).push(c);
  }
  if (!porFecha.size) return false;
  el.classList.remove("days");
  el.classList.add("semana");
  const fechas = [...porFecha.keys()].sort();
  el.innerHTML = fechas.map((f) => {
    const texto = fechaLegible(f);
    const [dia, ...resto] = texto.split(" ");
    return `
    <section class="semana__dia" aria-label="${esc(texto)}">
      <h3 class="semana__fecha">${esc(resto.join(" "))}<small>${esc(dia)}</small></h3>
      <div>${porFecha.get(f).sort((a, b) => (a.hora < b.hora ? -1 : 1)).map((c) => slot(c, { conFecha: false })).join("")}</div>
    </section>`;
  }).join("");
  return true;
}

function pintar(datos) {
  const clases = (datos?.clases || []).filter((c) => c && c.id && c.fecha && c.hora);
  let algo = false;
  document.querySelectorAll("[data-horario]").forEach((el) => {
    const ok = el.dataset.horario === "lista" ? pintarLista(el, clases) : pintarSemana(el, clases);
    if (ok) {
      algo = true;
      el.classList.remove("is-static");
      el.querySelectorAll(".swings").forEach(marcarColumpios);
      el.dispatchEvent(new CustomEvent("casalotus:contenido", { bubbles: true }));
    }
  });
  document.querySelectorAll("[data-horario-estado]").forEach((e) => {
    if (!algo) return;
    e.dataset.horarioEstado = "vivo";
    const hora = datos.actualizado ? new Date(datos.actualizado) : new Date();
    const t = e.querySelector("[data-horario-texto]");
    if (t) t.textContent = `Cupos en vivo · actualizado ${hora.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" })}`;
  });
  if (algo) document.querySelectorAll("[data-leyenda]").forEach((l) => (l.hidden = false));
  return algo;
}

/** The last answer, when it is under 10 minutes old: painted at once while the fresh one travels. */
export function guardada() {
  try {
    const g = JSON.parse(localStorage.getItem(GUARDADA) || "null");
    return g && Date.now() - g.t < 10 * 60000 ? g.d : null;
  } catch { return null; }
}

let pedido = null;
/**
 * GET /api/publico/disponibilidad, once per page: the strip and the grid share the same promise.
 * Resolves with `{ actualizado, clases }` or rejects (offline, server down, 12 s without an answer).
 */
export function disponibilidad() {
  pedido ??= (async () => {
    const corte = new AbortController();
    const t = setTimeout(() => corte.abort(), 12000);
    try {
      const r = await fetch(`${API}?desde=${hoyClave()}&dias=21`, { signal: corte.signal, headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      if (!Array.isArray(d?.clases)) throw new Error("respuesta sin clases");
      try { localStorage.setItem(GUARDADA, JSON.stringify({ t: Date.now(), d })); } catch { /* fine */ }
      return d;
    } finally { clearTimeout(t); }
  })();
  return pedido;
}

export async function iniciarHorarios() {
  if (!document.querySelector("[data-horario]")) return;
  document.querySelectorAll("[data-horario] .swings").forEach(marcarColumpios);
  const g = guardada();
  if (g) pintar(g);
  try { pintar(await disponibilidad()); } catch { /* the static weekly grid stays: every slot still books */ }
}
