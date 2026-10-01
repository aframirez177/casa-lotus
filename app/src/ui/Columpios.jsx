// Swing icons: the studio's own way to show a class filling up (the site's schedule uses the same drawing).
// The public never sees a number: the label is words. Staff get the count in the label.
import { useEffect, useRef, useState } from "react";
import { disponibilidad } from "../lib/clases.js";

export function Columpios({ clase, cupos, ocupados, pendientes = 0, tam = "m", claro = false, conNumero = false, decorativo = false, className = "" }) {
  const total = Number(cupos ?? clase?.cupos ?? 8);
  const llenos = Math.min(total, Number(ocupados ?? clase?.ocupados ?? 0));
  const antes = useRef(llenos);
  const [nuevos, setNuevos] = useState([]);
  useEffect(() => {
    if (llenos > antes.current) {
      const n = Array.from({ length: llenos - antes.current }, (_, i) => antes.current + i);
      setNuevos(n);
      const t = setTimeout(() => setNuevos([]), 1500);
      antes.current = llenos;
      return () => clearTimeout(t);
    }
    antes.current = llenos;
  }, [llenos]);
  const medidas = tam === "s" ? { "--asiento": "7px", "--alto": "18px", "--gap": "6px" } : tam === "l" ? { "--asiento": "11px", "--alto": "30px", "--gap": "12px" } : {};
  const etiqueta = conNumero ? `${llenos} de ${total} columpios ocupados` : clase ? disponibilidad(clase).texto : "";
  const firmes = Math.max(0, llenos - pendientes);
  return (
    <span className={`columpios ${claro ? "columpios-claro" : ""} ${className}`} style={medidas} {...(decorativo || !etiqueta ? { "aria-hidden": true } : { role: "img", "aria-label": etiqueta })}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} style={{ "--n": i }} className={`${i < firmes ? "lleno" : i < llenos ? "espera" : ""} ${nuevos.includes(i) ? "nuevo" : ""}`} />
      ))}
    </span>
  );
}
