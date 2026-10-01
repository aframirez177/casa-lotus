// /app/admin/registro — the audit log: who did what, and when.
import { useState } from "react";
import { useRegistro } from "../../api/hooks/admin.js";
import { api } from "../../api/cliente.js";
import { Encabezado, ErrorCaja, Vacio, Avatar } from "../../ui/Basicos.jsx";
import { EsqueletoLista } from "../../ui/Esqueleto.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { partesBogota, horaLegible, fechaLegible } from "../../lib/reglas.js";
import { diaRelativo } from "../../lib/fechas.js";

const ACTORES = [{ v: "", t: "Todo" }, { v: "admin", t: "Administración" }, { v: "profe", t: "Profes" }, { v: "clienta", t: "Clientas" }, { v: "sistema", t: "Sistema" }, { v: "ia", t: "Asistente" }];
const ACCIONES = { "reserva-web": "Reservó por la web", reserva: "Reserva", confirmar: "Confirmó un pago", pago: "Registró un pago", liberar: "Liberó un columpio", asistencia: "Marcó asistencia", cancelacion: "Canceló", "clase-extra": "Creó una clase extra", "clase-editada": "Editó una clase", "clase-cancelada": "Canceló una clase", "franja-nueva": "Creó una franja", ajustes: "Cambió ajustes", plan: "Cambió un plan", "clienta-nueva": "Registró una clienta", "clienta-editada": "Editó una clienta", "equipo-invitacion": "Invitó al equipo", espera: "Lista de espera" };

export default function Registro() {
  const { data, isPending, error, refetch } = useRegistro();
  const [actor, setActor] = useState("");
  const [mas, setMas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const todos = [...(data || []), ...mas];
  const lista = todos.filter((x) => !actor || x.actor?.tipo === actor);
  const cargarMas = async () => {
    setCargando(true);
    try { const r = await api.get("/api/admin/registro", { limite: 100, antes: todos[todos.length - 1]?.ts }); setMas((m) => [...m, ...r]); } finally { setCargando(false); }
  };
  let dia = "";
  return (
    <div className="max-w-[820px]">
      <Encabezado titulo="Registro" grande={false} lead="Cada cambio queda escrito con quién lo hizo." />
      <div className="scroll-x -mx-5 mb-6 flex gap-2 px-5 lg:mx-0 lg:px-0">
        {ACTORES.map((a) => <button key={a.v} type="button" aria-pressed={actor === a.v} onClick={() => setActor(a.v)} className="opcion shrink-0 !min-h-10 !rounded-full">{a.t}</button>)}
      </div>
      {isPending ? <EsqueletoLista filas={6} /> : error ? <ErrorCaja error={error} reintentar={refetch} /> : lista.length ? (
        <div className="tarjeta px-5 py-2">
          <ol>
            {lista.map((x, i) => {
              const { fecha, hora } = partesBogota(Date.parse(x.ts));
              const cabecera = fecha !== dia ? (dia = fecha) : null;
              return (
                <li key={x.ts + i}>
                  {cabecera && <p className="etiqueta-sola pb-1 pt-4 first-letter:uppercase">{diaRelativo(fecha) === "hoy" || diaRelativo(fecha) === "ayer" ? diaRelativo(fecha) : fechaLegible(fecha)}</p>}
                  <div className="flex items-start gap-3 border-b border-line py-3 last:border-0">
                    <Avatar nombre={x.actor?.nombre || "Casa Lotus"} tam={34} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.9375rem] text-ink"><strong className="font-medium text-navy">{x.actor?.nombre || "Sistema"}</strong> · {ACCIONES[x.accion] || x.accion}</p>
                      {x.detalle && <p className="texto-s suave break-words">{x.detalle}</p>}
                    </div>
                    <span className="shrink-0 text-[0.8125rem] text-muted">{horaLegible(hora)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          {(data?.length || 0) >= 100 && <div className="py-4 text-center"><Boton variante="suave" tam="s" cargando={cargando} onClick={cargarMas}>Ver más</Boton></div>}
        </div>
      ) : <Vacio titulo="Nada todavía" />}
    </div>
  );
}
