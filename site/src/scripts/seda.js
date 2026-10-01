// Casa Lotus — silk in the hero.
// Ribbons of fabric hang from the ceiling, like the swings, and flow through the air.
// Each ribbon is a Verlet rope pinned at the top: a slow wind keeps it alive, the hand drags
// it along as it moves, and scrolling gives it inertia. Two canvases give depth: the back one
// is blurred (far), the front one sharp (near).
// No dependencies.
(() => {
  const host = document.querySelector("[data-silk-host]");
  const canvases = [...document.querySelectorAll("[data-silk]")];
  if (!host || !canvases.length) return;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const narrow = matchMedia("(max-width: 760px)");
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  // the far layer is blurred by CSS, so it doesn't need full resolution
  const dprOf = (depth) => (depth === "back" ? Math.min(1, DPR * 0.5) : DPR);
  const STEP = 1 / 60;
  const N = 44;

  // Ana's colours only
  const RGB = { sky: "178,212,224", mint: "183,223,197", aqua: "138,212,214", lime: "210,243,162", navy: "22,84,114" };

  // x: rigging point across the hero (0–1) · w: half-width at full face (px) · len: × hero height
  // a: opacity · ph: phase, so no two ribbons move in step
  const LAYOUT = {
    wide: {
      back: [
        { x: 0.55, w: 78, len: 1.08, c: "sky", a: 0.78, ph: 0 },
        { x: 0.9, w: 92, len: 0.96, c: "mint", a: 0.82, ph: 2.1 },
      ],
      front: [
        { x: 0.71, w: 50, len: 0.9, c: "aqua", a: 0.55, ph: 1.2 },
        { x: 0.8, w: 16, len: 1.12, c: "navy", a: 0.26, ph: 3.4 },
        { x: 0.62, w: 13, len: 0.78, c: "lime", a: 0.75, ph: 4.2 },
      ],
    },
    narrow: {
      back: [
        { x: 0.22, w: 54, len: 0.7, c: "sky", a: 0.6, ph: 0 },
        { x: 0.86, w: 60, len: 0.8, c: "mint", a: 0.7, ph: 2.1 },
      ],
      front: [
        { x: 0.64, w: 30, len: 0.62, c: "aqua", a: 0.45, ph: 1.2 },
        { x: 0.78, w: 10, len: 0.74, c: "navy", a: 0.22, ph: 3.4 },
      ],
    },
  };

  const layers = canvases.map((cv) => ({ cv, ctx: cv.getContext("2d"), depth: cv.dataset.silk, ribbons: [] }));
  const env = { t: 0, px: null, py: null, pvx: 0, pvy: 0, sv: 0, R: 240, scale: 1, W: 0, H: 0 };

  function build() {
    const r = host.getBoundingClientRect();
    env.W = r.width; env.H = r.height;
    env.scale = Math.max(0.7, Math.min(1.25, r.width / 1280));
    env.R = 260 * env.scale;
    const spec = narrow.matches ? LAYOUT.narrow : LAYOUT.wide;
    layers.forEach((L) => {
      const dpr = dprOf(L.depth);
      L.cv.width = Math.round(r.width * dpr);
      L.cv.height = Math.round(r.height * dpr);
      L.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      L.ribbons = (spec[L.depth] || []).map((s) => {
        const ax = s.x * r.width, ay = -40, seg = (s.len * r.height) / (N - 1);
        // start hanging straight: the entrance is a fade, never a fall
        const pts = Array.from({ length: N }, (_, i) => ({ x: ax, y: ay + i * seg, px: ax, py: ay + i * seg }));
        return { ...s, ax, ay, seg, pts };
      });
    });
  }

  /* ── Physics ─────────────────────────────────────────── */
  function simulate(rb) {
    const { pts, seg } = rb;
    for (let i = 1; i < N; i++) {
      const p = pts[i], f = i / (N - 1);
      const vx = (p.x - p.px) * 0.965, vy = (p.y - p.py) * 0.965;
      p.px = p.x; p.py = p.y;
      // a slow flow field: the silk breathes on its own
      const wx = Math.sin(p.y * 0.006 + env.t * 0.7 + rb.ph) * 0.2 + Math.sin(env.t * 0.27 + rb.ph * 2) * 0.24;
      const wy = Math.cos(p.x * 0.005 + env.t * 0.5 + rb.ph) * 0.05;
      // the hand: movement nearby drags the fabric along, and the whole ribbon leans toward it
      let hx = 0, hy = 0;
      if (env.px !== null) {
        const dx = env.px - p.x, dy = env.py - p.y, d = Math.hypot(dx, dy);
        if (d < env.R) { const k = 1 - d / env.R; hx += env.pvx * k * k * 0.42; hy += env.pvy * k * k * 0.42; }
        hx += dx * 0.00032;
      }
      p.x += vx + (wx + hx) * f;
      p.y += vy + 0.32 + wy + hy * f + env.sv * f * 0.06;
    }
    for (let k = 0; k < 8; k++) {
      pts[0].x = rb.ax; pts[0].y = rb.ay;
      for (let i = 1; i < N; i++) {
        const a = pts[i - 1], b = pts[i];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, diff = (d - seg) / d;
        if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
        else { const h = diff * 0.5; a.x += dx * h; a.y += dy * h; b.x -= dx * h; b.y -= dy * h; }
      }
    }
  }

  /* ── Silk drawing ───────────────────────────────────── */
  // smooth curve through a list of points (quadratic through midpoints)
  function trace(path, P, start) {
    if (start) path.moveTo(P[0][0], P[0][1]); else path.lineTo(P[0][0], P[0][1]);
    for (let i = 1; i < P.length - 1; i++) {
      path.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
    }
    path.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
  }

  // draws one ribbon: body with a gradient along its length, then sheen and shade on its edges
  function draw(ctx, rb) {
    const { pts } = rb;
    const left = [], right = [], widths = new Array(N), normals = new Array(N);
    for (let i = 0; i < N; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const f = i / (N - 1);
      // the fabric turns as it falls: its visible width follows the twist, which reads as depth
      const swing = Math.max(-0.6, Math.min(0.6, (p.x - p.px) * 0.05));
      const c = Math.cos(rb.ph + f * 5.4 + env.t * 0.45 + swing);
      const taper = Math.min(1, 0.14 + f * 3.4) * (1 - f * 0.32); // gathered at the rigging, open below
      widths[i] = rb.w * env.scale * taper * (0.2 + 0.8 * Math.abs(c));
      normals[i] = [-ty, tx];
          }
    // silk never has a jagged edge: average each width with its neighbours
    for (let i = 0; i < N; i++) {
      const w = (widths[Math.max(0, i - 1)] + 2 * widths[i] + widths[Math.min(N - 1, i + 1)]) / 4;
      const p = pts[i], [nx, ny] = normals[i];
      left.push([p.x + nx * w, p.y + ny * w]);
      right.push([p.x - nx * w, p.y - ny * w]);
    }
    const outline = new Path2D();
    trace(outline, left, true);
    trace(outline, right.slice().reverse(), false);
    outline.closePath();

    const top = pts[0], bot = pts[N - 1];
    const g = ctx.createLinearGradient(top.x, top.y, bot.x, bot.y);
    g.addColorStop(0, `rgba(${RGB[rb.c]},${rb.a * 0.3})`);
    g.addColorStop(0.35, `rgba(${RGB[rb.c]},${rb.a})`);
    g.addColorStop(1, `rgba(${RGB[rb.c]},${rb.a * 0.5})`);
    ctx.fillStyle = g;
    ctx.fill(outline);

    // sheen on one edge, shade on the other: each is one continuous stroke on the same smooth
    // curve as the fill, so the edge stays clean (segment-by-segment strokes read as grain)
    const edge = (P, colour) => {
      const e = new Path2D(); trace(e, P, true);
      const gr = ctx.createLinearGradient(top.x, top.y, bot.x, bot.y);
      gr.addColorStop(0, `rgba(${colour},0)`);
      gr.addColorStop(0.3, `rgba(${colour},${colour === RGB.navy ? 0.16 * rb.a : 0.5 * rb.a})`);
      gr.addColorStop(1, `rgba(${colour},0)`);
      ctx.strokeStyle = gr; ctx.lineWidth = 1.2; ctx.stroke(e);
    };
    edge(left, "255,255,255");
    edge(right, RGB.navy);
  }

  /* ── Frame ──────────────────────────────────────────── */
  function render() {
    layers.forEach(({ ctx, ribbons }) => {
      ctx.clearRect(0, 0, env.W, env.H);
      ribbons.forEach((rb) => draw(ctx, rb));
    });
  }

  build();
  for (let k = 0; k < 150; k++) { env.t += STEP; layers.forEach((L) => L.ribbons.forEach(simulate)); }
  // rebuild only when the width changes (a mobile URL bar changing the height must not re-drop the silk)
  let builtWidth = env.W;
  new ResizeObserver(() => {
    const w = host.getBoundingClientRect().width;
    if (Math.abs(w - builtWidth) < 1) return;
    builtWidth = w; build(); if (reduce) settle();
  }).observe(host);

  // reduced motion: let the silk fall into place once, draw it, and stop
  function settle() {
    for (let s = 0; s < 240; s++) { env.t += STEP; layers.forEach((L) => L.ribbons.forEach(simulate)); }
    render();
  }
  if (reduce) { settle(); return; }

  // local QA only: advance the simulation by hand (hidden tabs get no animation frames)
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    window.__silk = { step(n = 60, px = null, py = null, pvx = 0) {
      env.px = px; env.py = py; env.pvx = pvx;
      for (let s = 0; s < n; s++) { env.t += STEP; layers.forEach((L) => L.ribbons.forEach(simulate)); }
      render();
    } };
  }

  // input: pointer anywhere over the hero, scroll inertia everywhere
  let lastX = null, lastY = null, lastScroll = scrollY;
  addEventListener("pointermove", (e) => {
    const r = host.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (y < -80 || y > r.height + 80) { env.px = null; lastX = null; return; }
    const clamp = (v) => Math.max(-18, Math.min(18, v));
    if (lastX !== null) { env.pvx += (clamp(x - lastX) - env.pvx) * 0.5; env.pvy += (clamp(y - lastY) - env.pvy) * 0.5; }
    env.px = x; env.py = y; lastX = x; lastY = y;
    // the layers shift by depth: far silk moves less than near silk
    layers.forEach((L) => {
      const k = L.depth === "back" ? 10 : 22;
      L.cv.style.transform = `translate3d(${(x / r.width - 0.5) * -k}px, ${(y / r.height - 0.5) * -k * 0.6}px, 0)`;
    });
  }, { passive: true });
  document.addEventListener("pointerleave", () => { env.px = null; lastX = null; });

  // one loop at a time; it sleeps while the hero is off screen or the tab is hidden
  let visible = true, running = false, acc = 0, prev = 0;
  const start = () => { if (running || !visible || document.hidden) return; running = true; prev = performance.now(); requestAnimationFrame(loop); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }).observe(host);

  function loop(now) {
    if (!visible || document.hidden) { running = false; return; }
    const dt = Math.min(0.1, (now - prev) / 1000);
    acc += dt;
    prev = now;
    const ds = scrollY - lastScroll; lastScroll = scrollY;
    env.sv += (ds - env.sv) * 0.2;
    while (acc >= STEP) {
      env.t += STEP;
      layers.forEach((L) => L.ribbons.forEach(simulate));
      env.pvx *= 0.9; env.pvy *= 0.9;
      acc -= STEP;
    }
    render();
    requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", start);
  start();
})();
