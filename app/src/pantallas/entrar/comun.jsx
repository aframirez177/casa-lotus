import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Campo } from "../../ui/Campos.jsx";
import { Simbolo } from "../../ui/Logo.jsx";
import { Link } from "react-router";
import { ConMovimiento } from "../../ui/ConMovimiento.jsx";

const COMUNES = ["1234567890", "12345678910", "contraseña", "contrasena", "password123", "casalotus", "qwertyuiop", "0123456789", "yogaaereo"];

/** 0–4 and Ana's words. Min 10 characters (contract §6 /api/auth/password). */
export function fuerza(clave = "") {
  if (!clave) return { nivel: 0, texto: "" };
  if (clave.length < 10) return { nivel: 1, texto: `Muy corta: faltan ${10 - clave.length} caracteres` };
  if (COMUNES.includes(clave.toLowerCase())) return { nivel: 1, texto: "Es muy común: elige otra" };
  let p = 1;
  if (/[a-záéíóúñ]/i.test(clave) && /\d/.test(clave)) p++;
  if (/[A-ZÁÉÍÓÚÑ]/.test(clave) && /[a-záéíóúñ]/.test(clave)) p++;
  if (/[^A-Za-z0-9áéíóúñÁÉÍÓÚÑ]/.test(clave) || clave.length >= 16) p++;
  return { nivel: Math.min(4, p), texto: ["", "Aceptable", "Buena", "Muy buena", "Excelente"][Math.min(4, p)] };
}

export function CampoClave({ etiqueta = "Contraseña", valor, onCambio, error, autoComplete = "current-password", conFuerza = false, autoFocus }) {
  const [ver, setVer] = useState(false);
  const f = fuerza(valor);
  return (
    <Campo etiqueta={etiqueta} error={error}>
      {(a11y) => (
        <>
          <div className="relative">
            <input {...a11y} type={ver ? "text" : "password"} className="entrada pr-14" value={valor} onChange={(e) => onCambio(e.target.value)} autoComplete={autoComplete} autoFocus={autoFocus} required minLength={conFuerza ? 10 : undefined} />
            <button type="button" onClick={() => setVer(!ver)} className="absolute right-1.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-mist" aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={ver}>
              {ver ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
          {conFuerza && valor && (
            <div className="mt-3" aria-live="polite">
              <div className="flex gap-1.5" aria-hidden="true">
                {[1, 2, 3, 4].map((i) => <span key={i} className="h-1.5 flex-1 rounded-full transition-colors duration-300" style={{ background: i <= f.nivel ? (f.nivel <= 1 ? "var(--color-error)" : f.nivel === 2 ? "var(--color-aviso)" : "var(--color-teal)") : "var(--color-line)" }} />)}
              </div>
              <p className={`mt-2 text-[0.8125rem] ${f.nivel <= 1 ? "text-error" : "text-muted"}`}>{f.texto}{f.nivel >= 2 && f.nivel < 4 ? ". Mezcla letras, números y algún símbolo para hacerla más fuerte." : ""}</p>
            </div>
          )}
        </>
      )}
    </Campo>
  );
}

/** A quiet single-column page with the mark on top (sign-in, links). */
export function PaginaSola({ children, ancho = "max-w-[460px]" }) {
  return (
    <ConMovimiento>
      <div className="atmosfera" aria-hidden="true"><i /><i /><i /></div>
      <main className={`mx-auto flex min-h-dvh w-full ${ancho} flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)]`}>
        <Link to="/" className="mb-10 inline-flex w-fit items-center gap-2.5 rounded-lg text-navy md:mb-14" aria-label="Casa Lotus">
          <Simbolo className="h-9 w-auto" />
        </Link>
        {children}
      </main>
    </ConMovimiento>
  );
}
