// Small shared pieces: headers, sections, empty states, avatars, class tags, error boxes.
import { RefreshCw } from "lucide-react";
import { Simbolo } from "./Logo.jsx";
import { colorClase, nombreClase } from "../lib/clases.js";
import { Boton } from "./Boton.jsx";

export function Encabezado({ eyebrow, titulo, lead, accion, grande = true, className = "" }) {
  return (
    <header className={`mb-8 pt-4 lg:pt-2 ${className}`}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="etiqueta mb-4">{eyebrow}</p>}
          <h1 className={grande ? "saludo" : "titulo"}>{titulo}</h1>
        </div>
        {accion && <div className="hidden shrink-0 sm:block">{accion}</div>}
      </div>
      {lead && <p className="lead mt-4 max-w-[46ch]">{lead}</p>}
      {accion && <div className="mt-5 sm:hidden">{accion}</div>}
    </header>
  );
}

export function Seccion({ titulo, ayuda, accion, children, className = "", id }) {
  return (
    <section className={`mt-10 first:mt-0 ${className}`} aria-labelledby={id}>
      {(titulo || accion) && (
        <div className={`mb-4 flex justify-between gap-3 ${ayuda ? "items-end" : "items-center"}`}>
          <div>
            {titulo && <h2 id={id} className="etiqueta">{titulo}</h2>}
            {ayuda && <p className="texto-s suave mt-2 max-w-[52ch]">{ayuda}</p>}
          </div>
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

export function Vacio({ titulo, texto, accion, className = "" }) {
  return (
    <div className={`tarjeta-suave flex flex-col items-center px-6 py-10 text-center ${className}`}>
      <Simbolo className="mb-4 h-9 w-auto text-navy/25" />
      <p className="subtitulo">{titulo}</p>
      {texto && <p className="texto-s suave mt-2 max-w-[36ch]">{texto}</p>}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  );
}

const TONOS = ["var(--color-multinivel)", "var(--color-yoga)", "var(--color-pilates)", "var(--color-stretch)", "var(--color-blob)"];
export function Avatar({ nombre = "", tam = 44, className = "" }) {
  // letters only: «Ana Admin (dev)» → «AA», «+57 301…» → a quiet dot
  const palabras = nombre.trim().split(/\s+/).filter((p) => /^\p{L}/u.test(p));
  const ini = ((palabras[0]?.[0] || "") + (palabras.length > 1 ? palabras[palabras.length - 1][0] : "")).toUpperCase();
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-semibold text-navy ${className}`} style={{ width: tam, height: tam, background: TONOS[h % TONOS.length], fontSize: tam * 0.36 }} aria-hidden="true">
      {ini || "·"}
    </span>
  );
}

export function TagClase({ clase, className = "" }) {
  const nombre = typeof clase === "string" ? clase : nombreClase(clase);
  return <span className={`tag-clase ${className}`} style={{ "--c": colorClase(nombre) }}>{nombre}</span>;
}

/** A thin colour field that marks the class type on a card's edge. */
export function FranjaClase({ clase, className = "" }) {
  return <span aria-hidden="true" className={`block w-1.5 shrink-0 self-stretch rounded-full ${className}`} style={{ background: colorClase(typeof clase === "string" ? clase : clase?.clase) }} />;
}

export function ErrorCaja({ error, reintentar, className = "" }) {
  return (
    <div className={`tarjeta-suave flex flex-col items-start gap-3 p-6 ${className}`} role="alert">
      <p className="subtitulo">No pudimos cargar esto</p>
      <p className="texto-s suave">{error?.mensaje || "Revisa tu conexión e intenta de nuevo."}</p>
      {reintentar && <Boton variante="suave" tam="s" icono={<RefreshCw size={16} />} onClick={reintentar}>Intentar de nuevo</Boton>}
    </div>
  );
}

export function Dato({ etiqueta, children, className = "" }) {
  return (
    <div className={className}>
      <dt className="etiqueta-sola mb-1">{etiqueta}</dt>
      <dd className="text-ink">{children || <span className="suave">—</span>}</dd>
    </div>
  );
}
