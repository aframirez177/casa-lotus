// Occupancy ring: the number that governs every decision. Springs to its value once.
import { m, useReducedMotion } from "motion/react";

export function Anillo({ pct = 0, tam = 120, grosor = 10, claro = false, children, etiqueta }) {
  const r = (tam - grosor) / 2, c = 2 * Math.PI * r;
  const valor = Math.max(0, Math.min(100, pct));
  const reducir = useReducedMotion();
  return (
    <div className="relative grid place-items-center" style={{ width: tam, height: tam }} role="img" aria-label={etiqueta || `${valor} %`}>
      <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} className="-rotate-90" aria-hidden="true">
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" strokeWidth={grosor} stroke={claro ? "rgb(246 248 252 / .16)" : "var(--color-mist)"} />
        <m.circle
          cx={tam / 2} cy={tam / 2} r={r} fill="none" strokeWidth={grosor} strokeLinecap="round"
          stroke={claro ? "var(--color-lime)" : "var(--color-navy)"} strokeDasharray={c}
          initial={{ strokeDashoffset: reducir ? c * (1 - valor / 100) : c }}
          animate={{ strokeDashoffset: c * (1 - valor / 100) }}
          transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.15 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
