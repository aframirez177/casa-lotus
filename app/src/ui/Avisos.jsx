// Toasts, with «Deshacer» for reversible actions. A deferred action (programar) applies at once on screen,
// commits after a few seconds unless undone, and flushes immediately if the page is being hidden.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Check, CircleAlert, Bell } from "lucide-react";

const Ctx = createContext(null);
let n = 0;

export function ProveedorAvisos({ children }) {
  const [lista, setLista] = useState([]);
  const pendientes = useRef(new Map());

  const quitar = useCallback((id) => setLista((l) => l.filter((x) => x.id !== id)), []);
  const avisar = useCallback((texto, { tipo = "ok", duracion, accion, icono } = {}) => {
    const id = ++n;
    setLista((l) => [...l.slice(-2), { id, texto, tipo, accion, icono }]);
    const ms = duracion ?? (tipo === "error" ? 6500 : accion ? 6000 : 3600);
    setTimeout(() => quitar(id), ms);
    return id;
  }, [quitar]);

  const programar = useCallback(({ texto, aplicar, revertir, confirmar, duracion = 5000, textoError }) => {
    aplicar?.();
    const id = ++n;
    const ejecutar = async () => {
      if (!pendientes.current.has(id)) return;
      pendientes.current.delete(id);
      quitar(id);
      try { await confirmar(); }
      catch (e) { revertir?.(); avisar(textoError || e?.mensaje || "No se pudo guardar.", { tipo: "error" }); }
    };
    const t = setTimeout(ejecutar, duracion);
    pendientes.current.set(id, { ejecutar, t });
    setLista((l) => [...l.slice(-2), {
      id, texto, tipo: "info",
      accion: { texto: "Deshacer", fn: () => { clearTimeout(t); pendientes.current.delete(id); quitar(id); revertir?.(); } },
    }]);
  }, [avisar, quitar]);

  // never lose a deferred write: flush when the app goes to the background
  useEffect(() => {
    const vaciar = () => { for (const { ejecutar, t } of pendientes.current.values()) { clearTimeout(t); ejecutar(); } };
    const oculto = () => { if (document.visibilityState === "hidden") vaciar(); };
    addEventListener("pagehide", vaciar);
    document.addEventListener("visibilitychange", oculto);
    return () => { removeEventListener("pagehide", vaciar); document.removeEventListener("visibilitychange", oculto); };
  }, []);

  const valor = useMemo(() => ({ avisar, programar }), [avisar, programar]);
  return (
    <Ctx.Provider value={valor}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6" aria-live="polite" role="status">
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
      </div>
    </Ctx.Provider>
  );
}

export function useAvisos() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAvisos fuera de ProveedorAvisos");
  return c;
}
