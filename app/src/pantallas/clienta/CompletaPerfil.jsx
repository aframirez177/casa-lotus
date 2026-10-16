// «Completa tu perfil (1 minuto)»: the optional half of Ana's form (birthday, barrio, EPS, interests, how she
// found the studio), asked after booking instead of before. «Cómo llegó» comes prefilled from the visit's source.
// Her e-mail comes first, with the reason in sight: it is how she gets the reminder the day before each class.
import { useState } from "react";
import { UserRoundPen, ArrowRight, Mail, X } from "lucide-react";
import { useEditarPerfil } from "../../api/hooks/clienta.js";
import { Boton } from "../../ui/Boton.jsx";
import { Entrada } from "../../ui/Campos.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { FormPerfilExtra } from "../reservar/Ficha.jsx";
import { perfilPorCompletar, CAMPOS_PERFIL } from "../reservar/reglasFicha.js";
import { llegoDesdeAtribucion } from "../../lib/atribucion.js";

const LUEGO = "cl_perfil_luego";
const leerLuego = () => { try { return Number(localStorage.getItem(LUEGO) || 0) > Date.now(); } catch { return false; } };
const ponerLuego = (dias) => { try { localStorage.setItem(LUEGO, String(Date.now() + dias * 86400000)); } catch { /* private mode */ } };
const SIN_CORREO = "cl_correo_luego";
const leerSinCorreo = () => { try { return Number(localStorage.getItem(SIN_CORREO) || 0) > Date.now(); } catch { return false; } };
const AYUDA_CORREO = "Para recordarte tus clases el día anterior.";
const correoValido = (c) => /^\S+@\S+\.\S+$/.test(String(c || "").trim());

/**
 * What the home asks for, one thing at a time: without an e-mail, the small «¿Te recordamos tus clases?» card
 * (dismissible for 30 days); otherwise «Completa tu perfil» once her ficha is complete.
 */
export function InvitacionPerfil({ perfil, fichaCompleta }) {
  const [sinCorreoLuego, setSinCorreoLuego] = useState(leerSinCorreo);
  if (!perfil.correo && !sinCorreoLuego) {
    return <PideCorreo onLuego={() => { try { localStorage.setItem(SIN_CORREO, String(Date.now() + 30 * 86400000)); } catch { /* private mode */ } setSinCorreoLuego(true); }} />;
  }
  return fichaCompleta ? <CompletaPerfil perfil={perfil} /> : null;
}

/** «¿Te recordamos tus clases? Déjanos tu correo»: one field, saved right there. */
export function PideCorreo({ onLuego }) {
  const [correo, setCorreo] = useState("");
  const [error, setError] = useState("");
  const editar = useEditarPerfil();
  const { avisar } = useAvisos();
  const guardar = (e) => {
    e.preventDefault();
    if (!correoValido(correo)) return setError("Revisa el correo.");
    editar.mutate({ correo: correo.trim() }, {
      onSuccess: () => avisar("Listo. Te recordamos cada clase el día anterior."),
      onError: (er) => setError(er.campos?.correo || er.mensaje),
    });
  };
  return (
    <section className="tarjeta relative p-5" aria-labelledby="pide-correo-t">
      <button type="button" onClick={onLuego} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-mist hover:text-navy" aria-label="Ahora no"><X size={17} /></button>
      <div className="flex items-start gap-4 pr-8">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-yoga text-navy"><Mail size={21} /></span>
        <div className="min-w-0 flex-1">
          <h2 id="pide-correo-t" className="font-medium text-navy">¿Te recordamos tus clases?</h2>
          <p className="texto-s suave">Déjanos tu correo y te escribimos el día anterior.</p>
        </div>
      </div>
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={guardar} noValidate>
        <input className="entrada min-w-0 flex-1 basis-36" type="email" inputMode="email" autoComplete="email" placeholder="tu@correo.com" value={correo}
          onChange={(e) => { setCorreo(e.target.value); setError(""); }} aria-label="Tu correo" aria-invalid={error ? true : undefined} aria-describedby={error ? "pide-correo-e" : undefined} />
        <Boton type="submit" cargando={editar.isPending}>Guardar</Boton>
      </form>
      {error && <p id="pide-correo-e" className="campo-error" role="alert">{error}</p>}
    </section>
  );
}

export function CompletaPerfil({ perfil }) {
  const [abierta, setAbierta] = useState(false);
  const [luego, setLuego] = useState(leerLuego);
  const [datos, setDatos] = useState(null);
  const [errorCorreo, setErrorCorreo] = useState("");
  const editar = useEditarPerfil();
  const { avisar } = useAvisos();
  const sinCorreo = !perfil.correo;
  if (luego || (!perfilPorCompletar(perfil) && !sinCorreo)) return null;

  const abrir = () => {
    setDatos({ ...(sinCorreo ? { correo: "" } : {}), ...Object.fromEntries(CAMPOS_PERFIL.map((k) => [k, perfil[k] ?? (k === "intereses" ? [] : "")])), llego: perfil.llego || llegoDesdeAtribucion() });
    setErrorCorreo("");
    setAbierta(true);
  };
  const guardar = () => {
    if (datos.correo && !correoValido(datos.correo)) return setErrorCorreo("Revisa el correo.");
    const { correo, ...resto } = datos;
    enviar(correo ? { ...resto, correo: correo.trim() } : resto);
  };
  const enviar = (cuerpo) => editar.mutate(cuerpo, {
    onSuccess: () => { setAbierta(false); ponerLuego(60); setLuego(true); avisar("Guardado. ¡Gracias por contarnos!"); },
    onError: (e) => { if (e.campos?.correo) setErrorCorreo(e.campos.correo); avisar(e.mensaje, { tipo: "error" }); },
  });

  return (
    <div className="tarjeta p-5">
      <button type="button" onClick={abrir} className="flex w-full items-center gap-4 text-left">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-multinivel text-navy"><UserRoundPen size={21} /></span>
        <span className="min-w-0 flex-1"><span className="block font-medium text-navy">Completa tu perfil (1&nbsp;minuto)</span><span className="block texto-s suave">{sinCorreo ? "Tu correo para recordarte las clases, tu cumpleaños y lo que buscas en clase." : "Tu cumpleaños, tu barrio y lo que buscas en clase. Así te conocemos mejor."}</span></span>
        <ArrowRight size={18} className="shrink-0 text-navy" />
      </button>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={() => { ponerLuego(30); setLuego(true); }} className="min-h-10 px-2 texto-s text-muted hover:text-navy">Ahora no</button>
      </div>
      <Hoja abierta={abierta} alCerrar={() => setAbierta(false)} titulo="Completa tu perfil" descripcion="Todo es opcional. Lo ven Ana y tu profe."
        pie={<div className="flex justify-end gap-2"><Boton variante="suave" onClick={() => setAbierta(false)}>Después</Boton><Boton punto cargando={editar.isPending} onClick={guardar}>Guardar</Boton></div>}>
        {datos && (
          <div className="space-y-6">
            {"correo" in datos && (
              <Entrada etiqueta="Tu correo" type="email" inputMode="email" autoComplete="email" placeholder="tu@correo.com" valor={datos.correo} data-autofoco=""
                onCambio={(v) => { setDatos((x) => ({ ...x, correo: v })); setErrorCorreo(""); }} ayuda={AYUDA_CORREO} error={errorCorreo} />
            )}
            <FormPerfilExtra perfil={datos} cambiar={(p) => setDatos((x) => ({ ...x, ...p }))} />
          </div>
        )}
      </Hoja>
    </div>
  );
}
