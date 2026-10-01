// Casa Lotus — site behaviour (every page). Ported from v1 main.js as an ES module:
// GSAP, ScrollTrigger, SplitText and Lenis come from npm (same pinned versions as v1's vendor/),
// bundled and self-hosted by Astro. Functional parts (CTAs, plans toggle, accordion, menu, video)
// work without motion; motion is layered on top and switched off for prefers-reduced-motion.
// Booking moved to the app: every booking CTA is a plain link to /app/reservar (shared/CONTRATO.md §9).
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import { iniciarAtribucion, videoAbierto } from "./atribucion.js";
import { iniciarHorarios, marcarColumpios } from "./horarios.js";

(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const money = (n) => "$" + Math.round(n).toLocaleString("es-CO");

  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) root.classList.add("dev");

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
      if (animate && !reduce) {
        const from = +priceEl.dataset.value || price;
        const o = { v: from };
        gsap.to(o, { v: price, duration: 0.9, ease: "expo.out", onUpdate: () => (priceEl.textContent = money(o.v)) });
        gsap.fromTo([perEl, saveEl], { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "expo.out", stagger: 0.05 });
      } else {
        priceEl.textContent = money(price);
      }
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

  /* ── Accordion with real height animation ───────────────── */
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
  let lenis;
  function setMenu(open) {
    menu.hidden = !open;
    openBtn.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
    open ? lenis?.stop() : lenis?.start();
    if (open) {
      closeBtn.focus();
      if (!reduce) gsap.from($$(".menu__nav a, .menu .btn", menu), { yPercent: 60, opacity: 0, duration: 0.9, ease: "expo.out", stagger: 0.05 });
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

  // swings sway one after another; the first data-taken ones show as booked (live count: horarios.js)
  $$(".swings").forEach(marcarColumpios);
  iniciarHorarios();

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
      lenis?.stop();
      vv.play().catch(() => {});
      window.dispatchEvent(new CustomEvent("casalotus:video", { detail: { ref: el.dataset.ref } }));
      if (el.dataset.ref) videoAbierto(el.dataset.ref);
    };
    $$("[data-video]").forEach((el) => el.addEventListener("click", () => open(el)));
    $("[data-viewer-close]", viewer).addEventListener("click", () => viewer.close());
    viewer.addEventListener("click", (e) => { if (e.target === viewer) viewer.close(); });
    viewer.addEventListener("close", () => { vv.pause(); vv.removeAttribute("src"); vv.load(); lenis?.start(); });
  }

  /* ── Studio video ──────────────────────────────────────────
     Nothing downloads until a clip nears the screen; it plays only while visible. With reduced
     motion or data saver the poster stays and no video loads. */
  const clips = $$("video[data-src]");
  const saveData = navigator.connection?.saveData;
  // posters too wait until a clip nears the screen (v1 fetched all seven on load, competing with the hero on 4G)
  const posters = $$("video[data-poster]");
  if ("IntersectionObserver" in window) {
    const po = new IntersectionObserver((entries) => entries.forEach(({ target: v, isIntersecting }) => {
      if (!isIntersecting) return;
      v.poster = v.dataset.poster;
      po.unobserve(v);
    }), { rootMargin: "900px 0px" });
    posters.forEach((v) => po.observe(v));
  } else posters.forEach((v) => (v.poster = v.dataset.poster));
  if (clips.length && !reduce && !saveData && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => entries.forEach(({ target: v, isIntersecting }) => {
      if (isIntersecting) {
        if (!v.getAttribute("src")) v.src = v.dataset.src;
        v.play().catch(() => {});
      } else if (!v.paused) v.pause();
    }), { rootMargin: "120px 0px" });
    clips.forEach((v) => io.observe(v));
  }

  /* ── Motion ─────────────────────────────────────────────── */
  if (reduce) {
    root.classList.add("motion-off");
    headerBasics();
    return;
  }
  root.classList.add("motion-on");
  gsap.registerPlugin(ScrollTrigger, SplitText);

  // smooth scroll, synced with ScrollTrigger
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  if (root.classList.contains("dev")) window.__lenis = lenis; // local QA only
  $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    const target = id.length > 1 && $(id);
    if (!target) return;
    e.preventDefault();
    lenis ? lenis.scrollTo(target, { offset: -40, duration: 1.4 }) : target.scrollIntoView({ behavior: "smooth" });
    history.replaceState(null, "", id);
  }));

  headerBasics();

  // headings rise line by line out of a mask
  const splitIn = (el, vars = {}) => {
    el.style.visibility = "visible";
    SplitText.create(el, {
      type: "lines", mask: "lines", linesClass: "split-line", autoSplit: true,
      onSplit: (self) => gsap.from(self.lines, { yPercent: 115, rotate: 2, duration: 1.3, ease: "expo.out", stagger: 0.09, ...vars }),
    });
  };
  const riseIn = (el, vars = {}) => {
    el.style.visibility = "visible";
    return gsap.from(el, { y: 26, opacity: 0, duration: 1.2, ease: "expo.out", ...vars });
  };

  // hero: the silk fades in as it unfurls (silk.js). A navy ribbon, exactly as wide as the
  // mark's stroke, flies in from beyond the screen and winds into the infinity: a dash the length
  // of the infinity slides along lead-in + infinity until it covers the infinity alone. The real
  // SVG then takes over (that is when the over-under cut appears) and the petals bloom from their
  // base. After the entrance the mark never moves again.
  const intro = gsap.timeline({ defaults: { ease: "expo.out" }, delay: 0.1 });
  if ($(".silk")) intro.from(".silk", { opacity: 0, duration: 2.2, ease: "sine.out", stagger: 0.25 }, 0);
  if ($(".hero__title")) intro.add(() => splitIn($(".hero__title")), 0.35)
    .add(() => $$(".hero [data-reveal]").forEach((el, i) => riseIn(el, { delay: 0.3 + i * 0.14 })), 0.5);
  const fly = $(".ribbon-fly"), measure = $(".ribbon-measure"), mark = $("[data-lotus-draw]");
  try { if (fly && measure && mark) {
    // The infinity's centreline was measured on the real shape and smoothed (data-centre).
    // The lead-in is one cubic Bézier that starts beyond the top-right corner of *this* screen
    // and arrives on the exact tangent of the infinity, so there is no kink where they meet.
    const centre = mark.dataset.centre.trim().split(/\s+/).map((p) => p.split(",").map(Number));
    const catmull = (pts, move = true) => {
      const P = [pts[0], ...pts, pts[pts.length - 1]];
      let d = move ? `M${P[1][0]} ${P[1][1]}` : "";
      for (let i = 1; i < P.length - 2; i++) {
        const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
        d += `C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
      }
      return d;
    };
    // screen → mark coordinates with the inverse CTM, written out (works in every Safari)
    const m = mark.getScreenCTM().inverse();
    const toMark = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    const S = toMark(innerWidth + 40, -40), J = centre[0];
    const tx = centre[1][0] - J[0], ty = centre[1][1] - J[1], tl = Math.hypot(tx, ty);
    const reach = Math.hypot(J[0] - S[0], J[1] - S[1]);
    const c2 = [J[0] - (tx / tl) * reach * 0.42, J[1] - (ty / tl) * reach * 0.42];  // on the tangent, behind J
    const c1 = [S[0] - reach * 0.18, S[1] + reach * 0.34];                         // a slow, open arc down
    const leadD = `M${S[0]} ${S[1]}C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${J[0]} ${J[1]}`;
    measure.setAttribute("d", catmull(centre));
    fly.setAttribute("d", leadD + catmull(centre, false));
    const total = fly.getTotalLength(), inf = measure.getTotalLength(), leadLen = total - inf;
    gsap.set(fly, { strokeDasharray: `${inf} ${total + inf}`, strokeDashoffset: inf, opacity: 1 });

    // landing, in paper: four discs are born one after another on the infinity's crossing (palest
    // first, lime on top) and all keep growing, never pausing, until the lime covers the screen. The
    // real mark takes over from the ribbon under them. Then one empty disc opens from the centre
    // through all four and the page shows through it with the logo in the middle. Four discs, one hole.
    const t0 = 0.1, flight = 2.3, land = t0 + flight;
    const veil = $(".paper-veil");
    const PAPER = ["#D6E1E6", "#B2D4E0", "#B7DFC5", "#D2F3A2"];   // bottom → top: line, sky, mint, lime (tokens.css)
    const rgb = PAPER.map((hx) => [1, 3, 5].map((k) => parseInt(hx.slice(k, k + 2), 16)));
    const sheets = PAPER.map(() => ({ h: 0, R: 0 }));   // h: hole radius · R: outer radius (px)
    // every disc follows the same curve from its own birth: R = unit·A·(e^(age/T) − 1). Its speed only
    // ever rises, so no disc waits for the others; the gap between births sets the rings' width.
    const A = 0.35, T = 0.44, GAP = 0.19;
    const clock = { t: 0 };
    let cx = 0, cy = 0, unit = 0, cover = 0, last = "";
    const place = () => {
      const r = mark.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height * 0.755;   // the infinity's crossing
      unit = r.width / 2;
      cover = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 48;
    };
    place();
    const f = (n) => Math.round(n * 10) / 10;
    const shade = (i, a) => i < 0 ? `rgb(22 84 114/${a})`
      : `rgb(${rgb[i].map((v, k) => Math.round(v + ([22, 84, 114][k] - v) * a)).join(" ")})`;
    // one radial gradient: concentric sheets are a function of the radius alone. Where a sheet's edge
    // lies on the sheet below it gets a soft contact shade; a second gradient, shifted down, is the
    // cast shadow on the page (outside the stack and at the top of the hole).
    const paint = () => {
      sheets.forEach((s, i) => { const age = clock.t - i * GAP; s.R = age > 0 ? unit * A * Math.expm1(age / T) : 0; });
      const on = sheets.filter((s) => s.R - s.h > 0.5);
      if (!on.length) { if (last) { veil.style.background = ""; last = ""; } return; }
      const xs = [...new Set([0, ...on.flatMap((s) => [s.h, s.R])])].sort((a, b) => a - b);
      const segs = [];
      for (let k = 0; k < xs.length; k++) {
        const a = xs[k], b = k + 1 < xs.length ? xs[k + 1] : Infinity, mid = b === Infinity ? a + 1 : (a + b) / 2;
        let top = -1;
        for (let i = sheets.length - 1; i >= 0; i--) if (sheets[i].h <= mid && mid < sheets[i].R) { top = i; break; }
        if (segs.length && segs[segs.length - 1].top === top) segs[segs.length - 1].b = b;
        else segs.push({ a, b, top });
      }
      const stops = [];
      segs.forEach((s, k) => {
        const prev = segs[k - 1], next = segs[k + 1], a = s.a, b = s.b === Infinity ? s.a + 1 : s.b;
        const w = Math.min(12, (b - a) * 0.45), A = 0.13, paper = s.top >= 0;
        const inL = paper && prev && prev.top > s.top, inR = paper && next && next.top > s.top;
        stops.push(`${shade(s.top, inL ? A : 0)} ${f(k ? a + 0.4 : a)}px`);
        if (inL) stops.push(`${shade(s.top, A * 0.35)} ${f(a + w * 0.4)}px`, `${shade(s.top, 0)} ${f(a + w)}px`);
        if (inR) stops.push(`${shade(s.top, 0)} ${f(b - w)}px`, `${shade(s.top, A * 0.35)} ${f(b - w * 0.4)}px`);
        if (s.b !== Infinity) stops.push(`${shade(s.top, inR ? A : 0)} ${f(b - 0.4)}px`);
      });
      const h0 = Math.min(...on.map((s) => s.h)), R1 = Math.max(...on.map((s) => s.R)), bl = 6, SA = 0.18;
      const cast = h0 > 0
        ? `transparent ${f(Math.max(0, h0 - bl))}px, rgb(22 84 114/${SA}) ${f(h0 + bl)}px, rgb(22 84 114/${SA}) ${f(R1 - bl)}px, transparent ${f(R1 + bl)}px`
        : `rgb(22 84 114/${SA}) ${f(Math.max(0, R1 - bl))}px, transparent ${f(R1 + bl)}px`;
      const bg = `radial-gradient(circle at ${f(cx)}px ${f(cy)}px, ${stops.join(", ")}), radial-gradient(circle at ${f(cx)}px ${f(cy + 8)}px, ${cast})`;
      if (bg !== last) { veil.style.background = bg; last = bg; }
    };
    addEventListener("scroll", place, { passive: true });
    addEventListener("resize", place);
    const age = (r) => T * Math.log1p(r / A);                        // age at which a disc reaches r·unit
    const covered = (PAPER.length - 1) * GAP + age((cover / unit) * 1.02);   // the lime reaches the corners
    const start = land - 0.4, open = start + covered - 0.5, reveal = 1.3, swap = start + age(1.2);
    gsap.ticker.add(paint);   // repaints only when a radius or the crossing actually moved
    intro.eventCallback("onComplete", () => { gsap.ticker.remove(paint); removeEventListener("scroll", place); removeEventListener("resize", place); });
    intro.to(fly, { strokeDashoffset: -leadLen, duration: flight, ease: "power2.out" }, t0)  // enters with momentum, settles as it lands
      .to(clock, { t: covered + 0.5, duration: covered + 0.5, ease: "none" }, start)
      .set(".lotus-part--base", { opacity: 1 }, swap)   // the first disc now covers the whole infinity
      .set(fly, { opacity: 0 }, swap)
      // one empty disc opens from the centre through every sheet at once: only the lime edge is seen
      .to(sheets, { h: () => cover + 24, duration: reveal, ease: "power2.inOut" }, open)   // starts as the lime lands, no pause
      .set(veil, { display: "none" }, open + reveal + 0.05)   // past the screen's corners: drop the layer
      .to(".lotus-draw__shadow", { opacity: 0.16, duration: 1.4, ease: "sine.out" }, open + 0.6)
      .fromTo(".lotus-part--petal", { opacity: 0, y: 34, scale: 0.8, transformOrigin: "50% 100%" },
        { opacity: 1, y: 0, scale: 1, duration: 1.5, ease: "expo.out", stagger: 0.12, immediateRender: false }, open + 0.4);
    if (root.classList.contains("dev")) window.__intro = intro; // local QA: frame-by-frame review
  } } catch (err) {
    if (mark) {
      gsap.set(".lotus-part", { opacity: 1 }); gsap.set(".ribbon-fly", { display: "none" });
      gsap.set(".lotus-draw__shadow", { opacity: 0.16 }); gsap.set(".paper-veil", { display: "none" });
    }
  }
  if ($(".hero__copy")) gsap.to(".hero__copy", { y: -80, opacity: 0.2, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 1 } });

  atmosphere();

  // everything else reveals on scroll
  $$("[data-split]").forEach((el) => {
    if (el.closest(".hero")) return;
    ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => splitIn(el) });
  });
  $$("[data-reveal]").forEach((el) => {
    if (el.closest(".hero")) return;
    ScrollTrigger.create({ trigger: el, start: "top 90%", once: true, onEnter: () => riseIn(el) });
  });

  // content painted later (the live schedule, horarios.js) reveals like the rest
  document.addEventListener("casalotus:contenido", (e) => {
    $$("[data-reveal]", e.target).forEach((el) => ScrollTrigger.create({ trigger: el, start: "top 90%", once: true, onEnter: () => riseIn(el) }));
    ScrollTrigger.refresh();
  });

  // images open from a soft inset and settle
  $$("[data-media]").forEach((m) => {
    const img = $("img, video", m);
    gsap.fromTo(m, { clipPath: "inset(14% 10% 6% 10% round 36px)" }, { clipPath: "inset(0% 0% 0% 0% round 22px)", duration: 1.6, ease: "expo.out", scrollTrigger: { trigger: m, start: "top 85%", once: true } });
    // the photo rests at 1.1× so a ±4% parallax never shows an empty edge inside its frame
    gsap.fromTo(img, { yPercent: -4 }, { yPercent: 4, ease: "none", scrollTrigger: { trigger: m, start: "top bottom", end: "bottom top", scrub: true } });
    gsap.fromTo(img, { filter: "blur(14px)", scale: 1.22 }, { filter: "blur(0px)", scale: 1.1, duration: 2, ease: "expo.out", clearProps: "filter", scrollTrigger: { trigger: m, start: "top 85%", once: true } });
  });

  // section heads sit on their own layer and drift slower than the content
  $$("[data-float]").forEach((h) => gsap.fromTo(h, { y: 70 }, { y: -40, ease: "none", scrollTrigger: { trigger: h.parentElement, start: "top bottom", end: "bottom top", scrub: 1.2 } }));

  // la sala: the clips hang at different depths and swing a little as the page passes
  $$(".sala__clip").forEach((c, i) => {
    const depth = [0.6, 1, 0.75, 1.15, 0.7, 0.9][i % 6], side = i % 2 ? -1 : 1;
    gsap.fromTo(c, { y: 44 * depth, rotation: 0.9 * side }, { y: -44 * depth, rotation: -0.9 * side, ease: "none",
      scrollTrigger: { trigger: ".sala", start: "top bottom", end: "bottom top", scrub: 1 } });
  });

  // manifesto: words light up as you read
  const words = $("[data-words]");
  if (words) {
    words.innerHTML = words.textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(" ");
    gsap.to($$(".w", words), { opacity: 1, stagger: 0.12, ease: "none", scrollTrigger: { trigger: words, start: "top 78%", end: "bottom 42%", scrub: 0.6 } });
  }

  // first class: the line draws as the steps pass
  const steps = $("[data-steps]");
  if (steps) {
    gsap.to(steps, { "--progress": 1, ease: "none", scrollTrigger: { trigger: steps, start: "top 70%", end: "bottom 60%", scrub: 0.5 } });
    $$(".step", steps).forEach((s) => ScrollTrigger.create({ trigger: s, start: "top 68%", onEnter: () => s.classList.add("is-on"), onLeaveBack: () => s.classList.remove("is-on") }));
  }

  // the trial price counts up once
  $$("[data-count]").forEach((el) => {
    const o = { v: 0 }, to = +el.dataset.count;
    ScrollTrigger.create({ trigger: el, start: "top 85%", once: true, onEnter: () => gsap.to(o, { v: to, duration: 1.8, ease: "expo.out", onUpdate: () => (el.textContent = Math.round(o.v).toLocaleString("es-CO")) }) });
  });

  // cards and plans arrive with a small stagger (initial state set up front: no flash)
  if ($(".class-card, .plan")) gsap.set(".class-card, .plan", { y: 50, opacity: 0 });
  ScrollTrigger.batch(".class-card, .plan", { start: "top 92%", once: true, onEnter: (b) => gsap.to(b, { y: 0, opacity: 1, duration: 1.3, ease: "expo.out", stagger: 0.1, clearProps: "transform" }) });

  // the air changes colour room by room
  const tones = { paper: "#F6F8FC", mist: "#EFF4F8", navy: "#0E3A4E" };
  $$("[data-bg]").forEach((sec) => ScrollTrigger.create({
    trigger: sec, start: "top 55%", end: "bottom 55%",
    onToggle: (self) => self.isActive && (document.body.style.backgroundColor = tones[sec.dataset.bg]),
  }));

  // the nav marks the current page (aria-current="page", set at build): nothing to track on scroll

  /* ── Tilt: cards are layered planes that lean toward the hand ── */
  if (fine) {
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
  }

  /* ── Magnetic buttons ───────────────────────────────────── */
  if (fine) $$("[data-magnetic]").forEach((el) => {
    const x = gsap.quickTo(el, "x", { duration: 0.8, ease: "power3.out" }), y = gsap.quickTo(el, "y", { duration: 0.8, ease: "power3.out" });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      x((e.clientX - r.left - r.width / 2) * 0.28);
      y((e.clientY - r.top - r.height / 2) * 0.38);
    });
    el.addEventListener("pointerleave", () => { x(0); y(0); });
  });

  /* ── Cursor ─────────────────────────────────────────────── */
  if (fine) {
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
  }

  /* ── Atmosphere ──────────────────────────────────────────
     Seven orbs of blurred light in a 3D scene. Depth (0 far → 1 near) sets how far
     back each sits, how much it drifts, how it answers the scroll and the hand. The
     palette follows the room you are in, always with Ana's colours. */
  function atmosphere() {
    const scene = $("[data-atmos]");
    if (!scene) return;
    const orbs = $$(".orb", scene).map((o) => ({ el: o, s: $(".orb__s", o), d: $(".orb__d", o), depth: +o.dataset.depth }));
    orbs.forEach((o) => o.el.style.setProperty("--depth", o.depth));

    // time only breathes, barely: scroll is what moves the light
    orbs.forEach((o, i) => gsap.to(o.d, { scale: 1.06, duration: 9 + i * 1.7, ease: "sine.inOut", yoyo: true, repeat: -1, delay: -i * 2 }));

    // scroll: each orb travels its own slow curve through the page, stretching and turning
    // a little as it goes (an ellipse that turns reads as an organic shape, not a circle).
    // Near orbs travel further. Everything is eased, so it trails the scroll like light in water.
    const TAU = Math.PI * 2;
    const tracks = orbs.map((o, i) => ({
      o, f1: 0.8 + i * 0.23, f2: 0.6 + i * 0.19, f3: 1.1 + i * 0.17, p1: i * 1.9, p2: i * 2.7, p3: i * 0.8,
      x: gsap.quickTo(o.s, "x", { duration: 2.4, ease: "power3.out" }),
      y: gsap.quickTo(o.s, "y", { duration: 2.4, ease: "power3.out" }),
      r: gsap.quickTo(o.s, "rotation", { duration: 2.8, ease: "power3.out" }),
      sx: gsap.quickTo(o.s, "scaleX", { duration: 2.4, ease: "power3.out" }),
      sy: gsap.quickTo(o.s, "scaleY", { duration: 2.4, ease: "power3.out" }),
    }));
    const flow = (p, v = 0) => tracks.forEach((t) => {
      const reach = 0.35 + t.o.depth * 0.65;
      t.x(Math.sin(p * TAU * t.f1 + t.p1) * innerWidth * 0.07 * reach);
      t.y(Math.cos(p * TAU * t.f2 + t.p2) * innerHeight * 0.1 * reach);
      t.r(Math.sin(p * TAU * t.f3 + t.p3) * 24);
      t.sx(1 + 0.16 * Math.sin(p * TAU * t.f3 + t.p1));
      t.sy(1 + 0.16 * Math.cos(p * TAU * t.f1 + t.p2) + v * t.o.depth);
    });
    flow(0);
    ScrollTrigger.create({ start: 0, end: "max", onUpdate: (self) => flow(self.progress, Math.min(Math.abs(self.getVelocity()) / 9000, 0.12)) });

    // the hand tilts the whole scene; depth turns that tilt into parallax
    if (fine) {
      const rx = gsap.quickTo(scene, "rotateX", { duration: 2.2, ease: "power3.out" });
      const ry = gsap.quickTo(scene, "rotateY", { duration: 2.2, ease: "power3.out" });
      addEventListener("pointermove", (e) => { ry((e.clientX / innerWidth - 0.5) * 10); rx(-(e.clientY / innerHeight - 0.5) * 8); }, { passive: true });
    }

    // colour follows the room (only hues Ana already uses)
    const moods = {
      inicio:          ["#B2D4E0", "#D0E8DB", "#D2F3A2", "#8AD4D6", "#B2D4E0", "#B7DFC5", "#99E27C"],
      clases:          ["#B2D4E0", "#B7DFC5", "#D2F3A2", "#8AD4D6", "#B7DFC5", "#B2D4E0", "#99E27C"],
      "primera-clase": ["#B2D4E0", "#EFF4F8", "#D0E8DB", "#B2D4E0", "#8AD4D6", "#D0E8DB", "#99E27C"],
      horarios:        ["#B7DFC5", "#D0E8DB", "#B2D4E0", "#B7DFC5", "#D0E8DB", "#8AD4D6", "#99E27C"],
      planes:          ["#D2F3A2", "#B2D4E0", "#D2F3A2", "#B7DFC5", "#99E27C", "#B2D4E0", "#D2F3A2"],
      metodo:          ["#8AD4D6", "#B2D4E0", "#D0E8DB", "#8AD4D6", "#B2D4E0", "#B7DFC5", "#99E27C"],
      preguntas:       ["#D0E8DB", "#EFF4F8", "#B2D4E0", "#D0E8DB", "#B7DFC5", "#B2D4E0", "#D2F3A2"],
    };
    Object.entries(moods).forEach(([id, colours]) => {
      const sec = document.getElementById(id);
      if (!sec) return;
      ScrollTrigger.create({ trigger: sec, start: "top 60%", end: "bottom 40%", onToggle: (self) => {
        if (self.isActive) orbs.forEach((o, i) => gsap.to(o.d, { "--orb": colours[i], duration: 2.4, ease: "sine.inOut", overwrite: "auto" }));
      } });
    });
  }

  /* ── Header, mobile CTA ─────────────────────────────────── */
  function headerBasics() {
    const header = $("[data-header]"), cta = $("[data-mobile-cta]");
    const hero = $(".hero, .page-hero"), closing = $(".closing");
    let last = scrollY;
    const onScroll = () => {
      const y = scrollY;
      header.classList.toggle("is-scrolled", y > 20);
      header.classList.toggle("is-hidden", y > 420 && y > last && (!menu || menu.hidden));
      last = y;
      const pastHero = hero && y > hero.offsetHeight * 0.7;
      const atEnd = closing && closing.getBoundingClientRect().top < innerHeight * 0.9;
      cta?.classList.toggle("is-visible", !!pastHero && !atEnd);
      const dark = closing && closing.getBoundingClientRect().top < 60;
      header.classList.toggle("is-dark", !!dark);
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
})();
