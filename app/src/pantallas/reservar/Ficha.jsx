// Ana's form (her Google Form, now in the app), split by when it is asked:
// «Tú» (who comes), «Tu ficha» (what a profe needs before the first class), the booking agreements in one
// card, and «Completa tu perfil» (optional, after booking). Shared by the booking flow and the profile.
import { useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { ChevronDown, ShieldCheck, HeartPulse, Camera, FileText, Megaphone, Check } from "lucide-react";
import { Entrada, Opciones, Interruptor, formatoCelular } from "../../ui/Campos.jsx";
import { CONSENTIMIENTOS, INTERESES, EXPERIENCIA, COMO_LLEGO, SALUD_SIN_DATOS } from "../../lib/reglas.js";

export { PERFIL_VACIO, escribioSalud, validarTu, validarFicha, validarAcuerdos, faltaFicha, faltanAcuerdos, perfilPorCompletar } from "./reglasFicha.js";
import { escribioSalud } from "./reglasFicha.js";

export function FormTu({ perfil, cambiar, errores = {} }) {
  return (
    <div className="space-y-5">
      <Entrada etiqueta="Nombre y apellido" valor={perfil.nombre} onCambio={(v) => cambiar({ nombre: v })} autoComplete="name" error={errores.nombre} autoCapitalize="words" />
      <Entrada etiqueta="WhatsApp" valor={perfil.whatsapp} onCambio={(v) => cambiar({ whatsapp: formatoCelular(v) })} inputMode="tel" autoComplete="tel-national" placeholder="300 123 4567"
        ayuda="Por aquí te recordamos la clase." error={errores.whatsapp} />
      <Entrada etiqueta="Correo" opcional type="email" valor={perfil.correo} onCambio={(v) => cambiar({ correo: v })} autoComplete="email" placeholder="tu@correo.com"
        ayuda="Para mandarte la confirmación y recordarte la clase." error={errores.correo} />
    </div>
  );
}

/** What a profe needs before the first class: health, an emergency contact, experience. */
export function FormFicha({ perfil, cambiar, errores = {} }) {
  const contando = perfil.salud === "__contar" || escribioSalud(perfil.salud);
  const ce = perfil.contactoEmergencia || { nombre: "", whatsapp: "" };
  return (
    <div className="space-y-8">
      <Grupo icono={<HeartPulse size={18} />} titulo="Tu salud" ayuda="Lesiones, cirugías, embarazo o cualquier condición. Así tu profe adapta cada postura.">
        <Opciones opciones={[...SALUD_SIN_DATOS, { valor: "__contar", texto: "Sí, quiero contarla" }]} valor={contando ? "__contar" : perfil.salud}
          onCambio={(v) => cambiar({ salud: v === "__contar" ? (escribioSalud(perfil.salud) ? perfil.salud : "__contar") : v })} error={!contando ? errores.salud : undefined} />
        <AnimatePresence initial={false}>
          {contando && (
            <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <Entrada area className="pt-4" etiqueta="Cuéntanos" valor={perfil.salud === "__contar" ? "" : perfil.salud} onCambio={(v) => cambiar({ salud: v || "__contar" })}
                placeholder="Por ejemplo: operación de rodilla hace un año, me duele al arrodillarme." ayuda="Solo la ven Ana y tu profe." error={errores.salud} />
            </m.div>
          )}
        </AnimatePresence>
      </Grupo>

      <Grupo titulo="Contacto de emergencia" ayuda="Alguien a quien llamar si algo pasa en clase.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Entrada etiqueta="Nombre" valor={ce.nombre} onCambio={(v) => cambiar({ contactoEmergencia: { ...ce, nombre: v } })} autoComplete="off" error={errores.contactoNombre} />
          <Entrada etiqueta="Su WhatsApp" valor={ce.whatsapp ? formatoCelular(ce.whatsapp) : ""} onCambio={(v) => cambiar({ contactoEmergencia: { ...ce, whatsapp: formatoCelular(v) } })} inputMode="tel" placeholder="300 123 4567" error={errores.contactoWhatsapp} />
        </div>
      </Grupo>

      <Grupo titulo="¿Has practicado antes?">
        <Opciones opciones={EXPERIENCIA} valor={perfil.experiencia} onCambio={(v) => cambiar({ experiencia: v })} error={errores.experiencia} />
      </Grupo>
    </div>
  );
}

/** «Completa tu perfil»: the rest of Ana's form, all optional. */
export function FormPerfilExtra({ perfil, cambiar }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Entrada etiqueta="Fecha de nacimiento" type="date" valor={perfil.nacimiento} onCambio={(v) => cambiar({ nacimiento: v })} max={new Date().toISOString().slice(0, 10)} ayuda="Para celebrarte." />
        <Entrada etiqueta="Barrio" valor={perfil.barrio} onCambio={(v) => cambiar({ barrio: v })} placeholder="Chapinero, Cedritos…" />
      </div>
      <Entrada etiqueta="EPS" valor={perfil.eps} onCambio={(v) => cambiar({ eps: v })} placeholder="Sura, Sanitas, Compensar…" />
      <Opciones etiqueta="Si pudieras escoger 2 de tus intereses…" ayuda="Elige hasta dos." opciones={INTERESES} valor={perfil.intereses || []} multiple max={2} columnas onCambio={(v) => cambiar({ intereses: v })} />
      <Opciones etiqueta="¿Cómo llegaste a Casa Lotus?" opciones={COMO_LLEGO} valor={perfil.llego} onCambio={(v) => cambiar({ llego: v })} />
    </div>
  );
}

