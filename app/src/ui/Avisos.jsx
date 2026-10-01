// Toasts, with «Deshacer» for reversible actions. A deferred action (programar) applies at once on screen,
// commits after a few seconds unless undone, and flushes immediately if the page is being hidden.
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const AvisosLista = lazy(() => import("./AvisosLista.jsx"));

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
  // the animated list loads with the first toast (or when the browser is idle), never on the first paint
  const [usada, setUsada] = useState(false);
  useEffect(() => { if (lista.length) setUsada(true); }, [lista.length]);
  useEffect(() => {
    let id;
    const precargar = () => import("./AvisosLista.jsx");
    const cuandoQuieto = () => { id = "requestIdleCallback" in window ? requestIdleCallback(precargar, { timeout: 6000 }) : setTimeout(precargar, 3000); };
    if (document.readyState === "complete") cuandoQuieto(); else addEventListener("load", cuandoQuieto, { once: true });
    return () => { removeEventListener("load", cuandoQuieto); if (id) ("cancelIdleCallback" in window ? cancelIdleCallback(id) : clearTimeout(id)); };
  }, []);
  return (
    <Ctx.Provider value={valor}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6" aria-live="polite" role="status">
        {usada && <Suspense fallback={null}><AvisosLista lista={lista} quitar={quitar} /></Suspense>}
      </div>
    </Ctx.Provider>
  );
}

export function useAvisos() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAvisos fuera de ProveedorAvisos");
  return c;
}
