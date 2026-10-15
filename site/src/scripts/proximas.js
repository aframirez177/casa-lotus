// Casa Lotus · «Próximas clases»: the next bookable classes right under the hero (home, trial and class pages).
// A student asked, on her phone, for the schedule to be higher up and the class details after it.
// The HTML ships the weekly grid as cards (no dates, no swings: nothing it cannot know), covered by a skeleton
// while JavaScript runs. After the first frame this paints the live classes from the same answer the grid
// uses (horarios.js, one request per page). The row's height is set by those static cards and every state
// keeps it (one line per field), so nothing below moves (CLS 0) and the LCP never waits on the API.
// Without an answer the weekly cards stay, ordered from the next one, and still book (the app picks the date).
import { hoyClave, sumarDias, fechaCorta, horaLegible, diaDeSemana, ahoraHora } from "../../../shared/reglas.js";
import { disponibilidad, guardada, estado, tomados, colorDe, tipoClase, nombreClase, marcarColumpios, esc, ICONOS } from "./horarios.js";

const MAX = 6; // phones scroll through six; wider screens show the first three or four (CSS)
const SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const minutos = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + (m || 0); };

/** Bookable, or full (then it offers the waiting list). Cancelled and too-late classes stay out. */
const visible = (c) => c?.id && c.fecha && c.hora && c.estado !== "Cancelada" && (c.reservable || c.motivo === "llena");

function enlace(c, lleno, ref) {
  const q = new URLSearchParams({ clase: c.id });
  if (lleno) q.set("espera", "1");
  q.set("ref", ref);
  return `/app/reservar?${q}`;
}

function cuando(fecha, hoy) {
  const [, dia, mes] = fechaCorta(fecha).split(" "); // "sáb 17 oct"
  const nombre = fecha === hoy ? "Hoy" : fecha === sumarDias(hoy, 1) ? "Mañana" : diaDeSemana(fecha);
  return `${nombre} <span>${esc(`${dia} ${mes}`)}</span>`;
}

function tarjeta(c, ref, hoy) {
  const est = estado(c);
  const lleno = Boolean(est.lleno);
  const color = colorDe(c.clase);
  const [hora, ...sufijo] = horaLegible(c.hora).split(" ");
  return `
  <li class="proxima${lleno ? " is-full" : ""}"${color ? ` style="--c: ${color}"` : ""}>
    <a class="proxima__link" href="${esc(enlace(c, lleno, ref))}" data-cta="${esc(ref)}" data-cursor="${lleno ? "Lista de espera" : "Reservar"}">
      <span class="proxima__cuando">${cuando(c.fecha, hoy)}</span>
      <span class="proxima__hora">${esc(hora)}<small>${esc(sufijo.join(" "))}</small></span>
      <span class="proxima__clase">${esc(nombreClase(c))}</span>
      <span class="swings proxima__columpios" data-taken="${tomados(c)}" aria-hidden="true">${"<i></i>".repeat(ICONOS)}</span>
      <span class="proxima__estado">${lleno ? "Llena · lista de espera" : esc(est.texto)}</span>
      <span class="proxima__go" aria-hidden="true"></span>
    </a>
  </li>`;
}

/** The studio answered with nothing bookable: say so, and offer WhatsApp (the link carries the ref). */
function vacia(fila, ref) {
  const wa = fila.dataset.whatsapp;
  return `
  <li class="proxima proxima--vacia">
    <p class="proxima__clase">Por ahora no hay clases abiertas en línea.</p>
    <p class="proxima__nota">Estamos abriendo horarios nuevos.${wa ? ` <a href="${esc(wa)}" data-wa="${esc(ref)}" target="_blank" rel="noopener">Escríbenos por WhatsApp</a> y te avisamos.` : ""}</p>
  </li>`;
}

function marcar(seccion, estadoNuevo, texto) {
  seccion.querySelector("[data-proximas]").dataset.estado = estadoNuevo;
  const e = seccion.querySelector("[data-proximas-estado]");
  if (e) { e.dataset.proximasEstado = estadoNuevo; e.querySelector("span:last-child").textContent = texto; }
}

/** Live classes: new nodes in place of the old ones (inserted nodes never count as a layout shift). */
function pintar(seccion, datos) {
  const fila = seccion.querySelector("[data-proximas]");
  const ref = fila.dataset.ref || "WEB-PROXIMAS";
  const todas = (datos?.clases || []).filter(visible).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // a class page lists its own class when the Sheet names it; while names are «Por confirmar», every class
  const tipo = tipoClase(fila.dataset.filtro);
  const propias = tipo ? todas.filter((c) => tipoClase(c.clase) === tipo) : [];
  const lista = (propias.length ? propias : todas).slice(0, MAX);
  const hoy = hoyClave();
  fila.toggleAttribute("data-vacia", !lista.length);
  fila.innerHTML = lista.length ? lista.map((c) => tarjeta(c, ref, hoy)).join("") : vacia(fila, ref);
  fila.querySelectorAll(".swings").forEach(marcarColumpios);
  fila.scrollLeft = 0;
  marcar(seccion, "vivo", "Cupos en vivo");
}

/** No answer: the weekly cards stay (they book through the app), starting with the next one to come. */
function semanal(seccion) {
  const fila = seccion.querySelector("[data-proximas]");
  if (fila.dataset.estado === "vivo") return; // a cached answer is already showing
  const hoy = SEMANA.indexOf(diaDeSemana(hoyClave())), ahora = minutos(ahoraHora());
  const espera = (li) => {
    let d = (SEMANA.indexOf(li.dataset.dia) - hoy + 7) % 7;
    if (d === 0 && minutos(li.dataset.hora) <= ahora) d = 7;
    return d * 1440 + minutos(li.dataset.hora);
  };
  const tarjetas = [...fila.children].filter((li) => li.dataset.dia);
  if (tarjetas.length) fila.replaceChildren(...tarjetas.sort((a, b) => espera(a) - espera(b)).map((li) => li.cloneNode(true)));
  marcar(seccion, "semanal", "Horario de la semana");
}

/** Resolves after the first frame is on screen: the strip never competes with the LCP. A tab opened in the
    background gets no frames, so a timer also lets it through (the strip is ready when she switches to it). */
const trasPrimerCuadro = () => new Promise((listo) => {
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(listo, 0)));
  setTimeout(listo, 250);
});

export async function iniciarProximas() {
  const secciones = [...document.querySelectorAll("[data-proximas-seccion]")];
  if (!secciones.length) return;
  // set at once, in the same task that turns motion on or off: the skeleton never blinks off before the answer
  secciones.forEach((s) => { s.querySelector("[data-proximas]").dataset.estado = "cargando"; });
  await trasPrimerCuadro();
  const g = guardada();
  if (g) secciones.forEach((s) => pintar(s, g));
  try {
    const d = await disponibilidad();
    secciones.forEach((s) => pintar(s, d));
  } catch { secciones.forEach(semanal); }
}
