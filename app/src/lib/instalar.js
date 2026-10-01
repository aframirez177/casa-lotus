// Install the app: Android/desktop Chrome hand us a prompt; iOS needs «Compartir → Agregar a inicio».
import { useSyncExternalStore } from "react";

let aviso = null;
const oyentes = new Set();
const avisar = () => oyentes.forEach((f) => f());

export function capturarInstalacion() {
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); aviso = e; avisar(); });
  addEventListener("appinstalled", () => { aviso = null; avisar(); });
}

const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const instalada = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function leer() {
  let descartada = false;
  try { descartada = Number(localStorage.getItem("cl_instalar_no") || 0) > Date.now(); } catch { /* ignore */ }
  return `${Boolean(aviso)}|${esIOS()}|${instalada()}|${descartada}`;
}

export function useInstalar() {
  const estado = useSyncExternalStore((cb) => { oyentes.add(cb); return () => oyentes.delete(cb); }, leer, () => "false|false|false|false");
  const [puede, ios, ya, descartada] = estado.split("|").map((x) => x === "true");
  return {
    puede, ios: ios && !ya, instalada: ya, descartada,
    async instalar() {
      if (!aviso) return false;
      aviso.prompt();
      const r = await aviso.userChoice.catch(() => null);
      aviso = null; avisar();
      return r?.outcome === "accepted";
    },
    descartar() { try { localStorage.setItem("cl_instalar_no", String(Date.now() + 14 * 86400000)); } catch { /* ignore */ } avisar(); },
  };
}
