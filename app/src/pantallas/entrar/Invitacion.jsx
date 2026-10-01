// /app/invitacion/:token — a new profe (or admin) activates the invitation: «Continuar con Google» or a password.
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useInvitacion, useAceptarInvitacion, useConfigAuth, useInvitacionGoogle } from "../../api/hooks/auth.js";
import { BotonGoogle, Divisor } from "../../ui/BotonGoogle.jsx";
import { inicioDe } from "../../shell/rutas.jsx";
import { CampoClave, PaginaSola, fuerza } from "./comun.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Esqueleto } from "../../ui/Esqueleto.jsx";
import { primerNombre } from "../../lib/reglas.js";

export default function Invitacion() {
  const { token } = useParams();
  const { data, isPending, error } = useInvitacion(token);
  const aceptar = useAceptarInvitacion(token);
  const conGoogle = useInvitacionGoogle(token);
  const config = useConfigAuth();
  const google = config.data?.google || null;
  const navegar = useNavigate();
  const listo = (r) => navegar(inicioDe(r.usuario.rol), { replace: true });
  const [clave, setClave] = useState("");
  const [otra, setOtra] = useState("");
  const ok = fuerza(clave).nivel >= 2 && clave === otra;

  return (
    <PaginaSola>
      {isPending ? <div className="space-y-4"><Esqueleto className="h-3 w-32" /><Esqueleto className="h-14 w-64" /><Esqueleto className="h-4 w-72" /></div>
        : error ? (
          <>
            <h1 className="titulo">Esta invitación ya no sirve</h1>
            <p className="lead mt-3">{error.status === 0 || error.status >= 500 ? error.mensaje : "Venció o ya se usó. Pídele a Ana que te envíe una nueva."}</p>
          </>
        ) : (
          <>
            <p className="etiqueta mb-4">Equipo Casa Lotus</p>
            <h1 className="saludo">Hola, {primerNombre(data.nombre)}.</h1>
            <p className="lead mt-4">{google ? "Elige cómo vas a entrar" : "Crea tu contraseña para entrar"}{data.rol === "profe" ? " a tus clases y tu lista de alumnas" : " al panel del estudio"}. Tu correo es <strong className="font-medium text-navy">{data.correo}</strong>.</p>
            {google && (
              <div className="mt-8">
                <BotonGoogle clientId={google.clientId} ocupado={conGoogle.isPending} correoDemo={data.correo}
                  onCredencial={(credential) => { aceptar.reset(); conGoogle.mutate(credential, { onSuccess: listo }); }} />
                <p className="campo-ayuda text-center">Con la cuenta de Google de {data.correo}.</p>
                {conGoogle.isError && <p className="campo-error mt-3 text-center" role="alert">{conGoogle.error.mensaje}</p>}
                <Divisor texto="o crea una contraseña" />
              </div>
            )}
            <form className={`space-y-5 ${google ? "" : "mt-8"}`} onSubmit={(e) => { e.preventDefault(); conGoogle.reset(); aceptar.mutate({ password: clave }, { onSuccess: listo }); }}>
              <input type="email" autoComplete="username" value={data.correo} readOnly hidden />
              <CampoClave etiqueta="Contraseña nueva" valor={clave} onCambio={setClave} autoComplete="new-password" conFuerza autoFocus={!google} error={aceptar.error?.campos?.password} />
              <CampoClave etiqueta="Escríbela otra vez" valor={otra} onCambio={setOtra} autoComplete="new-password" error={otra && otra !== clave ? "No coinciden todavía." : undefined} />
              {aceptar.isError && !aceptar.error.campos && <p className="campo-error" role="alert">{aceptar.error.mensaje}</p>}
              <Boton type="submit" bloque tam="l" punto={!google} variante={google ? "suave" : "primario"} cargando={aceptar.isPending} disabled={!ok}>Crear contraseña</Boton>
            </form>
          </>
        )}
    </PaginaSola>
  );
}
