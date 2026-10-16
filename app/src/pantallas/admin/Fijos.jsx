// «Cupo fijo»: the regulars who come every week at the same time. Their swing books itself for the next 14 days.
// Pieces for Ana's screens: the slot card's avatars, the slot sheet (add several people in a row), a person's
// «Horario fijo» section, and the inline pause / end controls both share.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, m } from "motion/react";
import { Check, AlertTriangle, Pause, Play, CircleStop, Plus, Repeat, UserPlus, ArrowRight, Search, CornerDownLeft } from "lucide-react";
import { useFijos, useCrearFijo, useEditarFijo, useTerminarFijo, useHorario, useClientas } from "../../api/hooks/admin.js";
import { Avatar } from "../../ui/Basicos.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { Interruptor } from "../../ui/Campos.jsx";
import { EsqueletoLista } from "../../ui/Esqueleto.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { SaldoPill } from "./comun.jsx";
import { nombreClase } from "../../lib/clases.js";
import { hoyClave, fechaCorta, primerNombre, ESTADO } from "../../lib/reglas.js";
import { slotTexto, textoFijas, resumenAlta, ESTADO_FIJO, estadoFijoTexto, hastaDePausa, listaDias, textoConflicto, cuantas, textoDevueltas } from "../../lib/fijos.js";

const plegar = { initial: { height: 0, opacity: 0 }, animate: { height: "auto", opacity: 1 }, exit: { height: 0, opacity: 0 }, transition: { type: "spring", stiffness: 380, damping: 36 } };

/** Small overlapping avatars of a slot's regulars (paused ones faded). */
export function AvataresFijos({ fijos = [], max = 3, tam = 26 }) {
  const lista = fijos.slice(0, max), resto = fijos.length - lista.length;
  // one initial each: two letters get cut where the circles overlap
  return (
    <span className="flex shrink-0 items-center" aria-hidden="true">
      {lista.map((f, i) => <Avatar key={f.id} nombre={primerNombre(f.clienta.nombre)} tam={tam} className={`ring-2 ring-white ${i ? "-ml-1.5" : ""} ${f.estado !== "Activo" ? "opacity-45" : ""}`} />)}
      {resto > 0 && <span className="-ml-1.5 grid place-items-center rounded-full bg-mist text-[0.6875rem] font-semibold text-navy ring-2 ring-white" style={{ width: tam, height: tam }}>+{resto}</span>}
    </span>
  );
}

export const EstadoFijo = ({ estado }) => { const e = ESTADO_FIJO[estado] || ESTADO_FIJO.Activo; return <span className={`chip ${e.clase}`}>{e.texto}</span>; };

/** What adding (or resuming) did: who is fixed now, what got booked, and every full class with a way to open it. */
export function ResultadoAlta({ nombre, r, className = "" }) {
  const x = resumenAlta(nombre, r);
  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} role="status" className={`rounded-[22px] bg-[color-mix(in_srgb,var(--color-teal)_9%,white)] p-4 ${className}`}>
      <p className="flex items-start gap-2 font-medium text-teal"><Check size={18} className="mt-0.5 shrink-0" />{x.titulo}</p>
      {x.lineas.map((l) => <p key={l} className="mt-1 pl-[26px] texto-s text-ink">{l}</p>)}
      {(r?.conflictos || []).map((c, i) => (
        <p key={c.clase.id} className="mt-2 flex items-start gap-2 rounded-2xl bg-aviso-bg px-3 py-2 texto-s text-aviso">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">{x.conflictos[i]}</span>
          <Link to={`/admin/agenda/${encodeURIComponent(c.clase.id)}`} className="shrink-0 font-medium underline underline-offset-2">Ver</Link>
        </p>
      ))}
    </m.div>
  );
}

/** Her next booked classes from this fijo: plain when confirmed, amber while they wait for a payment. */
function Proximas({ f }) {
  if (f.estado === "Terminado") return null;
  if (!f.proximas?.length) return <p className="texto-s suave">{f.estado === "Activo" ? "Sin clases en los próximos 14 días." : "Sin clases reservadas."}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Próximas clases">
      {f.proximas.map((p) => (
        <li key={p.clase.id} className={`chip !min-h-7 !px-2.5 text-[0.75rem] ${p.estado === ESTADO.PENDIENTE ? "chip-aviso" : "chip-blanco"}`} title={p.estado}>
          {fechaCorta(p.clase.fecha)}{p.estado === ESTADO.PENDIENTE ? " · sin pago" : ""}
        </li>
      ))}
    </ul>
  );
}

