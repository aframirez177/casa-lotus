// /app/admin/agenda — the week, day by day (a 7-column board on desktop). «+» adds an extra class or a weekly slot.
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { m } from "motion/react";
import { ChevronLeft, ChevronRight, Plus, CalendarPlus, Repeat } from "lucide-react";
import { useAgenda, useCrearClase, useProfesLista } from "../../api/hooks/admin.js";
import { Encabezado, ErrorCaja } from "../../ui/Basicos.jsx";
import { Esqueleto } from "../../ui/Esqueleto.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { Entrada, Selector } from "../../ui/Campos.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { TarjetaClaseEquipo, MiniClase } from "../comun/Clase.jsx";
import { useEsEscritorio } from "../../ui/useMedia.js";
import { hoyClave, sumarDias, fechaUTC, DIAS, MESES, fechaLegible } from "../../lib/reglas.js";

export const TIPOS_CLASE = ["Yoga Aéreo", "Yoga Aéreo multinivel", "Pilates Aéreo", "Stretch Aéreo", "Terapia", "Por confirmar"];
const lunesDe = (f) => { const d = fechaUTC(f).getUTCDay(); return sumarDias(f, d === 0 ? -6 : 1 - d); };

export default function Agenda() {
  const [params, setParams] = useSearchParams();
  const hoy = hoyClave();
  const lunes = params.get("semana") || lunesDe(hoy);
  const domingo = sumarDias(lunes, 6);
  const { data, isPending, error, refetch, isFetching } = useAgenda(lunes, domingo);
  const [nueva, setNueva] = useState(false);
  const navegar = useNavigate();
  const tablero = useEsEscritorio();
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)), [lunes]);
  const mover = (n) => setParams(n === 0 ? {} : { semana: sumarDias(lunes, n * 7) });
  const rango = `${fechaUTC(lunes).getUTCDate()} ${MESES[fechaUTC(lunes).getUTCMonth()].slice(0, 3)} – ${fechaUTC(domingo).getUTCDate()} ${MESES[fechaUTC(domingo).getUTCMonth()].slice(0, 3)}`;
  const total = (data || []).filter((c) => c.estado !== "Cancelada");
  const ocu = total.reduce((s, c) => s + c.ocupados, 0), cup = total.reduce((s, c) => s + c.cupos, 0);

  return (
    <div>
      <Encabezado titulo="Agenda" grande={false} lead={data ? `${total.length} clases · ${ocu} de ${cup} columpios ocupados` : " "}
        accion={<Boton tam="s" icono={<Plus size={17} />} onClick={() => setNueva(true)} className="hidden lg:inline-flex">Agregar</Boton>} />

      <div className="mb-6 flex items-center gap-2">
        <Boton variante="suave" tam="s" className="btn-icono !min-w-11" onClick={() => mover(-1)} aria-label="Semana anterior"><ChevronLeft size={18} /></Boton>
        <p className="min-w-[150px] text-center font-medium text-navy" aria-live="polite">{rango}</p>
        <Boton variante="suave" tam="s" className="btn-icono !min-w-11" onClick={() => mover(1)} aria-label="Semana siguiente"><ChevronRight size={18} /></Boton>
        {lunes !== lunesDe(hoy) && <Boton variante="fantasma" tam="s" onClick={() => mover(0)}>Esta semana</Boton>}
        {isFetching && !isPending && <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-navy/40" aria-hidden="true" />}
      </div>

      {isPending ? <div className="grid gap-3 lg:grid-cols-7">{Array.from({ length: 7 }, (_, i) => <Esqueleto key={i} className="h-36 rounded-[28px]" />)}</div>
        : error ? <ErrorCaja error={error} reintentar={refetch} /> : (
          <div className="grid gap-8 lg:grid-cols-7 lg:gap-3">
            {dias.map((f) => {
              const lista = data.filter((c) => c.fecha === f);
              const esHoy = f === hoy;
              return (
                <section key={f} className={`min-w-0 ${!lista.length ? "hidden lg:block" : ""}`} aria-label={fechaLegible(f)}>
                  <h2 className={`mb-3 flex items-baseline gap-2 ${esHoy ? "text-navy" : "text-muted"}`}>
                    <span className="text-[0.75rem] font-semibold uppercase tracking-[0.14em]">{DIAS[fechaUTC(f).getUTCDay()].slice(0, 3)}</span>
                    <span className={`font-display text-2xl leading-none ${esHoy ? "grid h-9 w-9 place-items-center rounded-full bg-navy text-[1.1rem] text-paper" : ""}`}>{fechaUTC(f).getUTCDate()}</span>
                  </h2>
                  <div className="grid gap-3">
                    {lista.map((c) => tablero ? <MiniClase key={c.id} clase={c} a={`/admin/agenda/${encodeURIComponent(c.id)}`} /> : <TarjetaClaseEquipo key={c.id} clase={c} a={`/admin/agenda/${encodeURIComponent(c.id)}`} compacta />)}
                    {!lista.length && <p className="rounded-[22px] border border-dashed border-line p-4 text-center text-[0.8125rem] text-muted">Sin clases</p>}
                  </div>
                </section>
              );
            })}
          </div>
        )}

      {/* floating «+» on phones */}
      <m.button type="button" onClick={() => setNueva(true)} aria-label="Agregar una clase" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 22, delay: 0.2 }}
        className="fixed right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-navy text-paper shadow-glass lg:hidden" style={{ bottom: "calc(max(14px, env(safe-area-inset-bottom)) + 84px)" }}>
        <Plus size={24} />
      </m.button>

      <HojaNueva abierta={nueva} cerrar={() => setNueva(false)} onFranja={() => { setNueva(false); navegar("/admin/horario?nueva=1"); }} />
    </div>
  );
}

