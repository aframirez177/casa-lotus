// Form fields with labels, hints and errors wired for screen readers.
import { useId, useRef } from "react";
import { m } from "motion/react";

export function Campo({ etiqueta, ayuda, error, opcional, className = "", children, id: idDado }) {
  const id = useId();
  const idCampo = idDado || id;
  const hijo = typeof children === "function" ? children({ id: idCampo, "aria-invalid": error ? true : undefined, "aria-describedby": [ayuda && idCampo + "-a", error && idCampo + "-e"].filter(Boolean).join(" ") || undefined }) : children;
  return (
    <div className={className}>
      {etiqueta && <label htmlFor={idCampo} className="campo-etiqueta">{etiqueta}{opcional && <span className="font-normal text-muted"> · opcional</span>}</label>}
      {hijo}
      {ayuda && !error && <p id={idCampo + "-a"} className="campo-ayuda">{ayuda}</p>}
      {error && <p id={idCampo + "-e"} className="campo-error" role="alert">{error}</p>}
    </div>
  );
}

export function Entrada({ etiqueta, ayuda, error, opcional, valor, onCambio, className, area, ...resto }) {
  const Tag = area ? "textarea" : "input";
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} opcional={opcional} className={className}>
      {(a11y) => <Tag className="entrada" value={valor ?? ""} onChange={(e) => onCambio?.(e.target.value)} {...a11y} {...resto} />}
    </Campo>
  );
}

export function Selector({ etiqueta, ayuda, error, valor, onCambio, opciones, className, vacio, ...resto }) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} className={className}>
      {(a11y) => (
        <select className="entrada" value={valor ?? ""} onChange={(e) => onCambio?.(e.target.value)} {...a11y} {...resto}>
          {vacio && <option value="">{vacio}</option>}
          {opciones.map((o) => (typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.valor} value={o.valor}>{o.texto}</option>))}
        </select>
      )}
    </Campo>
  );
}

/**
 * Chip choices. multiple + max for «hasta 2 intereses». Arrow keys move between options (radiogroup).
 */
export function Opciones({ etiqueta, ayuda, error, opciones, valor, onCambio, multiple = false, max = Infinity, columnas = false, className = "" }) {
  const id = useId();
  const sel = multiple ? valor || [] : valor;
  const lista = opciones.map((o) => (typeof o === "string" ? { valor: o, texto: o } : o));
  const elegir = (v) => {
    if (!multiple) return onCambio(v === sel ? "" : v);
    if (sel.includes(v)) return onCambio(sel.filter((x) => x !== v));
    if (sel.length >= max) return onCambio([...sel.slice(1), v]);
    onCambio([...sel, v]);
  };
  const flechas = (e) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
    const botones = [...e.currentTarget.querySelectorAll("button")];
    const i = botones.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    botones[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + botones.length) % botones.length].focus();
  };
  return (
    <div className={className}>
      {etiqueta && <p id={id} className="campo-etiqueta">{etiqueta}</p>}
      <div role={multiple ? "group" : "radiogroup"} aria-labelledby={etiqueta ? id : undefined} onKeyDown={flechas}
        className={columnas ? "grid gap-2 sm:grid-cols-2" : "flex flex-wrap gap-2"}>
        {lista.map((o) => {
          const activo = multiple ? sel.includes(o.valor) : sel === o.valor;
          return (
            <button key={o.valor} type="button" className={`opcion ${columnas ? "justify-start" : ""}`}
              {...(multiple ? { "aria-pressed": activo } : { role: "radio", "aria-checked": activo })}
              onClick={() => elegir(o.valor)}>
              {o.icono}{o.texto}
            </button>
          );
        })}
      </div>
      {ayuda && !error && <p className="campo-ayuda">{ayuda}</p>}
      {error && <p className="campo-error" role="alert">{error}</p>}
    </div>
  );
}

export function Interruptor({ activo, onCambio, etiqueta, ayuda, disabled }) {
  const id = useId();
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="min-w-0 flex-1">
        <p id={id} className="font-medium text-navy">{etiqueta}</p>
        {ayuda && <p className="texto-s suave mt-0.5">{ayuda}</p>}
      </div>
      <button type="button" role="switch" aria-checked={Boolean(activo)} aria-labelledby={id} disabled={disabled} className="interruptor min-h-8" onClick={() => onCambio(!activo)} />
    </div>
  );
}

/** Six boxes: types, pastes, auto-advances, and backspaces like one field. */
export function CodigoInput({ valor = "", onCambio, onCompleto, largo = 6, error, deshabilitado }) {
  const refs = useRef([]);
  // The code as of the last keystroke. Focus moves to the next box before the parent re-renders with the
  // new value, so handlers must read this, not the `valor` captured by the previous render (that stale value
  // sent the focus back to the first box after every digit).
  const actual = useRef(valor);
  actual.current = valor;
  const digitos = Array.from({ length: largo }, (_, i) => valor[i] || "");
  const poner = (texto, desde = 0) => {
    const limpio = texto.replace(/\D/g, "");
    if (!limpio) return;
    const nuevo = (actual.current.slice(0, desde) + limpio).slice(0, largo);
    actual.current = nuevo;
    onCambio(nuevo);
    const foco = Math.min(nuevo.length, largo - 1);
    refs.current[foco]?.focus();
    if (nuevo.length === largo) onCompleto?.(nuevo);
  };
  return (
    <m.div className="flex justify-between gap-2" animate={error ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }} transition={{ duration: 0.4 }} role="group" aria-label="Código de 6 dígitos">
      {digitos.map((d, i) => (
        <input
          key={i} ref={(el) => (refs.current[i] = el)} className="entrada-codigo" inputMode="numeric" pattern="[0-9]*" maxLength={largo}
          autoComplete={i === 0 ? "one-time-code" : "off"} aria-label={`Dígito ${i + 1}`} value={d} disabled={deshabilitado} aria-invalid={error ? true : undefined}
          data-autofoco={i === 0 ? "" : undefined}
          onChange={(e) => poner(e.target.value.slice(-largo), Math.min(i, actual.current.length))}
          onPaste={(e) => { e.preventDefault(); poner(e.clipboardData.getData("text"), 0); }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              const hasta = d ? i : Math.max(0, i - 1);
              actual.current = actual.current.slice(0, hasta);
              onCambio(actual.current);
              refs.current[hasta]?.focus();
            } else if (e.key === "ArrowLeft") refs.current[Math.max(0, i - 1)]?.focus();
            else if (e.key === "ArrowRight") refs.current[Math.min(largo - 1, i + 1)]?.focus();
          }}
          onFocus={(e) => { const n = actual.current.length; if (i > n) refs.current[n]?.focus(); else e.target.select(); }}
        />
      ))}
    </m.div>
  );
}

export { formatoCelular } from "../lib/celular.js";
