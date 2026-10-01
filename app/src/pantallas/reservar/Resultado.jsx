// The end of the booking: «Tu columpio está apartado», how to pay, the hold countdown, the calendar,
// and the invitation to install the app.
import { useState } from "react";
import { Link } from "react-router";
import { m } from "motion/react";
import { CalendarPlus, Copy, Check, MessageCircle, Smartphone, ArrowRight } from "lucide-react";
import { Boton } from "../../ui/Boton.jsx";
import { Columpios } from "../../ui/Columpios.jsx";
import { TagClase } from "../../ui/Basicos.jsx";
import { InstalarTarjeta } from "../../shell/Instalar.jsx";
import { useAhora } from "../../ui/useAhora.js";
import { descargarIcs } from "../../lib/ics.js";
import { dinero, fechaLegible, horaLegible, ESTADO } from "../../lib/reglas.js";
import { duracionCorta, momentoLegible } from "../../lib/fechas.js";
import { Simbolo } from "../../ui/Logo.jsx";

export function Resultado({ r, limpiar }) {
  const pendiente = r.estado === ESTADO.PENDIENTE;
  const ahora = useAhora(1000);
  const vence = r.pago?.venceApartado ? Date.parse(r.pago.venceApartado) : NaN;
  const queda = Number.isFinite(vence) ? vence - ahora : 0;
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(r.pago.llave.replace(/\s/g, "")); setCopiado(true); setTimeout(() => setCopiado(false), 2200); } catch { /* the number is visible anyway */ }
  };

  return (
    <div className="mx-auto max-w-[620px]">
      <m.div initial={{ scale: 0.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 160, damping: 14, delay: 0.1 }}
        className="mb-8 grid h-20 w-20 place-items-center rounded-[28px] bg-navy text-lime shadow-float">
        <Simbolo className="h-10 w-auto" />
      </m.div>
      <h1 className="saludo">{pendiente ? "Tu columpio está apartado." : "Tu columpio está reservado."}</h1>
      <p className="lead mt-4">{pendiente ? `${r.nombre ? r.nombre + ", " : ""}falta un paso: el pago. Cuando llegue tu comprobante, Ana lo confirma.` : `${r.nombre ? "Te esperamos, " + r.nombre + "." : "Te esperamos."} Llega 10 minutos antes, con ropa cómoda y tu botella de agua.`}</p>

      <m.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, type: "spring", stiffness: 240, damping: 28 }} className="tarjeta mt-8 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-[1.75rem] leading-none text-navy first-letter:uppercase">{fechaLegible(r.clase.fecha)}</p>
            <p className="mt-2 text-lg text-ink">{horaLegible(r.clase.hora)}</p>
          </div>
          <TagClase clase={r.clase} />
        </div>
        <div className="mt-5 flex items-center justify-between gap-4">
          <Columpios clase={r.clase} />
          <span className="text-[0.8125rem] text-muted">Código {r.codigo}</span>
        </div>
        <Boton variante="niebla" tam="s" className="mt-5" icono={<CalendarPlus size={17} />} onClick={() => descargarIcs(r.clase, { codigo: r.codigo })}>Agregar a mi calendario</Boton>
      </m.section>

      {pendiente && r.pago && (
        <m.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, type: "spring", stiffness: 240, damping: 28 }} className="tarjeta-noche mt-4 overflow-hidden p-6" aria-labelledby="pago-t">
          <p id="pago-t" className="etiqueta-sola !text-paper/70">Para confirmarlo</p>
          <p className="mt-3 text-paper/85">Paga {r.pago.plan === "Clase de prueba" ? "tu clase de prueba" : r.pago.plan}</p>
          <p className="numero mt-1 text-[3.25rem] !text-paper">{dinero(r.pago.monto)}</p>
          <div className="mt-5 rounded-[22px] bg-paper/8 p-4">
            <p className="text-[0.8125rem] text-paper/70">{(r.pago.medios || []).join(" · ")} a la llave</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="font-display text-[1.75rem] tracking-tight text-paper" data-seleccionable>{r.pago.llave}</p>
              <button type="button" onClick={copiar} className="flex min-h-11 items-center gap-2 rounded-full bg-paper/10 px-4 text-[0.875rem] text-paper hover:bg-paper/15" aria-live="polite">
                {copiado ? <><Check size={16} className="text-lime" /> Copiada</> : <><Copy size={16} /> Copiar</>}
              </button>
            </div>
          </div>
          <Boton variante="lima" bloque tam="l" punto className="mt-5" href={r.pago.waEnlace} icono={<MessageCircle size={18} />}>Enviar comprobante por WhatsApp</Boton>
          <p className="mt-4 rounded-[18px] border border-paper/15 px-4 py-3 text-[0.875rem] text-paper/85">Si ya tienes un plan activo, no pagues: Ana confirma tu reserva con tu plan.</p>
          {Number.isFinite(vence) && (
            <p className="mt-4 text-center text-[0.875rem] text-paper/75" aria-live="off">
              {queda > 0 ? <>Te lo guardamos <strong className="font-semibold text-paper">{duracionCorta(queda)}</strong> (hasta {momentoLegible(vence)}). Si no llega el pago, el columpio se libera solo.</> : "El apartado venció. Escríbenos y miramos si sigue libre."}
            </p>
          )}
        </m.section>
      )}

      <div className="mt-4 grid gap-4">
        <InstalarTarjeta titulo="Instala la app para ver y cambiar tus clases" texto="Queda en tu pantalla de inicio, como cualquier app." />
        <Link to="/mi" className="tarjeta flex items-center gap-4 p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-mist text-navy"><Smartphone size={20} /></span>
          <span className="min-w-0 flex-1"><span className="block font-medium text-navy">Ver mis clases</span><span className="block texto-s suave">Cambia o cancela desde la app.</span></span>
          <ArrowRight size={18} className="text-navy" />
        </Link>
      </div>
      <button type="button" onClick={limpiar} className="mt-8 enlace texto-s">Reservar otra clase</button>
    </div>
  );
}
