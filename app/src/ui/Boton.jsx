import { forwardRef } from "react";
import { Link } from "react-router";

const VARIANTES = { primario: "btn-primario", suave: "btn-suave", niebla: "btn-niebla", linea: "btn-linea", lima: "btn-lima", peligro: "btn-peligro", fantasma: "btn-fantasma" };
const TAMANOS = { xs: "btn-xs", s: "btn-s", m: "", l: "btn-l" };

/**
 * <Boton variante="primario" punto cargando a="/ruta" href="https://…" icono={<X/>}>Texto</Boton>
 * `a` = in-app link (React Router), `href` = external (opens in a new tab).
 */
export const Boton = forwardRef(function Boton(
  { variante = "primario", tam = "m", bloque, punto, cargando, icono, iconoFinal, a, href, className = "", children, type = "button", disabled, ...resto },
  ref,
) {
  const clases = `btn ${VARIANTES[variante] || ""} ${TAMANOS[tam] || ""} ${bloque ? "btn-bloque" : ""} ${!children ? "btn-icono" : ""} ${className}`;
  const contenido = (
    <>
      {cargando ? <span className="cargando" aria-hidden="true"><i /><i /><i /></span> : punto ? <span className="punto" aria-hidden="true" /> : icono}
      {children && <span className={cargando ? "opacity-80" : undefined}>{children}</span>}
      {!cargando && iconoFinal}
      {cargando && <span className="sr-only">Un momento…</span>}
    </>
  );
  if (a) return <Link ref={ref} to={a} className={clases} {...resto}>{contenido}</Link>;
  if (href) return <a ref={ref} href={href} target="_blank" rel="noopener noreferrer" className={clases} {...resto}>{contenido}</a>;
  return <button ref={ref} type={type} className={clases} disabled={disabled || cargando} aria-busy={cargando || undefined} {...resto}>{contenido}</button>;
});
