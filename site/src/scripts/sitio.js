// Casa Lotus — site behaviour (every page), the light part that runs at once.
// Everything a visitor needs works here without any animation library: attribution, menu, accordion,
// plans toggle, schedule, videos, header, and the scroll reveals (an IntersectionObserver + CSS).
// The motion layer (GSAP, ScrollTrigger, SplitText, Lenis: smooth scroll, line-split headings, parallax,
// tilt, magnetic buttons, cursor) is a separate module (movimiento.js), loaded on the first interaction
// or after the page has been idle a while: it never competes with the first paint.
// Booking moved to the app: every booking CTA is a plain link to /app/reservar (shared/CONTRATO.md §9).
import { iniciarAtribucion, videoAbierto } from "./atribucion.js";
import { iniciarHorarios, marcarColumpios } from "./horarios.js";
import { estado } from "./estado.js";

const root = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const money = (n) => "$" + Math.round(n).toLocaleString("es-CO");

if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) root.classList.add("dev");
root.classList.add(reduce ? "motion-off" : "motion-on");

/* ── Attribution: utm / click ids on landing, one event per CTA (atribucion.js) ── */
iniciarAtribucion();

/* ── Plans: monthly / quarterly ─────────────────────────── */
const toggle = $("[data-toggle]");
const plans = $$("[data-plans] .plan");
function renderPlans(period, animate) {
  toggle.dataset.state = period;
  $$("button", toggle).forEach((b) => b.setAttribute("aria-checked", String(b.dataset.period === period)));
  plans.forEach((p) => {
    const n = +p.dataset.classes, mes = +p.dataset.mes, tri = +p.dataset.trimestre;
    const price = period === "mes" ? mes : tri;
    const per = period === "mes" ? mes / n : tri / (n * 3);
    const priceEl = $("[data-price]", p), perEl = $("[data-per]", p), saveEl = $("[data-save]", p);
    perEl.textContent = period === "mes" ? `${money(per)} por clase` : `3 meses · ${money(per)} por clase`;
    saveEl.textContent = period === "mes" ? "" : `Ahorras ${money(mes * 3 - tri)} frente a pagar mes a mes`;
    const from = +priceEl.dataset.value || price;
    if (animate && !reduce && estado.precio) estado.precio(priceEl, from, price, [perEl, saveEl]);
    else priceEl.textContent = money(price);
    priceEl.dataset.value = price;
    // the plan the app should charge follows the toggle («8 clases al mes» / «Trimestral · 8 al mes»)
    const cta = $("[data-href-mes]", p);
    if (cta) cta.href = period === "mes" ? cta.dataset.hrefMes : cta.dataset.hrefTrimestre;
  });
}
if (toggle) {
  $$("button", toggle).forEach((b) => b.addEventListener("click", () => renderPlans(b.dataset.period, true)));
  toggle.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const next = toggle.dataset.state === "mes" ? "trimestre" : "mes";
    renderPlans(next, true);
    $(`[data-period="${next}"]`, toggle).focus();
  });
  renderPlans("mes", false);
}

