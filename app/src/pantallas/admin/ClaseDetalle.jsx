// /app/admin/agenda/:id — roster, waiting list, add a person, edit, cancel (with the people to notify).
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ArrowLeft, UserPlus, Pencil, CalendarX2, MessageCircle, MoreHorizontal, CircleDollarSign, Repeat } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useClaseAdmin, useReservarAdmin, useEditarClase, useCancelarClase, useTomarEspera, useEstadoEspera, useReagendarAdmin } from "../../api/hooks/admin.js";
import { useDisponibilidad, useEstudio } from "../../api/hooks/publico.js";
import { api, id as idUrl } from "../../api/cliente.js";
import { foto, restaurar, ponerClase } from "../../api/hooks/comun.js";
import { K } from "../../api/claves.js";
import { ErrorCaja, Seccion, Avatar } from "../../ui/Basicos.jsx";
import { EsqueletoLista, Esqueleto } from "../../ui/Esqueleto.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { Entrada, Selector, Interruptor } from "../../ui/Campos.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { CabeceraClase, Roster, NotasClase, HerramientasProfe } from "../comun/Clase.jsx";
import { BuscarClienta, HojaConfirmar } from "./comun.jsx";
import { TIPOS_CLASE, useProfes } from "./Agenda.jsx";
import { SelectorClase } from "../reservar/SelectorClase.jsx";
import { ESTADO, enlaceWhatsApp, primerNombre, fechaLegible, horaLegible, politicaCancelar, inicioClase } from "../../lib/reglas.js";
import { haceTexto } from "../../lib/fechas.js";

