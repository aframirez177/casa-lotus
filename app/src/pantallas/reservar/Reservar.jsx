// /app/reservar — public booking: class → you → your ficha → agreements → payment instructions.
// Reads ?clase, ?plan, ?ref, ?espera=1 and sessionStorage["cl_atribucion"]. A signed-in clienta with a
// complete ficha books in one tap; with gaps, she only fills what is missing.
import { createElement, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, X, UserRound, Sparkles, MessageCircle, RefreshCw } from "lucide-react";
import { useDisponibilidad, usePlanesPublicos, useReservaPublica } from "../../api/hooks/publico.js";
import { useYo } from "../../api/hooks/auth.js";
import { useMi, useReservarMi, useEditarPerfil, useFirmar } from "../../api/hooks/clienta.js";
import { Simbolo } from "../../ui/Logo.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Esqueleto } from "../../ui/Esqueleto.jsx";
import { ErrorCaja, TagClase } from "../../ui/Basicos.jsx";
import { Columpios } from "../../ui/Columpios.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { formatoCelular } from "../../lib/celular.js";
import { SelectorClase } from "./SelectorClase.jsx";
import { PERFIL_VACIO, validarTu, validarFicha, validarAcuerdos, escribioSalud } from "./reglasFicha.js";

// Only the first step ships with the page: the forms, the result, the sheets and the code login load when used.
const conMovimiento = (cargar, nombre) => lazy(() => Promise.all([cargar(), import("../../ui/ConMovimiento.jsx")])
  .then(([x, { ConMovimiento }]) => ({ default: (props) => createElement(ConMovimiento, null, createElement(x[nombre], props)) })));
const FormTu = conMovimiento(() => import("./Ficha.jsx"), "FormTu");
const FormFicha = conMovimiento(() => import("./Ficha.jsx"), "FormFicha");
const FormAcuerdos = conMovimiento(() => import("./Ficha.jsx"), "FormAcuerdos");
const Resultado = conMovimiento(() => import("./Resultado.jsx"), "Resultado");
const HojaEspera = lazy(() => import("./HojaEspera.jsx"));
const HojaEntrar = lazy(() => import("./HojaEntrar.jsx"));
const precargarPasos = () => { import("./Ficha.jsx"); import("./Resultado.jsx"); };
import { leerAtribucion, evento } from "../../lib/atribucion.js";
import { dinero, primerNombre, SALUD_SIN_DATOS, fechaLegible, horaLegible } from "../../lib/reglas.js";
import { nombreClase } from "../../lib/clases.js";

const PASOS = [
  { id: "clase", texto: "Clase" },
  { id: "tu", texto: "Tú" },
  { id: "ficha", texto: "Tu ficha" },
  { id: "acuerdos", texto: "Acuerdos" },
];
const BORRADOR = "cl_reserva_borrador";
const ULTIMA = "cl_reserva_ultima";
const COMO = { instagram: "Instagram", ig: "Instagram", facebook: "Facebook", fb: "Facebook", google: "Google" };

function leerBorrador() { try { return JSON.parse(sessionStorage.getItem(BORRADOR) || "null"); } catch { return null; } }

