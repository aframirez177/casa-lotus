// The toasts themselves (springs in and out). Loaded on demand by ProveedorAvisos.
import { AnimatePresence, m } from "motion/react";
import { Check, CircleAlert, Bell } from "lucide-react";
import { ConMovimiento } from "./ConMovimiento.jsx";

export default function AvisosLista({ lista, quitar }) {
  return (
    <ConMovimiento>
    <AnimatePresence initial={false}>
      {lista.map((x) => (
        <m.div
          key={x.id} layout
          initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.18 } }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className={`pointer-events-auto flex w-full max-w-[440px] items-center gap-3 rounded-[22px] py-3 pl-4 pr-2 shadow-glass ${x.tipo === "error" ? "bg-error-bg text-error" : "bg-navy-900 text-paper"}`}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center" aria-hidden="true">
            {x.icono || (x.tipo === "error" ? <CircleAlert size={18} /> : x.tipo === "nuevo" ? <Bell size={18} className="text-lime" /> : <Check size={18} className="text-lime" />)}
          </span>
          <p className="min-w-0 flex-1 py-1 text-[0.9375rem] leading-snug">{x.texto}</p>
          {x.accion && (
            <button type="button" onClick={() => { x.accion.fn(); if (!x.accion.mantener) quitar(x.id); }}
              className={`min-h-11 shrink-0 rounded-full px-4 text-[0.9375rem] font-semibold ${x.tipo === "error" ? "hover:bg-error/10" : "text-lime hover:bg-paper/10"}`}>
              {x.accion.texto}
            </button>
          )}
        </m.div>
      ))}
    </AnimatePresence>
    </ConMovimiento>
  );
}
