// Casa Lotus — site behaviour.
// Functional parts (WhatsApp links, plans toggle, accordion, menu) work without GSAP;
// motion is layered on top and switched off for prefers-reduced-motion.
(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const money = (n) => "$" + Math.round(n).toLocaleString("es-CO");

  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) root.classList.add("dev");

  /* ── WhatsApp links with attribution ──────────────────────
     Bookings number (not the payments one). Every CTA carries its own ref, plus the
     inbound utm_source, so every booking chat can be traced to the button that started it. */
  const WA = "573128720888";
  const source = new URLSearchParams(location.search).get("utm_source");
  $$("[data-wa]").forEach((a) => {
    const ref = a.dataset.wa + (source ? `·${source}` : "");
    const text = a.dataset.waText || "Hola Casa Lotus, quiero reservar mi clase de prueba";
    a.href = `https://wa.me/${WA}?text=${encodeURIComponent(`${text} (ref:${ref})`)}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.addEventListener("click", () => window.dispatchEvent(new CustomEvent("casalotus:cta", { detail: { ref } })));
  });

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
      if (animate && window.gsap && !reduce) {
        const from = +priceEl.dataset.value || price;
        const o = { v: from };
        gsap.to(o, { v: price, duration: 0.9, ease: "expo.out", onUpdate: () => (priceEl.textContent = money(o.v)) });
        gsap.fromTo([perEl, saveEl], { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "expo.out", stagger: 0.05 });
      } else {
        priceEl.textContent = money(price);
      }
      priceEl.dataset.value = price;
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
      if (window.gsap && !reduce) gsap.from($$(".menu__nav a, .menu .btn", menu), { yPercent: 60, opacity: 0, duration: 0.9, ease: "expo.out", stagger: 0.05 });
    } else openBtn.focus();
  }
  openBtn?.addEventListener("click", () => setMenu(true));
  closeBtn?.addEventListener("click", () => setMenu(false));
  $$("[data-menu-link]").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) setMenu(false); });

  // the whole class card books; the real link stays the keyboard target
  $$(".class-card").forEach((card) => card.addEventListener("click", (e) => {
    if (!e.target.closest("a")) $(".link-arrow", card)?.click();
  }));

  // swings sway one after another
  $$(".swings").forEach((s) => $$("i", s).forEach((i, n) => i.style.setProperty("--n", n)));

  /* ── Motion ─────────────────────────────────────────────── */
  const hasGsap = window.gsap && window.ScrollTrigger;
  if (reduce || !hasGsap) {
    root.classList.add("motion-off");
    headerBasics();
    return;
  }
  root.classList.add("motion-on");
  gsap.registerPlugin(ScrollTrigger, ...(window.SplitText ? [SplitText] : []));

  // smooth scroll, synced with ScrollTrigger
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    if (root.classList.contains("dev")) window.__lenis = lenis; // local QA only
  }
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
    if (!window.SplitText) return gsap.from(el, { y: 40, opacity: 0, duration: 1.2, ease: "expo.out", ...vars });
    SplitText.create(el, {
      type: "lines", mask: "lines", linesClass: "split-line", autoSplit: true,
      onSplit: (self) => gsap.from(self.lines, { yPercent: 115, rotate: 2, duration: 1.3, ease: "expo.out", stagger: 0.09, ...vars }),
    });
  };
  const riseIn = (el, vars = {}) => {
    el.style.visibility = "visible";
    return gsap.from(el, { y: 26, opacity: 0, filter: "blur(8px)", duration: 1.2, ease: "expo.out", clearProps: "filter", ...vars });
  };

  // hero: the mark is still (it only fades in); the words arrive around it
  const intro = gsap.timeline({ defaults: { ease: "expo.out" }, delay: 0.1 });
  intro.from("[data-lotus-static]", { opacity: 0, duration: 1.6, ease: "sine.out" }, 0)
    .add(() => splitIn($(".hero__title")), 0.25)
    .add(() => $$(".hero [data-reveal]").forEach((el, i) => riseIn(el, { delay: 0.25 + i * 0.12 })), 0.45);
  gsap.to(".hero__copy", { y: -80, opacity: 0.2, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 1 } });

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

  // images open from a soft inset and settle
  $$("[data-media]").forEach((m) => {
    const img = $("img", m);
    gsap.fromTo(m, { clipPath: "inset(14% 10% 6% 10% round 36px)" }, { clipPath: "inset(0% 0% 0% 0% round 22px)", duration: 1.6, ease: "expo.out", scrollTrigger: { trigger: m, start: "top 85%", once: true } });
    gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: "none", scrollTrigger: { trigger: m, start: "top bottom", end: "bottom top", scrub: true } });
    gsap.fromTo(img, { filter: "blur(16px)", scale: 1.18 }, { filter: "blur(0px)", scale: 1.04, duration: 2, ease: "expo.out", clearProps: "filter", scrollTrigger: { trigger: m, start: "top 85%", once: true } });
  });

  // section heads sit on their own layer and drift slower than the content
  $$("[data-float]").forEach((h) => gsap.fromTo(h, { y: 70 }, { y: -40, ease: "none", scrollTrigger: { trigger: h.parentElement, start: "top bottom", end: "bottom top", scrub: 1.2 } }));

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
  gsap.set(".class-card, .plan", { y: 50, opacity: 0 });
  ScrollTrigger.batch(".class-card, .plan", { start: "top 92%", once: true, onEnter: (b) => gsap.to(b, { y: 0, opacity: 1, duration: 1.3, ease: "expo.out", stagger: 0.1, clearProps: "transform" }) });

  // the air changes colour room by room
  const tones = { paper: "#F6F8FC", mist: "#EFF4F8", navy: "#0E3A4E" };
  $$("[data-bg]").forEach((sec) => ScrollTrigger.create({
    trigger: sec, start: "top 55%", end: "bottom 55%",
    onToggle: (self) => self.isActive && (document.body.style.backgroundColor = tones[sec.dataset.bg]),
  }));

  // nav shows where you are
  $$(".nav a").forEach((a) => {
    const sec = $(a.getAttribute("href"));
    if (sec) ScrollTrigger.create({ trigger: sec, start: "top 50%", end: "bottom 50%", onToggle: (s) => a.setAttribute("aria-current", String(s.isActive)) });
  });

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

    // drift: slow, each on its own period, bigger and faster when near
    orbs.forEach((o, i) => {
      const r = (a, b) => a + Math.random() * (b - a);
      gsap.to(o.d, { x: () => r(-9, 9) * innerWidth / 100 * (0.5 + o.depth), y: () => r(-7, 7) * innerHeight / 100 * (0.5 + o.depth),
        scale: r(0.85, 1.25), duration: r(14, 26) - o.depth * 6, ease: "sine.inOut", yoyo: true, repeat: -1, delay: -i * 3 });
    });

    // scroll: each layer rides its own wave, near ones travel further; speed stretches them like liquid
    const setters = orbs.map((o) => ({ y: gsap.quickTo(o.s, "y", { duration: 1.2, ease: "power3.out" }), sy: gsap.quickTo(o.s, "scaleY", { duration: 0.8, ease: "power3.out" }), o }));
    ScrollTrigger.create({ start: 0, end: "max", onUpdate: (self) => {
      const v = Math.min(Math.abs(self.getVelocity()) / 4000, 0.35);
      setters.forEach(({ y, sy, o }, i) => {
        y(Math.sin(self.progress * Math.PI * (3 + i) + i) * innerHeight * 0.22 * (0.3 + o.depth));
        sy(1 + v * o.depth);
      });
    } });

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
    const hero = $(".hero"), closing = $(".closing");
    let last = scrollY;
    const onScroll = () => {
      const y = scrollY;
      header.classList.toggle("is-scrolled", y > 20);
      header.classList.toggle("is-hidden", y > 420 && y > last && menu.hidden);
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
