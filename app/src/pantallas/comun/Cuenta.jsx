// /app/profe/cuenta and /app/admin/cuenta — name, WhatsApp, password, active sessions, sign out.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { LogOut, Smartphone, Monitor, KeyRound } from "lucide-react";
import { useYo, useEditarCuenta, useCambiarPassword, useSesiones, useCerrarSesionRemota, useSalir } from "../../api/hooks/auth.js";
import { Seccion, Avatar } from "../../ui/Basicos.jsx";
import { Esqueleto } from "../../ui/Esqueleto.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Entrada, formatoCelular } from "../../ui/Campos.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { CampoClave, fuerza } from "../entrar/comun.jsx";
import { InstalarTarjeta } from "../../shell/Instalar.jsx";
import { haceTexto } from "../../lib/fechas.js";

export default function Cuenta() {
  const { data: yo } = useYo();
  const editar = useEditarCuenta();
  const sesiones = useSesiones();
  const cerrar = useCerrarSesionRemota();
  const salir = useSalir();
  const navegar = useNavigate();
  const { avisar } = useAvisos();
  const [nombre, setNombre] = useState("");
  const [wa, setWa] = useState("");
  const [clave, setClave] = useState(false);
  useEffect(() => { if (yo) { setNombre(yo.nombre || ""); setWa(formatoCelular(yo.whatsapp || "")); } }, [yo]);
  if (!yo) return null;
  const sucio = nombre !== yo.nombre || wa.replace(/\D/g, "") !== String(yo.whatsapp || "").replace(/^57/, "");
  const lista = sesiones.data?.sesiones || [];
  const total = sesiones.data?.total ?? lista.length;
  const otras = lista.filter((s) => !s.actual);

  return (
    <div className="max-w-[720px]">
      <header className="mb-10 flex items-center gap-5 pt-4">
        <Avatar nombre={yo.nombre} tam={72} />
        <div><h1 className="titulo">{yo.nombre}</h1><p className="mt-2 suave">{yo.correo} · {yo.rol === "admin" ? "Administración" : "Profe"}</p></div>
      </header>

      <Seccion titulo="Tus datos">
        <form className="tarjeta grid gap-5 p-5 sm:p-6" onSubmit={(e) => { e.preventDefault(); editar.mutate({ nombre: nombre.trim(), whatsapp: wa.replace(/\D/g, "") }, { onSuccess: () => avisar("Guardado."), onError: (er) => avisar(er.mensaje, { tipo: "error" }) }); }}>
          <Entrada etiqueta="Nombre" valor={nombre} onCambio={setNombre} autoComplete="name" />
          <Entrada etiqueta="WhatsApp" valor={wa} onCambio={(v) => setWa(formatoCelular(v))} inputMode="tel" placeholder="300 123 4567" />
          <div className="flex flex-wrap gap-2">
            <Boton type="submit" disabled={!sucio} cargando={editar.isPending}>Guardar</Boton>
            <Boton variante="suave" icono={<KeyRound size={17} />} onClick={() => setClave(true)}>Cambiar contraseña</Boton>
          </div>
        </form>
      </Seccion>

      <Seccion titulo="Sesiones abiertas" ayuda="Los dispositivos donde has entrado. Si no reconoces alguno, ciérralo."
        accion={otras.length > 0 || total > lista.length ? <Boton tam="s" variante="suave" cargando={cerrar.isPending && cerrar.variables === "otras"} onClick={() => cerrar.mutate("otras", { onSuccess: () => avisar("Cerraste las demás sesiones.") })}>Cerrar las demás</Boton> : null}>
        {sesiones.isPending ? <Esqueleto className="h-32 rounded-[28px]" /> : (
          <ul className="tarjeta divide-y divide-line px-5">
            {[...lista].sort((a, b) => (b.actual - a.actual) || String(b.ultimoUso).localeCompare(String(a.ultimoUso))).slice(0, 10).map((s) => (
              <li key={s.id} className="flex items-center gap-4 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mist text-navy">{/iphone|android|móvil/i.test(s.dispositivo) ? <Smartphone size={18} /> : <Monitor size={18} />}</span>
                <div className="min-w-0 flex-1"><p className="font-medium text-navy">{s.dispositivo}{s.actual && <span className="chip chip-ok ml-2 align-middle">Esta</span>}</p><p className="texto-s suave">Último uso {haceTexto(s.ultimoUso)}</p></div>
                {!s.actual && <Boton tam="xs" variante="fantasma" onClick={() => cerrar.mutate(s.id)}>Cerrar</Boton>}
              </li>
            ))}
            {total > Math.min(10, lista.length) && <li className="py-4 texto-s suave">y {total - Math.min(10, lista.length)} más. «Cerrar las demás» las cierra todas menos esta.</li>}
          </ul>
        )}
      </Seccion>

      <div className="mt-10 grid gap-4">
        <InstalarTarjeta siempre />
        <Boton variante="suave" className="self-start" icono={<LogOut size={17} />} cargando={salir.isPending} onClick={() => salir.mutate(undefined, { onSettled: () => navegar("/entrar", { replace: true }) })}>Cerrar sesión</Boton>
      </div>
      <HojaClave abierta={clave} cerrar={() => setClave(false)} />
    </div>
  );
}

function HojaClave({ abierta, cerrar }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const cambiar = useCambiarPassword();
  const { avisar } = useAvisos();
  const fin = () => { setActual(""); setNueva(""); cambiar.reset(); cerrar(); };
  return (
    <Hoja abierta={abierta} alCerrar={fin} titulo="Cambiar contraseña" descripcion="Mínimo 10 caracteres. Una frase corta funciona muy bien.">
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); cambiar.mutate({ actual, nueva }, { onSuccess: () => { avisar("Contraseña cambiada."); fin(); } }); }}>
        <CampoClave etiqueta="Contraseña actual" valor={actual} onCambio={setActual} error={cambiar.error?.campos?.actual} />
        <CampoClave etiqueta="Contraseña nueva" valor={nueva} onCambio={setNueva} autoComplete="new-password" conFuerza error={cambiar.error?.campos?.nueva} />
        {cambiar.isError && !cambiar.error.campos && <p className="campo-error" role="alert">{cambiar.error.mensaje}</p>}
        <Boton type="submit" bloque cargando={cambiar.isPending} disabled={!actual || fuerza(nueva).nivel < 2}>Cambiar contraseña</Boton>
      </form>
    </Hoja>
  );
}
