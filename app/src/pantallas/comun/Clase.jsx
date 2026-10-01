// Staff view of a class (ClaseEquipo): the list card, the roster with attendance, and the class notes.
// Shared by the profe's screens and Ana's agenda.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { m, AnimatePresence } from "motion/react";
import { Check, X, Cake, Sparkles, HeartPulse, Phone, MessageCircle, CameraOff, ChevronRight, Lock, Hourglass, Clock, UserPlus, ListChecks, UserX } from "lucide-react";
import { Columpios } from "../../ui/Columpios.jsx";
import { Avatar, TagClase } from "../../ui/Basicos.jsx";
import { useAsistencia, useNotasClase, useClientasProfe, useAgregarAsistente, useCerrarLista, usePedirReemplazo } from "../../api/hooks/profe.js";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { useAhora } from "../../ui/useAhora.js";
import { colorClase, nombreClase } from "../../lib/clases.js";
import { ESTADO, horaLegible, inicioClase, momentoMs, enlaceWhatsApp, primerNombre, SALUD_SIN_DATOS, fechaLegible } from "../../lib/reglas.js";
import { diaRelativo } from "../../lib/fechas.js";

/**
 * Attendance window, from the class's own date and time (Bogotá): before the class day it cannot be marked yet;
 * from the class day until 48 h after it starts it is open; after that only Ana corrects it.
 */
export function ventanaAsistencia(c, ahora = Date.now(), admin = false) {
  if (c.estado === "Cancelada") return "cancelada";
  if (ahora < momentoMs(c.fecha, "00:00")) return "antes";
  if (!admin && ahora - inicioClase(c) > 48 * 3600000) return "cerrada";
  return "abierta";
}

export const activos = (c) => c.gente.filter((g) => [ESTADO.CONFIRMADA, ESTADO.ASISTIO, ESTADO.NO_VINO, ESTADO.PENDIENTE].includes(g.estado));
export const sinMarcar = (c) => c.gente.filter((g) => g.estado === ESTADO.CONFIRMADA).length;

/** The narrow card for the 7-column week board: time, type, a fill bar and the count. */
export function MiniClase({ clase: c, a }) {
  const cancelada = c.estado === "Cancelada";
  const [h, ...suf] = horaLegible(c.hora).split(" ");
  const porMarcar = c.pasada && sinMarcar(c);
  return (
    <Link to={a} className={`tarjeta relative block overflow-hidden p-3 pt-4 ${cancelada ? "opacity-55" : ""}`} aria-label={`${horaLegible(c.hora)}, ${nombreClase(c)}, ${c.ocupados} de ${c.cupos}`}>
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5" style={{ background: colorClase(c.clase) }} />
      <m.div layoutId={`clase-${c.id}`} className="flex items-baseline gap-1"><span className="font-display text-[1.45rem] leading-none text-navy">{h}</span><span className="text-[0.6875rem] text-muted">{suf.join(" ")}</span></m.div>
      <p className="mt-1.5 text-[0.8125rem] font-medium leading-tight text-navy">{nombreClase(c)}</p>
      <p className="text-[0.75rem] text-muted">{c.profe || "Sin profe"}</p>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-mist"><span className="block h-full rounded-full bg-navy" style={{ width: `${Math.min(100, (c.ocupados / Math.max(1, c.cupos)) * 100)}%` }} /></span>
        <span className="text-[0.75rem] font-medium text-navy">{c.ocupados}/{c.cupos}</span>
      </div>
      {(cancelada || c.reemplazoPedido || (!c.profe && !c.pasada) || porMarcar || c.pocaGente || c.espera?.length > 0) && (
        <p className={`mt-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] ${cancelada || c.reemplazoPedido ? "text-error" : "text-aviso"}`}>{cancelada ? "Cancelada" : c.reemplazoPedido ? "Reemplazo pedido" : !c.profe && !c.pasada ? "Sin profe" : porMarcar ? "Por marcar" : c.pocaGente ? "Poca gente" : `${c.espera.length} en espera`}</p>
      )}
    </Link>
  );
}