function Grupo({ titulo, ayuda, icono, children }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 flex items-center gap-2 subtitulo">{icono && <span className="text-teal">{icono}</span>}{titulo}</legend>
      {ayuda && <p className="texto-s suave mb-4">{ayuda}</p>}
      {!ayuda && <div className="mb-3" />}
      {children}
    </fieldset>
  );
}

/**
 * The booking agreements in one card: datos + descargo under one required box (both texts on demand), the
 * image choice, the health authorization only when she wrote about her health, and the optional news opt-in.
 * `completos = false` (a returning clienta whose agreements are on file) leaves only the health question.
 */
export function FormAcuerdosReserva({ valor, cambiar, conSensibles, completos = true, errores = {} }) {
  // quick taps in a row must not undo each other: build on the latest choice, not on the last render
  const ultimo = useRef(valor);
  ultimo.current = valor;
  const poner = (parcial) => { const nuevo = { ...ultimo.current, ...parcial }; ultimo.current = nuevo; cambiar(nuevo); };
  const [abierto, setAbierto] = useState(false);
  const acepta = valor.datos?.acepta === true && valor.descargo?.acepta === true;
  if (!completos && !conSensibles) return null;
  return (
    <div className="tarjeta divide-y divide-line px-5 sm:px-6">
      {completos && (
        <div className="py-5">
          <button type="button" role="checkbox" aria-checked={acepta} onClick={() => poner(acepta ? { datos: undefined, descargo: undefined } : { datos: { acepta: true }, descargo: { acepta: true } })}
            className="flex w-full items-start gap-3 text-left">
            <Casilla activa={acepta} error={Boolean(errores.acuerdos)} />
            <span className="text-[0.9375rem] leading-snug text-ink">Autorizo el tratamiento de mis datos y acepto el descargo de responsabilidad de Casa Lotus.</span>
          </button>
          <button type="button" className="ml-9 mt-1 inline-flex min-h-10 items-center gap-1 text-[0.875rem] font-medium text-teal" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
            {abierto ? "Ocultar los textos" : "Leer los textos"}
            <ChevronDown size={16} className={`transition-transform duration-300 ${abierto ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence initial={false}>
            {abierto && (
              <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                {[["datos", ShieldCheck, "/privacidad/"], ["descargo", FileText, "/terminos/"]].map(([k, Icono, enlace]) => (
                  <div key={k} className="mt-2 rounded-2xl bg-mist p-4">
                    <p className="flex items-center gap-2 text-[0.875rem] font-semibold text-navy"><Icono size={16} className="text-teal" />{CONSENTIMIENTOS[k].titulo}</p>
                    <p className="mt-2 text-[0.875rem] leading-relaxed text-ink" data-seleccionable>{CONSENTIMIENTOS[k].texto}</p>
                    <a href={enlace} target="_blank" rel="noopener" className="mt-2 inline-block text-[0.8125rem] enlace">Ver en la página</a>
                  </div>
                ))}
              </m.div>
            )}
          </AnimatePresence>
          {errores.acuerdos && <p className="campo-error ml-9" role="alert">{errores.acuerdos}</p>}
        </div>
      )}

      {completos && (
        <div className="py-5">
          <p className="flex items-center gap-2 font-medium text-navy"><Camera size={17} className="text-teal" />{CONSENTIMIENTOS.imagen.titulo}</p>
          <p className="texto-s mt-1 suave">{CONSENTIMIENTOS.imagen.corto}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={CONSENTIMIENTOS.imagen.titulo}>
            {CONSENTIMIENTOS.imagen.opciones.map((o, i) => (
              <button key={o} type="button" role="radio" aria-checked={valor.imagen?.acepta === (i === 0)} className="opcion justify-start" onClick={() => poner({ imagen: { acepta: i === 0 } })}>{o}</button>
            ))}
          </div>
          {errores.imagen && <p className="campo-error" role="alert">{errores.imagen}</p>}
        </div>
      )}

      <AnimatePresence initial={false}>
        {conSensibles && (
          <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="py-5">
              <p className="flex items-center gap-2 font-medium text-navy"><HeartPulse size={17} className="text-teal" />{CONSENTIMIENTOS.sensibles.titulo}</p>
              <p className="texto-s mt-1 text-ink">{CONSENTIMIENTOS.sensibles.texto}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={CONSENTIMIENTOS.sensibles.titulo}>
                <button type="button" role="radio" aria-checked={valor.sensibles?.acepta === true} className="opcion justify-start" onClick={() => poner({ sensibles: { acepta: true } })}>Sí, autorizo</button>
                <button type="button" role="radio" aria-checked={valor.sensibles?.acepta === false} className="opcion justify-start" onClick={() => poner({ sensibles: { acepta: false } })}>Prefiero no</button>
              </div>
              {valor.sensibles?.acepta === false && <p className="mt-3 rounded-2xl bg-aviso-bg p-3 text-[0.875rem] text-aviso">Sin tu autorización no guardamos lo que escribiste de tu salud. Cuéntaselo a tu profe al llegar.</p>}
              {errores.sensibles && <p className="campo-error" role="alert">{errores.sensibles}</p>}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {completos && (
        <div className="flex items-start gap-3 py-3">
          <Megaphone size={18} className="mt-3 shrink-0 text-teal" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <Interruptor activo={valor.novedades?.acepta === true} onCambio={(v) => poner({ novedades: { acepta: v } })} etiqueta={CONSENTIMIENTOS.novedades.titulo} ayuda="Eventos, talleres y promociones. Opcional." />
          </div>
        </div>
      )}
    </div>
  );
}

const Casilla = ({ activa, error }) => (
  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border-[1.5px] transition-colors ${activa ? "border-lime bg-lime text-navy-900" : error ? "border-error bg-error-bg" : "border-navy/50 bg-white"}`} aria-hidden="true">
    {activa && <Check size={15} strokeWidth={3} />}
  </span>
);

/** The profile's agreements, each one a floating card with its short text, the full text on demand, and the choice. */
export function FormAcuerdos({ valor, cambiar, conSensibles, errores = {}, fechas, sinNovedades = false }) {
  // quick taps in a row must not undo each other: build on the latest choice, not on the last render
  const ultimo = useRef(valor);
  ultimo.current = valor;
  const firmar = (k, acepta) => { const nuevo = { ...ultimo.current, [k]: { acepta } }; ultimo.current = nuevo; cambiar(nuevo); };
  return (
    <div className="space-y-3">
      <Acuerdo k="descargo" icono={<FileText size={18} />} valor={valor} firmar={firmar} error={errores.descargo} fecha={fechas?.descargo} enlace="/terminos/" />
      <Acuerdo k="datos" icono={<ShieldCheck size={18} />} valor={valor} firmar={firmar} error={errores.datos} fecha={fechas?.datos} enlace="/privacidad/" />
      <AnimatePresence initial={false}>
        {conSensibles && (
          <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Acuerdo k="sensibles" icono={<HeartPulse size={18} />} valor={valor} firmar={firmar} fecha={fechas?.sensibles} enlace="/privacidad/#datos-sensibles"
              nota={valor.sensibles?.acepta === false ? "Sin tu autorización no guardamos lo que escribiste de tu salud. Cuéntaselo a tu profe al llegar." : null} />
          </m.div>
        )}
      </AnimatePresence>
      <div className={`tarjeta p-5 ${errores.imagen ? "ring-2 ring-error/40" : ""}`}>
        <p className="flex items-center gap-2 subtitulo"><Camera size={18} className="text-teal" />{CONSENTIMIENTOS.imagen.titulo}</p>
        <p className="texto-s mt-2 text-ink">{CONSENTIMIENTOS.imagen.corto}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={CONSENTIMIENTOS.imagen.titulo}>
          {CONSENTIMIENTOS.imagen.opciones.map((o, i) => (
            <button key={o} type="button" role="radio" aria-checked={valor.imagen?.acepta === (i === 0)} className="opcion justify-start" onClick={() => firmar("imagen", i === 0)}>{o}</button>
          ))}
        </div>
        {fechas?.imagen && <p className="mt-3 text-[0.8125rem] text-muted">Elegido el {fechas.imagen}</p>}
        {errores.imagen && <p className="campo-error" role="alert">{errores.imagen}</p>}
      </div>
      {/* optional marketing opt-in: never pre-checked */}
      {!sinNovedades && <div className="tarjeta-suave px-5 py-3">
        <div className="flex items-start gap-3">
          <Megaphone size={18} className="mt-3 shrink-0 text-teal" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <Interruptor activo={valor.novedades?.acepta === true} onCambio={(v) => firmar("novedades", v)} etiqueta={CONSENTIMIENTOS.novedades.titulo} ayuda={CONSENTIMIENTOS.novedades.corto} />
            {fechas?.novedades && <p className="pb-2 text-[0.8125rem] text-muted">Elegido el {fechas.novedades}</p>}
          </div>
        </div>
      </div>}
    </div>
  );
}

function Acuerdo({ k, icono, valor, firmar, error, fecha, enlace, nota }) {
  const t = CONSENTIMIENTOS[k];
  const [abierto, setAbierto] = useState(false);
  const acepta = valor[k]?.acepta;
  const opcional = k === "sensibles";
  return (
    <div className={`tarjeta p-5 ${error ? "ring-2 ring-error/40" : ""}`}>
      <p className="flex items-center gap-2 subtitulo"><span className="text-teal">{icono}</span>{t.titulo}</p>
      <p className="texto-s mt-2 text-ink">{k === "sensibles" ? t.texto : t.corto}</p>
      {k !== "sensibles" && (
        <>
          <button type="button" className="mt-2 inline-flex min-h-10 items-center gap-1 text-[0.875rem] font-medium text-teal" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
            {abierto ? "Ocultar el texto completo" : "Leer el texto completo"}
            <ChevronDown size={16} className={`transition-transform duration-300 ${abierto ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence initial={false}>
            {abierto && (
              <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <p className="mt-2 rounded-2xl bg-mist p-4 text-[0.875rem] leading-relaxed text-ink" data-seleccionable>{t.texto}</p>
                {enlace && <a href={enlace} target="_blank" rel="noopener" className="mt-2 inline-block text-[0.8125rem] enlace">Ver en la página</a>}
              </m.div>
            )}
          </AnimatePresence>
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" role="checkbox" aria-checked={acepta === true} className="opcion" onClick={() => firmar(k, acepta === true ? (opcional ? false : undefined) : true)}>
          <span className={`grid h-5 w-5 place-items-center rounded-md border ${acepta === true ? "border-lime bg-lime text-navy-900" : "border-current"}`} aria-hidden="true">{acepta === true ? "✓" : ""}</span>
          {k === "descargo" ? "Leí y acepto" : "Autorizo"}
        </button>
        {opcional && <button type="button" role="checkbox" aria-checked={acepta === false} className="opcion" onClick={() => firmar(k, false)}>Prefiero no</button>}
      </div>
      {fecha && <p className="mt-3 text-[0.8125rem] text-muted">Aceptado el {fecha}</p>}
      {nota && <p className="mt-3 rounded-2xl bg-aviso-bg p-3 text-[0.875rem] text-aviso">{nota}</p>}
      {error && <p className="campo-error" role="alert">{error}</p>}
    </div>
  );
}
