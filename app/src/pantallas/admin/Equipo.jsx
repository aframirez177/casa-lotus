// /app/admin/equipo — profes and admins: invite (link to share by WhatsApp), deactivate, classes this month.
import { useEffect, useState } from "react";
import { UserPlus, Mail, Phone, Send } from "lucide-react";
import { useEquipo, useInvitar, useEditarStaff, useNuevaInvitacion } from "../../api/hooks/admin.js";
import { useYo } from "../../api/hooks/auth.js";
import { Encabezado, ErrorCaja, Avatar } from "../../ui/Basicos.jsx";
import { EsqueletoLista } from "../../ui/Esqueleto.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { Entrada, Opciones, Interruptor, formatoCelular } from "../../ui/Campos.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { Compartir } from "./comun.jsx";
import { dinero, whatsappLegible, primerNombre } from "../../lib/reglas.js";
import { haceTexto, mesActual, mesLegible } from "../../lib/fechas.js";

export default function Equipo() {
  const { data, isPending, error, refetch } = useEquipo();
  const { data: yo } = useYo();
  const [invitar, setInvitar] = useState(false);
  const [invitacion, setInvitacion] = useState(null);
  const editar = useEditarStaff();
  const nueva = useNuevaInvitacion();
  const { avisar } = useAvisos();
  const mes = mesLegible(mesActual()).split(" ")[0];
  return (
    <div className="max-w-[1000px]">
      <Encabezado titulo="Equipo" grande={false} lead="Cada profe entra con su correo y ve solo sus clases y a sus alumnas." accion={<Boton tam="s" icono={<UserPlus size={17} />} onClick={() => setInvitar(true)}>Invitar</Boton>} />
      {isPending ? <EsqueletoLista filas={3} /> : error ? <ErrorCaja error={error} reintentar={refetch} /> : (
        <ul className="grid items-start gap-4 md:grid-cols-2">
          {data.map((u) => (
            <li key={u.id} className={`tarjeta p-5 ${u.activa ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-4">
                <Avatar nombre={u.nombre} tam={52} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-navy">{u.nombre}{u.id === yo?.id && <span className="chip ml-2 align-middle">Tú</span>}</p>
                  <p className="texto-s suave">{u.rol === "admin" ? "Administración" : "Profe"}{u.nombreHorario && u.rol === "profe" ? ` · en el horario: «${u.nombreHorario}»` : ""}</p>
                  <p className="mt-2 flex items-center gap-1.5 texto-s text-ink"><Mail size={13} />{u.correo}</p>
                  {u.whatsapp && <p className="flex items-center gap-1.5 texto-s text-ink"><Phone size={13} />{whatsappLegible(u.whatsapp)}</p>}
                </div>
              </div>
              {u.rol === "profe" && (
                <div className="mt-4 flex gap-3">
                  <div className="flex-1 rounded-[18px] bg-mist p-3"><p className="numero text-2xl">{u.clasesMes}</p><p className="text-[0.75rem] text-muted">clases en {mes}</p></div>
                  {u.pagoMes != null && <div className="flex-1 rounded-[18px] bg-mist p-3"><p className="numero text-2xl">{dinero(u.pagoMes)}</p><p className="text-[0.75rem] text-muted">por pagar en {mes}</p></div>}
                </div>
              )}
              <p className="mt-3 text-[0.8125rem] text-muted">{u.ultimoAcceso ? `Entró ${haceTexto(u.ultimoAcceso)}` : "Todavía no ha entrado"}</p>
              {u.id !== yo?.id && (
                <div className="mt-3 border-t border-line pt-2">
                  <Interruptor activo={u.activa} etiqueta={u.activa ? "Activa" : "Desactivada"} ayuda={u.activa ? "Al desactivarla se cierran sus sesiones." : "No puede entrar."}
                    onCambio={(v) => editar.mutate({ id: u.id, activa: v }, { onSuccess: () => avisar(v ? `${primerNombre(u.nombre)} puede entrar otra vez.` : `${primerNombre(u.nombre)} ya no puede entrar.`) })} />
                  {!u.ultimoAcceso && u.activa && <Boton tam="xs" variante="suave" icono={<Send size={14} />} cargando={nueva.isPending && nueva.variables === u.id} onClick={() => nueva.mutate(u.id, { onSuccess: (r) => setInvitacion({ ...r, nombre: u.nombre }) })}>Enviar otra invitación</Boton>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <HojaInvitar abierta={invitar} cerrar={() => setInvitar(false)} listo={(r) => { setInvitar(false); setInvitacion(r); }} />
      <Hoja abierta={Boolean(invitacion)} alCerrar={() => setInvitacion(null)} titulo="Invitación lista" descripcion={invitacion ? `Envíale este enlace a ${primerNombre(invitacion.nombre)}. Sirve una sola vez y vence en 7 días.` : ""}>
        {invitacion && <Compartir enlace={invitacion.enlace} waEnlace={invitacion.waEnlace} waTexto={invitacion.waTexto} />}
      </Hoja>
    </div>
  );
}

function HojaInvitar({ abierta, cerrar, listo }) {
  const invitar = useInvitar();
  const [f, setF] = useState({ nombre: "", correo: "", whatsapp: "", rol: "profe", nombreHorario: "" });
  useEffect(() => { if (abierta) { setF({ nombre: "", correo: "", whatsapp: "", rol: "profe", nombreHorario: "" }); invitar.reset(); } }, [abierta]); // eslint-disable-line react-hooks/exhaustive-deps
  const e = invitar.error?.campos || {};
  return (
    <Hoja abierta={abierta} alCerrar={cerrar} titulo="Invitar al equipo" descripcion="Le llega un enlace para crear su contraseña.">
      <form className="space-y-5" onSubmit={(ev) => { ev.preventDefault(); invitar.mutate({ ...f, whatsapp: f.whatsapp.replace(/\D/g, ""), nombreHorario: f.nombreHorario || primerNombre(f.nombre) }, { onSuccess: (r) => listo({ ...r.invitacion, nombre: r.usuario.nombre }) }); }}>
        <Opciones etiqueta="Rol" opciones={[{ valor: "profe", texto: "Profe" }, { valor: "admin", texto: "Administración" }]} valor={f.rol} onCambio={(v) => setF({ ...f, rol: v || "profe" })} />
        <Entrada etiqueta="Nombre y apellido" valor={f.nombre} onCambio={(v) => setF({ ...f, nombre: v })} error={e.nombre} data-autofoco="" />
        <Entrada etiqueta="Correo" type="email" valor={f.correo} onCambio={(v) => setF({ ...f, correo: v })} error={e.correo} />
        <Entrada etiqueta="WhatsApp" opcional valor={f.whatsapp} onCambio={(v) => setF({ ...f, whatsapp: formatoCelular(v) })} inputMode="tel" />
        {f.rol === "profe" && <Entrada etiqueta="Nombre en el horario" opcional valor={f.nombreHorario} onCambio={(v) => setF({ ...f, nombreHorario: v })} placeholder={primerNombre(f.nombre) || "Como aparece en la hoja"} ayuda="Como aparece en la columna «Profe» del horario. Así ve sus clases." />}
        {invitar.isError && !invitar.error.campos && <p className="campo-error" role="alert">{invitar.error.mensaje}</p>}
        <Boton type="submit" bloque tam="l" punto cargando={invitar.isPending}>Crear invitación</Boton>
      </form>
    </Hoja>
  );
}