/** A class as a floating card: time, type, swings and who is special today. */
export function TarjetaClaseEquipo({ clase: c, a, mostrarDia = false, compacta = false, sinProfe = false }) {
  const gente = activos(c);
  const primeras = gente.filter((g) => g.primeraVez);
  const cumple = gente.filter((g) => g.cumple);
  const salud = gente.filter((g) => g.salud && !SALUD_SIN_DATOS.includes(g.salud));
  const porMarcar = c.pasada && sinMarcar(c);
  const cancelada = c.estado === "Cancelada";
  const [h, ...suf] = horaLegible(c.hora).split(" ");
  return (
    <Link to={a} className={`tarjeta mece relative flex gap-4 overflow-hidden p-4 sm:p-5 ${cancelada ? "opacity-60" : ""}`}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: colorClase(c.clase) }} />
      <m.div layoutId={`clase-${c.id}`} className="flex w-[70px] shrink-0 flex-col pl-1.5">
        {mostrarDia && <span className="mb-1 text-[0.75rem] font-medium text-muted first-letter:uppercase">{diaRelativo(c.fecha)}</span>}
        <span className="font-display text-[1.9rem] leading-none tracking-tight text-navy">{h}</span>
        <span className="mt-1 text-[0.8125rem] text-muted">{suf.join(" ")}</span>
      </m.div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight text-navy">{nombreClase(c)}</p>
          {cancelada ? <span className="chip chip-error">Cancelada</span> : c.reemplazoPedido ? <span className="chip chip-error">Reemplazo pedido</span> : !c.profe && !c.pasada ? <span className="chip chip-aviso">Sin profe</span> : porMarcar ? <span className="chip chip-aviso"><Clock size={13} />Marcar</span> : c.pocaGente ? <span className="chip chip-aviso">Poca gente</span> : null}
        </div>
        {c.profe && !sinProfe && <p className="mt-0.5 texto-s suave">con {c.profe}</p>}
        <div className="mt-3 flex items-center gap-3">
          <Columpios cupos={c.cupos} ocupados={c.ocupados} pendientes={gente.filter((g) => g.estado === ESTADO.PENDIENTE).length} tam="s" conNumero />
          <span className="text-[0.8125rem] font-medium text-navy">{c.ocupados}/{c.cupos}</span>
          {c.espera?.length > 0 && <span className="chip !min-h-6 !px-2 text-[0.75rem]"><Hourglass size={12} />{c.espera.length}</span>}
        </div>
        {!compacta && (primeras.length > 0 || cumple.length > 0 || salud.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {primeras.length > 0 && <span className="chip !bg-pilates"><Sparkles size={13} />{primeras.length === 1 ? `Primera vez: ${primerNombre(primeras[0].nombre)}` : `${primeras.length} primera vez`}</span>}
            {cumple.length > 0 && <span className="chip !bg-multinivel"><Cake size={13} />{primerNombre(cumple[0].nombre)}{cumple.length > 1 ? ` +${cumple.length - 1}` : ""}</span>}
            {salud.length > 0 && <span className="chip"><HeartPulse size={13} />{salud.length === 1 ? "1 con cuidado" : `${salud.length} con cuidado`}</span>}
          </div>
        )}
      </div>
      <ChevronRight size={18} className="shrink-0 self-center text-muted" aria-hidden="true" />
    </Link>
  );
}

/** The header of the class detail (shares its time block with the card: shared-element transition). */
export function CabeceraClase({ clase: c, sinProfe = false }) {
  const [h, ...suf] = horaLegible(c.hora).split(" ");
  return (
    <header className="mb-8 pt-2">
      <p className="etiqueta mb-4 first-letter:uppercase">{diaRelativo(c.fecha)}{c.tipo === "Extra" ? " · clase extra" : ""}</p>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <m.div layoutId={`clase-${c.id}`} className="flex items-baseline gap-2">
          <span className="saludo">{h}</span><span className="text-xl text-muted">{suf.join(" ")}</span>
        </m.div>
        <TagClase clase={c} className="mb-2" />
      </div>
      {c.profe && !sinProfe && <p className="lead mt-3">con {c.profe}</p>}
      <div className="mt-6 flex items-center gap-4">
        <Columpios cupos={c.cupos} ocupados={c.ocupados} pendientes={c.gente.filter((g) => g.estado === ESTADO.PENDIENTE).length} tam="l" conNumero />
        <p className="text-ink"><strong className="font-display text-2xl font-normal text-navy">{c.ocupados}</strong> de {c.cupos}</p>
      </div>
      {c.estado === "Cancelada" && <p className="mt-4 chip chip-error">Clase cancelada{c.notas ? ` · ${c.notas}` : ""}</p>}
      {c.reemplazoPedido && c.estado !== "Cancelada" && <p className="mt-4 chip chip-error !h-auto !min-h-8 !whitespace-normal !py-1.5">Reemplazo pedido{c.reemplazoPedido.motivo ? ` · ${c.reemplazoPedido.motivo}` : ""}</p>}
    </header>
  );
}

