// The clienta's booking card and the two sheets that act on it: cancel (policy in plain words) and reschedule.
import { useState } from "react";
import { CalendarClock, CalendarX2, CalendarPlus, MessageCircle, Clock } from "lucide-react";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { Columpios } from "../../ui/Columpios.jsx";
import { TagClase } from "../../ui/Basicos.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { useAhora } from "../../ui/useAhora.js";
import { useQueryClient } from "@tanstack/react-query";
import { K } from "../../api/claves.js";
import { api, id } from "../../api/cliente.js";
import { useReagendarMi } from "../../api/hooks/clienta.js";
import { useDisponibilidad } from "../../api/hooks/publico.js";
import { SelectorClase } from "../reservar/SelectorClase.jsx";
import { politicaCancelarTexto, politicaReagendarTexto } from "../../lib/politica.js";
import { partesCuenta, duracionCorta, diaRelativo } from "../../lib/fechas.js";
import { ESTADO, fechaLegible, horaLegible, inicioClase, dinero } from "../../lib/reglas.js";
import { descargarIcs } from "../../lib/ics.js";
import { nombreClase, colorClase } from "../../lib/clases.js";

/** The hero: the next class, with a live countdown. Dark card, lime only for the pay CTA. */
export function ProximaClase({ reserva: r, onCancelar, onReagendar }) {
  const ahora = useAhora(30000);
  const ini = inicioClase(r.clase);
  const { d, h, m } = partesCuenta(ini, ahora);
  const pendiente = r.estado === ESTADO.PENDIENTE;
  const venceMs = r.pago?.venceApartado ? Date.parse(r.pago.venceApartado) : NaN;
  const pronto = ini - ahora < 36 * 3600000;
  return (
    <article className="tarjeta-noche relative overflow-hidden p-6 shadow-float sm:p-7" aria-label="Tu próxima clase">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-multinivel/20 blur-2xl" aria-hidden="true" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <p className="etiqueta-sola !text-paper/70">{pendiente ? "Apartada · espera tu pago" : "Tu próxima clase"}</p>
          <button type="button" onClick={() => descargarIcs(r.clase, { codigo: r.id })} className="-mr-2 -mt-2 grid h-11 w-11 place-items-center rounded-full text-paper/85 hover:bg-paper/10" aria-label="Agregar a mi calendario" title="Agregar a mi calendario"><CalendarPlus size={19} /></button>
        </div>
        <p className="mt-4 font-display text-[2.25rem] leading-[0.95] tracking-tight text-paper first-letter:uppercase sm:text-[2.75rem]">{diaRelativo(r.clase.fecha)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-lg text-paper/85">{diaRelativo(r.clase.fecha) === "hoy" || diaRelativo(r.clase.fecha) === "mañana" ? fechaLegible(r.clase.fecha) + " · " : ""}{horaLegible(r.clase.hora)}</p>
          <TagClase clase={r.clase} />
        </div>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div aria-label={`Faltan ${d} días, ${h} horas y ${m} minutos`} role="timer">
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-paper/60">{pronto ? "Empieza en" : "Faltan"}</p>
            <p className="mt-1 flex items-baseline gap-3 font-display text-paper">
              {d > 0 && <span><span className="text-[2.6rem] leading-none">{d}</span><span className="ml-1 text-base text-paper/70">{d === 1 ? "día" : "días"}</span></span>}
              <span><span className="text-[2.6rem] leading-none">{h}</span><span className="ml-1 text-base text-paper/70">h</span></span>
              {d === 0 && <span><span className="text-[2.6rem] leading-none">{m}</span><span className="ml-1 text-base text-paper/70">min</span></span>}
            </p>
          </div>
          <Columpios clase={r.clase} claro tam="s" />
        </div>

        {pendiente && r.pago && (
          <div className="mt-6 rounded-[22px] bg-paper/8 p-4">
            <p className="text-[0.9375rem] text-paper/85">Paga <strong className="font-semibold text-paper">{dinero(r.pago.monto)}</strong> a la llave {r.pago.llave} y envía el comprobante.</p>
            {Number.isFinite(venceMs) && <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-paper/65"><Clock size={14} /> Te lo guardamos {duracionCorta(venceMs - ahora)} más.</p>}
            <Boton variante="lima" tam="s" punto className="mt-3" href={r.pago.waEnlace} icono={<MessageCircle size={16} />}>Enviar comprobante</Boton>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => onReagendar(r)} className="btn btn-s" style={{ "--bg": "rgb(246 248 252 / .1)", "--fg": "var(--color-paper)", "--bd": "rgb(246 248 252 / .18)" }}><CalendarClock size={16} /> Reagendar</button>
          <button type="button" onClick={() => onCancelar(r)} className="btn btn-s" style={{ "--bg": "transparent", "--fg": "var(--color-paper)", "--bd": "rgb(246 248 252 / .18)" }}><CalendarX2 size={16} /> Cancelar</button>
        </div>
      </div>
    </article>
  );
}

/** A lighter card for the rest of her upcoming classes. */
export function FilaReserva({ reserva: r, onCancelar, onReagendar }) {
  const pendiente = r.estado === ESTADO.PENDIENTE;
  return (
    <article className="tarjeta flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[20px] text-center leading-none text-navy" style={{ background: colorClase(r.clase.clase) }}>
          <span><span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.12em]">{fechaLegible(r.clase.fecha).slice(0, 3)}</span><span className="block font-display text-2xl">{Number(r.clase.fecha.slice(8))}</span></span>
        </span>
        <div className="min-w-0">
          <p className="font-medium text-navy first-letter:uppercase">{diaRelativo(r.clase.fecha)} · {horaLegible(r.clase.hora)}</p>
          <p className="texto-s suave truncate">{nombreClase(r.clase)}</p>
          {pendiente && <span className="chip chip-aviso mt-2">Espera tu pago</span>}
        </div>
      </div>
      <div className="flex gap-2">
        <Boton variante="niebla" tam="s" icono={<CalendarClock size={16} />} onClick={() => onReagendar(r)}>Reagendar</Boton>
        <Boton variante="fantasma" tam="s" onClick={() => onCancelar(r)}>Cancelar</Boton>
      </div>
    </article>
  );
}

/** Cancel: the policy in plain words, computed live from the limit; the write waits 5 s for «Deshacer». */
export function HojaCancelar({ reserva: r, cerrar }) {
  const ahora = useAhora(15000);
  const qc = useQueryClient();
  const { programar, avisar } = useAvisos();
  const p = r ? politicaCancelarTexto(r, ahora) : null;
  const confirmar = () => {
    const antes = qc.getQueryData(K.mi);
    cerrar();
    programar({
      texto: p.sinCosto ? "Cancelaste tu clase. Vuelve a tu plan." : "Cancelaste tu clase.",
      aplicar: () => qc.setQueryData(K.mi, (mi) => mi && { ...mi, proximas: mi.proximas.filter((x) => x.id !== r.id) }),
      revertir: () => qc.setQueryData(K.mi, antes),
      confirmar: async () => {
        const res = await api.post(`/api/yo/reservas/${id(r.id)}/cancelar`);
        qc.invalidateQueries({ queryKey: K.mi });
        qc.invalidateQueries({ queryKey: ["publico", "disponibilidad"] });
        if (res?.mensaje && !res.devolvioClase && r.estado !== ESTADO.PENDIENTE) avisar(res.mensaje);
      },
    });
  };
  return (
    <Hoja abierta={Boolean(r)} alCerrar={cerrar} titulo="¿Cancelar tu clase?" descripcion={r ? `${fechaLegible(r.clase.fecha)}, ${horaLegible(r.clase.hora)} · ${nombreClase(r.clase)}` : ""}>
      {p && (
        <>
          <div className={`rounded-[22px] p-5 ${p.tono === "ok" ? "bg-[color-mix(in_srgb,var(--color-teal)_9%,white)] text-teal" : p.tono === "aviso" ? "bg-aviso-bg text-aviso" : "bg-mist text-navy"}`} role="status">
            <p className="text-[1.0625rem] font-medium leading-snug">{p.titulo}</p>
            {p.detalle && <p className="mt-2 text-[0.9375rem] opacity-90">{p.detalle}</p>}
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Boton variante="suave" onClick={cerrar}>No, la mantengo</Boton>
            {p.puede && <Boton variante={p.tono === "aviso" ? "peligro" : "primario"} onClick={confirmar}>{p.boton}</Boton>}
          </div>
        </>
      )}
    </Hoja>
  );
}

/** Reschedule: policy first, then the same picker, then one confirm. */
export function HojaReagendar({ reserva: r, cerrar }) {
  const ahora = useAhora(15000);
  const [nueva, setNueva] = useState(null);
  const disp = useDisponibilidad(28);
  const reagendar = useReagendarMi();
  const { avisar } = useAvisos();
  const p = r ? politicaReagendarTexto(r, ahora) : null;
  const cerrarTodo = () => { setNueva(null); reagendar.reset(); cerrar(); };
  return (
    <Hoja abierta={Boolean(r)} alCerrar={cerrarTodo} titulo={p?.puede ? "Cambia tu clase" : "No se puede cambiar"} descripcion={p?.detalle}
      pie={p?.puede ? (
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 texto-s text-ink">{nueva ? <><span className="first-letter:uppercase">{diaRelativo(nueva.fecha)}</span> · {horaLegible(nueva.hora)}</> : "Elige la nueva clase"}</p>
          <Boton disabled={!nueva} cargando={reagendar.isPending} onClick={() => reagendar.mutate({ reserva: r.id, clase: nueva.id }, { onSuccess: (x) => { avisar(x.mensaje || "Listo, cambiaste tu clase."); cerrarTodo(); } })}>Cambiar</Boton>
        </div>
      ) : null}>
      {p && !p.puede && (
        <>
          <p className="lead">{p.titulo}.</p>
          <Boton className="mt-6" variante="suave" onClick={cerrarTodo}>Entendido</Boton>
        </>
      )}
      {p?.puede && (
        <>
          {reagendar.isError && <p className="campo-error mb-4" role="alert">{reagendar.error.mensaje}</p>}
          <SelectorClase clases={(disp.data?.clases || []).filter((c) => c.id !== r.clase.id)} seleccion={nueva?.id} onElegir={setNueva} inicial={r.clase.fecha} />
        </>
      )}
    </Hoja>
  );
}
