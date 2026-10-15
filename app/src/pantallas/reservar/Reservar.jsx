// /app/reservar — public booking: class → you → (your ficha + agreements, only the first time) → ticket.
// Reads ?clase, ?plan, ?ref, ?espera=1 and localStorage["cl_atribucion"]. After «Tú» the API says whether she
// is already a clienta (`/api/publico/identificar`): a returning clienta with her ficha on file books with one
// tap; someone new answers only what a profe needs. A signed-in clienta skips «Tú».
import { createElement, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, X, UserRound, Sparkles, MessageCircle, RefreshCw } from "lucide-react";
import { useDisponibilidad, usePlanesPublicos, useReservaPublica, useIdentificar, useDuracion } from "../../api/hooks/publico.js";
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
import { PERFIL_VACIO, validarTu, validarFicha, validarAcuerdos, escribioSalud, faltaFicha, faltanAcuerdos } from "./reglasFicha.js";

// Only the first step ships with the page: the forms, the result, the sheets and the code login load when used.
const conMovimiento = (cargar, nombre) => lazy(() => Promise.all([cargar(), import("../../ui/ConMovimiento.jsx")])
  .then(([x, { ConMovimiento }]) => ({ default: (props) => createElement(ConMovimiento, null, createElement(x[nombre], props)) })));
const FormTu = conMovimiento(() => import("./Ficha.jsx"), "FormTu");
const FormFicha = conMovimiento(() => import("./Ficha.jsx"), "FormFicha");
const FormAcuerdosReserva = conMovimiento(() => import("./Ficha.jsx"), "FormAcuerdosReserva");
const Resultado = conMovimiento(() => import("./Resultado.jsx"), "Resultado");
const HojaEspera = lazy(() => import("./HojaEspera.jsx"));
const HojaEntrar = lazy(() => import("./HojaEntrar.jsx"));
const precargarPasos = () => { import("./Ficha.jsx"); import("./Resultado.jsx"); };
import { leerAtribucion, evento, llegoDesdeAtribucion } from "../../lib/atribucion.js";
import { dinero, primerNombre, SALUD_SIN_DATOS, fechaLegible, horaLegible, normalizaWhatsApp, ESTADO } from "../../lib/reglas.js";
import { nombreClase, sinTipo, NOTA_SIN_TIPO } from "../../lib/clases.js";
import { rangoHora } from "../../lib/ics.js";

const BORRADOR = "cl_reserva_borrador";
const ULTIMA = "cl_reserva_ultima";
const PASOS_URL = ["clase", "tu", "confirmar", "ficha"];
/** Who identificar answered for: the same WhatsApp and first name are not asked twice. */
const claveIdentidad = (p) => normalizaWhatsApp(p.whatsapp) + "|" + primerNombre(p.nombre).toLowerCase();
const NUEVA = { conocida: false, pideFicha: true, pideAcuerdos: true };

function leerBorrador() { try { return JSON.parse(sessionStorage.getItem(BORRADOR) || "null"); } catch { return null; } }

