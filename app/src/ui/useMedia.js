import { useSyncExternalStore } from "react";
/** true while the media query matches. */
export function useMedia(consulta) {
  return useSyncExternalStore(
    (cb) => { const mq = matchMedia(consulta); mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); },
    () => matchMedia(consulta).matches,
    () => false,
  );
}
export const useEsEscritorio = () => useMedia("(min-width: 1024px)");
export const useEsAncho = () => useMedia("(min-width: 768px)");
