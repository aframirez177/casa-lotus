// /app/mi/reservar — the same picker, booking against her plan.
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { K } from "../../api/claves.js";
import { FlujoCodigo } from "../entrar/FlujoCodigo.jsx";
import { useMi, useReservarMi, useEsperaMi } from "../../api/hooks/clienta.js";
import { useDisponibilidad } from "../../api/hooks/publico.js";
import { Encabezado, ErrorCaja } from "../../ui/Basicos.jsx";
import { Esqueleto } from "../../ui/Esqueleto.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { Columpios } from "../../ui/Columpios.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { SelectorClase } from "../reservar/SelectorClase.jsx";
import { fechaLegible, horaLegible, dinero } from "../../lib/reglas.js";
import { nombreClase } from "../../lib/clases.js";

export default function ReservarMi() {
  const [params] = useSearchParams();
  const mi = useMi();
  const disp = useDisponibilidad(28);
  const [elegida, setElegida] = useState(null);
  const [espera, setEspera] = useState(null);
  const reservar = useReservarMi();
  const esperar = useEsperaMi();
  const { avisar } = useAvisos();
  const navegar = useNavigate();
  const saldo = mi.data?.saldo?.clases ?? 0;
  const mias = new Set((mi.data?.proximas || []).map((r) => r.clase.id));
  const clases = (disp.data?.clases || []).filter((c) => !mias.has(c.id));
  if (mi.data?.clienta?.limitada) return <Limitada whatsapp={mi.data.clienta.perfil.whatsapp} />;

  return (
    <div className="max-w-[720px]">
      <Encabezado titulo="Reserva tu clase" grande={false}
        lead={mi.data ? (saldo ? `Te ${saldo === 1 ? "queda 1 clase" : "quedan " + saldo + " clases"} en tu plan${mi.data.saldo.venceTexto ? `, hasta el ${mi.data.saldo.venceTexto}` : ""}.` : "No tienes clases en tu plan: la clase queda apartada mientras llega tu pago.") : " "} />
      {disp.isPending ? <Esqueleto className="h-64 rounded-[28px]" /> : disp.isError ? <ErrorCaja error={disp.error} reintentar={disp.refetch} /> : (
        <SelectorClase clases={clases} seleccion={elegida?.id} inicial={params.get("clase") || undefined} onElegir={setElegida} onEspera={setEspera} />
      )}

      <Hoja abierta={Boolean(elegida)} alCerrar={() => { setElegida(null); reservar.reset(); }} titulo="¿Reservamos?" descripcion={elegida ? `${fechaLegible(elegida.fecha)}, ${horaLegible(elegida.hora)} · ${nombreClase(elegida)}` : ""}>
        {elegida && <div className="mb-5"><Columpios clase={elegida} /></div>}
        <p className="lead">{saldo > 0 ? `Se descuenta 1 clase de tu plan. Te ${saldo - 1 === 1 ? "quedará 1" : "quedarán " + (saldo - 1)}.` : `Queda apartada y esperando tu pago${mi.data?.pago?.llave ? ` (llave ${mi.data.pago.llave})` : ""}.`}</p>
        {reservar.isError && <p className="campo-error mt-3" role="alert">{reservar.error.mensaje}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="suave" onClick={() => setElegida(null)}>Elegir otra</Boton>
          <Boton punto cargando={reservar.isPending} onClick={() => reservar.mutate(elegida.id, {
            onSuccess: (r) => {
              avisar(r.estado === "Confirmada" ? "¡Listo! Tu columpio está reservado." : `Tu columpio está apartado. Paga ${r.pago ? dinero(r.pago.monto) : ""} y envía el comprobante.`);
              navegar("/mi");
            },
          })}>Reservar</Boton>
        </div>
      </Hoja>

      <Hoja abierta={Boolean(espera)} alCerrar={() => { setEspera(null); esperar.reset(); }} titulo="Esta clase está llena" descripcion={espera ? `${fechaLegible(espera.fecha)}, ${horaLegible(espera.hora)}` : ""}>
        <p className="lead">¿Te avisamos si alguien cancela? Quien responde primero, toma el columpio.</p>
        {esperar.isError && <p className="campo-error mt-3" role="alert">{esperar.error.mensaje}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="suave" onClick={() => setEspera(null)}>No, gracias</Boton>
          <Boton punto cargando={esperar.isPending} onClick={() => esperar.mutate(espera.id, { onSuccess: () => { setEspera(null); avisar("Estás en la lista de espera. Te avisamos por WhatsApp."); } })}>Avisarme</Boton>
        </div>
      </Hoja>
    </div>
  );
}

/** A limited session (booked from the web with a known number) books through the public flow until she confirms. */
function Limitada({ whatsapp }) {
  const qc = useQueryClient();
  return (
    <div className="max-w-[520px]">
      <Encabezado titulo="Entra con tu código" grande={false} lead="Para reservar con tu plan, confirma que eres tú. Te enviamos 6 números." />
      <div className="tarjeta p-6"><FlujoCodigo compacto whatsappInicial={whatsapp} onListo={() => { qc.invalidateQueries({ queryKey: K.mi }); qc.invalidateQueries({ queryKey: K.yo }); }} /></div>
      <p className="mt-6 texto-s suave">¿Prefieres no entrar? <Link className="enlace" to="/reservar?ref=APP-MI">Reserva sin cuenta</Link> y paga la clase.</p>
    </div>
  );
}
