// The end of the booking: a ticket she can read in one glance. The class («Clase aérea» while it has no type),
// the day and the time range, the profe when known, and the state in ONE sentence: reserved with her plan (and
// how many classes are left) or held until she pays (amount, key, receipt by WhatsApp, the hold countdown).
// Then her calendar, and the invitation to install the app.
import { useState } from "react";
import { Link } from "react-router";
import { m } from "motion/react";
import { Copy, Check, MessageCircle, Smartphone, ArrowRight, CircleCheck, Hourglass, Mail } from "lucide-react";
import { Boton } from "../../ui/Boton.jsx";
import { BotonesCalendario } from "../../ui/Calendario.jsx";
import { InstalarTarjeta } from "../../shell/Instalar.jsx";
import { useAhora } from "../../ui/useAhora.js";
import { useDuracion } from "../../api/hooks/publico.js";
import { rangoHora } from "../../lib/ics.js";
import { nombreClase, sinTipo, NOTA_SIN_TIPO, estadoTicket } from "../../lib/clases.js";
import { dinero, fechaLegible, ESTADO } from "../../lib/reglas.js";
import { duracionCorta, momentoLegible } from "../../lib/fechas.js";
import { Simbolo } from "../../ui/Logo.jsx";

export function Resultado({ r, limpiar }) {
  const pendiente = r.estado === ESTADO.PENDIENTE;
  const duracion = useDuracion(r.clase);
  const ahora = useAhora(1000);
  const vence = r.pago?.venceApartado ? Date.parse(r.pago.venceApartado) : NaN;
  const queda = Number.isFinite(vence) ? vence - ahora : 0;
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(r.pago.llave.replace(/\s/g, "")); setCopiado(true); setTimeout(() => setCopiado(false), 2200); } catch { /* the number is visible anyway */ }
  };
  const resorte = (delay) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay, type: "spring", stiffness: 240, damping: 28 } });

  return (
    <div className="mx-auto max-w-[620px]">
      <div className="flex items-center gap-4">
        <m.div initial={{ scale: 0.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 160, damping: 14, delay: 0.1 }}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-[20px] bg-navy text-lime shadow-float lg:h-16 lg:w-16">
          <Simbolo className="h-7 w-auto lg:h-8" />
        </m.div>
        <h1 className="titulo">{pendiente ? "Tu columpio está apartado." : "Tu clase está reservada."}</h1>
      </div>
      {r.correo && <p className="mt-4 flex items-center gap-2 texto-s text-ink"><Mail size={16} className="shrink-0 text-teal" />Te mandamos la confirmación a tu correo.</p>}

      {/* the ticket */}
      <m.section {...resorte(0.15)} className="tarjeta mt-6 overflow-hidden" aria-label="Tu clase">
        <div className="p-6 pb-5">
          <div className="flex items-center justify-between gap-3">
            <p className="etiqueta-sola">Tu clase</p>
            <span className="text-[0.8125rem] text-muted">Código {r.codigo}</span>
          </div>
          <p className="mt-3 font-display text-[2.25rem] leading-[0.95] tracking-tight text-navy sm:text-[2.6rem]">{nombreClase(r.clase)}</p>
          {sinTipo(r.clase) && <p className="mt-2 texto-s suave">{NOTA_SIN_TIPO}</p>}
          <p className="mt-5 text-[1.125rem] font-medium text-navy first-letter:uppercase">{fechaLegible(r.clase.fecha)}</p>
          <p className="text-[1.125rem] text-ink">{rangoHora(r.clase, duracion)}{r.clase.profe ? <span className="suave"> · con {r.clase.profe}</span> : null}</p>
        </div>
        <div className="mx-6 border-t border-dashed border-line" aria-hidden="true" />
        <div className="p-6 pt-5">
          <p className={`flex items-start gap-2.5 text-[1.0625rem] font-medium leading-snug ${pendiente ? "text-aviso" : "text-teal"}`} role="status">
            {pendiente ? <Hourglass size={20} className="mt-0.5 shrink-0" /> : <CircleCheck size={20} className="mt-0.5 shrink-0" />}
            {estadoTicket(r)}
          </p>
          <BotonesCalendario clase={r.clase} codigo={r.codigo} className="mt-4 -ml-1" />
        </div>
      </m.section>

      {pendiente && r.pago && (
        <m.section {...resorte(0.25)} className="tarjeta-noche mt-4 overflow-hidden p-6" aria-labelledby="pago-t">
          <p id="pago-t" className="etiqueta-sola !text-paper/70">Para confirmarla</p>
          <p className="mt-3 text-paper/85">Paga {r.pago.plan === "Clase de prueba" ? "tu clase de prueba" : r.pago.plan}</p>
          <p className="numero mt-1 text-[3.25rem] !text-paper">{dinero(r.pago.monto)}</p>
          <div className="mt-5 rounded-[22px] bg-paper/8 p-4">
            <p className="text-[0.8125rem] text-paper/70">{(r.pago.medios || []).join(" · ")} a la llave</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="whitespace-nowrap font-display text-[clamp(1.4rem,7.2vw,1.75rem)] tracking-tight text-paper" data-seleccionable>{r.pago.llave}</p>
              <button type="button" onClick={copiar} className="flex min-h-11 items-center gap-2 rounded-full bg-paper/10 px-4 text-[0.875rem] text-paper hover:bg-paper/15" aria-live="polite">
                {copiado ? <><Check size={16} className="text-lime" /> Copiada</> : <><Copy size={16} /> Copiar</>}
              </button>
            </div>
          </div>
          <Boton variante="lima" bloque tam="l" className="mt-5 !whitespace-normal text-center" href={r.pago.waEnlace} icono={<MessageCircle size={19} />} aria-label="Enviar comprobante por WhatsApp">Enviar comprobante</Boton>
          <p className="mt-3 text-center text-[0.875rem] text-paper/75">Ana confirma tu clase cuando le llega. No tienes que registrar nada más.</p>
          {Number.isFinite(vence) && (
            <p className="mt-4 border-t border-paper/15 pt-4 text-center text-[0.875rem] text-paper/75" aria-live="off">
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
