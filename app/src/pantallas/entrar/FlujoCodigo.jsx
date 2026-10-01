// The passwordless sign-in for students: WhatsApp (or email) → 6-digit code. Used on /entrar,
// inside the booking flow («¿Ya has venido?») and to upgrade a limited session.
import { useEffect, useState } from "react";
import { MessageCircle, Mail } from "lucide-react";
import { usePedirCodigo, useVerificarCodigo } from "../../api/hooks/auth.js";
import { Boton } from "../../ui/Boton.jsx";
import { Entrada, CodigoInput, formatoCelular } from "../../ui/Campos.jsx";
import { Segmentado } from "../../ui/Segmentado.jsx";
import { esDemo } from "../../api/modo.js";
import { enlaceWhatsApp } from "../../lib/reglas.js";

const ESTUDIO_WA = "573128720888";

export function FlujoCodigo({ onListo, whatsappInicial = "", compacto = false, alCambiarPaso }) {
  const [canal, setCanal] = useState("whatsapp");
  const [dato, setDato] = useState(formatoCelular(whatsappInicial));
  const [enviado, setEnviado] = useState(null);
  const [codigo, setCodigo] = useState("");
  const [espera, setEspera] = useState(0);
  const pedir = usePedirCodigo();
  const verificar = useVerificarCodigo();

  useEffect(() => { if (espera <= 0) return; const t = setTimeout(() => setEspera(espera - 1), 1000); return () => clearTimeout(t); }, [espera]);
  useEffect(() => { alCambiarPaso?.(enviado ? "codigo" : "dato"); }, [enviado, alCambiarPaso]);

  const cuerpo = () => (canal === "whatsapp" ? { whatsapp: dato.replace(/\D/g, "") } : { correo: dato.trim() });
  const enviar = (e) => { e?.preventDefault(); pedir.mutate(cuerpo(), { onSuccess: (r) => { setEnviado(r); setCodigo(""); setEspera(45); } }); };
  const comprobar = (c = codigo) => { if (c.length === 6) verificar.mutate({ ...cuerpo(), codigo: c }, { onSuccess: (r) => onListo?.(r.usuario) }); };
  const valido = canal === "whatsapp" ? dato.replace(/\D/g, "").length === 10 : /^\S+@\S+\.\S+$/.test(dato);
  const tamBoton = compacto ? "m" : "l";

  if (enviado) {
    return (
      <div>
        <p className={compacto ? "texto-s text-ink" : "lead"}>Si tu {canal === "whatsapp" ? "número" : "correo"} está registrado, te llegará un código por WhatsApp o a tu correo. Vence en 10 minutos.</p>
        <form className="mt-6" onSubmit={(e) => { e.preventDefault(); comprobar(); }}>
          <CodigoInput valor={codigo} onCambio={(v) => { setCodigo(v); verificar.reset(); }} onCompleto={comprobar} error={verificar.isError} deshabilitado={verificar.isPending} />
          {verificar.isError && <p className="campo-error mt-3" role="alert">{verificar.error.mensaje}</p>}
          {esDemo && <p className="mt-3 chip chip-aviso">Demo: el código es 123456</p>}
          <Boton type="submit" bloque tam={tamBoton} className="mt-6" cargando={verificar.isPending} disabled={codigo.length < 6}>Entrar</Boton>
        </form>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 texto-s suave">
          <span>¿No te llegó?</span>
          <button type="button" className="enlace disabled:no-underline disabled:opacity-60" disabled={espera > 0 || pedir.isPending} onClick={enviar}>{espera > 0 ? `Reenviar en ${espera} s` : "Enviarlo otra vez"}</button>
          <button type="button" className="enlace" onClick={() => { setCanal(canal === "whatsapp" ? "correo" : "whatsapp"); setDato(""); setEnviado(null); }}>Usar {canal === "whatsapp" ? "mi correo" : "mi WhatsApp"}</button>
        </div>
        <Boton variante="suave" tam="s" className="mt-5" href={enlaceWhatsApp(ESTUDIO_WA, "Hola Ana, no me llegó el código para entrar a la app de Casa Lotus. ¿Me envías mi enlace?")} icono={<MessageCircle size={16} />}>¿No te llegó? Pide tu enlace a Ana</Boton>
      </div>
    );
  }

  return (
    <div>
      <form className="space-y-5" onSubmit={enviar}>
        <Segmentado etiqueta="Cómo te enviamos el código" valor={canal} onCambio={(v) => { setCanal(v); setDato(""); }} opciones={[{ valor: "whatsapp", texto: "WhatsApp" }, { valor: "correo", texto: "Correo" }]} />
        {canal === "whatsapp" ? (
          <Entrada etiqueta="Tu WhatsApp" valor={dato} onCambio={(v) => setDato(formatoCelular(v))} inputMode="tel" autoComplete="tel-national" placeholder="312 872 0888" data-autofoco="" error={pedir.error?.campos?.whatsapp} />
        ) : (
          <Entrada etiqueta="Tu correo" type="email" valor={dato} onCambio={setDato} autoComplete="email" placeholder="tu@correo.com" data-autofoco="" error={pedir.error?.campos?.correo} />
        )}
        {pedir.isError && !pedir.error.campos && <p className="campo-error" role="alert">{pedir.error.mensaje}</p>}
        <Boton type="submit" bloque tam={tamBoton} punto cargando={pedir.isPending} disabled={!valido} icono={canal === "correo" ? <Mail size={18} /> : undefined}>Enviarme el código</Boton>
      </form>
    </div>
  );
}
