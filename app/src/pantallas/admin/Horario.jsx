// /app/admin/horario — the weekly template. Each slot creates its classes for the weeks ahead.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Plus, Users } from "lucide-react";
import { useHorario, useCrearFranja, useEditarFranja, useDesactivarFranja } from "../../api/hooks/admin.js";
import { Encabezado, ErrorCaja, SinTipo } from "../../ui/Basicos.jsx";
import { Esqueleto } from "../../ui/Esqueleto.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { Entrada, Selector, Interruptor } from "../../ui/Campos.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { TIPOS_CLASE, useProfes } from "./Agenda.jsx";
import { colorClase, nombreClase } from "../../lib/clases.js";
import { horaLegible, hoyClave, fechaLegible } from "../../lib/reglas.js";
import { slotTexto, textoFijas } from "../../lib/fijos.js";
import { AvataresFijos, HojaFijasSlot } from "./Fijos.jsx";

const fijasTotal = (lista) => lista.reduce((n, x) => n + (x.cuposFijos || 0), 0);
const SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export default function Horario() {
  const { data, isPending, error, refetch } = useHorario();
  const [params, setParams] = useSearchParams();
  const [editar, setEditar] = useState(null);
  const [fijas, setFijas] = useState(null); // slot id whose regulars sheet is open
  const [nueva, setNueva] = useState(params.get("nueva") === "1");
  useEffect(() => { if (params.get("nueva")) setParams({}, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const activas = (data || []).filter((s) => s.activa);

  return (
    <div>
      <Encabezado titulo="Horario" grande={false} lead={data ? `${activas.length} franjas cada semana · ${activas.reduce((s, x) => s + x.cupos, 0)} columpios${fijasTotal(activas) ? ` · ${fijasTotal(activas)} ${fijasTotal(activas) === 1 ? "fija" : "fijas"}` : ""}` : " "}
        accion={<Boton tam="s" icono={<Plus size={17} />} onClick={() => setNueva(true)}>Nueva franja</Boton>} />
      {isPending ? <Esqueleto className="h-80 rounded-[28px]" /> : error ? <ErrorCaja error={error} reintentar={refetch} /> : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7 lg:gap-3">
          {SEMANA.map((dia) => {
            const lista = data.filter((s) => s.dia === dia).sort((a, b) => (a.hora < b.hora ? -1 : 1));
            return (
              <section key={dia} className={`min-w-0 ${!lista.length ? "hidden lg:block" : ""}`}>
                <h2 className="etiqueta-sola mb-3">{dia}</h2>
                <div className="grid gap-3">
                  {lista.map((s) => (
                    <div key={s.id} className={`tarjeta relative overflow-hidden ${s.activa ? "" : "opacity-55"}`}>
                      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5" style={{ background: colorClase(s.clase) }} />
                      <button type="button" onClick={() => setEditar(s)} className="block w-full rounded-t-[28px] p-4 pb-3 text-left hover:bg-mist/40">
                        <p className="flex items-baseline gap-1 whitespace-nowrap leading-none text-navy"><span className="font-display text-[1.45rem]">{horaLegible(s.hora).split(" ")[0]}</span><span className="text-[0.75rem] text-muted">{horaLegible(s.hora).split(" ").slice(1).join(" ")}</span></p>
                        <p className="mt-2 text-[0.875rem] font-medium leading-tight text-navy">{nombreClase(s)}</p>
                        <SinTipo clase={s} className="mt-1" />
                        <p className="mt-3 flex items-center gap-1.5 texto-s text-ink"><Users size={14} />{s.cupos} · {s.profe || "Profe por definir"}</p>
                        <p className="mt-1 text-[0.8125rem] text-muted">{s.activa ? `${s.proximas} ${s.proximas === 1 ? "clase creada" : "clases creadas"}` : "Desactivada"}</p>
                      </button>
                      {s.activa && (
                        <button type="button" onClick={() => setFijas(s.id)} aria-label={`Alumnas fijas de los ${slotTexto(s.dia, s.hora)}: ${textoFijas(s.cuposFijos || 0, s.cupos)}`}
                          className="flex min-h-12 w-full flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-4 py-2.5 text-left hover:bg-mist/40">
                          {s.fijos?.length ? <AvataresFijos fijos={s.fijos} /> : <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mist text-navy" aria-hidden="true"><Plus size={13} /></span>}
                          <span className={`text-[0.8125rem] font-medium ${s.cuposFijos ? "text-navy" : "text-muted"}`}>{s.fijos?.length ? textoFijas(s.cuposFijos, s.cupos) : "Agregar fijas"}</span>
                        </button>
                      )}
                    </div>
                  ))}
                  {!lista.length && <p className="rounded-[22px] border border-dashed border-line p-4 text-center text-[0.8125rem] text-muted">—</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <HojaFranja franja={editar} abierta={Boolean(editar)} cerrar={() => setEditar(null)} />
      <HojaFijasSlot slot={(data || []).find((s) => s.id === fijas)} abierta={Boolean(fijas)} cerrar={() => setFijas(null)} />
      <HojaFranja abierta={nueva} cerrar={() => setNueva(false)} />
    </div>
  );
}

function HojaFranja({ franja, abierta, cerrar }) {
  const profes = useProfes();
  const crear = useCrearFranja();
  const editar = useEditarFranja();
  const desactivar = useDesactivarFranja();
  const { avisar } = useAvisos();
  const [f, setF] = useState({});
  const [aplicar, setAplicar] = useState(true);
  const [resultado, setResultado] = useState(null);
  useEffect(() => {
    if (!abierta) return;
    setResultado(null);
    setF(franja ? { ...franja, cupos: String(franja.cupos) } : { dia: "Sábado", hora: "10:30", clase: TIPOS_CLASE[0], profe: "", cupos: "8", activa: true, desde: hoyClave() });
  }, [abierta, franja]);
  const guardar = (e) => {
    e.preventDefault();
    if (franja) editar.mutate({ id: franja.id, clase: f.clase, profe: f.profe, cupos: Number(f.cupos), activa: true, aplicarAFuturas: aplicar }, { onSuccess: (r) => { avisar(r.clasesActualizadas ? `Listo. Se actualizaron ${r.clasesActualizadas} clases.` : "Franja guardada."); cerrar(); } });
    else crear.mutate({ dia: f.dia, hora: f.hora, clase: f.clase, profe: f.profe, cupos: Number(f.cupos), activa: true, desde: f.desde }, { onSuccess: (r) => { avisar(`Franja creada: ${r.clasesCreadas} ${r.clasesCreadas === 1 ? "clase nueva" : "clases nuevas"} en la agenda.`); cerrar(); } });
  };
  const err = (franja ? editar : crear).error;
  return (
    <Hoja abierta={abierta} alCerrar={cerrar} titulo={resultado ? "Franja desactivada" : franja ? `${franja.dia} · ${horaLegible(franja.hora)}` : "Nueva franja semanal"}
      descripcion={resultado ? null : franja ? "Cambia la clase, quién la dicta o los cupos." : "Se repite cada semana y crea sus clases de una vez. Los festivos se saltan solos."}>
      {resultado ? (
        <div className="space-y-4">
          <p className="lead">{resultado.canceladas ? `Se quitaron ${resultado.canceladas} clases sin reservas.` : "No había clases futuras sin reservas."}</p>
          {resultado.conReservas.length > 0 && (
            <div className="rounded-[22px] bg-aviso-bg p-4 text-aviso">
              <p className="font-medium">Estas clases tienen gente y siguen en pie:</p>
              <ul className="mt-2 list-disc pl-5 texto-s">{resultado.conReservas.map((c) => <li key={c.id}>{fechaLegible(c.fecha)} · {c.ocupados} personas</li>)}</ul>
              <p className="mt-2 texto-s">Cancélalas desde la agenda si hace falta, y avísales.</p>
            </div>
          )}
          <Boton bloque onClick={cerrar}>Entendido</Boton>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={guardar}>
          {!franja && (
            <div className="grid grid-cols-2 gap-3">
              <Selector etiqueta="Día" valor={f.dia} onCambio={(v) => setF({ ...f, dia: v })} opciones={SEMANA} />
              <Entrada etiqueta="Hora" type="time" valor={f.hora} onCambio={(v) => setF({ ...f, hora: v })} step={300} error={err?.campos?.hora} />
            </div>
          )}
          <Selector etiqueta="Clase" valor={f.clase} onCambio={(v) => setF({ ...f, clase: v })} opciones={[...new Set([...TIPOS_CLASE, ...(f.clase ? [f.clase] : [])])]} />
          <div className="grid grid-cols-2 gap-3">
            <Selector etiqueta="Profe" valor={f.profe} onCambio={(v) => setF({ ...f, profe: v })} opciones={[...new Set([...profes, ...(f.profe ? [f.profe] : [])])]} vacio="Por definir" />
            <Entrada etiqueta="Cupos" valor={f.cupos} onCambio={(v) => setF({ ...f, cupos: v.replace(/\D/g, "") })} inputMode="numeric" />
          </div>
          {!franja && <Entrada etiqueta="Empieza" type="date" valor={f.desde} onCambio={(v) => setF({ ...f, desde: v })} min={hoyClave()} />}
          {franja && <Interruptor activo={aplicar} onCambio={setAplicar} etiqueta="Aplicar a las clases ya creadas" ayuda="Las próximas clases de esta franja toman los cambios." />}
          {err && !err.campos && <p className="campo-error" role="alert">{err.mensaje}</p>}
          <Boton type="submit" bloque tam="l" punto={!franja} cargando={crear.isPending || editar.isPending}>{franja ? "Guardar" : "Crear la franja"}</Boton>
          {franja?.activa && (
            <Boton variante="fantasma" bloque cargando={desactivar.isPending} onClick={() => desactivar.mutate(franja.id, { onSuccess: setResultado })}>Desactivar esta franja</Boton>
          )}
          {franja && !franja.activa && (
            <Boton variante="suave" bloque cargando={editar.isPending} onClick={() => editar.mutate({ id: franja.id, activa: true }, { onSuccess: () => { avisar("Franja activa otra vez."); cerrar(); } })}>Activarla otra vez</Boton>
          )}
        </form>
      )}
    </Hoja>
  );
}
