import { useId } from "react";
import { m } from "motion/react";

/** Segmented control with a sliding pill (shared layout). */
export function Segmentado({ opciones, valor, onCambio, etiqueta, className = "", claro = false }) {
  const grupo = useId();
  return (
    <div role="tablist" aria-label={etiqueta} className={`inline-flex rounded-full p-1 ${claro ? "bg-white shadow-card" : "bg-mist"} ${className}`}>
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button key={o.valor} type="button" role="tab" aria-selected={activo} onClick={() => onCambio(o.valor)}
            className={`relative min-h-10 rounded-full px-4 text-[0.9375rem] font-medium transition-colors ${activo ? "text-paper" : "text-navy hover:text-navy-900"}`}>
            {activo && <m.span layoutId={grupo} className="absolute inset-0 rounded-full bg-navy" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            <span className="relative inline-flex items-center gap-2">{o.texto}{o.insignia ? <span className={`insignia ${activo ? "insignia-lima" : ""}`}>{o.insignia}</span> : null}</span>
          </button>
        );
      })}
    </div>
  );
}
