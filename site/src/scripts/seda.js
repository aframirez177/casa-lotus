// Casa Lotus — silk in the hero (v1 look, new engine placement).
// The simulation and the drawing live in a Web Worker on OffscreenCanvas (seda.worker.js): the main
// thread only forwards the hand and the scroll, so the silk costs the page nothing. It starts after the
// page has loaded and gone idle, sleeps off screen or in a hidden tab, and fades in on its first frame.
// - prefers-reduced-motion or Save-Data: one settled frame, drawn once, then still (as in v1).
// - no OffscreenCanvas (older Safari): on the home page the same engine runs on the main thread, capped at
//   30 fps on phones and started only on the first interaction; on inner pages, one settled frame.
import { crearSeda, STEP } from "./seda-motor.js";

const host = document.querySelector("[data-silk-host]");
const canvases = [...document.querySelectorAll("[data-silk]")];

if (host && canvases.length) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.connection?.saveData === true;
  const estrecho = () => matchMedia("(max-width: 760px)").matches;
  const movil = matchMedia("(pointer: coarse)").matches;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const esInicio = host.classList.contains("hero");
  const tam = () => { const r = host.getBoundingClientRect(); return { w: r.width, h: r.height }; };
  const mostrar = () => canvases.forEach((c) => c.classList.add("is-on"));

  const cuandoInactivo = (fn, espera = 1200) => {
    const ir = () => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: espera }) : setTimeout(fn, 200));
    if (document.readyState === "complete") ir(); else addEventListener("load", ir, { once: true });
  };

  // input, shared by both engines: pointer over the hero (rAF-throttled) and scroll deltas
  const enlazar = (puntero, scroll) => {
    let ultimoScroll = scrollY, pendiente = null, cuadro = 0;
    addEventListener("pointermove", (e) => {
      pendiente = e;
      if (cuadro) return;
      cuadro = requestAnimationFrame(() => {
        cuadro = 0;
        const r = host.getBoundingClientRect(), x = pendiente.clientX - r.left, y = pendiente.clientY - r.top;
        if (y < -80 || y > r.height + 80) return puntero(null, null);
        puntero(x, y);
        // the layers shift by depth: far silk moves less than near silk (a transform: compositor only)
        canvases.forEach((c) => {
          const k = c.dataset.silk === "back" ? 10 : 22;
          c.style.transform = `translate3d(${(x / r.width - 0.5) * -k}px, ${(y / r.height - 0.5) * -k * 0.6}px, 0)`;
        });
      });
    }, { passive: true });
    document.addEventListener("pointerleave", () => puntero(null, null));
    addEventListener("scroll", () => { const y = scrollY; scroll(y - ultimoScroll); ultimoScroll = y; }, { passive: true });
  };

  const offscreen = !reduce && "transferControlToOffscreen" in HTMLCanvasElement.prototype && "Worker" in window;

  if (offscreen) {
    cuandoInactivo(() => {
      const worker = new Worker(new URL("./seda.worker.js", import.meta.url), { type: "module" });
      const off = canvases.map((c) => c.transferControlToOffscreen());
      const { w, h } = tam();
      worker.postMessage({ tipo: "init", canvases: off, depths: canvases.map((c) => c.dataset.silk), w, h, narrow: estrecho(), dpr, fps: movil ? 30 : 60 }, off);
      worker.onmessage = ({ data }) => { if (data.tipo === "listo") mostrar(); };
      enlazar((x, y) => worker.postMessage({ tipo: "puntero", x, y }), (ds) => worker.postMessage({ tipo: "scroll", ds }));
      const visible = { pantalla: true };
      const avisar = () => worker.postMessage({ tipo: "visible", visible: visible.pantalla && !document.hidden });
      new IntersectionObserver(([e]) => { visible.pantalla = e.isIntersecting; avisar(); }).observe(host);
      document.addEventListener("visibilitychange", avisar);
      let ancho = w;
      new ResizeObserver(() => {
        const t = tam();
        if (Math.abs(t.w - ancho) < 1) return; // a phone's URL bar changing the height must not re-drop the silk
        ancho = t.w;
        worker.postMessage({ tipo: "resize", w: t.w, h: t.h, narrow: estrecho(), dpr });
      }).observe(host);
    }, 1500);
  } else {
    // main-thread engine: a settled still frame, or (home only, with motion) a light live loop
    const capas = canvases.map((canvas) => ({ canvas, ctx: canvas.getContext("2d"), depth: canvas.dataset.silk, ribbons: [] }));
    const seda = crearSeda(capas);
    let vivoActivo = false;
    const quieta = () => { if (vivoActivo) return; const { w, h } = tam(); seda.build(w, h, estrecho(), dpr); seda.step(390); seda.render(); mostrar(); };
    if (reduce || !esInicio) cuandoInactivo(quieta, 2000);
    else {
      const vivo = () => {
        vivoActivo = true;
        const { w, h } = tam();
        seda.build(w, h, estrecho(), Math.min(dpr, 1.5));
        seda.step(150);
        let visible = true, corriendo = false, prev = 0, acc = 0, ds = 0;
        const fps = movil ? 30 : 60;
        enlazar((x, y) => seda.puntero(x, y), (d) => (ds += d));
        const bucle = (ahora) => {
          if (!visible || document.hidden) { corriendo = false; return; }
          const dt = Math.min(0.1, (ahora - prev) / 1000);
          if (dt < 1 / fps - 0.002) return requestAnimationFrame(bucle);
          prev = ahora; acc += dt;
          seda.scroll(ds); ds = 0;
          let n = 0; while (acc >= STEP && n < 6) { acc -= STEP; n++; }
          if (n === 6) acc = 0;
          if (n) seda.step(n);
          seda.render();
          requestAnimationFrame(bucle);
        };
        const arrancar = () => { if (corriendo || !visible || document.hidden) return; corriendo = true; prev = performance.now(); requestAnimationFrame(bucle); };
        new IntersectionObserver(([e]) => { visible = e.isIntersecting; arrancar(); }).observe(host);
        document.addEventListener("visibilitychange", arrancar);
        seda.render(); mostrar(); arrancar();
      };
      // the first interaction starts it (an audit or a visitor who only reads sees the still frame)
      cuandoInactivo(quieta, 2000);
      const una = () => { ["pointermove", "scroll", "touchstart", "keydown"].forEach((t) => removeEventListener(t, una)); setTimeout(vivo, 50); };
      ["pointermove", "scroll", "touchstart", "keydown"].forEach((t) => addEventListener(t, una, { passive: true, once: true }));
    }
  }
}