/**
 * The roster: one floating card per person, «Vino» / «No vino» as big toggles (from 1 h before the class),
 * health and emergency contact behind a tap. `acciones(persona)` lets Ana add her own buttons.
 */
export function Roster({ clase: c, admin = false, acciones }) {
  const ahora = useAhora(60000);
  const marcar = useAsistencia({ admin });
  const { avisar } = useAvisos();
  const ventana = ventanaAsistencia(c, ahora, admin);
  const bloqueada = ventana === "cerrada";
  const puedeMarcar = ventana === "abierta";
  const gente = activos(c);
  const fuera = c.gente.filter((g) => !gente.includes(g));
  const marcadas = gente.filter((g) => g.estado === ESTADO.ASISTIO || g.estado === ESTADO.NO_VINO).length;
  const confirmadas = gente.filter((g) => g.estado !== ESTADO.PENDIENTE);

  const poner = (g, vino) => {
    if ((vino && g.estado === ESTADO.ASISTIO) || (!vino && g.estado === ESTADO.NO_VINO)) return;
    marcar.mutate({ clase: c, reserva: g.reserva, vino }, { onError: (e) => avisar(e.mensaje, { tipo: "error" }) });
  };
  const todasVinieron = () => confirmadas.filter((g) => g.estado === ESTADO.CONFIRMADA).forEach((g) => poner(g, true));

  if (!gente.length) return <p className="tarjeta-suave p-6 text-center text-ink">Nadie ha reservado esta clase todavía.</p>;
  return (
    <div>
      {puedeMarcar && confirmadas.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-[22px] bg-white/70 px-4 py-3">
          <p className="texto-s text-ink" aria-live="polite">{marcadas === confirmadas.length ? "Asistencia completa. ¡Gracias!" : `Marcaste ${marcadas} de ${confirmadas.length}.`}</p>
          {marcadas < confirmadas.length && <button type="button" onClick={todasVinieron} className="min-h-11 rounded-full px-3 text-[0.875rem] font-medium text-teal hover:bg-mist">Todas vinieron</button>}
        </div>
      )}
      {bloqueada && <p className="mb-4 flex items-center gap-2 rounded-[18px] bg-aviso-bg px-4 py-3 texto-s text-aviso"><Lock size={14} /> Pasaron 48 horas: pídele a Ana que lo corrija.</p>}
      {ventana === "antes" && <p className="mb-4 flex items-center gap-2 texto-s suave"><Clock size={14} /> Podrás marcar la asistencia desde el día de la clase.</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {gente.map((g) => <Persona key={g.reserva} g={g} puedeMarcar={puedeMarcar && g.estado !== ESTADO.PENDIENTE} poner={poner} acciones={acciones} admin={admin} />)}
      </ul>
      {admin && fuera.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer texto-s font-medium text-muted">Canceladas y vencidas ({fuera.length})</summary>
          <ul className="mt-3 space-y-2">{fuera.map((g) => <li key={g.reserva} className="flex items-center justify-between rounded-2xl bg-white/60 px-4 py-3 texto-s"><span>{g.nombre}</span><span className="chip">{g.estado}</span></li>)}</ul>
        </details>
      )}
    </div>
  );
}

