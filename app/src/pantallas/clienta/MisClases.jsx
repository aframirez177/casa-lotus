// /app/mi/clases — upcoming (cancel / reschedule) and history, plus her plans.
import { useState } from "react";
import { Check, X, CalendarX2, Clock, Hourglass } from "lucide-react";
import { useMi } from "../../api/hooks/clienta.js";
import { Encabezado, Seccion, ErrorCaja, Vacio } from "../../ui/Basicos.jsx";
import { EsqueletoLista } from "../../ui/Esqueleto.jsx";
import { Segmentado } from "../../ui/Segmentado.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { ListaEscalonada } from "../../ui/Animado.jsx";
import { FilaReserva, HojaCancelar, HojaReagendar } from "./comun.jsx";
import { ESTADO, horaLegible, fechaLegible } from "../../lib/reglas.js";
import { nombreClase } from "../../lib/clases.js";

const ESTADOS = {
  [ESTADO.ASISTIO]: { texto: "Viniste", clase: "chip-ok", Icono: Check },
  [ESTADO.NO_VINO]: { texto: "No viniste", clase: "chip-aviso", Icono: X },
  [ESTADO.CANCELADA]: { texto: "Cancelada", clase: "", Icono: CalendarX2 },
  [ESTADO.CANCELADA_TARDE]: { texto: "Cancelada tarde", clase: "chip-aviso", Icono: Clock },
  [ESTADO.VENCIDA]: { texto: "Apartado vencido", clase: "", Icono: Hourglass },
  [ESTADO.CONFIRMADA]: { texto: "Confirmada", clase: "chip-blanco", Icono: Check },
  [ESTADO.PENDIENTE]: { texto: "Espera pago", clase: "chip-aviso", Icono: Clock },
};

export default function MisClases() {
  const { data, isPending, error, refetch } = useMi();
  const [vista, setVista] = useState("proximas");
  const [cancelar, setCancelar] = useState(null);
  const [reagendar, setReagendar] = useState(null);
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
                      <p className="texto-s suave">{horaLegible(r.clase.hora)} · {nombreClase(r.clase)}</p>
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