export default function Reservar() {
  const [params, setParams] = useSearchParams();
  const pasoUrl = params.get("paso") || "clase";
  const atribucion = useMemo(() => leerAtribucion(params), []); // eslint-disable-line react-hooks/exhaustive-deps
  const planPedido = params.get("plan") || "";
  const { data: yo } = useYo();
  const clienta = yo?.rol === "clienta" && !yo.limitada ? yo : null;
  const mi = useMi({ enabled: Boolean(clienta) });
  const disp = useDisponibilidad(28);
  const planes = usePlanesPublicos();
  const { avisar } = useAvisos();

  const borrador = useRef(leerBorrador());
  const [claseId, setClaseId] = useState(params.get("clase") || borrador.current?.clase || "");
  const [perfil, setPerfil] = useState(() => ({ ...PERFIL_VACIO, llego: COMO[String(atribucion.utm?.source || "").toLowerCase()] || "", ...(borrador.current?.perfil || {}) }));
  const [acuerdos, setAcuerdos] = useState(borrador.current?.acuerdos || {});
  const [errores, setErrores] = useState({});
  const [sinApi, setSinApi] = useState(false); // the booking API is unreachable: booking goes on by WhatsApp
  const [resultado, setResultado] = useState(() => { try { return JSON.parse(sessionStorage.getItem(ULTIMA) || "null"); } catch { return null; } });
  const paso = ["clase", "tu", "ficha", "acuerdos"].includes(pasoUrl) || (pasoUrl === "listo" && resultado) ? pasoUrl : "clase";
  const [espera, setEspera] = useState(null);
  const [entrar, setEntrar] = useState(false);
  const [hojasVistas, setHojasVistas] = useState({});
  useEffect(() => { if (espera || entrar) setHojasVistas((v) => ({ ...v, ...(espera ? { espera: true } : {}), ...(entrar ? { entrar: true } : {}) })); }, [espera, entrar]);
  const reservaPublica = useReservaPublica();
  const reservarMi = useReservarMi();
  const editarPerfil = useEditarPerfil();
  const firmar = useFirmar();

  useEffect(() => { evento("reserva-inicio"); }, []);
  // keep the draft for a refresh, never the health answer (sensitive data stays in memory only)
  useEffect(() => {
    try { sessionStorage.setItem(BORRADOR, JSON.stringify({ clase: claseId, perfil: { ...perfil, salud: "", eps: "" }, acuerdos })); } catch { /* private mode */ }
  }, [claseId, perfil, acuerdos]);

  // a signed-in clienta: prefill from her profile
  const fichaLista = mi.data?.clienta?.fichaCompleta;
  useEffect(() => {
    if (!mi.data) return;
    const p = mi.data.clienta.perfil;
    setPerfil((x) => ({ ...x, ...Object.fromEntries(Object.entries(p).filter(([, v]) => (Array.isArray(v) ? v.length : typeof v === "object" ? v && Object.values(v).some(Boolean) : v))) , whatsapp: formatoCelular(p.whatsapp || x.whatsapp) }));
    setAcuerdos((a) => ({ ...mi.data.clienta.consentimientos, ...a }));
  }, [mi.data]);

  const clases = disp.data?.clases || [];
  const clase = clases.find((c) => c.id === claseId) || resultado?.clase;
  const plan = planes.data?.find((p) => p.nombre === planPedido) || planes.data?.find((p) => p.tipo === "Prueba");

  // the site sends ?espera=1 from a full slot: open the waiting list for that class
  useEffect(() => {
    if (params.get("espera") === "1" && clase && !clase.reservable) setEspera(clase);
  }, [clase]); // eslint-disable-line react-hooks/exhaustive-deps

  const ir = (p) => {
    const n = new URLSearchParams(params);
    if (p === "clase") n.delete("paso"); else n.set("paso", p);
    if (claseId) n.set("clase", claseId);
    setParams(n);
    scrollTo({ top: 0, behavior: "smooth" });
  };
  const cambiar = (parcial) => { setPerfil((p) => ({ ...p, ...parcial })); setErrores({}); };

  const pasosVisibles = clienta ? PASOS.filter((p) => p.id !== "tu") : PASOS;
  const indice = Math.max(0, pasosVisibles.findIndex((p) => p.id === paso));

  async function enviar() {
    const conSensibles = escribioSalud(perfil.salud);
    const salud = conSensibles && acuerdos.sensibles?.acepta !== true ? SALUD_SIN_DATOS[1] : perfil.salud;
    const perfilFinal = { ...perfil, salud, whatsapp: perfil.whatsapp.replace(/\D/g, ""), contactoEmergencia: { ...perfil.contactoEmergencia, whatsapp: (perfil.contactoEmergencia?.whatsapp || "").replace(/\D/g, "") } };
    const consentimientos = Object.fromEntries(["datos", "descargo", "imagen", "sensibles", "novedades"].filter((k) => typeof acuerdos[k]?.acepta === "boolean").map((k) => [k, { acepta: acuerdos[k].acepta }]));
    try {
      let r;
      if (clienta) {
        if (!fichaLista) {
          await editarPerfil.mutateAsync(perfilFinal);
          await firmar.mutateAsync(consentimientos);
        }
        const res = await reservarMi.mutateAsync(clase.id);
        r = { codigo: res.id, estado: res.estado, clase: res.clase, pago: res.pago, plan: res.plan };
      } else {
        r = await reservaPublica.mutateAsync({ clase: clase.id, perfil: perfilFinal, consentimientos, plan: plan?.nombre, ref: atribucion.ref, utm: atribucion.utm, clickIds: atribucion.clickIds, website: "" });
      }
      const final = { ...r, nombre: primerNombre(perfil.nombre || clienta?.nombre), ts: Date.now() };
      setResultado(final);
      try { sessionStorage.setItem(ULTIMA, JSON.stringify(final)); sessionStorage.removeItem(BORRADOR); } catch { /* ignore */ }
      ir("listo");
    } catch (e) {
      if (e.sinApi) { setSinApi(true); scrollTo({ top: 0, behavior: "smooth" }); return; }
      if (e.campos) {
        setErrores(e.campos);
        if (e.campos.nombre || e.campos.whatsapp || e.campos.correo) ir("tu");
      }
      if (e.motivo === "llena" || e.motivo === "tarde" || e.motivo === "cancelada") { disp.refetch(); ir("clase"); }
      avisar(e.mensaje || "No pudimos apartar tu columpio.", { tipo: "error" });
    }
  }
  const enviando = reservaPublica.isPending || reservarMi.isPending || editarPerfil.isPending || firmar.isPending;

  function siguiente() {
    if (paso === "clase") {
      if (!clase) return;
      if (clienta && fichaLista) return enviar();
      return ir(clienta ? "ficha" : "tu");
    }
    if (paso === "tu") { const e = validarTu(perfil); if (Object.keys(e).length) return setErrores(e); return ir("ficha"); }
    if (paso === "ficha") { const e = validarFicha(perfil); if (Object.keys(e).length) { setErrores(e); return document.querySelector("[aria-invalid=true], .campo-error")?.scrollIntoView({ block: "center", behavior: "smooth" }); } return ir("acuerdos"); }
    if (paso === "acuerdos") { const e = validarAcuerdos(acuerdos); if (Object.keys(e).length) return setErrores(e); return enviar(); }
  }

  if (paso === "listo" && resultado) {
    return <Marco paso="listo"><Suspense fallback={<EsqueletoPaso />}><Resultado r={resultado} plan={plan} limpiar={() => { sessionStorage.removeItem(ULTIMA); setResultado(null); setClaseId(""); ir("clase"); }} /></Suspense></Marco>;
  }
  // a direct visit to a later step without a class goes back to the start
  if (paso !== "clase" && !clase && !disp.isPending) {
    return <Marco paso="clase"><p className="lead">Primero elige tu clase.</p><Boton className="mt-6" onClick={() => ir("clase")}>Elegir clase</Boton></Marco>;
  }

  if (sinApi) {
    return <Marco paso={paso}><PorWhatsApp clase={clase} plan={plan || planPedido} nombre={perfil.nombre} referencia={atribucion.ref} reintentar={() => setSinApi(false)} /></Marco>;
  }

  const cta = paso === "clase" ? (clienta && fichaLista ? "Reservar con mi plan" : "Continuar") : paso === "acuerdos" ? "Apartar mi columpio" : "Continuar";

  return (
    <Marco paso={paso} pasos={pasosVisibles} indice={indice} atras={paso !== "clase" ? () => history.back() : null}>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <div className="min-w-0">
          <Suspense fallback={<EsqueletoPaso />}>
            <div key={paso} className="entra-x">
              {paso === "clase" && (
                <>
                  <h1 className="saludo">{clienta ? `Hola, ${primerNombre(clienta.nombre)}.` : "Aparta tu columpio."}</h1>
                  <p className="lead mt-4 max-w-[38ch]">{clienta ? (fichaLista ? "Elige tu clase y queda reservada con tu plan." : "Elige tu clase. Después completamos lo que falta de tu ficha.") : "Elige el día y la hora. Las clases son semipersonalizadas, con cupos limitados."}</p>
                  {plan && !clienta && (
                    <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[0.9375rem] text-navy shadow-card">
                      <Sparkles size={16} className="text-teal" />{plan.nombre}<span className="text-muted">·</span><strong className="font-semibold">{dinero(plan.precio)}</strong>
                    </p>
                  )}
                  {!clienta && !disp.error?.sinApi && (
                    <button type="button" onClick={() => setEntrar(true)} className="mt-4 flex min-h-11 items-center gap-2 text-[0.9375rem] text-teal">
                      <UserRound size={17} /> <span className="underline underline-offset-4">¿Ya has venido? Entra con tu WhatsApp</span>
                    </button>
                  )}
                  <div className="mt-8">
                    {disp.isPending ? <EsqueletoSelector /> : disp.isError ? (disp.error?.sinApi
                      ? <PorWhatsApp plan={plan || planPedido} referencia={atribucion.ref} reintentar={disp.refetch} enLinea />
                      : <ErrorCaja error={disp.error} reintentar={disp.refetch} />) : (
                      <SelectorClase clases={clases} seleccion={claseId} inicial={claseId} onElegir={(c) => { setClaseId(c.id); precargarPasos(); }} onEspera={(c) => setEspera(c)} />
                    )}
                  </div>
                </>
              )}
              {paso === "tu" && (
                <>
                  <h1 className="titulo">¿Quién viene?</h1>
                  <p className="lead mt-3">Con tu WhatsApp te confirmamos y te recordamos la clase.</p>
                  <div className="mt-8"><FormTu perfil={perfil} cambiar={cambiar} errores={errores} /></div>
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />
                  <div className="mt-8 tarjeta-suave flex items-center gap-4 p-5">
                    <UserRound size={22} className="shrink-0 text-navy" />
                    <p className="min-w-0 flex-1 texto-s text-ink"><strong className="block font-medium text-navy">¿Ya has venido?</strong>Entra con tu WhatsApp y no llenas nada otra vez.</p>
                    <Boton tam="s" variante="suave" onClick={() => setEntrar(true)}>Entrar</Boton>
                  </div>
                </>
              )}
              {paso === "ficha" && (
                <>
                  <h1 className="titulo">Cuéntanos de ti</h1>
                  <p className="lead mt-3">Así tu profe prepara la clase para tu cuerpo. Solo la ven Ana y tu profe.</p>
                  <div className="mt-8"><FormFicha perfil={perfil} cambiar={cambiar} errores={errores} /></div>
                </>
              )}
              {paso === "acuerdos" && (
                <>
                  <h1 className="titulo">Últimos acuerdos</h1>
                  <p className="lead mt-3">Son cortos. Léelos con calma.</p>
                  <div className="mt-8"><FormAcuerdos valor={acuerdos} cambiar={(v) => { setAcuerdos(v); setErrores({}); }} conSensibles={escribioSalud(perfil.salud)} errores={errores} /></div>
                </>
              )}
            </div>
          </Suspense>
        </div>

        {/* desktop: the chosen class floats beside the form */}
        <aside className={disp.error?.sinApi ? "hidden" : "hidden lg:block"}>
          <div className="sticky top-24">
            <Resumen clase={clase} plan={!clienta ? plan : null} />
            <Boton bloque tam="l" punto={paso === "acuerdos" || (clienta && fichaLista)} className="mt-4" onClick={siguiente} disabled={!clase} cargando={enviando} iconoFinal={paso !== "acuerdos" ? <ArrowRight size={18} /> : null}>{cta}</Boton>
          </div>
        </aside>
      </div>

      {/* phones: a floating bar with the choice and the next step */}
      <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(14px,env(safe-area-inset-bottom))] lg:hidden">
        {(clase || paso !== "clase") && !disp.error?.sinApi && (
            <div className="sube vidrio mx-auto flex max-w-[560px] items-center gap-3 rounded-[28px] p-2 pl-5">
              <div className="min-w-0 flex-1">
                {clase ? (
                  <>
                    <p className="truncate text-[0.8125rem] text-muted first-letter:uppercase">{fechaLegible(clase.fecha)}</p>
                    <p className="truncate font-medium text-navy">{horaLegible(clase.hora)} · {nombreClase(clase)}</p>
                  </>
                ) : <p className="text-[0.9375rem] text-muted">Elige una clase</p>}
              </div>
              <Boton tam="m" punto={paso === "acuerdos" || (clienta && fichaLista)} onClick={siguiente} disabled={!clase} cargando={enviando}>{paso === "acuerdos" ? "Apartar" : clienta && fichaLista && paso === "clase" ? "Reservar" : "Continuar"}</Boton>
            </div>
        )}
      </div>

      {/* sheets load the first time they open and then stay mounted, so they can animate out */}
      <Suspense fallback={null}>
        {(espera || hojasVistas.espera) && <HojaEspera clase={espera} cerrar={() => setEspera(null)} clienta={clienta} perfil={perfil} />}
        {(entrar || hojasVistas.entrar) && <HojaEntrar abierta={entrar} whatsapp={perfil.whatsapp} cerrar={() => setEntrar(false)} alEntrar={() => { setEntrar(false); avisar("¡Hola de nuevo! Ya estás dentro."); if (paso !== "clase") ir("clase"); }} />}
      </Suspense>
    </Marco>
  );
}

