// /app/admin/registro — the audit log: who did what, and when.
import { useState } from "react";
import { useRegistro } from "../../api/hooks/admin.js";
import { api } from "../../api/cliente.js";
import { Encabezado, ErrorCaja, Vacio, Avatar } from "../../ui/Basicos.jsx";
import { EsqueletoLista } from "../../ui/Esqueleto.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { partesBogota, horaLegible, fechaLegible } from "../../lib/reglas.js";
import { diaRelativo } from "../../lib/fechas.js";
import { textoDetalle } from "../../lib/texto.js";

const ACTORES = [{ v: "", t: "Todo" }, { v: "admin", t: "Administración" }, { v: "profe", t: "Profes" }, { v: "clienta", t: "Clientas" }, { v: "sistema", t: "Sistema" }, { v: "ia", t: "Asistente" }];
const ACCIONES = {
  // server (dominio.verbo)
  "ads.conversion": "Envió una conversión a Google Ads", "ajustes.completar": "Completó los ajustes", "ajustes.editar": "Cambió ajustes",
  "asistencia.cerrar": "Cerró la lista de una clase", "asistencia.sin-reserva": "Agregó a alguien que vino sin reserva",
  "auth.codigo": "Pidió un código para entrar", "auth.enlace": "Entró con su enlace", "auth.entrar": "Entró", "auth.entrar-fallido": "Intento de entrada fallido",
  "auth.invitacion": "Aceptó su invitación", "auth.password": "Cambió su contraseña", "auth.recuperar": "Pidió recuperar la contraseña",
  "auth.restablecer": "Restableció su contraseña", "auth.verificar": "Entró con un código", "calendario.generar": "Creó las clases de las próximas semanas",
  "clase.cancelar": "Canceló una clase", "clase.editar": "Editó una clase", "clase.extra": "Creó una clase extra", "clase.nota": "Escribió notas de una clase",
  "clase.reemplazo": "Pidió reemplazo para una clase", "clienta.acceso": "Creó un enlace de acceso", "clienta.crear": "Registró una clienta",
  "clienta.editar": "Editó una clienta", "clienta.lead": "Llegó una persona interesada", "consentimientos.baja": "Se dio de baja de las novedades",
  "consentimientos.datos": "Respondió el tratamiento de datos", "consentimientos.descargo": "Respondió el descargo", "consentimientos.editar": "Cambió sus acuerdos",
  "consentimientos.imagen": "Respondió fotos y videos", "consentimientos.sensibles": "Respondió los datos de salud", "cuenta.editar": "Editó su cuenta",
  "equipo.admin-inicial": "Se creó la primera cuenta de administración", "equipo.crear": "Invitó a alguien al equipo", "equipo.editar": "Editó a alguien del equipo",
  "equipo.invitacion": "Envió otra invitación", "espera.avisada": "Avisó a alguien en espera", "espera.estado": "Cambió la lista de espera",
  "espera.salir": "Salió de la lista de espera", "espera.tomar": "Le dio el cupo a alguien en espera", "espera.unirse": "Se unió a la lista de espera",
  "espera.web": "Se unió a la lista de espera desde la web", "horario.crear": "Creó una franja semanal", "horario.desactivar": "Desactivó una franja",
  "horario.editar": "Editó una franja", "pago.plan": "Pagó un plan", "pago.registrar": "Registró un pago", "perfil.editar": "Editó su ficha",
  "perfil.nombre": "Cambió su nombre", "plan.crear": "Creó un plan", "plan.editar": "Cambió un plan", "reserva.asistencia": "Marcó asistencia",
  "reserva.cancelar": "Canceló una reserva", "reserva.confirmar": "Confirmó una reserva", "reserva.crear": "Reservó una clase",
  "reserva.liberar": "Liberó un columpio", "reserva.reagendar": "Cambió una reserva de clase", "reserva.vencer": "Venció un apartado sin pago",
  "reserva.web": "Reservó por la web", "whatsapp.conversacion": "Organizó una conversación", "whatsapp.plantilla": "Envió una plantilla de WhatsApp",
  "whatsapp.texto": "Envió un WhatsApp",
  // demo adapter
  "reserva-web": "Reservó por la web", reserva: "Reserva", confirmar: "Confirmó un pago", pago: "Registró un pago", liberar: "Liberó un columpio",
  asistencia: "Marcó asistencia", cancelacion: "Canceló", "clase-extra": "Creó una clase extra", "clase-editada": "Editó una clase",
  "clase-cancelada": "Canceló una clase", "franja-nueva": "Creó una franja", ajustes: "Cambió ajustes", plan: "Cambió un plan",
  "clienta-nueva": "Registró una clienta", "clienta-editada": "Editó una clienta", "equipo-invitacion": "Invitó al equipo", espera: "Lista de espera",
};

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
                      <p className="text-[0.9375rem] text-ink"><strong className="font-medium text-navy">{x.actor?.nombre || "Sistema"}</strong> · {ACCIONES[x.accion] || textoDetalle(x.accion)}</p>
                      {textoDetalle(x.detalle) && <p className="texto-s suave break-words">{textoDetalle(x.detalle)}</p>}
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