export default function ClaseDetalle() {
  const { id } = useParams();
  const { data: c, isPending, error, refetch } = useClaseAdmin(id);
  const [params, setParams] = useSearchParams();
  const [hoja, setHoja] = useState(params.get("profe") === "1" ? "editar" : null); // agregar | editar | cancelar | {persona}
  const [confirmar, setConfirmar] = useState(null);
  const [mover, setMover] = useState(null);
  const qc = useQueryClient();
  const { programar } = useAvisos();

  const cancelarReserva = (g, sinCosto) => {
    const instantanea = foto(qc);
    programar({
      texto: `Cancelaste la reserva de ${primerNombre(g.nombre)}${sinCosto ? ": la clase vuelve a su plan." : "."}`,
      aplicar: () => ponerClase(qc, { ...c, ocupados: c.ocupados - 1, libres: c.libres + 1, gente: c.gente.map((x) => (x.reserva === g.reserva ? { ...x, estado: "Cancelada" } : x)) }),
      revertir: () => restaurar(qc, instantanea),
      confirmar: async () => { const r = await api.post(`/api/admin/reservas/${idUrl(g.reserva)}/cancelar`, { sinCosto }); ponerClase(qc, r.clase); qc.invalidateQueries({ queryKey: K.tablero }); },
    });
  };

  return (
    <div className="max-w-[1040px]">
      <Link to="/admin/agenda" className="-ml-3 mb-2 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-navy hover:bg-white/70"><ArrowLeft size={18} /> Agenda</Link>
      {isPending ? <div className="space-y-4 pt-4"><Esqueleto className="h-3 w-24" /><Esqueleto className="h-16 w-48" /><EsqueletoLista filas={4} /></div>
        : error ? <ErrorCaja error={error} reintentar={refetch} /> : (
          <>
            <CabeceraClase clase={c} />
            {c.reemplazoPedido && c.estado !== "Cancelada" && (
              <div className="-mt-2 mb-6 flex flex-wrap items-center gap-3 rounded-[22px] bg-error-bg p-4 text-error">
                <p className="min-w-0 flex-1">{c.profe || "La profe"} no puede dictarla{c.reemplazoPedido.motivo ? `: ${c.reemplazoPedido.motivo}` : "."}</p>
                <Boton tam="s" onClick={() => setHoja("editar")}>Asignar otra profe</Boton>
              </div>
            )}
            {(c.pasada || inicioClase(c) - Date.now() <= 3600000) && <HerramientasProfe clase={c} admin />}
            {c.estado !== "Cancelada" && (
              <div className="-mt-2 mb-10 flex flex-wrap gap-2">
                {!c.pasada && <Boton tam="s" icono={<UserPlus size={16} />} onClick={() => setHoja("agregar")}>Agregar persona</Boton>}
                <Boton tam="s" variante="suave" icono={<Pencil size={16} />} onClick={() => setHoja("editar")}>Editar</Boton>
                {!c.pasada && <Boton tam="s" variante="fantasma" icono={<CalendarX2 size={16} />} onClick={() => setHoja("cancelar")}>Cancelar clase</Boton>}
              </div>
            )}

            <div className="grid gap-x-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <Seccion titulo="Quién viene">
                  <Roster clase={c} admin acciones={(g) => (
                    <>
                      {g.whatsapp && <a href={enlaceWhatsApp(g.whatsapp)} target="_blank" rel="noopener" className="chip !min-h-9 !px-3"><MessageCircle size={14} />WhatsApp</a>}
                      {g.estado === ESTADO.PENDIENTE && <button type="button" className="chip chip-noche !min-h-9 !px-3" onClick={() => setConfirmar(g)}><CircleDollarSign size={14} />Confirmar</button>}
                      {[ESTADO.CONFIRMADA, ESTADO.PENDIENTE].includes(g.estado) && !c.pasada && <button type="button" className="chip !min-h-9 !px-3" onClick={() => setHoja({ persona: g })}><MoreHorizontal size={14} />Más</button>}
                    </>
                  )} />
                </Seccion>
              </div>
              <aside className="min-w-0">
                <Seccion titulo="Lista de espera">
                  {c.espera.length ? <Espera clase={c} /> : <p className="tarjeta-suave p-5 texto-s text-ink">Nadie en espera.</p>}
                </Seccion>
                <div className="mt-10"><NotasClase clase={c} /></div>
              </aside>
            </div>

            <Hoja abierta={hoja === "agregar"} alCerrar={() => setHoja(null)} titulo="¿A quién reservamos?" descripcion="Si tiene clases en su plan, queda confirmada; si no, queda esperando el pago.">
              <Agregar clase={c} listo={() => setHoja(null)} />
            </Hoja>
            <Hoja abierta={hoja === "editar"} alCerrar={() => { setHoja(null); if (params.get("profe")) setParams({}, { replace: true }); }} titulo="Editar la clase">
              <Editar clase={c} listo={() => setHoja(null)} />
            </Hoja>
            <HojaCancelarClase clase={c} abierta={hoja === "cancelar"} cerrar={() => setHoja(null)} />
            <HojaPersona g={hoja?.persona} clase={c} cerrar={() => setHoja(null)} cancelar={(g, sinCosto) => { setHoja(null); cancelarReserva(g, sinCosto); }} mover={(g) => { setHoja(null); setMover(g); }} />
            <HojaConfirmar p={confirmar ? { reserva: confirmar.reserva, nombre: confirmar.nombre, clase: c, saldo: 0 } : null} cerrar={() => { setConfirmar(null); refetch(); }} />
            <HojaMover g={mover} clase={c} cerrar={() => setMover(null)} />
          </>
        )}
    </div>
  );
}

function Agregar({ clase: c, listo }) {
  const reservar = useReservarAdmin();
  const { avisar } = useAvisos();
  if (c.libres <= 0) return <p className="lead">La clase está llena. Sube los cupos en «Editar» o pídele que se una a la lista de espera.</p>;
  return (
    <>
      {reservar.isError && <p className="campo-error mb-3" role="alert">{reservar.error.mensaje}</p>}
      <BuscarClienta excluir={c.gente.filter((g) => [ESTADO.CONFIRMADA, ESTADO.PENDIENTE].includes(g.estado)).map((g) => g.clienta)}
        onElegir={(cl) => reservar.mutate({ clienta: cl.id, clase: c.id }, { onSuccess: (r) => { avisar(r.reserva.estado === ESTADO.CONFIRMADA ? `${primerNombre(cl.nombre)} quedó confirmada con su plan.` : `${primerNombre(cl.nombre)} quedó apartada, esperando el pago.`); listo(); } })} />
    </>
  );
}

