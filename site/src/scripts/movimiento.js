// Casa Lotus — the motion layer (v1's feel), loaded after the first interaction or a quiet while
// (sitio.js), never before the first paint. GSAP 3.15 + ScrollTrigger + SplitText and Lenis 1.3.26,
// bundled and self-hosted. Everything here is an enhancement: the page is complete without it.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import { estado } from "./estado.js";

const root = document.documentElement;
const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const money = (n) => "$" + Math.round(n).toLocaleString("es-CO");
/** below the fold right now? (what is already on screen keeps its state: nothing re-animates) */
const porVenir = (el) => el.getBoundingClientRect().top > innerHeight * 0.92;

export function iniciar() {
  gsap.registerPlugin(ScrollTrigger, SplitText);

  // smooth scroll, synced with ScrollTrigger
  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  estado.lenis = lenis;
  if (root.classList.contains("dev")) window.__lenis = lenis; // local QA only
  $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    const target = id.length > 1 && $(id);
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: -40, duration: 1.4 });
    history.replaceState(null, "", id);
  }));

  // headings rise line by line out of a mask (the observer in sitio.js calls this from now on)
  estado.splitIn = (el) => {
    el.classList.add("is-split");
    SplitText.create(el, {
      type: "lines", mask: "lines", linesClass: "split-line", autoSplit: true, aria: "none",
      onSplit: (self) => gsap.from(self.lines, { yPercent: 115, rotate: 2, duration: 1.3, ease: "expo.out", stagger: 0.09 }),
    });
  };

  // plans: the price counts to its new value
  estado.precio = (el, from, to, lineas) => {
    const o = { v: from };
    gsap.to(o, { v: to, duration: 0.9, ease: "expo.out", onUpdate: () => (el.textContent = money(o.v)) });
    gsap.fromTo(lineas, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "expo.out", stagger: 0.05 });
  };

  // all layout reads first, then every tween and trigger (no read/write ping-pong)
  const media = $$("[data-media]").map((m) => ({ m, img: $("img, video", m), nuevo: porVenir(m) }));
  const cuentas = $$("[data-count]").map((el) => ({ el, nuevo: porVenir(el) }));

  // hero copy drifts up and fades as the hero leaves (home)
  if ($(".hero__copy")) gsap.to(".hero__copy", { y: -80, opacity: 0.2, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 1 } });

  // images open from a soft inset and settle; the photo rests at 1.1× so a ±4% parallax never shows an edge
  media.forEach(({ m, img, nuevo }) => {
    if (!img) return;
    if (nuevo) {
      gsap.fromTo(m, { clipPath: "inset(14% 10% 6% 10% round 36px)" }, { clipPath: "inset(0% 0% 0% 0% round 22px)", duration: 1.6, ease: "expo.out", scrollTrigger: { trigger: m, start: "top 85%", once: true } });
      gsap.fromTo(img, { filter: "blur(14px)", scale: 1.22 }, { filter: "blur(0px)", scale: 1.1, duration: 2, ease: "expo.out", clearProps: "filter", scrollTrigger: { trigger: m, start: "top 85%", once: true } });
    } else gsap.set(img, { scale: 1.1 });
    gsap.fromTo(img, { yPercent: -4 }, { yPercent: 4, ease: "none", scrollTrigger: { trigger: m, start: "top bottom", end: "bottom top", scrub: true } });
  });

  // section heads sit on their own layer and drift slower than the content
  $$("[data-float]").forEach((h) => gsap.fromTo(h, { y: 70 }, { y: -40, ease: "none", scrollTrigger: { trigger: h.parentElement, start: "top bottom", end: "bottom top", scrub: 1.2 } }));

  // la sala: the clips hang at different depths and swing a little as the page passes
  $$(".sala__clip").forEach((c, i) => {
    const depth = [0.6, 1, 0.75, 1.15, 0.7, 0.9][i % 6], side = i % 2 ? -1 : 1;
    gsap.fromTo(c, { y: 44 * depth, rotation: 0.9 * side }, { y: -44 * depth, rotation: -0.9 * side, ease: "none", scrollTrigger: { trigger: ".sala", start: "top bottom", end: "bottom top", scrub: 1 } });
  });

  // manifesto: words light up as you read (soft blue-grey → navy, both above 3:1)
  const words = $("[data-words]");
  if (words) {
    words.innerHTML = words.textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(" ");
    gsap.to($$(".w", words), { color: "#165472", stagger: 0.12, ease: "none", scrollTrigger: { trigger: words, start: "top 78%", end: "bottom 42%", scrub: 0.6 } });
  }

  // first class: the line draws as the steps pass
  const steps = $("[data-steps]");
  if (steps) {
    gsap.to(steps, { "--progress": 1, ease: "none", scrollTrigger: { trigger: steps, start: "top 70%", end: "bottom 60%", scrub: 0.5 } });
    $$(".step", steps).forEach((s) => ScrollTrigger.create({ trigger: s, start: "top 68%", onEnter: () => s.classList.add("is-on"), onLeaveBack: () => s.classList.remove("is-on") }));
  }

  // the trial price counts up once (only if it hasn't been seen yet)
  cuentas.forEach(({ el, nuevo }) => {
    if (!nuevo) return;
    const o = { v: 0 }, to = +el.dataset.count;
    ScrollTrigger.create({ trigger: el, start: "top 85%", once: true, onEnter: () => gsap.to(o, { v: to, duration: 1.8, ease: "expo.out", onUpdate: () => (el.textContent = Math.round(o.v).toLocaleString("es-CO")) }) });
  });

  if (!fine) return;

  /* ── Tilt: cards are layered planes that lean toward the hand ── */
  const tilt = (el, max) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      gsap.to(el, { "--ry": `${(px - 0.5) * max * 2}deg`, "--rx": `${(0.5 - py) * max * 1.6}deg`, "--lift": "-8px", duration: 0.7, ease: "power3.out", overwrite: "auto" });
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
    });
    el.addEventListener("pointerleave", () => gsap.to(el, { "--ry": "0deg", "--rx": "0deg", "--lift": "0px", duration: 1.2, ease: "expo.out", overwrite: "auto" }));
  };
  $$(".class-card").forEach((c) => tilt(c, 6));
  $$(".plan").forEach((p) => tilt(p, 4));

  /* ── Magnetic buttons ───────────────────────────────────── */
  $$("[data-magnetic]").forEach((el) => {
    const x = gsap.quickTo(el, "x", { duration: 0.8, ease: "power3.out" }), y = gsap.quickTo(el, "y", { duration: 0.8, ease: "power3.out" });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      x((e.clientX - r.left - r.width / 2) * 0.28);
      y((e.clientY - r.top - r.height / 2) * 0.38);
    });
    el.addEventListener("pointerleave", () => { x(0); y(0); });
  });

  /* ── Cursor ─────────────────────────────────────────────── */
  const c = $(".cursor"), dot = $(".cursor__dot", c), ring = $(".cursor__ring", c), label = $(".cursor__label", c);
  root.classList.add("has-cursor");
  const dx = gsap.quickTo(dot, "x", { duration: 0.12, ease: "power3.out" }), dy = gsap.quickTo(dot, "y", { duration: 0.12, ease: "power3.out" });
  const rx = gsap.quickTo(ring, "x", { duration: 0.55, ease: "power3.out" }), ry = gsap.quickTo(ring, "y", { duration: 0.55, ease: "power3.out" });
  addEventListener("pointermove", (e) => {
    dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
    const t = e.target instanceof Element ? e.target : null;
    const labelled = t?.closest("[data-cursor]");
    const interactive = t?.closest("a, button, summary, [role=radio]");
    c.classList.toggle("has-label", !!labelled);
    c.classList.toggle("is-hover", !labelled && !!interactive);
    label.textContent = labelled ? labelled.dataset.cursor : "";
    c.classList.toggle("is-dark", !!t?.closest(".closing, .footer, .menu, .plan--best"));
    c.classList.remove("is-hidden");
  }, { passive: true });
  document.addEventListener("pointerleave", () => c.classList.add("is-hidden"));

  /* ── Atmosphere: the hand tilts the whole scene (its drift and colour are CSS) ── */
  const scene = $("[data-atmos]");
  if (scene) {
    const sx = gsap.quickTo(scene, "rotateX", { duration: 2.2, ease: "power3.out" });
    const sy = gsap.quickTo(scene, "rotateY", { duration: 2.2, ease: "power3.out" });
    addEventListener("pointermove", (e) => { sy((e.clientX / innerWidth - 0.5) * 10); sx(-(e.clientY / innerHeight - 0.5) * 8); }, { passive: true });
  }
}