/* ── Accordion with real height animation (Web Animations, no library) ── */
const qas = $$(".qa");
qas.forEach((d) => d.removeAttribute("name")); // JS keeps it exclusive, with animation
const animateQa = (d, open) => {
  const body = $(".qa__a", d);
  if (reduce) { d.open = open; return; }
  if (open) {
    d.open = true;
    body.animate([{ height: "0px", opacity: 0 }, { height: body.scrollHeight + "px", opacity: 1 }], { duration: 520, easing: "cubic-bezier(.16,1,.3,1)" });
  } else {
    const a = body.animate([{ height: body.offsetHeight + "px", opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 360, easing: "cubic-bezier(.65,0,.35,1)" });
    a.onfinish = () => (d.open = false);
  }
};
qas.forEach((d) => {
  $("summary", d).addEventListener("click", (e) => {
    e.preventDefault();
    const opening = !d.open;
    if (opening) qas.filter((o) => o !== d && o.open).forEach((o) => animateQa(o, false));
    animateQa(d, opening);
  });
});

/* ── Mobile menu ────────────────────────────────────────── */
const menu = $("[data-menu]"), openBtn = $("[data-menu-open]"), closeBtn = $("[data-menu-close]");
function setMenu(open) {
  menu.hidden = !open;
  openBtn.setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
  open ? estado.lenis?.stop() : estado.lenis?.start();
  if (open) {
    closeBtn.focus();
    if (!reduce) $$(".menu__nav a, .menu .btn", menu).forEach((el, i) =>
      el.animate([{ opacity: 0, transform: "translateY(60%)" }, { opacity: 1, transform: "none" }], { duration: 900, delay: i * 50, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" }));
  } else openBtn.focus();
}
openBtn?.addEventListener("click", () => setMenu(true));
closeBtn?.addEventListener("click", () => setMenu(false));
$$("[data-menu-link]").forEach((a) => a.addEventListener("click", () => setMenu(false)));
addEventListener("keydown", (e) => { if (e.key === "Escape" && menu && !menu.hidden) setMenu(false); });

// the whole class card opens its class page; the real links stay the keyboard targets
$$(".class-card").forEach((card) => card.addEventListener("click", (e) => {
  if (!e.target.closest("a")) ($(".h3 a", card) || $(".link-arrow", card))?.click();
}));

/* ── Schedule: swings, and live availability once the schedule nears the screen ── */
$$(".swings").forEach(marcarColumpios);
const horario = $("[data-horario]");
if (horario) {
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); iniciarHorarios(); } }, { rootMargin: "600px 0px" });
  io.observe(horario);
}

/* ── Video viewer ──────────────────────────────────────────
   Testimonials play with sound only when someone taps them: nothing downloads before that. */
const viewer = $("[data-viewer]");
if (viewer?.showModal) {
  const vv = $("video", viewer);
  const open = (el) => {
    $$("track", vv).forEach((t) => t.remove());
    vv.poster = el.dataset.poster;
    vv.src = el.dataset.video;
    if (el.dataset.captions) {
      const t = Object.assign(document.createElement("track"), { kind: "captions", srclang: "es", label: "Español", src: el.dataset.captions, default: true });
      vv.append(t);
    }
    viewer.showModal();
    estado.lenis?.stop();
    vv.play().catch(() => {});
    window.dispatchEvent(new CustomEvent("casalotus:video", { detail: { ref: el.dataset.ref } }));
    if (el.dataset.ref) videoAbierto(el.dataset.ref);
  };
  $$("[data-video]").forEach((el) => el.addEventListener("click", () => open(el)));
  $("[data-viewer-close]", viewer).addEventListener("click", () => viewer.close());
  viewer.addEventListener("click", (e) => { if (e.target === viewer) viewer.close(); });
  viewer.addEventListener("close", () => { vv.pause(); vv.removeAttribute("src"); vv.load(); estado.lenis?.start(); });
}

/* ── Studio video ──────────────────────────────────────────
   Nothing downloads until a clip nears the screen; it plays only while visible. With reduced motion or
   data saver the poster stays and no video loads. Posters too wait until a clip nears the screen. */
const saveData = navigator.connection?.saveData;
const posters = $$("video[data-poster]");
const po = new IntersectionObserver((entries) => entries.forEach(({ target: v, isIntersecting }) => {
  if (!isIntersecting) return;
  v.poster = v.dataset.poster;
  po.unobserve(v);
}), { rootMargin: "900px 0px" });
posters.forEach((v) => po.observe(v));
const clips = $$("video[data-src]");
if (clips.length && !reduce && !saveData) {
  const io = new IntersectionObserver((entries) => entries.forEach(({ target: v, isIntersecting }) => {
    if (isIntersecting) {
      if (!v.getAttribute("src")) v.src = v.dataset.src;
      v.play().catch(() => {});
    } else if (!v.paused) v.pause();
  }), { rootMargin: "120px 0px" });
  clips.forEach((v) => io.observe(v));
}

