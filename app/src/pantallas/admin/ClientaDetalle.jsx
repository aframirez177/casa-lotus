// /app/admin/clientas/:id — everything about one person: balance and plans, bookings, ficha, agreements,
// timeline, notes and tags; with WhatsApp, access link, book and register payment one tap away.
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, MessageCircle, Link2, CalendarPlus, CircleDollarSign, X, Plus, Check, HeartPulse, Phone, Pencil, MessagesSquare } from "lucide-react";
import { useClienta, useEditarClienta, useEnlaceAcceso, useReservarAdmin } from "../../api/hooks/admin.js";
import { useDisponibilidad } from "../../api/hooks/publico.js";
import { ErrorCaja, Seccion, Avatar, Dato, Vacio } from "../../ui/Basicos.jsx";
import { Esqueleto, EsqueletoLista } from "../../ui/Esqueleto.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { Anillo } from "../../ui/Anillo.jsx";
import { formatoCelular } from "../../ui/Campos.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { Etapa, HojaPago, Compartir } from "./comun.jsx";
import { ICONOS_EVENTO } from "../../shell/Campana.jsx";
import { SelectorClase } from "../reservar/SelectorClase.jsx";
import { FormTu, FormFicha, PERFIL_VACIO } from "../reservar/Ficha.jsx";
import { enlaceWhatsApp, fechaLegible, horaLegible, partesBogota, whatsappLegible, CONSENTIMIENTOS, ESTADO, dinero, primerNombre } from "../../lib/reglas.js";
import { haceTexto, diaRelativo } from "../../lib/fechas.js";
import { nombreClase } from "../../lib/clases.js";
import { textoDetalle } from "../../lib/texto.js";
import { nombreRef } from "../../lib/refs.js";

const CLICS = { gclid: "Google Ads", gbraid: "Google Ads", wbraid: "Google Ads", fbclid: "Meta" };
/** «Por la web: Portada · google / cpc · clic de Google Ads». */
const textoAtribucion = (a) => ["Por la web: " + nombreRef(a.ref), a.utm?.source && `${a.utm.source}${a.utm.medium ? " / " + a.utm.medium : ""}`, a.utm?.campaign && `campaña ${a.utm.campaign}`, a.clic && `clic de ${CLICS[a.clic] || a.clic}`].filter(Boolean).join(" · ");

const fechaDe = (iso) => (iso ? fechaLegible(partesBogota(Date.parse(iso)).fecha) : "");

