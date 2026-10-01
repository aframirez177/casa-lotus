// Casa Lotus — the silk, drawn in a Web Worker on OffscreenCanvas: the main thread only forwards the
// hand and the scroll. Frames run while the hero is on screen and the tab is visible, nothing otherwise.
import { crearSeda, STEP } from "./seda-motor.js";

let seda = null, capas = [], visible = true, corriendo = false, prev = 0, acc = 0, fps = 60, primero = true, pendiente = 0, estatica = false;
const raf = self.requestAnimationFrame?.bind(self) ?? ((f) => setTimeout(() => f(performance.now()), 1000 / 60));

function bucle(ahora) {
  if (!visible) { corriendo = false; return; }
  const dt = Math.min(0.1, (ahora - prev) / 1000);
  // phones: at most ~30 frames a second (physics still steps at 60 Hz, so the motion is the same)
  if (fps < 60 && dt < 1 / fps - 0.002) { raf(bucle); return; }
  prev = ahora;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 6) { acc -= STEP; n++; }
  if (n === 6) acc = 0; // a long pause (tab switch): don't try to catch up
  seda.scroll(pendiente); pendiente = 0; // scroll inertia, eased per frame as in v1
  if (n) seda.step(n);
  seda.render();
  if (primero) { primero = false; self.postMessage({ tipo: "listo" }); }
  raf(bucle);
}
const arrancar = () => { if (corriendo || !visible || !seda || estatica) return; corriendo = true; prev = performance.now(); raf(bucle); };

self.onmessage = ({ data: m }) => {
  if (m.tipo === "init") {
    capas = m.canvases.map((canvas, i) => ({ canvas, ctx: canvas.getContext("2d"), depth: m.depths[i], ribbons: [] }));
    seda = crearSeda(capas);
    fps = m.fps || 60;
    seda.build(m.w, m.h, m.narrow, m.dpr);
    seda.step(150); // already hanging, never falling, on the first frame
    estatica = !!m.estatica;
    if (estatica) { seda.step(240); seda.render(); self.postMessage({ tipo: "listo" }); return; }
    arrancar();
  } else if (m.tipo === "resize" && seda) {
    seda.build(m.w, m.h, m.narrow, m.dpr);
    seda.step(150);
    seda.render();
  } else if (m.tipo === "puntero" && seda) {
    seda.puntero(m.x, m.y);
  } else if (m.tipo === "scroll") {
    pendiente += m.ds;
  } else if (m.tipo === "visible") {
    visible = m.visible;
    arrancar();
  }
};
