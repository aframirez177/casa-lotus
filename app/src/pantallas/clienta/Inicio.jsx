// /app/mi — her next class (with countdown), her balance, quick booking, waiting lists, nudges.
import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, ClipboardList, Hourglass, ShieldCheck, Sparkles, MessageCircle } from "lucide-react";
import { useMi, useReservarMi } from "../../api/hooks/clienta.js";
import { useDisponibilidad } from "../../api/hooks/publico.js";
import { useYo } from "../../api/hooks/auth.js";
import { useQueryClient } from "@tanstack/react-query";
import { K } from "../../api/claves.js";
import { api, id } from "../../api/cliente.js";
import { Encabezado, Seccion, ErrorCaja, TagClase } from "../../ui/Basicos.jsx";
import { EsqueletoPagina } from "../../ui/Esqueleto.jsx";
import { Anillo } from "../../ui/Anillo.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { Columpios } from "../../ui/Columpios.jsx";
import { ListaEscalonada } from "../../ui/Animado.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { InstalarTarjeta } from "../../shell/Instalar.jsx";
import { FlujoCodigo } from "../entrar/FlujoCodigo.jsx";
import { ProximaClase, FilaReserva, HojaCancelar, HojaReagendar } from "./comun.jsx";
import { primerNombre, hoyClave, fechaLegible, horaLegible, enlaceWhatsApp } from "../../lib/reglas.js";
import { diaRelativo } from "../../lib/fechas.js";
import { nombreClase } from "../../lib/clases.js";