export default function Reservar() {
  const [params, setParams] = useSearchParams();
  const pasoUrl = params.get("paso") === "acuerdos" ? "ficha" : params.get("paso") || "clase";
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
  const [perfil, setPerfil] = useState(() => ({ ...PERFIL_VACIO, llego: llegoDesdeAtribucion(atribucion), ...(borrador.current?.perfil || {}) }));
  const [acuerdos, setAcuerdos] = useState(borrador.current?.acuerdos || {});
  const [identidad, setIdentidad] = useState(borrador.current?.identidad || null); // { clave, conocida, pideFicha, pideAcuerdos }
  const [errores, setErrores] = useState({});
  const [sinApi, setSinApi] = useState(false); // the booking API is unreachable: booking goes on by WhatsApp
  const [resultado, setResultado] = useState(() => { try { return JSON.parse(sessionStorage.getItem(ULTIMA) || "null"); } catch { return null; } });
  const [espera, setEspera] = useState(null);
  const [entrar, setEntrar] = useState(false);
  const [hojasVistas, setHojasVistas] = useState({});
  useEffect(() => { if (espera || entrar) setHojasVistas((v) => ({ ...v, ...(espera ? { espera: true } : {}), ...(entrar ? { entrar: true } : {}) })); }, [espera, entrar]);
  const reservaPublica = useReservaPublica();
  const identificar = useIdentificar();
  const reservarMi = useReservarMi();
  const editarPerfil = useEditarPerfil();
  const firmar = useFirmar();

  useEffect(() => { evento("reserva-inicio"); }, []);
  // keep the draft for a refresh, never the health answer (sensitive data stays in memory only)
  useEffect(() => {
    try { sessionStorage.setItem(BORRADOR, JSON.stringify({ clase: claseId, perfil: { ...perfil, salud: "", eps: "" }, acuerdos, identidad })); } catch { /* private mode */ }
  }, [claseId, perfil, acuerdos, identidad]);

  // a signed-in clienta: prefill from her profile
  useEffect(() => {
    if (!mi.data) return;
    const p = mi.data.clienta.perfil;
    setPerfil((x) => ({ ...x, ...Object.fromEntries(Object.entries(p).filter(([, v]) => (Array.isArray(v) ? v.length : typeof v === "object" ? v && Object.values(v).some(Boolean) : v))), whatsapp: formatoCelular(p.whatsapp || x.whatsapp) }));
    setAcuerdos((a) => ({ ...mi.data.clienta.consentimientos, ...a }));
  }, [mi.data]);

  // what this person still has to answer before booking
  const vigente = identidad && identidad.clave === claveIdentidad(perfil) ? identidad : null;
  const pide = clienta
    ? { conocida: true, pideFicha: mi.data ? faltaFicha(mi.data.clienta.perfil) : false, pideAcuerdos: mi.data ? faltanAcuerdos(mi.data.clienta.consentimientos) : false }
    : vigente || NUEVA;
  const listaParaReservar = !pide.pideFicha && !pide.pideAcuerdos;

  const clases = disp.data?.clases || [];
  const clase = clases.find((c) => c.id === claseId) || resultado?.clase;
  const plan = planes.data?.find((p) => p.nombre === planPedido) || planes.data?.find((p) => p.tipo === "Prueba");

  // the site sends ?espera=1 from a full slot: open the waiting list for that class
  useEffect(() => {
    if (params.get("espera") === "1" && clase && !clase.reservable) setEspera(clase);
  }, [clase]); // eslint-disable-line react-hooks/exhaustive-deps

  let paso = PASOS_URL.includes(pasoUrl) || (pasoUrl === "listo" && resultado) ? pasoUrl : "clase";
  if (paso === "tu" && clienta) paso = "clase";
  const conocidaLista = Boolean(clienta || vigente?.conocida) && listaParaReservar;
  if (paso === "confirmar" && !conocidaLista) paso = clienta ? "ficha" : "tu";
  if (paso === "ficha" && conocidaLista) paso = "confirmar";

  const ir = (p) => {
    const n = new URLSearchParams(params);
    if (p === "clase") n.delete("paso"); else n.set("paso", p);
    if (claseId) n.set("clase", claseId);
    setParams(n);
    scrollTo({ top: 0, behavior: "smooth" });
  };
  const cambiar = (parcial) => { setPerfil((p) => ({ ...p, ...parcial })); setErrores({}); };

  // the progress: Clase · Tú · Listo for a returning clienta, Clase · Tú · Ficha · Listo for someone new
  const pasosVisibles = [
    { id: "clase", texto: "Clase" },
    ...(clienta ? [] : [{ id: "tu", texto: "Tú" }]),
    ...(listaParaReservar ? [] : [{ id: "ficha", texto: "Ficha" }]),
    { id: "listo", texto: "Listo" },
  ];
  const indice = paso === "listo" ? pasosVisibles.length : Math.max(0, pasosVisibles.findIndex((p) => p.id === (paso === "confirmar" ? "tu" : paso)));

  const conSensibles = pide.pideFicha && escribioSalud(perfil.salud);

  async function enviar() {
    const salud = conSensibles && acuerdos.sensibles?.acepta !== true ? SALUD_SIN_DATOS[1] : perfil.salud;
    const ficha = pide.pideFicha ? {
      salud, experiencia: perfil.experiencia,
      contactoEmergencia: { nombre: (perfil.contactoEmergencia?.nombre || "").trim(), whatsapp: (perfil.contactoEmergencia?.whatsapp || "").replace(/\D/g, "") },
    } : {};
    const firmados = Object.fromEntries(["datos", "descargo", "imagen", "sensibles", "novedades"]
      .filter((k) => typeof acuerdos[k]?.acepta === "boolean" && (pide.pideAcuerdos || (k === "sensibles" && conSensibles)))
      .map((k) => [k, { acepta: acuerdos[k].acepta }]));
    try {
      let r;
      if (clienta) {
        if (pide.pideFicha) await editarPerfil.mutateAsync(ficha);
        if (Object.keys(firmados).length) await firmar.mutateAsync(firmados);
        const res = await reservarMi.mutateAsync(clase.id);
        const conPlan = res.estado === ESTADO.CONFIRMADA;
        const antes = mi.data?.saldo?.clases;
        r = { codigo: res.id, estado: res.estado, clase: res.clase, pago: res.pago || null, plan: res.plan, conPlan, saldo: conPlan && Number.isFinite(antes) ? { clases: Math.max(0, antes - 1) } : null, correo: false };
      } else {
        const base = { nombre: perfil.nombre.trim(), whatsapp: perfil.whatsapp.replace(/\D/g, ""), ...((perfil.correo || "").trim() ? { correo: perfil.correo.trim() } : {}), ...(perfil.llego ? { llego: perfil.llego } : {}) };
        r = await reservaPublica.mutateAsync({ clase: clase.id, perfil: { ...base, ...ficha }, consentimientos: firmados, plan: plan?.nombre, ref: atribucion.ref, utm: atribucion.utm, clickIds: atribucion.clickIds, website: "" });
      }
      // the progress she walked stays as it was (booking may open a session that would shorten it)
      const final = { ...r, nombre: primerNombre(perfil.nombre || clienta?.nombre), ts: Date.now(), pasos: pasosVisibles };
      setResultado(final);
      try { sessionStorage.setItem(ULTIMA, JSON.stringify(final)); sessionStorage.removeItem(BORRADOR); } catch { /* ignore */ }
      ir("listo");
    } catch (e) {
      if (e.sinApi) { setSinApi(true); scrollTo({ top: 0, behavior: "smooth" }); return; }
      if (e.campos) {
        setErrores(e.campos);
        if (e.campos.nombre || e.campos.whatsapp || e.campos.correo) ir("tu");
        // her agreements were not on file after all (e.g. the server could not recognise her): ask them
        if (e.campos.consentimientos && !clienta) { setIdentidad({ ...NUEVA, clave: claveIdentidad(perfil) }); ir("ficha"); }
      }
      if (e.motivo === "llena" || e.motivo === "tarde" || e.motivo === "cancelada") { disp.refetch(); ir("clase"); }
      avisar(e.mensaje || "No pudimos apartar tu columpio.", { tipo: "error" });
    }
  }
  const enviando = reservaPublica.isPending || reservarMi.isPending || editarPerfil.isPending || firmar.isPending;

  /** «Tú» → ask the API who she is (no personal data comes back), then the shortest way to book. */
  async function despuesDeTu() {
    const clave = claveIdentidad(perfil);
    let id = identidad?.clave === clave ? identidad : null;
    if (!id) {
      try {
        const r = await identificar.mutateAsync({ nombre: perfil.nombre.trim(), whatsapp: perfil.whatsapp.replace(/\D/g, ""), website: "" });
        id = { clave, conocida: Boolean(r?.conocida), pideFicha: r?.pideFicha !== false, pideAcuerdos: r?.pideAcuerdos !== false };
      } catch (e) {
        if (e.campos) return setErrores(e.campos);
        id = { ...NUEVA, clave }; // unknown or unreachable: ask everything, the booking still works
      }
      setIdentidad(id);
    }
    ir(id.conocida && !id.pideFicha && !id.pideAcuerdos ? "confirmar" : "ficha");
  }

  function siguiente() {
    if (paso === "clase") {
      if (!clase) return;
      if (clienta) return listaParaReservar ? enviar() : ir("ficha");
      return ir("tu");
    }
    if (paso === "tu") { const e = validarTu(perfil); if (Object.keys(e).length) return setErrores(e); return despuesDeTu(); }
    if (paso === "confirmar") return enviar();
    if (paso === "ficha") {
      const e = { ...(pide.pideFicha ? validarFicha(perfil) : {}), ...validarAcuerdos(acuerdos, { completos: pide.pideAcuerdos, conSensibles }) };
      if (Object.keys(e).length) { setErrores(e); return requestAnimationFrame(() => document.querySelector("[aria-invalid=true], .campo-error")?.scrollIntoView({ block: "center", behavior: "smooth" })); }
      return enviar();
    }
  }

  if (paso === "listo" && resultado) {
    const pasosHechos = resultado.pasos || pasosVisibles;
    return <Marco paso="listo" pasos={pasosHechos} indice={pasosHechos.length}><Suspense fallback={<EsqueletoPaso />}><Resultado r={resultado} limpiar={() => { sessionStorage.removeItem(ULTIMA); setResultado(null); setClaseId(""); ir("clase"); }} /></Suspense></Marco>;
  }
  // a direct visit to a later step without a class goes back to the start
  if (paso !== "clase" && !clase && !disp.isPending) {
    return <Marco paso="clase"><p className="lead">Primero elige tu clase.</p><Boton className="mt-6" onClick={() => ir("clase")}>Elegir clase</Boton></Marco>;
  }

  if (sinApi) {
    return <Marco paso={paso}><PorWhatsApp clase={clase} plan={plan || planPedido} nombre={perfil.nombre} referencia={atribucion.ref} reintentar={() => setSinApi(false)} /></Marco>;
  }

  const final = paso === "confirmar" || paso === "ficha" || (paso === "clase" && clienta && listaParaReservar);
  const cta = paso === "clase" ? (clienta && listaParaReservar ? "Reservar con mi plan" : "Continuar") : final ? "Reservar" : "Continuar";
  const ctaCorto = paso === "clase" && clienta && listaParaReservar ? "Reservar" : cta;
  const cargandoCta = enviando || identificar.isPending;
  const sinClase = !clase || (clienta && !mi.data); // a signed-in clienta: wait for her profile before deciding
  const nombre = primerNombre(perfil.nombre).replace(/^\p{Ll}/u, (l) => l.toUpperCase()); // «mariana» typed → «Mariana»

  return (
    <Marco paso={paso} pasos={pasosVisibles} indice={indice} atras={paso !== "clase" ? () => history.back() : null}>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <div className="min-w-0">
          <Suspense fallback={<EsqueletoPaso />}>
            <div key={paso} className="entra-x">
              {paso === "clase" && (
                <>
                  <h1 className="saludo-reserva">{clienta ? `Hola, ${primerNombre(clienta.nombre)}.` : "Aparta tu columpio."}</h1>
                  <p className="mt-2 text-[0.9375rem] leading-snug text-ink lg:mt-4 lg:max-w-[38ch] lg:text-[1.1875rem] lg:font-light lg:leading-[1.45]">
                    {clienta
                      ? (listaParaReservar ? "Elige tu clase y queda reservada con tu plan." : "Elige tu clase. Después completamos tu ficha.")
                      : <><span className="lg:hidden">Elige día y hora. Cupos limitados.</span><span className="hidden lg:inline">Elige el día y la hora. Las clases son semipersonalizadas, con cupos limitados.</span></>}
                  </p>
                  {!clienta && (plan || !disp.error?.sinApi) && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 lg:mt-6 lg:gap-x-5">
                      {plan && (
                        <p className="inline-flex min-h-9 items-center gap-1 rounded-full bg-white px-2.5 text-[0.8125rem] text-navy shadow-card lg:min-h-11 lg:gap-2 lg:px-4 lg:text-[0.9375rem]">
                          <Sparkles size={14} className="text-teal" />{plan.nombre}<span className="text-muted">·</span><strong className="font-semibold">{dinero(plan.precio)}</strong>
                        </p>
                      )}
                      {!disp.error?.sinApi && (
                        <button type="button" onClick={() => setEntrar(true)} className="flex min-h-11 items-center gap-1.5 text-[0.875rem] text-teal lg:text-[0.9375rem]">
                          <UserRound size={16} className="hidden shrink-0 lg:block" /><span className="underline underline-offset-4">¿Ya has venido?</span>
                        </button>
                      )}
                    </div>
                  )}
                  <div className="mt-4 lg:mt-8">
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
                  <p className="lead mt-3">Si ya has venido, te reconocemos y no llenas nada más.</p>
                  <form className="mt-8" onSubmit={(e) => { e.preventDefault(); siguiente(); }} noValidate>
                    <FormTu perfil={perfil} cambiar={cambiar} errores={errores} />
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />
                    <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
                  </form>
                </>
              )}
              {paso === "confirmar" && (
                <>
                  <h1 className="titulo">¡Hola de nuevo, {nombre}!</h1>
                  <p className="lead mt-3 max-w-[40ch]">Ya tenemos tu ficha. Si tienes clases en tu plan, queda reservada con él; si no, te la apartamos mientras llega tu pago.</p>
                  <div className="mt-6 lg:hidden"><Resumen clase={clase} /></div>
                  <button type="button" onClick={() => ir("tu")} className="mt-6 min-h-11 texto-s enlace">¿No eres tú? Cambia tus datos</button>
                </>
              )}
              {paso === "ficha" && (
                <>
                  {pide.conocida ? <h1 className="titulo">¡Hola de nuevo, {nombre}!</h1> : <h1 className="titulo">Tu ficha</h1>}
                  <p className="lead mt-3 max-w-[42ch]">{!pide.pideFicha ? "Solo falta que aceptes los acuerdos de Casa Lotus." : pide.conocida ? "Antes de reservar, completa tu ficha: tu profe la necesita. Solo la ven Ana y tu profe." : "Así tu profe prepara la clase para tu cuerpo. Solo la ven Ana y tu profe."}</p>
                  {pide.pideFicha && <div className="mt-8"><FormFicha perfil={perfil} cambiar={cambiar} errores={errores} /></div>}
                  {(pide.pideAcuerdos || conSensibles) && (
                    <section className="mt-10" aria-labelledby="acuerdos-t">
                      <h2 id="acuerdos-t" className="subtitulo mb-3">Acuerdos</h2>
                      <FormAcuerdosReserva valor={acuerdos} cambiar={(v) => { setAcuerdos(v); setErrores({}); }} conSensibles={conSensibles} completos={pide.pideAcuerdos} errores={errores} />
                    </section>
                  )}
                </>
              )}
            </div>
          </Suspense>
        </div>

        {/* desktop: the chosen class floats beside the form */}
        <aside className={disp.error?.sinApi ? "hidden" : "hidden lg:block"}>
          <div className="sticky top-24">
            <Resumen clase={clase} plan={!clienta && !vigente?.conocida ? plan : null} />
            <Boton bloque tam="l" punto={final} className="mt-4" onClick={siguiente} disabled={sinClase} cargando={cargandoCta} iconoFinal={!final ? <ArrowRight size={18} /> : null}>{cta}</Boton>
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
              <Boton tam="m" punto={final} onClick={siguiente} disabled={sinClase} cargando={cargandoCta}>{ctaCorto}</Boton>
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

function Marco({ children, paso, pasos = [], indice = 0, atras }) {
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
          {pasos.length > 0 ? (
            <ol className="flex flex-1 items-center gap-1.5" aria-label={paso === "listo" ? "Reserva lista" : `Paso ${indice + 1} de ${pasos.length}`}>
              {pasos.map((p, i) => (
                <li key={p.id} className="flex-1" aria-current={i === indice ? "step" : undefined}>
                  <span className="relative block h-1 overflow-hidden rounded-full bg-line">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-navy transition-[width] duration-500 ease-out" style={{ width: i < indice ? "100%" : i === indice ? "50%" : "0%" }} />
                  </span>
                  <span className={`mt-1.5 hidden text-[0.6875rem] font-medium sm:block ${i <= indice ? "text-navy" : "text-muted"}`}>{p.texto}</span>
                </li>
              ))}
            </ol>
          ) : <span className="flex-1" />}
          <a href="/" className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-navy hover:bg-white/70" aria-label="Salir de la reserva"><X size={20} /></a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1080px] px-5 pb-[calc(env(safe-area-inset-bottom)+8rem)] pt-5 lg:pb-16 lg:pt-10">{children}</main>
    </>
  );
}

/** The chosen class: name («Clase aérea» while it has no type), day, time range, swings, and the plan price for a visitor. */
function Resumen({ clase, plan }) {
  const duracion = useDuracion(clase);
  if (!clase) return (
    <div className="tarjeta-suave p-6"><p className="subtitulo">Tu clase</p><p className="texto-s suave mt-1">Elige un día y una hora.</p></div>
  );
  return (
    <div className="tarjeta-flota p-6">
      <p className="etiqueta-sola">Tu clase</p>
      <p className="mt-3 font-display text-[1.75rem] leading-none text-navy">{nombreClase(clase)}</p>
      {sinTipo(clase) && <p className="mt-1.5 texto-s suave">{NOTA_SIN_TIPO}</p>}
      <p className="mt-4 font-medium text-navy first-letter:uppercase">{fechaLegible(clase.fecha)}</p>
      <p className="text-ink">{rangoHora(clase, duracion)}</p>
      <div className="mt-4 flex items-center gap-3"><Columpios clase={clase} />{!sinTipo(clase) && <TagClase clase={clase} className="ml-auto" />}</div>
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
