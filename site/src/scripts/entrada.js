// Casa Lotus — the mark's entrance on the home page, without GSAP (it must not wait for a library).
// A navy ribbon, exactly as wide as the mark's stroke, flies in from beyond the screen and winds into the
// infinity: a dash the length of the infinity slides along lead-in + infinity until it covers the
// infinity alone. Then, in paper: four discs are born one after another on the infinity's crossing
// (palest first, lime on top), grow, and one empty disc opens from the centre through all four. Since
// 2026-10-01 the discs stay around the mark, behind it and behind the headline: the page is never covered.
// The real SVG takes over from the ribbon, the petals bloom from their base, and the mark never moves again.
const root = document.documentElement;
const mark = document.querySelector("[data-lotus-draw]");

if (mark) {
  const $ = (s) => document.querySelector(s);
  const fly = mark.querySelector(".ribbon-fly"), measure = mark.querySelector(".ribbon-measure");
  const base = mark.querySelector(".lotus-part--base"), petals = [...mark.querySelectorAll(".lotus-part--petal")];
  const shadow = $(".lotus-draw__shadow"), veil = $(".paper-veil");
  const estatica = () => {
    [base, ...petals].forEach((p) => (p.style.opacity = 1));
    if (shadow) shadow.style.opacity = 0.16;
    if (fly) fly.style.display = "none";
    if (veil) veil.style.display = "none";
  };

  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !fly || !measure) estatica();
  else {
    try { entrada(); } catch { estatica(); }
  }

  function entrada() {
    // The infinity's centreline was measured on the real shape and smoothed (data-centre). The lead-in is
    // one cubic Bézier that starts beyond the top-right corner of *this* screen and arrives on the exact
    // tangent of the infinity, so there is no kink where they meet.
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
    // all layout reads first, in one go (no forced reflow later)
    const m = mark.getScreenCTM().inverse();
    const r = mark.getBoundingClientRect(), vr = veil?.getBoundingClientRect();
    const toMark = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    const S = toMark(innerWidth + 40, -40), J = centre[0];
    const tx = centre[1][0] - J[0], ty = centre[1][1] - J[1], tl = Math.hypot(tx, ty);
    const reach = Math.hypot(J[0] - S[0], J[1] - S[1]);
    const c2 = [J[0] - (tx / tl) * reach * 0.42, J[1] - (ty / tl) * reach * 0.42]; // on the tangent, behind J
    const c1 = [S[0] - reach * 0.18, S[1] + reach * 0.34];                        // a slow, open arc down
    measure.setAttribute("d", catmull(centre));
    fly.setAttribute("d", `M${S[0]} ${S[1]}C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${J[0]} ${J[1]}` + catmull(centre, false));
    const total = fly.getTotalLength(), inf = measure.getTotalLength(), leadLen = total - inf;
    fly.style.strokeDasharray = `${inf} ${total + inf}`;
    fly.style.strokeDashoffset = inf;
    fly.style.opacity = 1;

    // paper discs, painted as one radial gradient inside the veil (around the mark)
    const PAPER = ["#D6E1E6", "#B2D4E0", "#B7DFC5", "#D2F3A2"]; // bottom → top: line, sky, mint, lime (tokens.css)
    const rgb = PAPER.map((hx) => [1, 3, 5].map((k) => parseInt(hx.slice(k, k + 2), 16)));
    const sheets = PAPER.map(() => ({ h: 0, R: 0 })); // h: hole radius · R: outer radius (px)
    // every disc follows the same curve from its own birth: R = unit·A·(e^(age/T) − 1)
    const A = 0.35, T = 0.44, GAP = 0.19;
    const unit = r.width / 2;
    const cx = vr ? r.left + r.width / 2 - vr.left : 0, cy = vr ? r.top + r.height * 0.755 - vr.top : 0; // the infinity's crossing
    const cover = unit * 1.15; // just past the infinity's ends: contained around the mark
    const f = (n) => Math.round(n * 10) / 10;
    const shade = (i, a) => (i < 0 ? `rgb(22 84 114/${a})` : `rgb(${rgb[i].map((v, k) => Math.round(v + ([22, 84, 114][k] - v) * a)).join(" ")})`);
    let last = "";
    const paint = (clock) => {
      sheets.forEach((s, i) => { const age = clock - i * GAP; s.R = age > 0 ? Math.min(unit * A * Math.expm1(age / T), cover) : 0; });
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
        const w = Math.min(12, (b - a) * 0.45), AS = 0.13, paper = s.top >= 0;
        const inL = paper && prev && prev.top > s.top, inR = paper && next && next.top > s.top;
        // outside every disc the veil is transparent (the page shows), not the navy shade
        const col = (i, al) => (i < 0 ? "transparent" : shade(i, al));
        stops.push(`${col(s.top, inL ? AS : 0)} ${f(k ? a + 0.4 : a)}px`);
        if (inL) stops.push(`${col(s.top, AS * 0.35)} ${f(a + w * 0.4)}px`, `${col(s.top, 0)} ${f(a + w)}px`);
        if (inR) stops.push(`${col(s.top, 0)} ${f(b - w)}px`, `${col(s.top, AS * 0.35)} ${f(b - w * 0.4)}px`);
        if (s.b !== Infinity) stops.push(`${col(s.top, inR ? AS : 0)} ${f(b - 0.4)}px`);
      });
      const h0 = Math.min(...on.map((s) => s.h)), R1 = Math.max(...on.map((s) => s.R)), bl = 6, SA = 0.14;
      const cast = h0 > 0
        ? `transparent ${f(Math.max(0, h0 - bl))}px, rgb(22 84 114/${SA}) ${f(h0 + bl)}px, rgb(22 84 114/${SA}) ${f(R1 - bl)}px, transparent ${f(R1 + bl)}px`
        : `rgb(22 84 114/${SA}) ${f(Math.max(0, R1 - bl))}px, transparent ${f(R1 + bl)}px`;
      const bg = `radial-gradient(circle at ${f(cx)}px ${f(cy)}px, ${stops.join(", ")}), radial-gradient(circle at ${f(cx)}px ${f(cy + 8)}px, ${cast})`;
      if (bg !== last) { veil.style.background = bg; last = bg; }
    };

    // timeline (seconds), as v1
    const age = (rr) => T * Math.log1p(rr / A);
    const t0 = 0.1, flight = 2.3, land = t0 + flight;
    const covered = (PAPER.length - 1) * GAP + age((cover / unit) * 1.02);
    const start = land - 0.4, open = start + covered - 0.35, reveal = 1.1, swap = start + age(1.2);
    const fin = open + 0.4 + 0.12 * (petals.length - 1) + 1.5;
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const power2Out = (p) => 1 - (1 - p) ** 2;
    const power2InOut = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
    const expoOut = (p) => (p === 1 ? 1 : 1 - 2 ** (-10 * p));
    const sineOut = (p) => Math.sin((p * Math.PI) / 2);
    petals.forEach((p) => { p.style.transformBox = "fill-box"; p.style.transformOrigin = "50% 100%"; });

    let t00 = 0, swapped = false;
    const frame = (now) => {
      if (!t00) t00 = now;
      const t = (now - t00) / 1000;
      // the ribbon: enters with momentum, settles as it lands
      fly.style.strokeDashoffset = inf + (-leadLen - inf) * power2Out(clamp((t - t0) / flight));
      // the discs
      if (veil && t >= start) {
        const hole = t >= open ? power2InOut(clamp((t - open) / reveal)) * (cover + 24) : 0;
        sheets.forEach((s) => (s.h = hole));
        if (t <= open + reveal + 0.05) paint(t - start); else if (veil.style.display !== "none") veil.style.display = "none";
      }
      // the real mark takes over from the ribbon
      if (!swapped && t >= swap) { swapped = true; base.style.opacity = 1; fly.style.opacity = 0; }
      if (shadow && t >= open + 0.6) shadow.style.opacity = 0.16 * sineOut(clamp((t - open - 0.6) / 1.4));
      petals.forEach((p, i) => {
        const q = clamp((t - (open + 0.4 + i * 0.12)) / 1.5);
        if (q <= 0) return;
        const e = expoOut(q);
        p.style.opacity = e;
        p.style.transform = `translate(0, ${34 * (1 - e)}px) scale(${0.8 + 0.2 * e})`;
      });
      if (t < fin) requestAnimationFrame(frame);
      else { fly.style.display = "none"; root.classList.add("marca-lista"); }
    };
    requestAnimationFrame(frame);
  }
}
