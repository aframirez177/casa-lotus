import "./app.css";
import { createRoot } from "react-dom/client";
import { esDemo } from "./api/modo.js";
import { usarTransporte } from "./api/cliente.js";
import { usarStreamDemo } from "./api/stream.js";
import { capturarInstalacion } from "./lib/instalar.js";
import { App } from "./App.jsx";

capturarInstalacion();

// The demo adapter exists only in dev and in demo builds (VITE_API=mock): a production build drops it entirely.
if ((import.meta.env.DEV || import.meta.env.VITE_API === "mock") && esDemo) {
  // the in-browser studio: invented people, the same rules as the server
  const { crearServidorDemo } = await import("./api/mock/servidor.js");
  const demo = crearServidorDemo();
  usarTransporte(demo.transporte);
  usarStreamDemo(demo.abrirStream);
  window.__clDemo = demo;
}

createRoot(document.getElementById("raiz")).render(<App />);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}
