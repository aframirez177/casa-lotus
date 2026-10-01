// /app/invitacion/:token — a new profe (or admin) creates their password.
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useInvitacion, useAceptarInvitacion } from "../../api/hooks/auth.js";
import { inicioDe } from "../../shell/rutas.jsx";
import { CampoClave, PaginaSola, fuerza } from "./comun.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Esqueleto } from "../../ui/Esqueleto.jsx";
import { primerNombre } from "../../lib/reglas.js";

export default function Invitacion() {
  const { token } = useParams();
  const { data, isPending, error } = useInvitacion(token);
  const aceptar = useAceptarInvitacion(token);
  const navegar = useNavigate();
  const [clave, setClave] = useState("");
  const [otra, setOtra] = useState("");
  const ok = fuerza(clave).nivel >= 2 && clave === otra;

  return (
    <PaginaSola>
      {isPending ? <div className="space-y-4"><Esqueleto className="h-3 w-32" /><Esqueleto className="h-14 w-64" /><Esqueleto className="h-4 w-72" /></div>
        : error ? (
          <>
            <h1 className="titulo">Esta invitación ya no sirve</h1>
            <p className="lead mt-3">{error.mensaje || "Venció o ya se usó."} Pídele a Ana que te envíe una nueva.</p>
          </>
        ) : (
          <>
            <p className="etiqueta mb-4">Equipo Casa Lotus</p>
            <h1 className="saludo">Hola, {primerNombre(data.nombre)}.</h1>
            <p className="lead mt-4">Crea tu contraseña para entrar{data.rol === "profe" ? " a tus clases y tu lista de alumnas" : " al panel del estudio"}. Tu correo es <strong className="font-medium text-navy">{data.correo}</strong>.</p>
            <form className="mt-8 space-y-5" onSubmit={(e) => { e.preventDefault(); aceptar.mutate({ password: clave }, { onSuccess: (r) => navegar(inicioDe(r.usuario.rol), { replace: true }) }); }}>
              <input type="email" autoComplete="username" value={data.correo} readOnly hidden />
              <CampoClave etiqueta="Contraseña nueva" valor={clave} onCambio={setClave} autoComplete="new-password" conFuerza autoFocus error={aceptar.error?.campos?.password} />
              <CampoClave etiqueta="Escríbela otra vez" valor={otra} onCambio={setOtra} autoComplete="new-password" error={otra && otra !== clave ? "No coinciden todavía." : undefined} />
              {aceptar.isError && !aceptar.error.campos && <p className="campo-error" role="alert">{aceptar.error.mensaje}</p>}
              <Boton type="submit" bloque tam="l" punto cargando={aceptar.isPending} disabled={!ok}>Crear mi contraseña</Boton>
            </form>
          </>
        )}
    </PaginaSola>
  );
}
