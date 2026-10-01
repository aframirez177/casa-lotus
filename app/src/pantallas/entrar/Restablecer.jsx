// /app/restablecer/:token — a new password from the reset email.
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useRestablecer } from "../../api/hooks/auth.js";
import { inicioDe } from "../../shell/rutas.jsx";
import { CampoClave, PaginaSola, fuerza } from "./comun.jsx";
import { Boton } from "../../ui/Boton.jsx";

export default function Restablecer() {
  const { token } = useParams();
  const restablecer = useRestablecer();
  const navegar = useNavigate();
  const [clave, setClave] = useState("");
  const [otra, setOtra] = useState("");
  return (
    <PaginaSola>
      <p className="etiqueta mb-4">Equipo Casa Lotus</p>
      <h1 className="titulo">Crea una contraseña nueva</h1>
      <p className="lead mt-3">Al guardarla, entras de una vez.</p>
      <form className="mt-8 space-y-5" onSubmit={(e) => { e.preventDefault(); restablecer.mutate({ token, nueva: clave }, { onSuccess: (r) => navegar(inicioDe(r.usuario.rol), { replace: true }) }); }}>
        <CampoClave etiqueta="Contraseña nueva" valor={clave} onCambio={setClave} autoComplete="new-password" conFuerza autoFocus error={restablecer.error?.campos?.nueva} />
        <CampoClave etiqueta="Escríbela otra vez" valor={otra} onCambio={setOtra} autoComplete="new-password" error={otra && otra !== clave ? "No coinciden todavía." : undefined} />
        {restablecer.isError && !restablecer.error.campos && (
          <p className="campo-error" role="alert">{restablecer.error.status === 404 ? "Este enlace venció o ya se usó. Pide uno nuevo desde «¿Olvidaste tu contraseña?»." : restablecer.error.mensaje}</p>
        )}
        <Boton type="submit" bloque tam="l" cargando={restablecer.isPending} disabled={fuerza(clave).nivel < 2 || clave !== otra}>Guardar y entrar</Boton>
      </form>
    </PaginaSola>
  );
}
