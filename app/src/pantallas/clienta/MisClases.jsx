// /app/mi/clases — upcoming (cancel / reschedule) and history, plus her plans.
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X, CalendarX2, Clock, Hourglass, ShieldCheck, ArrowRight } from "lucide-react";
import { useMi } from "../../api/hooks/clienta.js";
import { Encabezado, Seccion, ErrorCaja, Vacio } from "../../ui/Basicos.jsx";
import { EsqueletoLista } from "../../ui/Esqueleto.jsx";
import { Segmentado } from "../../ui/Segmentado.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { ListaEscalonada } from "../../ui/Animado.jsx";
import { FilaReserva, HojaCancelar, HojaReagendar } from "./comun.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { FlujoCodigo } from "../entrar/FlujoCodigo.jsx";
import { K } from "../../api/claves.js";
import { ESTADO, fechaLegible } from "../../lib/reglas.js";
import { rangoHora } from "../../lib/ics.js";
import { nombreClase, tituloTuClase } from "../../lib/clases.js";

const ESTADOS = {
  [ESTADO.ASISTIO]: { texto: "Viniste", clase: "chip-ok", Icono: Check },
  [ESTADO.NO_VINO]: { texto: "No viniste", clase: "chip-aviso", Icono: X },
  [ESTADO.CANCELADA]: { texto: "Cancelada", clase: "", Icono: CalendarX2 },
  [ESTADO.CANCELADA_TARDE]: { texto: "Cancelada tarde", clase: "chip-aviso", Icono: Clock },
  [ESTADO.VENCIDA]: { texto: "Apartado vencido", clase: "", Icono: Hourglass },
  [ESTADO.CONFIRMADA]: { texto: "Confirmada", clase: "chip-blanco", Icono: Check },
  [ESTADO.PENDIENTE]: { texto: "Falta tu pago", clase: "chip-aviso", Icono: Clock },
};

