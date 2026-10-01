// The class picker: a week strip of days, then that day's classes as cards with swings filling up.
// Used by the public booking, the clienta's «Reservar», and «Reagendar». Never shows a seat count.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Hourglass, Lock } from "lucide-react";
import { Columpios } from "../../ui/Columpios.jsx";
import { colorClase, nombreClase, disponibilidad } from "../../lib/clases.js";
import { DIAS, MESES, fechaUTC, hoyClave, sumarDias, horaLegible } from "../../lib/reglas.js";
import { diaRelativo } from "../../lib/fechas.js";
import { Vacio } from "../../ui/Basicos.jsx";

/** How a day reads in the strip: «hay cupo», «sin cupo» (full), «reservas cerradas» (past the cut-off) or «clases canceladas». */
export function textoDia(clases = []) {
  if (!clases.length) return "sin clases";
  if (clases.some((c) => c.reservable)) return "hay cupo";
  const cancelada = (c) => c.estado === "Cancelada" || c.motivo === "cancelada";
  if (clases.every(cancelada)) return "clases canceladas";
  if (clases.some((c) => !cancelada(c) && c.motivo !== "tarde" && (c.motivo === "llena" || c.libres <= 0))) return "sin cupo";
  return "reservas cerradas";
}

export function SelectorClase({ clases = [], seleccion, onElegir, onEspera, excluir = [], dias = 21, inicial }) {
  const hoy = hoyClave();
  const porFecha = useMemo(() => {
    const mapa = {};
    for (const c of clases) if (!excluir.includes(c.id)) (mapa[c.fecha] ||= []).push(c);
    for (const k in mapa) mapa[k].sort((a, b) => (a.hora < b.hora ? -1 : 1));
    return mapa;
  }, [clases, excluir]);
  const fechas = useMemo(() => Array.from({ length: dias }, (_, i) => sumarDias(hoy, i)), [hoy, dias]);
  const primera = fechas.find((f) => porFecha[f]?.some((c) => c.reservable)) || fechas.find((f) => porFecha[f]) || hoy;
  const [dia, setDia] = useState(() => inicial?.slice(0, 10) && porFecha[inicial.slice(0, 10)] ? inicial.slice(0, 10) : primera);
  useEffect(() => { if (!porFecha[dia] && porFecha[primera]) setDia(primera); }, [porFecha, dia, primera]);

  const tira = useRef(null);
  useEffect(() => {
    tira.current?.querySelector(`[data-fecha="${dia}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [dia]);

  if (!clases.length) return <Vacio titulo="Aún no hay clases abiertas" texto="Ana está armando el horario de las próximas semanas. Escríbenos y te avisamos." />;

  const lista = porFecha[dia] || [];
  return (
    <div>
      <div ref={tira} className="scroll-x -mx-5 flex scroll-px-5 gap-2 px-5 pb-3 pt-1 md:mx-0 md:scroll-px-0 md:px-0" role="tablist" aria-label="Días">
        {fechas.map((f) => {
          const cl = porFecha[f] || [];
          const libres = cl.some((c) => c.reservable);
          const estadoDia = textoDia(cl);
          const activo = f === dia;
          const d = fechaUTC(f);
          return (
            <button key={f} type="button" role="tab" aria-selected={activo} data-fecha={f} disabled={!cl.length}
              onClick={() => setDia(f)}
              aria-label={`${diaRelativo(f)}, ${estadoDia}`}
              className={`relative flex h-[84px] w-[58px] shrink-0 flex-col items-center justify-center gap-1 rounded-[22px] transition-[background-color,color,box-shadow,transform] duration-300 ease-out disabled:opacity-35 ${activo ? "scale-[1.04] bg-navy text-paper shadow-float" : "bg-white text-navy shadow-card"}`}>
              <span className={`relative text-[0.6875rem] font-semibold uppercase tracking-[0.12em] ${activo ? "text-paper/75" : "text-muted"}`}>{f === hoy ? "Hoy" : DIAS[d.getUTCDay()].slice(0, 3)}</span>
              <span className="relative font-display text-[1.6rem] leading-none">{d.getUTCDate()}</span>
              <span className={`relative h-1.5 w-1.5 rounded-full ${!cl.length ? "bg-transparent" : libres ? "bg-lime" : activo ? "bg-paper/40" : "bg-line"}`} />
            </button>
          );
        })}
      </div>

      <p className="mb-4 mt-3 text-[0.9375rem] text-muted" aria-live="polite">
        <span className="inline-block font-medium text-navy first-letter:uppercase">{diaRelativo(dia)}</span>
        {diaRelativo(dia) === "hoy" || diaRelativo(dia) === "mañana" ? ` · ${fechaUTC(dia).getUTCDate()} de ${MESES[fechaUTC(dia).getUTCMonth()]}` : ""}
      </p>

      <ul className="grid gap-3">
        {lista.map((c, i) => (
          <li key={dia + c.id} className="aparece" style={{ "--i": i }}>
            <TarjetaClase clase={c} elegida={seleccion === c.id} onElegir={onElegir} onEspera={onEspera} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TarjetaClase({ clase: c, elegida, onElegir, onEspera }) {
  const disp = disponibilidad(c);
  const llena = disp.tono === "llena";
  const cerrada = !c.reservable && !llena;
  const [h, ...resto] = horaLegible(c.hora).split(" ");
  const sufijo = resto.join(" ");
  const accion = () => (llena ? onEspera?.(c) : !cerrada && onElegir?.(c));
  return (
    <button type="button" onClick={accion} disabled={cerrada || (llena && !onEspera)} aria-pressed={!llena && !cerrada ? Boolean(elegida) : undefined}
      className={`mece tarjeta relative flex w-full items-stretch gap-4 overflow-hidden p-4 text-left transition-[box-shadow,transform] duration-300 disabled:opacity-60 sm:p-5 ${elegida ? "ring-2 ring-navy" : ""}`}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-2" style={{ background: colorClase(c.clase) }} />
      <span className="flex w-[74px] shrink-0 flex-col justify-center pl-2">
        <span className="font-display text-[2rem] leading-none tracking-tight text-navy">{h}</span>
        <span className="mt-1 text-[0.8125rem] text-muted">{sufijo}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
        <span className="font-medium leading-tight text-navy">{nombreClase(c)}</span>
        <Columpios clase={c} tam="s" decorativo />
        <span className={`inline-flex items-center gap-1.5 text-[0.8125rem] font-medium ${disp.tono === "pocos" ? "text-aviso" : llena ? "text-navy" : cerrada ? "text-muted" : "text-teal"}`}>
          {llena ? <Hourglass size={14} /> : cerrada ? <Lock size={14} /> : null}{disp.texto}
        </span>
      </span>
      <span className={`grid h-11 w-11 shrink-0 place-items-center self-center rounded-full border transition-colors ${elegida ? "border-navy bg-navy text-lime" : "border-line text-transparent"}`} aria-hidden="true">
        <Check size={20} strokeWidth={2.2} />
      </span>
    </button>
  );
}