function Editar({ clase: c, listo }) {
  const editar = useEditarClase();
  const profes = useProfes();
  const { avisar } = useAvisos();
  const [f, setF] = useState({ clase: c.clase || "Por confirmar", profe: c.profe || "", cupos: String(c.cupos), notas: c.notas || "" });
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); editar.mutate({ id: c.id, clase: f.clase, profe: f.profe, cupos: Number(f.cupos) }, { onSuccess: () => { avisar("Clase actualizada."); listo(); } }); }}>
      <Selector etiqueta="Clase" valor={f.clase} onCambio={(v) => setF({ ...f, clase: v })} opciones={[...new Set([...TIPOS_CLASE, f.clase])]} />
      <div className="grid grid-cols-2 gap-3">
        <Selector etiqueta="Profe" valor={f.profe} onCambio={(v) => setF({ ...f, profe: v })} opciones={[...new Set([...profes, ...(f.profe ? [f.profe] : [])])]} vacio="Por definir" />
        <Entrada etiqueta="Cupos" valor={f.cupos} onCambio={(v) => setF({ ...f, cupos: v.replace(/\D/g, "") })} inputMode="numeric" ayuda={`Nunca menos de ${c.ocupados}, las reservas que ya tiene.`} error={editar.error?.campos?.cupos} />
      </div>
      {editar.isError && !editar.error.campos && <p className="campo-error" role="alert">{editar.error.mensaje}</p>}
      <Boton type="submit" bloque tam="l" cargando={editar.isPending}>Guardar</Boton>
    </form>
  );
}

function HojaCancelarClase({ clase: c, abierta, cerrar }) {
  const cancelar = useCancelarClase();
  const [motivo, setMotivo] = useState("");
  const [afectadas, setAfectadas] = useState(null);
  const fin = () => { setAfectadas(null); setMotivo(""); cancelar.reset(); cerrar(); };
  return (
    <Hoja abierta={abierta} alCerrar={fin} titulo={afectadas ? "Avísales" : "¿Cancelar esta clase?"} descripcion={afectadas ? "La clase se canceló y volvió al plan de cada persona. Toca cada una para enviarle el mensaje." : `${fechaLegible(c.fecha)}, ${horaLegible(c.hora)}`}>
      {afectadas ? (
        afectadas.length ? (
          <ul className="space-y-2">
            {afectadas.map((a) => (
              <li key={a.reserva} className="flex items-center gap-3 rounded-2xl bg-mist p-3">
                <Avatar nombre={a.nombre} tam={38} />
                <span className="min-w-0 flex-1 font-medium text-navy">{a.nombre}</span>
                <Boton tam="xs" href={a.waEnlace} icono={<MessageCircle size={14} />}>Avisar</Boton>
              </li>
            ))}
          </ul>
        ) : <p className="lead">No había nadie reservado. Listo.</p>
      ) : (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); cancelar.mutate({ id: c.id, motivo }, { onSuccess: (r) => setAfectadas(r.afectadas) }); }}>
          <p className="text-ink">{c.ocupados ? `Hay ${c.ocupados === 1 ? "1 persona" : c.ocupados + " personas"}. Sus reservas se cancelan y la clase vuelve a cada plan. Después te muestro a quién avisar.` : "No hay nadie reservado."}</p>
          <Entrada etiqueta="Motivo" opcional valor={motivo} onCambio={setMotivo} placeholder="Poca gente, festivo, la profe está enferma…" ayuda="Va en el mensaje que les envías." />
          {cancelar.isError && <p className="campo-error" role="alert">{cancelar.error.mensaje}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Boton variante="suave" onClick={fin}>No, volver</Boton>
            <Boton type="submit" variante="peligro" cargando={cancelar.isPending}>Sí, cancelar la clase</Boton>
          </div>
        </form>
      )}
    </Hoja>
  );
}

