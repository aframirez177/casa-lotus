// Bottom sheet on phones (drag the handle down to close), centred dialog from 768 px.
// Focus is trapped while open and returns to where it was; Esc closes; the page behind does not scroll.
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m, useDragControls } from "motion/react";
import { X } from "lucide-react";
import { useEsAncho } from "./useMedia.js";

const FOCO = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let abiertas = 0;

export function Hoja({ abierta, alCerrar, titulo, descripcion, etiqueta, children, pie, ancho = "max-w-[560px]", oscura = false }) {
  return createPortal(
    <AnimatePresence>{abierta && <Panel {...{ alCerrar, titulo, descripcion, etiqueta, pie, ancho, oscura }}>{children}</Panel>}</AnimatePresence>,
    document.body,
  );
}

function Panel({ alCerrar, titulo, descripcion, etiqueta, children, pie, ancho, oscura }) {
  const ancha = useEsAncho();
  const panel = useRef(null);
  const previo = useRef(null);
  const controles = useDragControls();
  const idTitulo = useId(), idDesc = useId();

  useEffect(() => {
    previo.current = document.activeElement;
    abiertas++;
    document.documentElement.style.overflow = "hidden";
    const t = setTimeout(() => {
      const el = panel.current?.querySelector("[data-autofoco]") || panel.current;
      el?.focus({ preventScroll: true });
    }, 40);
    return () => {
      clearTimeout(t);
      abiertas--;
      if (!abiertas) document.documentElement.style.overflow = "";
      if (previo.current?.focus) setTimeout(() => previo.current.focus({ preventScroll: true }), 0);
    };
  }, []);

  function teclado(e) {
    if (e.key === "Escape") { e.stopPropagation(); alCerrar?.(); return; }
    if (e.key !== "Tab") return;
    const f = [...panel.current.querySelectorAll(FOCO)].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const primero = f[0], ultimo = f[f.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  }

  const fondo = oscura ? "bg-navy-900 text-paper" : "bg-white";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" onKeyDown={teclado}>
      <m.div
        className="absolute inset-0 bg-navy-900/35 backdrop-blur-[3px]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
        onClick={alCerrar} aria-hidden="true"
      />
      <m.div
        ref={panel}
        role="dialog" aria-modal="true" aria-labelledby={titulo ? idTitulo : undefined} aria-label={titulo ? undefined : etiqueta} aria-describedby={descripcion ? idDesc : undefined}
        tabIndex={-1}
        className={`relative flex w-full ${ancho} max-h-[92dvh] flex-col overflow-hidden outline-none ${fondo} rounded-t-[32px] md:rounded-[32px] shadow-float`}
        initial={ancha ? { opacity: 0, y: 18, scale: 0.97 } : { y: "100%" }}
        animate={ancha ? { opacity: 1, y: 0, scale: 1 } : { y: 0 }}
        exit={ancha ? { opacity: 0, y: 12, scale: 0.98 } : { y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38, mass: 0.9 }}
        drag={ancha ? false : "y"} dragListener={false} dragControls={controles}
        dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) alCerrar?.(); }}
      >
        <div className="shrink-0 touch-none px-6 pt-3 md:pt-6" onPointerDown={(e) => !ancha && controles.start(e)}>
          <div className={`mx-auto mb-3 h-1.5 w-11 rounded-full md:hidden ${oscura ? "bg-paper/25" : "bg-line"}`} aria-hidden="true" />
          {(titulo || alCerrar) && (
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1 pt-1">
                {titulo && <h2 id={idTitulo} className={`titulo-s ${oscura ? "!text-paper" : ""}`}>{titulo}</h2>}
                {descripcion && <p id={idDesc} className={`mt-2 texto-s ${oscura ? "text-paper/75" : "suave"}`}>{descripcion}</p>}
              </div>
              {alCerrar && (
                <button type="button" onClick={alCerrar} className={`-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full ${oscura ? "hover:bg-paper/10" : "hover:bg-mist"}`} aria-label="Cerrar">
                  <X size={20} strokeWidth={1.8} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-4">{children}</div>
        {pie && <div className={`shrink-0 border-t px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:pb-6 ${oscura ? "border-paper/10" : "border-line"}`}>{pie}</div>}
      </m.div>
    </div>
  );
}
