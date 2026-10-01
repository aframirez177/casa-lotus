// /app/profe — the next class up front (with countdown), classes to mark, today and the weeks ahead.
import { Link } from "react-router";
import { useState } from "react";
import { ArrowRight, BellRing, Clock, Sparkles, Cake, HeartPulse } from "lucide-react";
import { useYo } from "../../api/hooks/auth.js";
import { useClasesProfe, useResumenProfe, usePushClaveProfe, useSuscribirPushProfe } from "../../api/hooks/profe.js";
import { Encabezado, Seccion, ErrorCaja, Vacio, TagClase } from "../../ui/Basicos.jsx";
import { EsqueletoPagina } from "../../ui/Esqueleto.jsx";
import { ListaEscalonada } from "../../ui/Animado.jsx";
import { Columpios } from "../../ui/Columpios.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { useAhora } from "../../ui/useAhora.js";
import { useAvisos } from "../../ui/Avisos.jsx";
import { TarjetaClaseEquipo, sinMarcar, activos } from "../comun/Clase.jsx";
import { suscribirPush, permisoPush, pushDisponible } from "../../lib/push.js";
import { primerNombre, hoyClave, fechaLegible, horaLegible, inicioClase, SALUD_SIN_DATOS } from "../../lib/reglas.js";
import { porDia, nombreClase } from "../../lib/clases.js";
import { diaRelativo, mesActual, mesLegible, partesCuenta } from "../../lib/fechas.js";
import { esDemo } from "../../api/modo.js";

export default function InicioProfe() {
  const { data: yo } = useYo();
  const { data, isPending, error, refetch } = useClasesProfe();
  const resumen = useResumenProfe(mesActual());
  const ahora = useAhora(60000);
  if (isPending) return <EsqueletoPagina tarjetas={3} />;
  if (error) return <ErrorCaja error={error} reintentar={refetch} />;

  const hoy = hoyClave();
  const enlace = (c) => `/profe/clase/${encodeURIComponent(c.id)}`;
  const porMarcar = data.filter((c) => c.pasada && sinMarcar(c) > 0 && c.estado !== "Cancelada");
  const proxima = data.filter((c) => c.estado !== "Cancelada" && inicioClase(c) > ahora - 60 * 60000).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  const deHoy = data.filter((c) => c.fecha === hoy && !porMarcar.includes(c) && c !== proxima);
  const siguientes = data.filter((c) => c.fecha > hoy && c !== proxima);
  const lead = porMarcar.length ? `Tienes ${porMarcar.length === 1 ? "1 clase" : porMarcar.length + " clases"} por marcar.`
    : proxima ? `Tu próxima clase es ${diaRelativo(proxima.fecha) === "hoy" ? "hoy" : diaRelativo(proxima.fecha) === "mañana" ? "mañana" : "el " + fechaLegible(proxima.fecha)}, a las ${horaLegible(proxima.hora)}` : "No tienes clases en las próximas dos semanas.";
  const mes = mesLegible(mesActual()).split(" ")[0];

  return (
    <div>
      <Encabezado eyebrow={fechaLegible(hoy)} titulo={`Hola, ${primerNombre(yo?.nombre)}.`} lead={lead} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-5">
          {proxima ? <Proxima c={proxima} a={enlace(proxima)} ahora={ahora} /> : <Vacio titulo="Sin clases a la vista" texto="Cuando Ana te asigne una clase, aparece aquí." />}
        </div>
        <div className="min-w-0 space-y-4">
          {porMarcar.length > 0 && (
            <Link to={enlace(porMarcar[0])} className="tarjeta flex items-center gap-4 p-5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-aviso-bg text-aviso"><Clock size={21} /></span>
              <span className="min-w-0 flex-1"><span className="block font-medium text-navy">{porMarcar.length === 1 ? "1 clase por marcar" : `${porMarcar.length} clases por marcar`}</span><span className="block texto-s suave first-letter:uppercase">{diaRelativo(porMarcar[0].fecha)} · {horaLegible(porMarcar[0].hora)}</span></span>
              <ArrowRight size={18} className="text-navy" />
            </Link>
          )}
          {resumen.data && (
            <div className="tarjeta flex items-center gap-4 p-5">
              <span className="numero text-[2.4rem]">{resumen.data.clasesDictadas}</span>
              <span className="min-w-0 flex-1 texto-s text-ink">{resumen.data.clasesDictadas === 1 ? "clase dictada" : "clases dictadas"} en {mes}{resumen.data.clasesDictadas > 0 ? ` · ${resumen.data.asistentes} asistentes · ${resumen.data.ocupacionPct} % de ocupación` : ""}{resumen.data.proximas ? `. Te ${resumen.data.proximas === 1 ? "queda 1" : "quedan " + resumen.data.proximas} este mes.` : "."}</span>
            </div>
          )}
          <Avisos />
        </div>
      </div>

      {porMarcar.length > 0 && (
        <Seccion titulo="Por marcar" ayuda="Toca la clase y marca quién vino.">
          <ListaEscalonada clave="profe-marcar" className="grid gap-3 md:grid-cols-2">
            {porMarcar.map((c) => <TarjetaClaseEquipo key={c.id} clase={c} a={enlace(c)} mostrarDia sinProfe />)}
          </ListaEscalonada>
        </Seccion>
      )}
      {deHoy.length > 0 && (
        <Seccion titulo="Más tarde hoy">
          <div className="grid gap-3 md:grid-cols-2">{deHoy.map((c) => <TarjetaClaseEquipo key={c.id} clase={c} a={enlace(c)} sinProfe />)}</div>
        </Seccion>
      )}
      {porDia(siguientes).map(({ fecha, lista }) => (
        <Seccion key={fecha} titulo={diaRelativo(fecha) === "mañana" ? "Mañana" : fechaLegible(fecha)}>
          <div className="grid gap-3 md:grid-cols-2">{lista.map((c) => <TarjetaClaseEquipo key={c.id} clase={c} a={enlace(c)} sinProfe />)}</div>
        </Seccion>
      ))}
    </div>
  );
}

