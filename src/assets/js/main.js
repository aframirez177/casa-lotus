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

  // swings sway one after another; the first data-taken ones show as booked (live count: see Booking)
  const marcarColumpios = (s) => $$("i", s).forEach((i, n) => {
    i.style.setProperty("--n", n);
    i.classList.toggle("is-taken", n < (+s.dataset.taken || 0));
  });
  $$(".swings").forEach(marcarColumpios);

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
    };
    $$("[data-video]").forEach((el) => el.addEventListener("click", () => open(el)));
    $("[data-viewer-close]", viewer).addEventListener("click", () => viewer.close());
    viewer.addEventListener("click", (e) => { if (e.target === viewer) viewer.close(); });
    viewer.addEventListener("close", () => { vv.pause(); vv.removeAttribute("src"); vv.load(); lenis?.start(); });
  }

  /* ── Booking ───────────────────────────────────────────────
     The site is static; the studio's Sheet answers through an Apps Script web app (data-api on
     <html>). With it, the schedule shows the real free swings and every [data-book] link opens a
     form that holds a swing until Ana confirms the payment. Without it (offline, slow, blocked),
     nothing changes: every link keeps going to WhatsApp. */
  // on localhost, ?api=http://localhost:5175/api points the site at the local studio (apps-script/dev)
  const API = (root.classList.contains("dev") && new URLSearchParams(location.search).get("api")) || root.dataset.api;
  const dlg = $("[data-book-dialog]");
  let agenda = null;
  const corto = (f) => { // "mié 30 sep"
    const [y, m, d] = f.split("-").map(Number), fecha = new Date(y, m - 1, d);
    return `${["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][fecha.getDay()]} ${d} ${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m - 1]}`;
  };
  const hora12 = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`; };
  const cupos = (n) => (n === 1 ? "queda 1 cupo" : `quedan ${n} cupos`);
  const deFranja = (franja) => {
    if (!franja) return agenda.clases.filter((c) => c.reservable).slice(0, 6);
    const [dia, hora] = franja.split(" ");
    return agenda.clases.filter((c) => c.dia === dia && c.hora === hora).slice(0, 3);
  };

  function pintarAgenda() {
    $$("[data-franja]").forEach((slot) => {
      const lista = deFranja(slot.dataset.franja), c = lista.find((x) => x.reservable) || lista[0];
      if (!c) return;
      const sw = $(".swings", slot);
      sw.dataset.taken = c.ocupados;
      marcarColumpios(sw);
      $("[data-next]", slot).textContent = `${corto(c.fecha)} · ${c.libres ? cupos(c.libres) : "llena, hay lista de espera"}`;
      if (c.clase) { const k = $(".slot__class", slot); k.textContent = c.clase; k.removeAttribute("data-todo"); }
    });
  }

  function opcionesDe(origen) {
    const opciones = deFranja(origen.dataset.franja);
    const primera = opciones.find((c) => c.reservable);
    return opciones.map((c) => `
      <label class="book__opt${c.reservable ? "" : " is-off"}">
        <input type="radio" name="clase" value="${c.id}"${c.reservable ? "" : " disabled"}${c === primera ? " checked" : ""}>
        <span><strong>${corto(c.fecha)}</strong><span class="book__hora">${hora12(c.hora)}</span>${c.clase ? `<small>${c.clase}</small>` : ""}</span>
        <em>${c.reservable ? cupos(c.libres) : c.libres ? "cerrada" : "llena"}</em>
      </label>`).join("") || `<p class="book__note">No hay clases abiertas en esta franja. Escríbenos por WhatsApp.</p>`;
  }

  // Opens at once. If the studio has not answered yet, the form waits in «Buscando cupos…» and fills
  // itself when the answer lands; if it never does, the visitor is offered WhatsApp, as always.
  function abrirReserva(origen) {
    const listo = !!agenda;
    dlg.origen = origen;
    $("[data-book-options]", dlg).innerHTML = listo ? opcionesDe(origen) : `<p class="book__loading" role="status">Buscando cupos…</p>`;
    $("[data-book-note]", dlg).textContent = `Tu primera clase cuesta $25.000. Te guardamos el columpio ${agenda?.horasParaPagar || 12} horas mientras nos envías el comprobante.`;
    $("[data-book-wa]", dlg).href = origen.href; // same WhatsApp message and ref as the link that opened it
    dlg.dataset.ref = origen.dataset.wa || "WEB";
    $("[data-book-error]", dlg).textContent = "";
    $("[data-book-form]", dlg).hidden = false;
    $("[data-book-done]", dlg).hidden = true;
    $("[data-book-form] button[type=submit]", dlg).disabled = !listo;
    if (!dlg.open) { dlg.showModal(); lenis?.stop(); }
    if (!listo) pedido.then(() => {
      if (!dlg.open || dlg.origen !== origen) return;
      if (agenda) abrirReserva(origen);
      else $("[data-book-options]", dlg).innerHTML = `<p class="book__note">No pudimos ver los cupos en este momento. Escríbenos por WhatsApp y te apartamos el columpio.</p>`;
    });
  }

  const errores = {
    nombre: "Escribe tu nombre.", whatsapp: "Revisa tu WhatsApp: 10 dígitos que empiezan por 3.", acepta: "Para reservar, acepta la política de datos.",
    llena: "Esa clase se llenó hace un momento. Elige otra fecha.", tarde: "Esa clase empieza pronto y ya no se reserva por la web. Escríbenos por WhatsApp.",
    muchas: "Ya tienes dos reservas esperando el pago. Envía el comprobante o escríbenos por WhatsApp.", clase: "Elige una clase.",
  };

  // Apps Script takes 2 to 15 s to answer (Google starting the script, not our code). So the last answer
  // is kept 10 minutes to paint at once, the fresh one is awaited up to 25 s, and a click that comes
  // before it still opens the form. The server re-checks every booking: an old count never oversells.
  const GUARDADA = "casalotus:agenda";
  const traerAgenda = () => {
    const corte = new AbortController(), t = setTimeout(() => corte.abort(), 25000);
    return fetch(`${API}?accion=disponibilidad`, { signal: corte.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error("sin agenda");
        agenda = d;
        pintarAgenda();
        try { localStorage.setItem(GUARDADA, JSON.stringify({ t: Date.now(), d })); } catch { /* private mode: fine */ }
      })
      .finally(() => clearTimeout(t));
  };
  let pedido = Promise.resolve(), fallo = false;

  if (API && dlg?.showModal) {
    try {
      const g = JSON.parse(localStorage.getItem(GUARDADA) || "null");
      if (g && Date.now() - g.t < 600000) { agenda = g.d; pintarAgenda(); }
    } catch { /* nothing kept */ }
    pedido = traerAgenda().catch(() => { fallo = true; }); // no answer: WhatsApp keeps working
    $$("[data-book]").forEach((a) => a.addEventListener("click", (e) => {
      if (fallo && !agenda) return; // the studio never answered: the link goes to WhatsApp as always
      e.preventDefault();
      abrirReserva(a);
    }));

    const form = $("[data-book-form]", dlg);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(form), error = $("[data-book-error]", dlg), boton = $("button[type=submit]", form);
      const datos = { accion: "reservar", clase: f.get("clase"), nombre: String(f.get("nombre") || "").trim(), whatsapp: f.get("whatsapp"),
        acepta: form.acepta.checked, website: f.get("website"), ref: dlg.dataset.ref + (source ? `·${source}` : "") };
      if (!datos.clase) return (error.textContent = errores.clase);
      if (datos.nombre.length < 2) return (error.textContent = errores.nombre);
      if (String(datos.whatsapp).replace(/\D/g, "").length < 10) return (error.textContent = errores.whatsapp);
      if (!datos.acepta) return (error.textContent = errores.acepta);
      error.textContent = "";
      boton.disabled = true;
      boton.lastChild.textContent = "Apartando…";
      const paciencia = setTimeout(() => { boton.lastChild.textContent = "Un momento más…"; }, 6000);
      fetch(API, { method: "POST", body: JSON.stringify(datos) }) // text/plain: no preflight, Apps Script reads it as-is
        .then((r) => r.json())
        .then((r) => {
          if (!r.ok) throw new Error(errores[r.error] || "No pudimos apartar el columpio. Escríbenos por WhatsApp.");
          $("[data-book-when]", dlg).textContent = `${r.clase.fechaTexto.charAt(0).toUpperCase() + r.clase.fechaTexto.slice(1)} · ${r.clase.horaTexto} · te lo guardamos ${r.horas} horas`;
          $("[data-book-code]", dlg).textContent = r.codigo;
          $("[data-book-send]", dlg).href = `https://wa.me/${r.whatsapp}?text=${encodeURIComponent(`Hola Casa Lotus, aparté mi columpio para el ${r.clase.fechaTexto} a las ${r.clase.horaTexto} (código ${r.codigo}). Te envío el comprobante.`)}`;
          form.hidden = true;
          $("[data-book-done]", dlg).hidden = false;
          window.dispatchEvent(new CustomEvent("casalotus:reserva", { detail: { ref: datos.ref, codigo: r.codigo } }));
          traerAgenda().catch(() => {});
        })
        .catch((err) => { error.textContent = err.message.startsWith("No pudimos") || Object.values(errores).includes(err.message) ? err.message : "No pudimos conectar. Reserva por WhatsApp, te respondemos rápido."; })
        .finally(() => { clearTimeout(paciencia); boton.disabled = false; boton.lastChild.textContent = "Apartar mi columpio"; });
    });
    $("[data-book-close]", dlg).addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => lenis?.start());
  }

  /* ── Studio video ──────────────────────────────────────────
     Nothing downloads until a clip nears the screen; it plays only while visible. With reduced
     motion or data saver the poster stays and no video loads. */
  const clips = $$("video[data-src]");
  const saveData = navigator.connection?.saveData;
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
    return gsap.from(el, { y: 26, opacity: 0, duration: 1.2, ease: "expo.out", ...vars });
  };

  // hero: the silk fades in as it unfurls (silk.js). A navy ribbon, exactly as wide as the
  // mark's stroke, flies in from beyond the screen and winds into the infinity: a dash the length
  // of the infinity slides along lead-in + infinity until it covers the infinity alone. The real
  // SVG then takes over (that is when the over-under cut appears) and the petals bloom from their
  // base. After the entrance the mark never moves again.
  const intro = gsap.timeline({ defaults: { ease: "expo.out" }, delay: 0.1 });
  intro.from(".silk", { opacity: 0, duration: 2.2, ease: "sine.out", stagger: 0.25 }, 0)
    .add(() => splitIn($(".hero__title")), 0.35)
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
    gsap.set(".lotus-part", { opacity: 1 }); gsap.set(".ribbon-fly", { display: "none" });
    gsap.set(".lotus-draw__shadow", { opacity: 0.16 }); gsap.set(".paper-veil", { display: "none" });
  }
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