function Marco({ children, paso, pasos = PASOS, indice = 0, atras }) {
  return (
    <>
      <div className="atmosfera" aria-hidden="true"><i /><i /><i /></div>
      <header className="sticky top-0 z-20 bg-paper/75 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex h-16 max-w-[1080px] items-center gap-3 px-5">
          {atras ? (
            <button type="button" onClick={atras} className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-navy hover:bg-white/70" aria-label="Volver al paso anterior"><ArrowLeft size={20} /></button>
          ) : (
            <a href="/" className="-ml-1 rounded-lg p-1 text-navy" aria-label="Casa Lotus, volver a la página"><Simbolo className="h-8 w-auto" /></a>
          )}
          {paso !== "listo" && (
            <ol className="flex flex-1 items-center gap-1.5" aria-label={`Paso ${indice + 1} de ${pasos.length}`}>
              {pasos.map((p, i) => (
                <li key={p.id} className="flex-1" aria-current={i === indice ? "step" : undefined}>
                  <span className="relative block h-1 overflow-hidden rounded-full bg-line">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-navy transition-[width] duration-500 ease-out" style={{ width: i < indice ? "100%" : i === indice ? "50%" : "0%" }} />
                  </span>
                  <span className={`mt-1.5 hidden text-[0.6875rem] font-medium sm:block ${i <= indice ? "text-navy" : "text-muted"}`}>{p.texto}</span>
                </li>
              ))}
            </ol>
          )}
          {paso === "listo" && <span className="flex-1" />}
          <a href="/" className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-navy hover:bg-white/70" aria-label="Salir de la reserva"><X size={20} /></a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1080px] px-5 pb-[calc(env(safe-area-inset-bottom)+8rem)] pt-6 lg:pb-16 lg:pt-10">{children}</main>
    </>
  );
}