function Persona({ g, puedeMarcar, poner, acciones, admin }) {
  const [ver, setVer] = useState(null); // "salud" | "contacto"
  const tieneSalud = g.salud && g.salud !== SALUD_SIN_DATOS[0];
  const pendiente = g.estado === ESTADO.PENDIENTE;
  return (
    <m.li layout className={`tarjeta p-4 sm:p-5 ${g.primeraVez ? "ring-1 ring-[color-mix(in_srgb,var(--color-pilates)_90%,var(--color-navy))]" : ""}`}>
      <div className="flex items-start gap-3">
        <Avatar nombre={g.nombre} tam={44} />
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-tight text-navy">{g.nombre}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {g.primeraVez && <span className="chip !bg-pilates"><Sparkles size={13} />Primera vez</span>}
            {g.cumple && <span className="chip !bg-multinivel"><Cake size={13} />Cumpleaños</span>}
            {g.experiencia && !g.primeraVez && <span className="chip">{g.experiencia}</span>}
            {g.autorizaImagen === false && <span className="chip chip-aviso"><CameraOff size={13} />Sin fotos</span>}
            {pendiente && <span className="chip chip-aviso">Espera pago</span>}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {tieneSalud && (
          <button type="button" onClick={() => setVer(ver === "salud" ? null : "salud")} aria-expanded={ver === "salud"} className={`chip !min-h-9 !px-3 ${ver === "salud" ? "chip-noche" : ""}`}><HeartPulse size={14} />Salud</button>
        )}
        {g.contactoEmergencia && (
          <button type="button" onClick={() => setVer(ver === "contacto" ? null : "contacto")} aria-expanded={ver === "contacto"} className={`chip !min-h-9 !px-3 ${ver === "contacto" ? "chip-noche" : ""}`}><Phone size={14} />Emergencia</button>
        )}
        {acciones?.(g)}
      </div>
      <AnimatePresence initial={false}>
        {ver === "salud" && (
          <m.div key="s" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 rounded-[18px] bg-mist p-4">
              <p className="text-[0.9375rem] text-ink" data-seleccionable>{g.salud}</p>
              <p className="mt-2 flex items-center gap-1.5 text-[0.75rem] font-medium uppercase tracking-[0.12em] text-muted"><Lock size={12} />Solo para ti y Ana</p>
            </div>
          </m.div>
        )}
        {ver === "contacto" && (
          <m.div key="c" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 flex items-center gap-2 rounded-[18px] bg-mist p-3 pl-4">
              <p className="min-w-0 flex-1 text-[0.9375rem] text-ink" data-seleccionable>{g.contactoEmergencia}</p>
              {(() => { const tel = (g.contactoEmergencia.match(/\d[\d ]{8,}\d/) || [""])[0].replace(/\D/g, ""); return tel ? (
                <>
                  <a href={`tel:+57${tel.slice(-10)}`} className="grid h-11 w-11 place-items-center rounded-full bg-white text-navy" aria-label="Llamar"><Phone size={17} /></a>
                  <a href={enlaceWhatsApp("57" + tel.slice(-10))} target="_blank" rel="noopener" className="grid h-11 w-11 place-items-center rounded-full bg-white text-navy" aria-label="WhatsApp"><MessageCircle size={17} /></a>
                </>
              ) : null; })()}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {puedeMarcar && (
        <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label={`Asistencia de ${g.nombre}`}>
          <button type="button" role="radio" aria-checked={g.estado === ESTADO.ASISTIO} onClick={() => poner(g, true)}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl border text-[0.9375rem] font-medium transition-colors ${g.estado === ESTADO.ASISTIO ? "border-navy bg-navy text-paper" : "border-line bg-white text-navy hover:border-navy/40"}`}>
            <Check size={18} className={g.estado === ESTADO.ASISTIO ? "text-lime" : ""} />Vino
          </button>
          <button type="button" role="radio" aria-checked={g.estado === ESTADO.NO_VINO} onClick={() => poner(g, false)}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl border text-[0.9375rem] font-medium transition-colors ${g.estado === ESTADO.NO_VINO ? "border-aviso-bg bg-aviso-bg text-aviso" : "border-line bg-white text-navy hover:border-navy/40"}`}>
            <X size={18} />No vino
          </button>
        </div>
      )}
      {admin && !puedeMarcar && !pendiente && g.estado === ESTADO.CONFIRMADA && <p className="mt-3 texto-s suave">Confirmada{g.origen ? ` · llegó por ${g.origen}` : ""}</p>}
    </m.li>
  );
}

/** Class notes with autosave (optimistic, rolls back on error). */
export function NotasClase({ clase: c }) {
  const [texto, setTexto] = useState(c.notas || "");
  const [estado, setEstado] = useState("");
  const guardar = useNotasClase();
  const t = useRef(null);
  const ultimo = useRef(c.notas || "");
  useEffect(() => { if (document.activeElement?.id !== "notas-clase") setTexto(c.notas || ""); }, [c.notas]);
  const cambiar = (v) => {
    setTexto(v);
    setEstado("escribiendo");
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      if (v === ultimo.current) return setEstado("");
      setEstado("guardando");
      guardar.mutate({ clase: c, texto: v }, { onSuccess: () => { ultimo.current = v; setEstado("guardado"); }, onError: () => setEstado("error") });
    }, 900);
  };
  return (
    <div className="tarjeta p-5">
      <div className="flex items-center justify-between">
        <label htmlFor="notas-clase" className="etiqueta-sola">Notas de la clase</label>
        <span className="text-[0.8125rem] text-muted" aria-live="polite">{estado === "guardando" ? "Guardando…" : estado === "guardado" ? "Guardado" : estado === "error" ? "No se guardó" : ""}</span>
      </div>
      <textarea id="notas-clase" className="entrada mt-3 !min-h-[120px]" value={texto} onChange={(e) => cambiar(e.target.value)} placeholder="Qué trabajaron, cómo les fue, qué recordar para la próxima…" />
    </div>
  );
}

