// «Continuar con Google» for the team, with Google Identity Services' own button (never redrawn).
// The script loads only on the screens that show this button. In the demo there is no Google: a plain
// stand-in button signs in an invented team member.
import { useEffect, useRef, useState } from "react";
import { esDemo } from "../api/modo.js";

const GIS = "https://accounts.google.com/gsi/client";
let carga = null;
let iniciadoCon = "";
const manejador = { actual: null };

function cargarGis() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!carga) {
    carga = new Promise((resolver, rechazar) => {
      const s = document.createElement("script");
      s.src = GIS;
      s.async = true;
      s.defer = true;
      s.onload = () => (window.google?.accounts?.id ? resolver(window.google) : rechazar(new Error("gis")));
      s.onerror = () => { carga = null; s.remove(); rechazar(new Error("gis")); };
      document.head.appendChild(s);
    });
  }
  return carga;
}

/**
 * <BotonGoogle clientId onCredencial={(jwt) => …} correoDemo="…" />
 * onCredencial receives the ID token (credential) to send to the server.
 */
export function BotonGoogle({ clientId, onCredencial, correoDemo, ocupado = false }) {
  const caja = useRef(null);
  const [estado, setEstado] = useState("cargando"); // cargando | listo | fallo
  manejador.actual = onCredencial;

  useEffect(() => {
    if (esDemo || clientId === "demo") return;
    let vivo = true;
    cargarGis().then((google) => {
      if (!vivo || !caja.current) return;
      if (iniciadoCon !== clientId) {
        // one initialize per page and client id; the callback always reaches the button on screen
        google.accounts.id.initialize({ client_id: clientId, callback: (r) => manejador.actual?.(r.credential), ux_mode: "popup" });
        iniciadoCon = clientId;
      }
      const ancho = Math.max(220, Math.min(400, Math.round(caja.current.getBoundingClientRect().width)));
      google.accounts.id.renderButton(caja.current, { type: "standard", theme: "outline", shape: "pill", text: "continue_with", locale: "es", size: "large", width: ancho, logo_alignment: "center" });
      setEstado("listo");
    }).catch(() => vivo && setEstado("fallo"));
    return () => { vivo = false; };
  }, [clientId]);

  if (esDemo || clientId === "demo") {
    return (
      <button type="button" disabled={ocupado} onClick={() => onCredencial("demo:" + (correoDemo || ""))}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-line bg-white px-5 text-[0.9375rem] font-medium text-ink transition-colors hover:bg-mist disabled:opacity-60">
        Continuar con Google <span className="chip chip-aviso !min-h-6 !px-2 text-[0.6875rem]">demo</span>
      </button>
    );
  }
  return (
    <div aria-busy={estado === "cargando" || ocupado || undefined}>
      <div ref={caja} className={`flex min-h-11 w-full justify-center transition-opacity ${ocupado ? "pointer-events-none opacity-60" : ""}`} />
      {estado === "cargando" && <div className="esqueleto -mt-11 h-11 rounded-full" aria-hidden="true" />}
      {estado === "fallo" && <p className="campo-ayuda text-center">No pudimos cargar el botón de Google. Entra con tu correo y contraseña.</p>}
    </div>
  );
}

/** «o con tu correo» between the Google button and the form. */
export function Divisor({ texto }) {
  return (
    <div className="my-6 flex items-center gap-4 text-[0.8125rem] text-muted" role="separator" aria-label={texto}>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <span aria-hidden="true">{texto}</span>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </div>
  );
}