function Resumen({ clase, plan }) {
  if (!clase) return (
    <div className="tarjeta-suave p-6"><p className="subtitulo">Tu clase</p><p className="texto-s suave mt-1">Elige un día y una hora.</p></div>
  );
  return (
    <div className="tarjeta-flota p-6">
      <p className="etiqueta-sola">Tu clase</p>
      <p className="mt-3 font-display text-[2rem] leading-none text-navy first-letter:uppercase">{fechaLegible(clase.fecha)}</p>
      <p className="mt-2 text-lg text-ink">{horaLegible(clase.hora)}</p>
      <div className="mt-4 flex items-center gap-3"><TagClase clase={clase} /></div>
      <div className="mt-5"><Columpios clase={clase} /></div>
      {plan && (
        <div className="mt-6 flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-ink">{plan.nombre}</span>
          <span className="font-display text-2xl text-navy">{dinero(plan.precio)}</span>
        </div>
      )}
    </div>
  );
}

function EsqueletoPaso() {
  return <div className="space-y-4 pt-2" aria-busy="true" aria-label="Cargando"><Esqueleto className="h-12 w-64" /><Esqueleto className="h-5 w-80 max-w-full" /><Esqueleto className="mt-6 h-40 rounded-[28px]" /></div>;
}

function EsqueletoSelector() {
  return (
    <div aria-busy="true" aria-label="Cargando clases">
      <div className="flex gap-2 overflow-hidden">{Array.from({ length: 6 }, (_, i) => <Esqueleto key={i} className="h-[84px] w-[58px] shrink-0 rounded-[22px]" />)}</div>
      <Esqueleto className="mt-6 h-4 w-40" />
      <div className="mt-4 grid gap-3">{Array.from({ length: 2 }, (_, i) => <Esqueleto key={i} className="h-[108px] rounded-[28px]" />)}</div>
    </div>
  );
}

