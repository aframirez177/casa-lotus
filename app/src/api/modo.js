// Demo mode: VITE_API=mock at build time, or ?demo=1 on localhost (remembered for the tab; ?demo=0 turns it off).
function calcular() {
  if (import.meta.env.VITE_API === "mock") return true;
  if (!import.meta.env.DEV) return false; // production: never, whatever the URL says
  if (typeof location === "undefined") return false;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) || location.hostname.endsWith(".localhost");
  if (!local) return false;
  const p = new URLSearchParams(location.search).get("demo");
  try {
    if (p === "1") sessionStorage.setItem("cl_demo", "1");
    if (p === "0") sessionStorage.removeItem("cl_demo");
    return sessionStorage.getItem("cl_demo") === "1";
  } catch { return p === "1"; }
}
export const esDemo = calcular();