/** The next class: big, calm, with who is special today. */
function Proxima({ c, a, ahora }) {
  const { d, h, m } = partesCuenta(inicioClase(c), ahora);
  const gente = activos(c);
  const primeras = gente.filter((g) => g.primeraVez).length;
  const cumple = gente.filter((g) => g.cumple).length;
  const salud = gente.filter((g) => g.salud && !SALUD_SIN_DATOS.includes(g.salud)).length;
  const enCurso = ahora >= inicioClase(c);
  return (
    <Link to={a} className="tarjeta-noche relative block overflow-hidden p-6 shadow-float sm:p-7">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-yoga/20 blur-2xl" aria-hidden="true" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <p className="etiqueta-sola !text-paper/70">{enCurso ? "En curso" : "Tu próxima clase"}</p>
          <TagClase clase={c} />
        </div>
        <p className="mt-4 font-display text-[2.25rem] leading-[0.95] tracking-tight text-paper first-letter:uppercase">{diaRelativo(c.fecha)} · {horaLegible(c.hora)}</p>
        <p className="mt-1 text-paper/80">{nombreClase(c)}</p>
        {!enCurso && (
          <p className="mt-5 font-display text-paper" role="timer">
            {d > 0 && <><span className="text-[2.4rem] leading-none">{d}</span><span className="ml-1 mr-3 text-base text-paper/70">{d === 1 ? "día" : "días"}</span></>}
            <span className="text-[2.4rem] leading-none">{h}</span><span className="ml-1 mr-3 text-base text-paper/70">h</span>
            {d === 0 && <><span className="text-[2.4rem] leading-none">{m}</span><span className="ml-1 text-base text-paper/70">min</span></>}
          </p>
        )}
        <div className="mt-5 flex items-center gap-3"><Columpios cupos={c.cupos} ocupados={c.ocupados} claro tam="s" conNumero /><span className="text-[0.875rem] text-paper/80">{c.ocupados} de {c.cupos}</span></div>
        {(primeras || cumple || salud) > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {primeras > 0 && <span className="chip !bg-pilates"><Sparkles size={13} />{primeras === 1 ? "1 primera vez" : `${primeras} primera vez`}</span>}
            {cumple > 0 && <span className="chip !bg-multinivel"><Cake size={13} />Cumpleaños</span>}
            {salud > 0 && <span className="chip"><HeartPulse size={13} />{salud === 1 ? "1 con cuidado" : `${salud} con cuidado`}</span>}
          </div>
        )}
        {c.reemplazoPedido && <p className="mt-4 chip chip-error">Reemplazo pedido</p>}
        <p className="mt-6 inline-flex items-center gap-2 text-[0.9375rem] font-medium text-lime">Ver quién viene <ArrowRight size={16} /></p>
      </div>
    </Link>
  );
}

/** Notifications on this phone: new assignments and changes to her classes. */
function Avisos() {
  const clave = usePushClaveProfe();
  const suscribir = useSuscribirPushProfe();
  const { avisar } = useAvisos();
  const [permiso, setPermiso] = useState(permisoPush());
  if (permiso === "granted" || (!pushDisponible() && !esDemo)) return null;
  const activar = async () => {
    if (esDemo) return avisar("En la demo no se envían notificaciones.");
    try { await suscribir.mutateAsync(await suscribirPush(clave.data?.clavePublica)); setPermiso("granted"); avisar("Listo: te avisamos cuando te asignen o cambien una clase."); }
    catch (e) { setPermiso(permisoPush()); avisar(e.mensaje || e.message, { tipo: "error" }); }
  };
  return (
    <div className="tarjeta flex items-center gap-4 p-5">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-mist text-navy"><BellRing size={20} /></span>
      <div className="min-w-0 flex-1"><p className="font-medium text-navy">Avisos en este teléfono</p><p className="texto-s suave">{permiso === "denied" ? "Están bloqueados en los ajustes del teléfono." : "Cuando Ana te asigne o cambie una clase."}</p></div>
      {permiso !== "denied" && <Boton tam="s" cargando={suscribir.isPending} onClick={activar}>Activar</Boton>}
    </div>
  );
}
