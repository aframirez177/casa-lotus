// Motion that orients: lists stagger in on their first load only, then stay put.
import { m } from "motion/react";
import { Children } from "react";

const vistas = new Set();

export function ListaEscalonada({ clave, children, className = "", como = "div", cada = 0.05 }) {
  const primera = clave && !vistas.has(clave);
  if (clave) vistas.add(clave);
  const Tag = m[como];
  return (
    <Tag className={className} initial={primera ? "oculto" : false} animate="visible" variants={{ visible: { transition: { staggerChildren: cada } } }}>
      {Children.map(children, (hijo) => hijo && (
        <m.div variants={{ oculto: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 28 } } }}>{hijo}</m.div>
      ))}
    </Tag>
  );
}

export function Aparece({ children, className = "", retraso = 0 }) {
  return (
    <m.div className={className} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 240, damping: 28, delay: retraso }}>
      {children}
    </m.div>
  );
}
