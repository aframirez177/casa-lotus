import { useEffect, useState } from "react";
/** Re-render every `cada` ms (countdowns). Pauses while the tab is hidden. */
export function useAhora(cada = 30000) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    let t = setInterval(() => setAhora(Date.now()), cada);
    const vis = () => { clearInterval(t); if (!document.hidden) { setAhora(Date.now()); t = setInterval(() => setAhora(Date.now()), cada); } };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [cada]);
  return ahora;
}