export default function MisClases() {
  const { data, isPending, error, refetch } = useMi();
  const [vista, setVista] = useState("proximas");
  const [cancelar, setCancelar] = useState(null);
  const [reagendar, setReagendar] = useState(null);
  const [params, setParams] = useSearchParams();
  const idReserva = params.get("reserva");
  const accion = params.get("accion");
  // «No puedo ir» (the reminder e-mail): ?reserva=<id>&accion=cancelar opens that booking's sheet with the policy right away.
  // The action is used once (removed from the URL), so closing the sheet does not reopen it.
  useEffect(() => {
    if (!data || !idReserva || !accion) return;
    const r = data.proximas.find((x) => x.id === idReserva);
    if (r && accion === "cancelar") setCancelar(r);
    else if (r && accion === "reagendar") setReagendar(r);
    const n = new URLSearchParams(params);
    n.delete("accion");
    setParams(n, { replace: true });
  }, [data, idReserva, accion]); // eslint-disable-line react-hooks/exhaustive-deps

  // a session scoped to one booking (the reminder link, or a booking just made from a known number) sees only that
  if (data?.clienta?.limitada) {
    return (
      <>
        <SoloSuClase data={data} idReserva={idReserva} onCancelar={setCancelar} onReagendar={setReagendar} />
        <HojaCancelar reserva={cancelar} cerrar={() => setCancelar(null)} />
        <HojaReagendar reserva={reagendar} cerrar={() => setReagendar(null)} />
      </>
    );
  }
  return (
    <div>
      <Encabezado titulo="Mis clases" grande={false} accion={<Boton a="/mi/reservar" punto tam="s">Reservar otra</Boton>} />
      <Segmentado etiqueta="Mis clases" valor={vista} onCambio={setVista} opciones={[{ valor: "proximas", texto: "Próximas", insignia: data?.proximas.length || null }, { valor: "historial", texto: "Historial" }]} />
      <div className="mt-6">
        {isPending ? <EsqueletoLista filas={3} /> : error ? <ErrorCaja error={error} reintentar={refetch} /> : vista === "proximas" ? (
          data.proximas.length ? (
            <ListaEscalonada clave="mis-proximas" className="grid gap-3 lg:grid-cols-2">
              {data.proximas.map((r) => <FilaReserva key={r.id} reserva={r} onCancelar={setCancelar} onReagendar={setReagendar} />)}
            </ListaEscalonada>
          ) : <Vacio titulo="No tienes clases agendadas" texto="Reserva tu próxima clase y aparece aquí." accion={<Boton a="/mi/reservar" punto>Reservar</Boton>} />
        ) : (
          data.historial.length ? (
            <ul className="tarjeta divide-y divide-line overflow-hidden">
              {data.historial.map((r) => {
                const e = ESTADOS[r.estado] || { texto: r.estado, clase: "" };
                return (
                  <li key={r.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-navy first-letter:uppercase">{fechaLegible(r.clase.fecha)}</p>
                      <p className="texto-s suave">{rangoHora(r.clase)} · {nombreClase(r.clase)}</p>
                    </div>
                    <span className={`chip ${e.clase}`}>{e.Icono && <e.Icono size={13} />}{e.texto}</span>
                  </li>
                );
              })}
            </ul>
          ) : <Vacio titulo="Todavía no hay historial" texto="Después de tu primera clase, aquí la ves." />
        )}
      </div>

      {data?.compras?.length > 0 && (
        <Seccion titulo="Tus planes" className="mt-12">
          <div className="grid gap-3 md:grid-cols-2">
            {data.compras.map((c) => (
              <div key={c.id} className="tarjeta p-5">
                <div className="flex items-baseline justify-between gap-3"><p className="font-medium text-navy">{c.plan}</p><span className="chip chip-ok">{c.estado}</span></div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-mist" aria-hidden="true"><div className="h-full rounded-full bg-navy" style={{ width: `${(c.usadas / Math.max(1, c.clases)) * 100}%` }} /></div>
                <p className="texto-s mt-3 text-ink">Usaste {c.usadas} de {c.clases}. Vence el {fechaLegible(c.vence)}.</p>
              </div>
            ))}
          </div>
        </Seccion>
      )}

      <HojaCancelar reserva={cancelar} cerrar={() => setCancelar(null)} />
      <HojaReagendar reserva={reagendar} cerrar={() => setReagendar(null)} />
    </div>
  );
}

/**
 * The calm view a reminder's «No puedo ir» opens: one class, cancel or move it, nothing else of hers.
 * After cancelling, a thank-you instead of an empty list.
 */
function SoloSuClase({ data, idReserva, onCancelar, onReagendar }) {
  const qc = useQueryClient();
  const [codigo, setCodigo] = useState(false);
  const vista = useRef(false);
  const r = data.proximas.find((x) => x.id === idReserva) || data.proximas[0];
  if (r) vista.current = true;
  const entrar = (
    <button type="button" onClick={() => setCodigo(true)} className="tarjeta mt-8 flex w-full items-center gap-4 p-5 text-left">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-yoga text-navy"><ShieldCheck size={20} /></span>
      <span className="min-w-0 flex-1"><span className="block font-medium text-navy">Entra con tu código</span><span className="block texto-s suave">Para ver tu plan y todas tus clases.</span></span>
      <ArrowRight size={18} className="shrink-0 text-navy" />
    </button>
  );
  return (
    <div className="max-w-[640px]">
      {r ? (
        <>
          <Encabezado titulo={tituloTuClase(r.clase)} grande={false} lead="Si no puedes venir, cancélala aquí. Si prefieres otro día, cámbiala. Así tu columpio queda para alguien más." />
          <FilaReserva reserva={r} onCancelar={onCancelar} onReagendar={onReagendar} />
        </>
      ) : (
        <>
          <Encabezado titulo={vista.current ? "Listo, gracias por avisar" : "Tu clase"} grande={false} />
          <Vacio titulo={vista.current ? "Tu clase quedó cancelada" : "Esta clase ya no está en tus próximas"}
            texto={vista.current ? "Tu columpio ya quedó libre para alguien más. Te esperamos pronto." : "Puede que ya la hayas cancelado o cambiado, o que ya haya empezado."}
            accion={<Boton a="/reservar?ref=APP-NO-PUEDO-IR" variante="suave">Reservar otro día</Boton>} />
        </>
      )}
      {entrar}
      <Hoja abierta={codigo} alCerrar={() => setCodigo(false)} titulo="Entra con tu código" descripcion="Así sabemos que eres tú y te mostramos tu plan y todas tus clases.">
        <FlujoCodigo compacto whatsappInicial={data.clienta.perfil.whatsapp} onListo={() => { setCodigo(false); qc.invalidateQueries({ queryKey: K.mi }); qc.invalidateQueries({ queryKey: K.yo }); }} />
      </Hoja>
    </div>
  );
}