export default function ClientaDetalle() {
  const { id } = useParams();
  const { data: c, isPending, error, refetch } = useClienta(id);
  const [hoja, setHoja] = useState(null);
  const enlace = useEnlaceAcceso();

  if (isPending) return <div className="space-y-6 pt-4"><div className="flex items-center gap-4"><Esqueleto className="h-[72px] w-[72px] rounded-full" /><div className="space-y-2"><Esqueleto className="h-10 w-56" /><Esqueleto className="h-4 w-40" /></div></div><EsqueletoLista filas={3} /></div>;
  if (error) return <ErrorCaja error={error} reintentar={refetch} />;
  const proximas = c.reservas.filter((r) => [ESTADO.CONFIRMADA, ESTADO.PENDIENTE].includes(r.estado) && r.clase.fecha >= partesBogota(Date.now()).fecha);

  return (
    <div className="max-w-[1080px]">
      <Link to="/admin/clientas" className="-ml-3 mb-2 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-navy hover:bg-white/70"><ArrowLeft size={18} /> Clientas</Link>
      <header className="mb-8 pt-2">
        <div className="flex items-center gap-4 sm:gap-5">
          <Avatar nombre={c.nombre} tam={72} />
          <div className="min-w-0">
            <h1 className="titulo">{c.nombre}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 texto-s suave">
              <Etapa etapa={c.etapa} /><span className="whitespace-nowrap">{c.whatsappTexto}</span>{c.llego && <span>Llegó por {c.llego}</span>}<span>Desde el {fechaLegible(c.desde).replace(/^\S+ /, "")}</span>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Boton tam="s" href={enlaceWhatsApp(c.whatsapp)} icono={<MessageCircle size={16} />}>WhatsApp</Boton>
          <Boton tam="s" variante="suave" icono={<Link2 size={16} />} cargando={enlace.isPending} onClick={() => enlace.mutate(c.id, { onSuccess: () => setHoja("enlace") })}>Enlace de acceso</Boton>
          <Boton tam="s" variante="suave" icono={<CalendarPlus size={16} />} onClick={() => setHoja("reservar")}>Reservar</Boton>
          <Boton tam="s" variante="suave" icono={<CircleDollarSign size={16} />} onClick={() => setHoja("pago")}>Registrar pago</Boton>
          {c.conversacion && <Boton tam="s" variante="fantasma" a={`/admin/mensajes/${c.conversacion.id}`} icono={<MessagesSquare size={16} />}>Conversación{c.conversacion.noLeidos ? ` (${c.conversacion.noLeidos})` : ""}</Boton>}
        </div>
      </header>

      <div className="grid gap-x-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Seccion titulo="Saldo y planes">
            <div className="tarjeta p-5 sm:p-6">
              <div className="flex items-center gap-5">
                <Anillo pct={c.compras[0]?.clases ? Math.round((c.saldo.clases / (c.compras.find((x) => x.estado === "Vigente")?.clases || c.saldo.clases || 1)) * 100) : 0} tam={96} grosor={8} etiqueta={`${c.saldo.clases} clases disponibles`}>
                  <span className="numero text-[2.1rem]">{c.saldo.clases}</span>
                </Anillo>
                <div><p className="font-medium text-navy">{c.saldo.clases === 1 ? "1 clase disponible" : `${c.saldo.clases} clases disponibles`}</p>{c.saldo.venceTexto && <p className="texto-s suave">Vence el {c.saldo.venceTexto}</p>}</div>
              </div>
              {c.compras.length > 0 && (
                <ul className="mt-5 divide-y divide-line border-t border-line">
                  {c.compras.slice(0, 5).map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1"><p className="text-ink">{p.plan}</p><p className="texto-s suave">{fechaLegible(p.fecha)} · {p.medio} · {dinero(p.valor)}</p></div>
                      <span className="text-right texto-s"><span className="block font-medium text-navy">{p.usadas}/{p.clases}</span><span className={`block text-[0.75rem] ${p.estado === "Vigente" ? "text-teal" : "text-muted"}`}>{p.estado}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Seccion>

          <Seccion titulo="Próximas clases">
            {proximas.length ? (
              <ul className="space-y-2">{proximas.map((r) => (
                <li key={r.id}><Link to={`/admin/agenda/${encodeURIComponent(r.clase.id)}`} className="tarjeta flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1"><p className="font-medium text-navy first-letter:uppercase">{diaRelativo(r.clase.fecha)} · {horaLegible(r.clase.hora)}</p><p className="texto-s suave">{nombreClase(r.clase)}</p>{r.atribucion && <p className="mt-1 text-[0.8125rem] text-teal">{textoAtribucion(r.atribucion)}</p>}</div>
                  <span className={`chip ${r.estado === ESTADO.PENDIENTE ? "chip-aviso" : "chip-ok"}`}>{r.estado === ESTADO.PENDIENTE ? "Espera pago" : "Confirmada"}</span>
                </Link></li>
              ))}</ul>
            ) : <p className="tarjeta-suave p-5 texto-s text-ink">Sin clases agendadas.{c.espera.length ? ` En espera para ${c.espera.length === 1 ? "1 clase" : c.espera.length + " clases"}.` : ""}</p>}
          </Seccion>

          <Seccion titulo="Línea de tiempo">
            {c.linea.length ? (
              <ol className="relative ml-2 border-l border-line pl-6">
                {c.linea.map((e) => {
                  const Icono = ICONOS_EVENTO[e.tipo] || Check;
                  return (
                    <li key={e.id} className="relative pb-5 last:pb-0">
                      <span className="absolute -left-[39px] grid h-7 w-7 place-items-center rounded-full bg-white text-navy shadow-card"><Icono size={14} /></span>
                      <p className="font-medium text-navy">{textoDetalle(e.titulo)}</p>
                      {textoDetalle(e.detalle) && <p className="texto-s text-ink">{textoDetalle(e.detalle)}</p>}
                      <p className="text-[0.8125rem] text-muted">{haceTexto(e.ts)}</p>
                    </li>
                  );
                })}
              </ol>
            ) : <Vacio titulo="Sin movimientos todavía" />}
          </Seccion>
        </div>

        <aside className="min-w-0">
          <Seccion titulo="Ficha" accion={<Boton tam="xs" variante="suave" icono={<Pencil size={14} />} onClick={() => setHoja("ficha")}>Editar</Boton>}>
            <dl className="tarjeta grid grid-cols-2 gap-x-4 gap-y-5 p-5">
              <Dato etiqueta="Nacimiento">{c.perfil.nacimiento ? fechaLegible(c.perfil.nacimiento).replace(/^\S+ /, "") : ""}</Dato>
              <Dato etiqueta="Barrio">{c.perfil.barrio}</Dato>
              <Dato etiqueta="Experiencia">{c.perfil.experiencia}</Dato>
              <Dato etiqueta="EPS">{c.perfil.eps}</Dato>
              <Dato etiqueta="Salud" className="col-span-2">{c.perfil.salud && <span className="inline-flex items-start gap-2"><HeartPulse size={16} className="mt-0.5 shrink-0 text-teal" />{c.perfil.salud}</span>}</Dato>
              <Dato etiqueta="Contacto de emergencia" className="col-span-2">{c.perfil.contactoEmergencia?.nombre && (
                <span className="flex items-center gap-2">{c.perfil.contactoEmergencia.nombre} · {whatsappLegible(c.perfil.contactoEmergencia.whatsapp)}
                  {c.perfil.contactoEmergencia.whatsapp && <a href={`tel:+${c.perfil.contactoEmergencia.whatsapp}`} className="grid h-9 w-9 place-items-center rounded-full bg-mist text-navy" aria-label="Llamar"><Phone size={15} /></a>}</span>
              )}</Dato>
              <Dato etiqueta="Intereses" className="col-span-2">{c.perfil.intereses?.length ? <span className="flex flex-wrap gap-1.5">{c.perfil.intereses.map((i) => <span key={i} className="chip !h-auto !min-h-7 !whitespace-normal !py-1">{i}</span>)}</span> : ""}</Dato>
              <Dato etiqueta="Correo" className="col-span-2">{c.perfil.correo}</Dato>
            </dl>
          </Seccion>

          <Seccion titulo="Acuerdos">
            <ul className="tarjeta divide-y divide-line px-5">
              {["descargo", "datos", "sensibles", "imagen", "novedades"].map((k) => {
                const v = c.consentimientos?.[k];
                const texto = k === "imagen" ? (v ? (v.acepta ? "Sí aparece en fotos" : "No quiere fotos") : "Sin responder") : v ? (v.acepta ? "Aceptó" : "No aceptó") : "Sin responder";
                return (
                  <li key={k} className="flex items-center gap-3 py-3">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${v?.acepta ? "bg-[color-mix(in_srgb,var(--color-teal)_12%,white)] text-teal" : "bg-mist text-muted"}`}>{v?.acepta ? <Check size={15} /> : <X size={15} />}</span>
                    <div className="min-w-0 flex-1"><p className="text-[0.9375rem] text-navy">{CONSENTIMIENTOS[k]?.titulo}</p><p className="text-[0.8125rem] text-muted">{texto}{v?.fecha ? ` · ${fechaDe(v.fecha)}` : ""}{v?.version ? ` · ${v.version}` : ""}</p></div>
                  </li>
                );
              })}
            </ul>
          </Seccion>

          <Seccion titulo="Notas y etiquetas"><NotasEtiquetas c={c} /></Seccion>
        </aside>
      </div>

      <Hoja abierta={hoja === "enlace"} alCerrar={() => setHoja(null)} titulo="Enlace de acceso" descripcion={`Con este enlace, ${primerNombre(c.nombre)} entra a la app sin código. Envíaselo solo a ella.`}>
        {enlace.data && <Compartir {...enlace.data} />}
      </Hoja>
      <HojaReservar c={c} abierta={hoja === "reservar"} cerrar={() => setHoja(null)} />
      <HojaPago abierta={hoja === "pago"} cerrar={() => setHoja(null)} clienta={c} />
      <HojaFicha c={c} abierta={hoja === "ficha"} cerrar={() => setHoja(null)} />
    </div>
  );
}

function NotasEtiquetas({ c }) {
  const editar = useEditarClienta(c.id);
  const [notas, setNotas] = useState(c.notas || "");
  const [estado, setEstado] = useState("");
  const [nueva, setNueva] = useState("");
  const t = useRef(null);
  useEffect(() => { if (document.activeElement?.id !== "notas-clienta") setNotas(c.notas || ""); }, [c.notas]);
  const guardarNotas = (v) => {
    setNotas(v); setEstado("");
    clearTimeout(t.current);
    t.current = setTimeout(() => { setEstado("guardando"); editar.mutate({ notas: v }, { onSuccess: () => setEstado("guardado"), onError: () => setEstado("error") }); }, 900);
  };
  const etiquetas = c.etiquetas || [];
  const poner = (lista) => editar.mutate({ etiquetas: lista });
  return (
    <div className="tarjeta p-5">
      <div className="flex items-center justify-between"><label htmlFor="notas-clienta" className="etiqueta-sola">Notas</label><span className="text-[0.8125rem] text-muted" aria-live="polite">{estado === "guardando" ? "Guardando…" : estado === "guardado" ? "Guardado" : estado === "error" ? "No se guardó" : ""}</span></div>
      <textarea id="notas-clienta" className="entrada mt-3" value={notas} onChange={(e) => guardarNotas(e.target.value)} placeholder="Lo que conviene recordar de ella." />
      <p className="etiqueta-sola mt-5">Etiquetas</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {etiquetas.map((x) => (
          <span key={x} className="chip !pr-1">{x}<button type="button" onClick={() => poner(etiquetas.filter((y) => y !== x))} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white" aria-label={`Quitar ${x}`}><X size={13} /></button></span>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); const v = nueva.trim(); if (v && !etiquetas.includes(v)) poner([...etiquetas, v]); setNueva(""); }} className="flex items-center">
          <input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nueva etiqueta" aria-label="Nueva etiqueta" className="h-8 w-32 rounded-full border border-dashed border-line bg-transparent px-3 text-[0.8125rem] outline-none focus:border-teal" />
          {nueva && <button type="submit" className="ml-1 grid h-8 w-8 place-items-center rounded-full bg-navy text-paper" aria-label="Agregar etiqueta"><Plus size={15} /></button>}
        </form>
      </div>
    </div>
  );
}

function HojaReservar({ c, abierta, cerrar }) {
  const disp = useDisponibilidad(28);
  const reservar = useReservarAdmin();
  const { avisar } = useAvisos();
  const [clase, setClase] = useState(null);
  const fin = () => { setClase(null); reservar.reset(); cerrar(); };
  const mias = new Set(c.reservas.filter((r) => [ESTADO.CONFIRMADA, ESTADO.PENDIENTE].includes(r.estado)).map((r) => r.clase.id));
  return (
    <Hoja abierta={abierta} alCerrar={fin} titulo={`Reservarle a ${primerNombre(c.nombre)}`} descripcion={c.saldo.clases ? `Tiene ${c.saldo.clases === 1 ? "1 clase" : c.saldo.clases + " clases"}: queda confirmada.` : "No tiene clases: queda apartada esperando el pago."}
      pie={<div className="flex items-center gap-3"><p className="min-w-0 flex-1 texto-s text-ink">{clase ? `${fechaLegible(clase.fecha)}, ${horaLegible(clase.hora)}` : ""}</p><Boton disabled={!clase} cargando={reservar.isPending} onClick={() => reservar.mutate({ clienta: c.id, clase: clase.id }, { onSuccess: () => { avisar("Reservado."); fin(); } })}>Reservar</Boton></div>}>
      {reservar.isError && <p className="campo-error mb-3" role="alert">{reservar.error.mensaje}</p>}
      <SelectorClase clases={(disp.data?.clases || []).filter((x) => !mias.has(x.id))} seleccion={clase?.id} onElegir={setClase} />
    </Hoja>
  );
}

function HojaFicha({ c, abierta, cerrar }) {
  const editar = useEditarClienta(c.id);
  const { avisar } = useAvisos();
  const [p, setP] = useState(PERFIL_VACIO);
  useEffect(() => { if (abierta) setP({ ...PERFIL_VACIO, ...c.perfil, whatsapp: formatoCelular(c.perfil.whatsapp), contactoEmergencia: { nombre: c.perfil.contactoEmergencia?.nombre || "", whatsapp: formatoCelular(c.perfil.contactoEmergencia?.whatsapp || "") } }); }, [abierta, c.perfil]);
  const cambiar = (x) => setP((y) => ({ ...y, ...x }));
  return (
    <Hoja abierta={abierta} alCerrar={cerrar} titulo="Editar ficha" ancho="max-w-[680px]"
      pie={<Boton bloque cargando={editar.isPending} onClick={() => editar.mutate({ ...p, whatsapp: p.whatsapp.replace(/\D/g, ""), contactoEmergencia: { ...p.contactoEmergencia, whatsapp: p.contactoEmergencia.whatsapp.replace(/\D/g, "") }, salud: p.salud === "__contar" ? "" : p.salud }, { onSuccess: () => { avisar("Ficha guardada."); cerrar(); }, onError: (e) => avisar(e.mensaje, { tipo: "error" }) })}>Guardar</Boton>}>
      <div className="space-y-8"><FormTu perfil={p} cambiar={cambiar} errores={editar.error?.campos || {}} /><FormFicha perfil={p} cambiar={cambiar} /></div>
    </Hoja>
  );
}