function HojaNueva({ abierta, cerrar, onFranja }) {
  const [modo, setModo] = useState("");
  const fin = () => { setModo(""); cerrar(); };
  return (
    <Hoja abierta={abierta} alCerrar={fin} titulo={modo === "extra" ? "Clase extra" : "¿Qué quieres agregar?"} descripcion={modo === "extra" ? "Una sola vez, en el día y la hora que elijas." : null}>
      {modo === "extra" ? <FormExtra listo={fin} /> : (
        <div className="grid gap-3">
          <button type="button" onClick={() => setModo("extra")} className="tarjeta flex items-center gap-4 p-5 text-left">
            <span className="grid h-12 w-12 place-items-center rounded-[18px] bg-pilates text-navy"><CalendarPlus size={22} /></span>
            <span><span className="block font-medium text-navy">Clase extra</span><span className="block texto-s suave">Una clase suelta: un taller, una reposición, un horario nuevo para probar.</span></span>
          </button>
          <button type="button" onClick={onFranja} className="tarjeta flex items-center gap-4 p-5 text-left">
            <span className="grid h-12 w-12 place-items-center rounded-[18px] bg-multinivel text-navy"><Repeat size={22} /></span>
            <span><span className="block font-medium text-navy">Nueva franja semanal</span><span className="block texto-s suave">Se repite cada semana y crea sus clases de una vez.</span></span>
          </button>
        </div>
      )}
    </Hoja>
  );
}

/** Names as written in the schedule's «Profe» column, for the pickers. */
export function useProfes() {
  const { data } = useProfesLista();
  return (data || []).filter((u) => u.activa !== false).map((u) => u.nombreHorario || u.nombre);
}

function FormExtra({ listo }) {
  const crear = useCrearClase();
  const profes = useProfes();
  const { avisar } = useAvisos();
  const [f, setF] = useState({ fecha: sumarDias(hoyClave(), 1), hora: "18:00", clase: TIPOS_CLASE[0], profe: "", cupos: "8", notas: "" });
  const [festivo, setFestivo] = useState(null);
  const enviar = (forzar = false) => crear.mutate({ ...f, cupos: Number(f.cupos), forzar }, {
    onSuccess: (c) => { avisar(`Clase extra creada: ${c.fechaTexto}, ${c.horaTexto}`); listo(); },
    onError: (e) => { if (e.motivo === "festivo") setFestivo(e.mensaje); },
  });
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); enviar(false); }}>
      <div className="grid grid-cols-2 gap-3">
        <Entrada etiqueta="Día" type="date" valor={f.fecha} onCambio={(v) => setF({ ...f, fecha: v })} min={hoyClave()} error={crear.error?.campos?.fecha} />
        <Entrada etiqueta="Hora" type="time" valor={f.hora} onCambio={(v) => setF({ ...f, hora: v })} step={300} error={crear.error?.campos?.hora} />
      </div>
      <Selector etiqueta="Clase" valor={f.clase} onCambio={(v) => setF({ ...f, clase: v })} opciones={TIPOS_CLASE} />
      <div className="grid grid-cols-2 gap-3">
        <Selector etiqueta="Profe" valor={f.profe} onCambio={(v) => setF({ ...f, profe: v })} opciones={profes} vacio="Por definir" />
        <Entrada etiqueta="Cupos" valor={f.cupos} onCambio={(v) => setF({ ...f, cupos: v.replace(/\D/g, "") })} inputMode="numeric" />
      </div>
      <Entrada etiqueta="Notas" opcional valor={f.notas} onCambio={(v) => setF({ ...f, notas: v })} placeholder="Taller de inversiones, reposición…" />
      {festivo && (
        <div className="rounded-[22px] bg-aviso-bg p-4 text-aviso" role="alert">
          <p>{festivo}</p>
          <Boton tam="s" className="mt-3" variante="suave" cargando={crear.isPending} onClick={() => enviar(true)}>Sí, crearla igual</Boton>
        </div>
      )}
      {crear.isError && !crear.error.campos && crear.error.motivo !== "festivo" && <p className="campo-error" role="alert">{crear.error.mensaje}</p>}
      <Boton type="submit" bloque tam="l" punto cargando={crear.isPending && !festivo}>Crear la clase</Boton>
    </form>
  );
}