/**
 * One fijo with its controls. «Pausar» and «Terminar» open inline (no second sheet), so Ana stays where she is.
 * `conNombre` for the slot sheet (who), otherwise the slot (when) for her detail.
 */
export function FilaFijo({ f, conNombre = false }) {
  const [panel, setPanel] = useState(null); // pausa | fin
  const editar = useEditarFijo();
  const { avisar } = useAvisos();
  const hoy = hoyClave();
  const nombre = primerNombre(f.clienta.nombre);
  const reanudar = () => editar.mutate({ id: f.id, estado: "Activo", hasta: "" }, {
    onSuccess: (r) => avisar(r.reservasCreadas?.length ? `Listo: reservamos ${listaDias(r.reservasCreadas.map((x) => x.clase.fecha))}.${r.conflictos?.length ? ` ${textoConflicto(r.conflictos[0])}.` : ""}` : "Horario fijo activo otra vez."),
    onError: (e) => avisar(e.mensaje, { tipo: "error" }),
  });
  return (
    <li className="py-3.5">
      <div className="flex items-start gap-3">
        {conNombre ? <Avatar nombre={f.clienta.nombre} tam={40} className={f.estado === "Activo" ? "" : "opacity-55"} />
          : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mist text-navy"><Repeat size={17} /></span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 pt-0.5 font-medium leading-snug text-navy">
              {conNombre ? <Link to={`/admin/clientas/${f.clienta.id}`} className="hover:underline">{f.clienta.nombre}</Link> : <span className="inline-block first-letter:uppercase">{f.slotTexto}</span>}
            </p>
            {(f.estado !== "Activo" || !conNombre) && <EstadoFijo estado={f.estado} />}
          </div>
          {f.estado !== "Activo" && estadoFijoTexto(f, hoy) !== ESTADO_FIJO[f.estado]?.texto && <p className="texto-s suave">{estadoFijoTexto(f, hoy)}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
            <Proximas f={f} />
            {f.estado !== "Terminado" && !panel && (
              <span className="ml-auto flex shrink-0 gap-1">
                {f.estado === "Activo"
                  ? <Boton tam="xs" variante="fantasma" className="!min-h-9 !px-2.5" icono={<Pause size={14} />} onClick={() => setPanel("pausa")} aria-label={`Pausar el horario fijo de ${nombre}`}>Pausar</Boton>
                  : <Boton tam="xs" variante="suave" className="!min-h-9 !px-2.5" icono={<Play size={14} />} cargando={editar.isPending} onClick={reanudar} aria-label={`Reanudar el horario fijo de ${nombre}`}>Reanudar</Boton>}
                <Boton tam="xs" variante="fantasma" className="!min-h-9 !px-2.5 !text-muted" icono={<CircleStop size={14} />} onClick={() => setPanel("fin")} aria-label={`Terminar el horario fijo de ${nombre}`}>Terminar</Boton>
              </span>
            )}
          </div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {panel === "pausa" && <m.div key="p" {...plegar} className="overflow-hidden"><PanelPausa f={f} nombre={nombre} listo={() => setPanel(null)} /></m.div>}
        {panel === "fin" && <m.div key="f" {...plegar} className="overflow-hidden"><PanelTerminar f={f} nombre={nombre} listo={() => setPanel(null)} /></m.div>}
      </AnimatePresence>
    </li>
  );
}

/** Pause from a date. Her classes already booked from that day go back to her plan (switch on by default). */
function PanelPausa({ f, nombre, listo }) {
  const hoy = hoyClave();
  const editar = useEditarFijo();
  const { avisar } = useAvisos();
  const [desde, setDesde] = useState(f.proximas?.[0]?.clase.fecha || hoy);
  const [cancelar, setCancelar] = useState(true);
  const pausar = () => editar.mutate({ id: f.id, estado: "Pausado", hasta: hastaDePausa(desde, hoy), cancelarFuturas: cancelar }, {
    onSuccess: (r) => { avisar(cuantas(r.reservasCanceladas) ? `Pausado. ${textoDevueltas(r.reservasCanceladas)}` : `Pausaste el horario fijo de ${nombre}.`); listo(); },
  });
  return (
    <div className="mt-3 space-y-3 rounded-[22px] bg-mist p-4">
      <label className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-navy">Pausar desde</span>
        <input type="date" className="entrada !min-h-11 !w-auto !py-1.5" value={desde} min={hoy} onChange={(e) => setDesde(e.target.value || hoy)} aria-label="Pausar desde" />
      </label>
      <Interruptor activo={cancelar} onCambio={setCancelar} etiqueta="Cancelar sus clases ya reservadas" ayuda="La clase vuelve a su plan." />
      {editar.isError && <p className="campo-error" role="alert">{editar.error.mensaje}</p>}
      <div className="flex flex-wrap gap-2">
        <Boton tam="s" cargando={editar.isPending} onClick={pausar}>Pausar</Boton>
        <Boton tam="s" variante="fantasma" onClick={listo}>Volver</Boton>
      </div>
    </div>
  );
}

function PanelTerminar({ f, nombre, listo }) {
  const terminar = useTerminarFijo();
  const { avisar } = useAvisos();
  return (
    <div className="mt-3 space-y-3 rounded-[22px] bg-error-bg p-4">
      <p className="text-error"><strong className="font-medium">¿Terminar el horario fijo de {nombre}?</strong> Sus clases ya reservadas de los {f.slotTexto} se cancelan y vuelven a su plan.</p>
      {terminar.isError && <p className="campo-error" role="alert">{terminar.error.mensaje}</p>}
      <div className="flex flex-wrap gap-2">
        <Boton tam="s" variante="peligro" cargando={terminar.isPending} onClick={() => terminar.mutate(f.id, { onSuccess: (r) => { avisar(`Horario fijo terminado. ${textoDevueltas(r.reservasCanceladas)}`.trim()); listo(); } })}>Terminar</Boton>
        <Boton tam="s" variante="fantasma" onClick={listo}>Volver</Boton>
      </div>
    </div>
  );
}

/**
 * The slot sheet, built for loading regulars fast: «Agregar alumna» sits on top, type a name and Enter (or tap),
 * see what was booked and any full class, and the search is ready again for the next person. Her list follows.
 */
export function HojaFijasSlot({ slot, abierta, cerrar }) {
  const lista = useFijos({ slot: slot?.id }, Boolean(slot && abierta));
  const crear = useCrearFijo();
  const [agregar, setAgregar] = useState(false);
  const [desde, setDesde] = useState(hoyClave());
  const [resultado, setResultado] = useState(null);
  const [vuelta, setVuelta] = useState(0); // remounts the search after each add
  const zona = useRef(null);
  useEffect(() => { if (abierta) { setResultado(null); setAgregar(false); setDesde(hoyClave()); crear.reset(); } }, [abierta, slot?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const vivos = (lista.data || []).filter((f) => f.estado !== "Terminado");
  const activos = vivos.filter((f) => f.estado === "Activo").length;
  // open while adding (also once the first person of an empty slot is in: the search stays for the next one)
  const abrirBusqueda = agregar || Boolean(resultado) || (lista.isSuccess && !vivos.length);
  useEffect(() => { if (agregar) setTimeout(() => zona.current?.querySelector("input[type=search]")?.focus({ preventScroll: true }), 60); }, [vuelta, agregar]);
  if (!slot) return <Hoja abierta={false} alCerrar={cerrar} />;
  const elegir = (cl) => crear.mutate({ clienta: cl.id, dia: slot.dia, hora: slot.hora, desde: desde > hoyClave() ? desde : undefined }, {
    onSuccess: (r) => { setResultado({ nombre: cl.nombre, r }); setAgregar(true); setVuelta((n) => n + 1); },
  });
  return (
    <Hoja abierta={abierta} alCerrar={cerrar} titulo={`Alumnas fijas · ${slotTexto(slot.dia, slot.hora)}`}
      descripcion={`${nombreClase(slot)}${slot.profe ? " con " + slot.profe : ""} · ${textoFijas(lista.data ? activos : slot.cuposFijos || 0, slot.cupos)}. Su columpio se reserva solo cada semana, 14 días adelante.`}>
      <div ref={zona} className="mb-2">
        {!abrirBusqueda ? (
          <Boton variante="suave" bloque icono={<UserPlus size={17} />} onClick={() => setAgregar(true)}>Agregar alumna</Boton>
        ) : (
          <div className="rounded-[24px] bg-mist p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h3 className="subtitulo">Agregar alumna</h3>
              <label className="flex items-center gap-2 texto-s text-muted">Desde
                <input type="date" className="entrada !min-h-10 !w-auto !py-1 !pl-3 text-[0.875rem]" value={desde} min={hoyClave()} onChange={(e) => setDesde(e.target.value || hoyClave())} aria-label="Desde qué día" />
              </label>
            </div>
            <AnimatePresence initial={false}>{resultado && <ResultadoAlta key={resultado.r.fijo.id} nombre={resultado.nombre} r={resultado.r} className="mb-3 !bg-white" />}</AnimatePresence>
            {crear.isError && <p className="campo-error mb-3" role="alert">{crear.error.mensaje}</p>}
            <BuscarRapido key={vuelta} onElegir={elegir} excluir={vivos.map((f) => f.clienta.id)} ocupado={crear.isPending} autoFoco={abrirBusqueda} />
          </div>
        )}
      </div>
      {lista.isPending ? <EsqueletoLista filas={2} /> : vivos.length ? (
        <ul className="divide-y divide-line">{vivos.map((f) => <FilaFijo key={f.id} f={f} conNombre />)}</ul>
      ) : <p className="mt-4 texto-s suave">Todavía no hay alumnas fijas en esta franja. Agrega a quienes vienen cada semana: así la clase deja de verse vacía.</p>}
    </Hoja>
  );
}

/** Name search for loading several people in a row: results appear as she types, Enter takes the first one. */
function BuscarRapido({ onElegir, excluir = [], ocupado = false, autoFoco = false }) {
  const [q, setQ] = useState("");
  const [deb, setDeb] = useState("");
  useEffect(() => { const t = setTimeout(() => setDeb(q.trim()), 180); return () => clearTimeout(t); }, [q]);
  const { data, isFetching } = useClientas({ q: deb, orden: "nombre" }, deb.length > 0);
  const lista = deb ? (data || []).filter((c) => !excluir.includes(c.id)).slice(0, 8) : [];
  const elegir = (c) => { if (!ocupado && c) onElegir(c); };
  return (
    <div aria-busy={ocupado || undefined}>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input className="entrada pl-11 pr-11" type="search" placeholder="Nombre o WhatsApp" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar alumna para agregar"
          data-autofoco={autoFoco ? "" : undefined} enterKeyHint="go" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); elegir(lista[0]); } }} />
        {lista.length > 0 && <CornerDownLeft size={16} className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 text-muted md:block" aria-hidden="true" />}
      </div>
      {deb && (
        <ul className={`mt-2 transition-opacity ${isFetching || ocupado ? "opacity-55" : ""}`}>
          {lista.map((c) => (
            <li key={c.id}>
              <button type="button" disabled={ocupado} onClick={() => elegir(c)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-white">
                <Avatar nombre={c.nombre} tam={36} />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium text-navy">{c.nombre}</span><span className="block texto-s suave">{c.whatsappTexto}</span></span>
                <SaldoPill saldo={c.saldo} />
              </button>
            </li>
          ))}
          {!lista.length && !isFetching && <li className="px-2 py-4 texto-s suave">No encontré a nadie con ese nombre (o ya es fija aquí).</li>}
        </ul>
      )}
    </div>
  );
}

/** Her «Horario fijo» on the clienta detail: what she has, and adding one by picking an active slot. */
export function SeccionHorarioFijo({ c }) {
  const [hoja, setHoja] = useState(false);
  const fijos = c.fijos || [];
  const vivos = fijos.filter((f) => f.estado !== "Terminado"), terminados = fijos.filter((f) => f.estado === "Terminado");
  return (
    <>
      {vivos.length ? (
        <ul className="tarjeta divide-y divide-line px-5">{vivos.map((f) => <FilaFijo key={f.id} f={f} />)}</ul>
      ) : (
        <div className="tarjeta-suave flex flex-wrap items-center gap-3 p-5">
          <p className="min-w-0 flex-1 basis-56 texto-s text-ink">Si viene cada semana a la misma hora, agrégale su horario fijo y su columpio se reserva solo.</p>
          <Boton tam="s" variante="suave" icono={<Plus size={16} />} onClick={() => setHoja(true)}>Agregar horario fijo</Boton>
        </div>
      )}
      {vivos.length > 0 && <Boton className="mt-3" tam="xs" variante="fantasma" icono={<Plus size={14} />} onClick={() => setHoja(true)}>Agregar horario fijo</Boton>}
      {terminados.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer texto-s font-medium text-muted">Terminados ({terminados.length})</summary>
          <ul className="mt-2 space-y-1">{terminados.map((f) => <li key={f.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 px-4 py-2.5 texto-s"><span className="inline-block first-letter:uppercase">{f.slotTexto}</span><span className="suave">{estadoFijoTexto(f, hoyClave())}</span></li>)}</ul>
        </details>
      )}
      <HojaNuevoFijo c={c} abierta={hoja} cerrar={() => setHoja(false)} />
    </>
  );
}

function HojaNuevoFijo({ c, abierta, cerrar }) {
  const horario = useHorario();
  const crear = useCrearFijo();
  const [slot, setSlot] = useState(null);
  const [desde, setDesde] = useState(hoyClave());
  const [resultado, setResultado] = useState(null);
  useEffect(() => { if (abierta) { setSlot(null); setResultado(null); setDesde(hoyClave()); crear.reset(); } }, [abierta]); // eslint-disable-line react-hooks/exhaustive-deps
  const tiene = new Set((c.fijos || []).filter((f) => f.estado !== "Terminado").map((f) => f.slot));
  const franjas = (horario.data || []).filter((s) => s.activa && !tiene.has(s.id))
    .sort((a, b) => ORDEN.indexOf(a.dia) - ORDEN.indexOf(b.dia) || (a.hora < b.hora ? -1 : 1));
  const nombre = primerNombre(c.nombre);
  return (
    <Hoja abierta={abierta} alCerrar={cerrar} titulo={resultado ? "Horario fijo listo" : `Horario fijo para ${nombre}`}
      descripcion={resultado ? null : c.saldo?.clases ? "Elige la franja. Cada semana su columpio queda reservado con su plan." : "Elige la franja. No tiene clases en su plan: sus clases quedan apartadas esperando el pago."}
      pie={resultado ? <Boton bloque onClick={cerrar}>Listo</Boton> : (
        <div className="flex items-center gap-3">
          <label className="flex min-w-0 flex-1 items-center gap-2 texto-s text-muted">Desde
            <input type="date" className="entrada !min-h-10 !w-auto !py-1 !pl-3 text-[0.875rem]" value={desde} min={hoyClave()} onChange={(e) => setDesde(e.target.value || hoyClave())} aria-label="Desde qué día" />
          </label>
          <Boton disabled={!slot} cargando={crear.isPending} iconoFinal={<ArrowRight size={16} />}
            onClick={() => crear.mutate({ clienta: c.id, dia: slot.dia, hora: slot.hora, desde: desde > hoyClave() ? desde : undefined }, { onSuccess: (r) => setResultado(r) })}>Agregar</Boton>
        </div>
      )}>
      {resultado ? <ResultadoAlta nombre={c.nombre} r={resultado} /> : horario.isPending ? <EsqueletoLista filas={3} /> : (
        <>
          {crear.isError && <p className="campo-error mb-3" role="alert">{crear.error.mensaje}</p>}
          {franjas.length ? (
            <div role="radiogroup" aria-label="Franja" className="grid gap-2">
              {franjas.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={slot?.id === s.id} onClick={() => setSlot(s)}
                  className={`flex items-center gap-3 rounded-[20px] border p-4 text-left transition-colors ${slot?.id === s.id ? "border-navy bg-navy text-paper" : "border-line bg-white text-navy hover:border-navy/40"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium first-letter:uppercase">{slotTexto(s.dia, s.hora)}</span>
                    <span className={`block texto-s ${slot?.id === s.id ? "text-paper/75" : "suave"}`}>{nombreClase(s)}{s.profe ? ` · ${s.profe}` : ""}</span>
                  </span>
                  <span className={`shrink-0 text-[0.8125rem] ${slot?.id === s.id ? "text-paper/80" : "text-muted"}`}>{textoFijas(s.cuposFijos || 0, s.cupos)}</span>
                </button>
              ))}
            </div>
          ) : <p className="tarjeta-suave p-5 texto-s text-ink">Ya tiene horario fijo en todas las franjas activas.</p>}
        </>
      )}
    </Hoja>
  );
}
const ORDEN = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