export default function Inicio() {
  const { data: yo } = useYo();
  const { data, isPending, error, refetch } = useMi();
  const [cancelar, setCancelar] = useState(null);
  const [reagendar, setReagendar] = useState(null);
  const [confirmarWa, setConfirmarWa] = useState(false);
  const qc = useQueryClient();

  if (isPending) return <EsqueletoPagina tarjetas={2} />;
  if (error) return <ErrorCaja error={error} reintentar={refetch} />;

  const { clienta, saldo, proximas, espera, compras } = data;
  const nombre = primerNombre(clienta.perfil.nombre || yo?.nombre);
  const [primera, ...resto] = proximas;
  const plan = compras?.[0];
  const lead = clienta.limitada ? "Aquí ves la clase que acabas de reservar." : primera
    ? `Tu próxima clase es ${diaRelativo(primera.clase.fecha) === "hoy" ? "hoy" : diaRelativo(primera.clase.fecha) === "mañana" ? "mañana" : "el " + fechaLegible(primera.clase.fecha)}, a las ${horaLegible(primera.clase.hora)}`
    : saldo.clases ? `Tienes ${saldo.clases === 1 ? "1 clase" : saldo.clases + " clases"} esperándote. ¿Cuándo vienes?` : "Cuando quieras volver al aire, aparta tu columpio.";

  return (
    <div>
      <Encabezado eyebrow={fechaLegible(hoyClave())} titulo={`Hola, ${nombre}.`} lead={lead} />

      {clienta.limitada && (
        <button type="button" onClick={() => setConfirmarWa(true)} className="tarjeta mb-6 flex w-full items-center gap-4 p-5 text-left">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-yoga text-navy"><ShieldCheck size={22} /></span>
          <span className="min-w-0 flex-1"><span className="block font-medium text-navy">Entra con tu código para ver tu plan y todas tus clases</span><span className="block texto-s suave">Por ahora ves solo lo que reservaste en este teléfono.</span></span>
          <ArrowRight size={18} className="shrink-0 text-navy" />
        </button>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-5">
          {primera ? <ProximaClase reserva={primera} onCancelar={setCancelar} onReagendar={setReagendar} /> : <SinClase saldo={saldo} />}
          {resto.length > 0 && (
            <Seccion titulo="También vienes">
              <ListaEscalonada clave="mi-resto" className="space-y-3">
                {resto.map((r) => <FilaReserva key={r.id} reserva={r} onCancelar={setCancelar} onReagendar={setReagendar} />)}
              </ListaEscalonada>
            </Seccion>
          )}
          {!clienta.limitada && <ReservaRapida saldo={saldo} proximas={proximas} />}
        </div>

        <div className="min-w-0 space-y-5">
          {!clienta.limitada && <Saldo saldo={saldo} plan={plan} />}
          {!clienta.fichaCompleta && !clienta.limitada && (
            <Link to="/mi/perfil#ficha" className="tarjeta flex items-center gap-4 p-5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-pilates text-navy"><ClipboardList size={21} /></span>
              <span className="min-w-0 flex-1"><span className="block font-medium text-navy">Completa tu ficha</span><span className="block texto-s suave">Tu contacto de emergencia y tu salud. Toma un minuto y tu profe te cuida mejor.</span></span>
              <ArrowRight size={18} className="shrink-0 text-navy" />
            </Link>
          )}
          {espera.length > 0 && <Espera items={espera} />}
          <InstalarTarjeta />
        </div>
      </div>

      <HojaCancelar reserva={cancelar} cerrar={() => setCancelar(null)} />
      <HojaReagendar reserva={reagendar} cerrar={() => setReagendar(null)} />
      <Hoja abierta={confirmarWa} alCerrar={() => setConfirmarWa(false)} titulo="Entra con tu código" descripcion="Así sabemos que eres tú y te mostramos tu plan y todas tus clases.">
        <FlujoCodigo compacto whatsappInicial={clienta.perfil.whatsapp} onListo={() => { setConfirmarWa(false); qc.invalidateQueries({ queryKey: K.mi }); qc.invalidateQueries({ queryKey: K.yo }); }} />
      </Hoja>
    </div>
  );
}

function SinClase({ saldo }) {
  return (
    <div className="tarjeta-flota relative overflow-hidden p-7">
      <p className="etiqueta-sola">Sin clases agendadas</p>
      <p className="mt-4 font-display text-[2.25rem] leading-[0.95] tracking-tight text-navy">Tu columpio te está esperando.</p>
      <p className="mt-3 text-ink">{saldo.clases ? `Te ${saldo.clases === 1 ? "queda 1 clase" : "quedan " + saldo.clases + " clases"} en tu plan.` : "Reserva una clase y la confirmamos cuando llegue tu pago."}</p>
      <Boton a="/mi/reservar" punto className="mt-6">Reservar una clase</Boton>
    </div>
  );
}

function Saldo({ saldo, plan }) {
  const total = plan?.clases || saldo.clases || 0;
  const pct = total ? Math.round((saldo.clases / total) * 100) : 0;
  return (
    <section className="tarjeta p-6" aria-labelledby="saldo-t">
      <h2 id="saldo-t" className="etiqueta">Tu plan</h2>
      {saldo.clases > 0 ? (
        <div className="mt-5 flex items-center gap-6">
          <Anillo pct={pct} tam={116} grosor={9} etiqueta={`Te quedan ${saldo.clases} de ${total} clases`}>
            <span><span className="numero block text-[2.6rem]">{saldo.clases}</span><span className="block text-[0.75rem] text-muted">{saldo.clases === 1 ? "clase" : "clases"}</span></span>
          </Anillo>
          <div className="min-w-0">
            <p className="font-medium text-navy">{plan?.plan || "Clases disponibles"}</p>
            <p className="texto-s mt-1 text-ink">Te {saldo.clases === 1 ? "queda 1" : "quedan " + saldo.clases} de {total}.</p>
            {saldo.venceTexto && <p className="texto-s mt-1 suave">Vence el {saldo.venceTexto}.</p>}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="font-display text-2xl text-navy">No tienes clases en tu plan.</p>
          <p className="texto-s mt-2 suave">Renuévalo con Ana y sigue volando.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Boton tam="s" href={enlaceWhatsApp("573128720888", "Hola Ana, quiero renovar mi plan en Casa Lotus.")} icono={<MessageCircle size={16} />}>Renovar con Ana</Boton>
            <Boton tam="s" variante="suave" href="/#planes">Ver planes</Boton>
          </div>
        </div>
      )}
    </section>
  );
}

/** The next free classes, bookable in one tap. */
function ReservaRapida({ saldo, proximas }) {
  const { data } = useDisponibilidad(14);
  const reservar = useReservarMi();
  const { avisar } = useAvisos();
  const [elegida, setElegida] = useState(null);
  const mias = new Set(proximas.map((r) => r.clase.id));
  const libres = (data?.clases || []).filter((c) => c.reservable && !mias.has(c.id)).slice(0, 6);
  if (!libres.length) return null;
  return (
    <Seccion titulo="Reserva rápida" accion={<Link to="/mi/reservar" className="inline-flex min-h-11 items-center gap-1 texto-s font-medium text-teal">Ver todo <ArrowRight size={15} /></Link>}>
      <div className="scroll-x -mx-5 flex scroll-px-5 gap-3 px-5 pb-2 lg:mx-0 lg:px-0">
        {libres.map((c) => (
          <button key={c.id} type="button" onClick={() => setElegida(c)} className="tarjeta mece flex w-[168px] shrink-0 flex-col gap-3 p-4 text-left">
            <span className="text-[0.8125rem] font-medium text-muted first-letter:uppercase">{diaRelativo(c.fecha)}</span>
            <span className="font-display text-[1.75rem] leading-none text-navy">{horaLegible(c.hora).replace(" a. m.", "").replace(" p. m.", "")}<span className="ml-1 font-sans text-sm text-muted">{horaLegible(c.hora).slice(-5)}</span></span>
            <TagClase clase={c} className="self-start" />
            <Columpios clase={c} tam="s" />
          </button>
        ))}
      </div>
      <Hoja abierta={Boolean(elegida)} alCerrar={() => setElegida(null)} titulo="¿Reservamos?" descripcion={elegida ? `${fechaLegible(elegida.fecha)}, ${horaLegible(elegida.hora)} · ${nombreClase(elegida)}` : ""}>
        <p className="lead">{saldo.clases > 0 ? `Se descuenta 1 clase de tu plan. Te ${saldo.clases - 1 === 1 ? "quedará 1" : "quedarán " + (saldo.clases - 1)}.` : "No tienes clases en tu plan: tu columpio queda apartado mientras llega tu pago."}</p>
        {reservar.isError && <p className="campo-error mt-3" role="alert">{reservar.error.mensaje}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="suave" onClick={() => setElegida(null)}>Ahora no</Boton>
          <Boton punto cargando={reservar.isPending} onClick={() => reservar.mutate(elegida.id, { onSuccess: (r) => { setElegida(null); avisar(r.estado === "Confirmada" ? "¡Listo! Tu columpio está reservado." : "Tu columpio está apartado. Envía el comprobante para confirmarlo."); } })}>Reservar</Boton>
        </div>
      </Hoja>
    </Seccion>
  );
}

function Espera({ items }) {
  const qc = useQueryClient();
  const { programar } = useAvisos();
  const salir = (e) => {
    const antes = qc.getQueryData(K.mi);
    programar({
      texto: "Saliste de la lista de espera.",
      aplicar: () => qc.setQueryData(K.mi, (mi) => mi && { ...mi, espera: mi.espera.filter((x) => x.id !== e.id) }),
      revertir: () => qc.setQueryData(K.mi, antes),
      confirmar: async () => { await api.del(`/api/yo/espera/${id(e.id)}`); qc.invalidateQueries({ queryKey: K.mi }); },
    });
  };
  return (
    <section className="tarjeta p-6" aria-labelledby="espera-t">
      <h2 id="espera-t" className="etiqueta">Lista de espera</h2>
      <ul className="mt-4 space-y-3">
        {items.map((e) => (
          <li key={e.id} className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mist text-navy"><Hourglass size={17} /></span>
            <span className="min-w-0 flex-1"><span className="block font-medium text-navy first-letter:uppercase">{diaRelativo(e.clase.fecha)} · {horaLegible(e.clase.hora)}</span><span className="block texto-s suave">{e.clase.libres > 0 ? "¡Se liberó un columpio! Resérvalo ya." : "Te avisamos si se libera un columpio."}</span></span>
            {e.clase.libres > 0 ? <Boton tam="xs" a={`/mi/reservar?clase=${encodeURIComponent(e.clase.id)}`} icono={<Sparkles size={14} />}>Tomarlo</Boton> : <Boton tam="xs" variante="fantasma" onClick={() => salir(e)}>Salir</Boton>}
          </li>
        ))}
      </ul>
    </section>
  );
}