/**
 * The profe's tools on a class: add someone who came without booking, close the list (the rest did not come),
 * and «No puedo dictar esta clase» (Ana is told and reassigns it).
 */
export function HerramientasProfe({ clase: c, admin = false }) {
  const ahora = useAhora(60000);
  const [hoja, setHoja] = useState(null);
  const ini = inicioClase(c);
  const editable = ventanaAsistencia(c, ahora, admin) === "abierta";
  const empezo = ahora >= ini;
  const pendientes = c.gente.filter((g) => g.estado === ESTADO.CONFIRMADA);
  if (c.estado === "Cancelada") return null;
  return (
    <>
      <div className="-mt-2 mb-10 flex flex-wrap gap-2">
        {editable && ini - ahora <= 3600000 && <Boton tam="s" variante="suave" icono={<UserPlus size={16} />} onClick={() => setHoja("agregar")}>Agregar a alguien que vino</Boton>}
        {editable && empezo && pendientes.length > 0 && <Boton tam="s" variante="suave" icono={<ListChecks size={16} />} onClick={() => setHoja("cerrar")}>Cerrar lista</Boton>}
        {!admin && !empezo && !c.reemplazoPedido && <Boton tam="s" variante="fantasma" icono={<UserX size={16} />} onClick={() => setHoja("reemplazo")}>No puedo dictar esta clase</Boton>}
      </div>
      <HojaAgregar clase={c} abierta={hoja === "agregar"} cerrar={() => setHoja(null)} admin={admin} />
      <HojaCerrarLista clase={c} pendientes={pendientes} abierta={hoja === "cerrar"} cerrar={() => setHoja(null)} />
      <HojaReemplazo clase={c} abierta={hoja === "reemplazo"} cerrar={() => setHoja(null)} />
    </>
  );
}

