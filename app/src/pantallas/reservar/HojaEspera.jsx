// The waiting list for a full class (public visitors and signed-in clientas). Loaded on demand.
import { useEffect, useState } from "react";
import { useEsperaPublica } from "../../api/hooks/publico.js";
import { useEsperaMi } from "../../api/hooks/clienta.js";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { Entrada, formatoCelular } from "../../ui/Campos.jsx";
import { Columpios } from "../../ui/Columpios.jsx";
import { fechaLegible, horaLegible } from "../../lib/reglas.js";
import { nombreClase } from "../../lib/clases.js";

export default function HojaEspera({ clase, cerrar, clienta, perfil }) {
  const [nombre, setNombre] = useState(perfil.nombre || "");
  const [wa, setWa] = useState(perfil.whatsapp || "");
  const [acepta, setAcepta] = useState(false);
  const [listo, setListo] = useState(false);
  const publica = useEsperaPublica();
  const mia = useEsperaMi();
  useEffect(() => { if (!clase) { setListo(false); publica.reset(); mia.reset(); } }, [clase]); // eslint-disable-line react-hooks/exhaustive-deps
  const enviar = (e) => {
    e.preventDefault();
    const ok = { onSuccess: () => setListo(true) };
    if (clienta) mia.mutate(clase.id, ok);
    else publica.mutate({ clase: clase.id, nombre: nombre.trim(), whatsapp: wa.replace(/\D/g, ""), consentimientos: { datos: { acepta: true } } }, ok);
  };
  const error = publica.error || mia.error;
  return (
    <Hoja abierta={Boolean(clase)} alCerrar={cerrar} titulo={listo ? "Estás en la lista" : "Lista de espera"}
      descripcion={clase ? `${fechaLegible(clase.fecha)}, ${horaLegible(clase.hora)} · ${nombreClase(clase)}` : ""}>
      {listo ? (
        <div>
          <p className="lead">Si se libera un columpio, te escribimos por WhatsApp. Quien responde primero, lo toma.</p>
          <Boton className="mt-6" bloque onClick={cerrar}>Elegir otra clase mientras tanto</Boton>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-5">
          <div className="flex items-center gap-4 rounded-[22px] bg-mist p-4">
            {clase && <Columpios clase={clase} />}
            <p className="texto-s text-ink">Esta clase está llena. Déjanos tus datos y te avisamos si alguien cancela.</p>
          </div>
          {!clienta && (
            <>
              <Entrada etiqueta="Tu nombre" valor={nombre} onCambio={setNombre} autoComplete="name" required />
              <Entrada etiqueta="Tu WhatsApp" valor={wa} onCambio={(v) => setWa(formatoCelular(v))} inputMode="tel" placeholder="300 123 4567" required error={error?.campos?.whatsapp} />
              <label className="flex items-start gap-3 text-[0.875rem] text-ink">
                <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--color-navy)]" />
                <span>Autorizo a Casa Lotus a usar mi nombre y WhatsApp para avisarme de este cupo. <a className="enlace" href="/privacidad/" target="_blank" rel="noopener">Privacidad</a></span>
              </label>
            </>
          )}
          {error && !error.campos && <p className="campo-error" role="alert">{error.mensaje}</p>}
          <Boton type="submit" bloque punto cargando={publica.isPending || mia.isPending} disabled={!clienta && (!acepta || nombre.trim().length < 2 || wa.replace(/\D/g, "").length !== 10)}>Avisarme si se libera</Boton>
        </form>
      )}
    </Hoja>
  );
}