/**
 * When the booking API cannot be reached, nobody is left stranded: the booking goes on by WhatsApp
 * with a prefilled message (the class she picked, her name, the attribution ref), as in the studio's
 * first website. Ana confirms it by hand.
 */
function PorWhatsApp({ clase, plan, nombre, referencia, reintentar, enLinea = false }) {
  const nombrePlan = typeof plan === "string" ? plan : plan?.nombre;
  const quiero = !nombrePlan || /prueba/i.test(nombrePlan) ? "mi clase de prueba" : `con el plan ${nombrePlan}`;
  const cuando = clase?.fecha ? ` el ${fechaLegible(clase.fecha)} a las ${horaLegible(clase.hora)}` : "";
  const quien = nombre?.trim() ? `Soy ${nombre.trim()}. ` : "";
  const texto = `Hola, ${quien}quiero reservar ${quiero} en Casa Lotus${cuando}.${referencia ? ` (ref:${referencia})` : ""}`;
  const enlace = "https://wa.me/573128720888?text=" + encodeURIComponent(texto);
  return (
    <div className={enLinea ? "" : "mt-2"} role="status">
      {!enLinea && <h1 className="titulo">Sigamos por WhatsApp.</h1>}
      <div className="tarjeta-suave mt-6 flex flex-col items-start gap-4 p-6">
        <p className="subtitulo">Las reservas en línea vuelven en un momento</p>
        <p className="texto-s suave max-w-[44ch]">Mientras tanto, aparta tu columpio por WhatsApp: el mensaje ya va escrito{cuando ? " con tu clase" : ""} y Ana te confirma por ahí.</p>
        <Boton variante="lima" tam="l" href={enlace} icono={<MessageCircle size={19} />} onClick={() => evento("cta", { ref: referencia || "APP-RESERVAR-WHATSAPP", respaldo: true })}>Reservar por WhatsApp</Boton>
        {reintentar && <Boton variante="suave" tam="s" icono={<RefreshCw size={16} />} onClick={reintentar}>Intentar de nuevo</Boton>}
      </div>
    </div>
  );
}