/* ── Reveals: an observer and a CSS animation (main.css) ──
   Headings get GSAP's line split instead when the motion module is already there. */
if (!reduce) {
  const revelar = new IntersectionObserver((entries) => {
    let k = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      revelar.unobserve(el);
      if (el.hasAttribute("data-split") && estado.splitIn) estado.splitIn(el);
      else { el.style.setProperty("--d", `${(k++ * 0.1).toFixed(2)}s`); el.classList.add("is-in"); }
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  const observar = (scope = document) => $$("[data-reveal], [data-split], .class-card, .plan", scope).forEach((el) => {
    if (!el.closest(".hero, .page-hero")) revelar.observe(el);
  });
  observar();
  // content painted later (the live schedule, horarios.js) reveals like the rest
  document.addEventListener("casalotus:contenido", (e) => observar(e.target));
}

/* ── The air changes colour room by room (body tone + atmosphere palette), no scroll handler ── */
const tones = { paper: "#F6F8FC", mist: "#EFF4F8", navy: "#0E3A4E" };
const tono = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) document.body.style.backgroundColor = tones[e.target.dataset.bg];
}), { rootMargin: "-55% 0px -45% 0px" });
$$("[data-bg]").forEach((s) => tono.observe(s));
const HUMORES = ["inicio", "clases", "primera-clase", "horarios", "planes", "metodo", "preguntas"];
const humor = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) root.dataset.humor = e.target.id;
}), { rootMargin: "-50% 0px -50% 0px" });
HUMORES.forEach((id) => { const s = document.getElementById(id); if (s) humor.observe(s); });

/* ── Header and mobile CTA: scroll reads only scrollY; the rest comes from observers ── */
{
  const header = $("[data-header]"), cta = $("[data-mobile-cta]");
  const hero = $(".hero, .page-hero"), closing = $(".closing");
  let last = scrollY, pastHero = false, atEnd = false;
  const onScroll = () => {
    const y = scrollY;
    header.classList.toggle("is-scrolled", y > 20);
    header.classList.toggle("is-hidden", y > 420 && y > last && (!menu || menu.hidden));
    last = y;
  };
  const ctaState = () => cta?.classList.toggle("is-visible", pastHero && !atEnd);
  if (hero) new IntersectionObserver(([e]) => { pastHero = e.intersectionRatio < 0.3 && e.boundingClientRect.top < 0; ctaState(); }, { threshold: [0, 0.3, 1] }).observe(hero);
  if (closing) {
    new IntersectionObserver(([e]) => { atEnd = e.isIntersecting || e.boundingClientRect.top < 0; ctaState(); }, { rootMargin: "0px 0px -10% 0px" }).observe(closing);
    // the header inverts once the closing room reaches it (a band 60 px tall under the top edge)
    new IntersectionObserver(([e]) => header.classList.toggle("is-dark", e.isIntersecting), { rootMargin: `0px 0px -${Math.max(0, innerHeight - 60)}px 0px` }).observe(closing);
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ── The motion layer, loaded when someone moves (or after a quiet while) ── */
if (!reduce) {
  const eventos = ["pointermove", "pointerdown", "wheel", "touchstart", "keydown", "scroll"];
  let cargado = false;
  const cargar = () => {
    if (cargado) return;
    cargado = true;
    eventos.forEach((t) => removeEventListener(t, cargar));
    import("./movimiento.js").then((m) => m.iniciar()).catch(() => {});
  };
  eventos.forEach((t) => addEventListener(t, cargar, { passive: true, once: true }));
  addEventListener("load", () => setTimeout(() => ("requestIdleCallback" in window ? requestIdleCallback(cargar, { timeout: 4000 }) : cargar()), 6000), { once: true });
}