function HojaPersona({ g, clase: c, cerrar, cancelar, mover }) {
  const [sinCosto, setSinCosto] = useState(false);
  const { data: estudio } = useEstudio();
  const horas = estudio?.politicas?.horasCancelar ?? 6;
  if (!g) return <Hoja abierta={false} alCerrar={cerrar} />;
  const tarde = politicaCancelar({ estado: g.estado }, c, Date.now(), horas);
  const esTarde = g.estado === ESTADO.CONFIRMADA && tarde.ok && !tarde.devuelveClase;
  return (
    <Hoja abierta={Boolean(g)} alCerrar={cerrar} titulo={g.nombre} descripcion={`${g.estado}${g.origen ? " · " + g.origen : ""}`}>
      <div className="space-y-3">
        <button type="button" onClick={() => mover(g)} className="tarjeta flex w-full items-center gap-4 p-4 text-left"><Repeat size={20} className="text-navy" /><span className="font-medium text-navy">Moverla a otra clase</span></button>
        <div className="tarjeta p-4">
          <p className="font-medium text-navy">Cancelar su reserva</p>
          <p className="texto-s mt-1 text-ink">{g.estado === ESTADO.PENDIENTE ? "No ha pagado: el columpio queda libre." : esTarde ? `Faltan menos de ${horas} horas: la clase se descuenta de su plan, salvo que se la devuelvas.` : "Avisó a tiempo: la clase vuelve a su plan."}</p>
          {esTarde && <Interruptor activo={sinCosto} onCambio={setSinCosto} etiqueta="Devolverle la clase" ayuda="Por esta vez, sin costo." />}
          <Boton className="mt-3" variante="peligro" tam="s" onClick={() => cancelar(g, esTarde ? sinCosto : true)}>Cancelar reserva</Boton>
        </div>
      </div>
    </Hoja>
  );
}

function HojaMover({ g, clase: c, cerrar }) {
  const disp = useDisponibilidad(28);
  const reagendar = useReagendarAdmin();
  const { avisar } = useAvisos();
  const [nueva, setNueva] = useState(null);
  const fin = () => { setNueva(null); reagendar.reset(); cerrar(); };
  return (
    <Hoja abierta={Boolean(g)} alCerrar={fin} titulo={g ? `Mover a ${primerNombre(g.nombre)}` : ""} descripcion="Elige la nueva clase."
      pie={<div className="flex items-center gap-3"><p className="min-w-0 flex-1 texto-s text-ink">{nueva ? `${fechaLegible(nueva.fecha)}, ${horaLegible(nueva.hora)}` : ""}</p><Boton disabled={!nueva} cargando={reagendar.isPending} onClick={() => reagendar.mutate({ reserva: g.reserva, clase: nueva.id }, { onSuccess: () => { avisar(`Listo: ${primerNombre(g.nombre)} pasó al ${fechaLegible(nueva.fecha)}.`); fin(); } })}>Mover</Boton></div>}>
      {reagendar.isError && <p className="campo-error mb-3" role="alert">{reagendar.error.mensaje}</p>}
      {g && <SelectorClase clases={(disp.data?.clases || []).filter((x) => x.id !== c.id)} seleccion={nueva?.id} onElegir={setNueva} inicial={c.fecha} />}
    </Hoja>
  );
}

function Espera({ clase: c }) {
  const tomar = useTomarEspera();
  const estado = useEstadoEspera();
  const { avisar } = useAvisos();
  return (
    <ul className="space-y-2">
      {c.espera.map((e, i) => {
        const texto = `Hola ${primerNombre(e.nombre)}, se liberó un columpio para el ${fechaLegible(c.fecha)} a las ${horaLegible(c.hora)} en Casa Lotus. ¿Lo quieres?`;
        return (
          <li key={e.id} className="tarjeta p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mist text-[0.8125rem] font-semibold text-navy">{i + 1}</span>
              <div className="min-w-0 flex-1"><p className="font-medium text-navy">{e.nombre}</p><p className="texto-s suave">Espera {haceTexto(e.creada).replace("hace ", "desde hace ")}{e.estado === "Avisada" ? " · ya le avisaste" : ""}</p></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {e.whatsapp && <Boton tam="xs" variante={c.libres > 0 ? "primario" : "suave"} href={enlaceWhatsApp(e.whatsapp, texto)} icono={<MessageCircle size={14} />} onClick={() => estado.mutate({ id: e.id, estado: "Avisada" })}>Avisar</Boton>}
              {c.libres > 0 && <Boton tam="xs" variante="suave" cargando={tomar.isPending && tomar.variables === e.id} onClick={() => tomar.mutate(e.id, { onSuccess: () => avisar(`${primerNombre(e.nombre)} tomó el columpio.`) })}>Darle el cupo</Boton>}
              <Boton tam="xs" variante="fantasma" onClick={() => estado.mutate({ id: e.id, estado: "Ya no" })}>Quitar</Boton>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