function HojaAgregar({ clase: c, abierta, cerrar, admin }) {
  const [q, setQ] = useState("");
  const [deb, setDeb] = useState("");
  const [sinPlan, setSinPlan] = useState(null);
  useEffect(() => { const t = setTimeout(() => setDeb(q.trim()), 220); return () => clearTimeout(t); }, [q]);
  const { data, isFetching } = useClientasProfe(deb.length >= 2 ? deb : "");
  const agregar = useAgregarAsistente({ admin });
  const { avisar } = useAvisos();
  const ya = new Set(activos(c).map((g) => g.clienta));
  const fin = () => { setQ(""); setSinPlan(null); agregar.reset(); cerrar(); };
  return (
    <Hoja abierta={abierta} alCerrar={fin} titulo={sinPlan ? "Listo, quedó en la lista" : "¿Quién vino?"} descripcion={sinPlan ? null : "Alguien que llegó sin reservar. Queda marcada como «Vino»."}>
      {sinPlan ? (
        <div>
          <p className="lead">{primerNombre(sinPlan)} no tiene clases en su plan. Le avisamos a Ana para cobrarle.</p>
          <Boton className="mt-6" bloque onClick={fin}>Entendido</Boton>
        </div>
      ) : (
        <>
          <input className="entrada" type="search" placeholder="Buscar por nombre" value={q} onChange={(e) => setQ(e.target.value)} data-autofoco="" aria-label="Buscar alumna" />
          {agregar.isError && <p className="campo-error mt-3" role="alert">{agregar.error.mensaje}</p>}
          <ul className={`mt-3 transition-opacity ${isFetching ? "opacity-60" : ""}`}>
            {(data || []).filter((x) => !ya.has(x.id)).map((x) => (
              <li key={x.id}>
                <button type="button" disabled={agregar.isPending} onClick={() => agregar.mutate({ clase: c, clienta: x.id }, { onSuccess: (r) => { if (r?.sinPlan) setSinPlan(x.nombre); else { avisar(`${primerNombre(x.nombre)} quedó en la lista.`); fin(); } } })}
                  className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-mist">
                  <Avatar nombre={x.nombre} tam={38} />
                  <span className="min-w-0 flex-1"><span className="block font-medium text-navy">{x.nombre}</span>{x.primeraVez && <span className="chip !bg-pilates mt-1"><Sparkles size={12} />Primera vez</span>}</span>
                  <Check size={18} className="text-muted" />
                </button>
              </li>
            ))}
            {deb.length < 2 && <li className="py-6 text-center texto-s suave">Escribe al menos dos letras de su nombre.</li>}
            {deb.length >= 2 && data && !data.length && <li className="py-6 text-center texto-s suave">No encontré a nadie. Si es nueva, pídele a Ana que la registre.</li>}
          </ul>
        </>
      )}
    </Hoja>
  );
}

function HojaCerrarLista({ clase: c, pendientes, abierta, cerrar }) {
  const cerrarLista = useCerrarLista();
  const { avisar } = useAvisos();
  return (
    <Hoja abierta={abierta} alCerrar={cerrar} titulo="¿Cerrar la lista?" descripcion="Quienes no marcaste quedan como «No vino».">
      <ul className="space-y-2">{pendientes.map((g) => <li key={g.reserva} className="flex items-center gap-3 rounded-2xl bg-mist p-3"><Avatar nombre={g.nombre} tam={34} /><span className="flex-1 text-navy">{g.nombre}</span><span className="chip chip-aviso">No vino</span></li>)}</ul>
      {cerrarLista.isError && <p className="campo-error mt-3" role="alert">{cerrarLista.error.mensaje}</p>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Boton variante="suave" onClick={cerrar}>Volver</Boton>
        <Boton cargando={cerrarLista.isPending} onClick={() => cerrarLista.mutate(c, { onSuccess: () => { avisar("Lista cerrada. ¡Gracias!"); cerrar(); } })}>Cerrar lista</Boton>
      </div>
    </Hoja>
  );
}

function HojaReemplazo({ clase: c, abierta, cerrar }) {
  const pedir = usePedirReemplazo();
  const { avisar } = useAvisos();
  const [motivo, setMotivo] = useState("");
  return (
    <Hoja abierta={abierta} alCerrar={cerrar} titulo="No puedo dictar esta clase" descripcion={`${fechaLegible(c.fecha)}, ${horaLegible(c.hora)}: Ana busca reemplazo y te avisa.`}>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); pedir.mutate({ clase: c, motivo: motivo.trim() }, { onSuccess: () => { avisar("Ana ya sabe. Gracias por avisar con tiempo."); cerrar(); setMotivo(""); } }); }}>
        <label className="block">
          <span className="campo-etiqueta">¿Qué pasó? <span className="font-normal text-muted">· opcional</span></span>
          <textarea className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Una cita médica, un viaje…" />
        </label>
        {pedir.isError && <p className="campo-error" role="alert">{pedir.error.mensaje}</p>}
        <Boton type="submit" bloque tam="l" cargando={pedir.isPending}>Avisarle a Ana</Boton>
      </form>
    </Hoja>
  );
}
