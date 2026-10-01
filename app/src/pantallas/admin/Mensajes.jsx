// /app/admin/mensajes[/:id] — the WhatsApp inbox. While the Meta connection is not live, an honest,
// calm state explains what is coming. Free text only inside the 24 h window; templates outside it.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { m } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Search, Send, Check, CheckCheck, Clock, Image as ImagenIcono, FileText, MessageCircle, Plug, LayoutTemplate, CircleAlert, UserRound } from "lucide-react";
import { useWaEstado, useConversaciones, useConversacion, useEnviarMensaje } from "../../api/hooks/admin.js";
import { Encabezado, ErrorCaja, Vacio, Avatar } from "../../ui/Basicos.jsx";
import { Esqueleto, EsqueletoLista } from "../../ui/Esqueleto.jsx";
import { Segmentado } from "../../ui/Segmentado.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { Entrada } from "../../ui/Campos.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { useAhora } from "../../ui/useAhora.js";
import { Etapa } from "./comun.jsx";
import { Simbolo } from "../../ui/Logo.jsx";
import { haceTexto, duracionCorta } from "../../lib/fechas.js";
import { horaLegible, partesBogota, primerNombre } from "../../lib/reglas.js";
import { useEsEscritorio } from "../../ui/useMedia.js";


export default function Mensajes() {
  const { id } = useParams();
  const estado = useWaEstado();
  const escritorio = useEsEscritorio();
  if (estado.isPending) return <EsqueletoLista filas={5} />;
  if (estado.isError) return <ErrorCaja error={estado.error} reintentar={estado.refetch} />;
  if (!estado.data.conectado || estado.data.modo === "desconectado") return <Desconectado estado={estado.data} />;

  return (
    <div className={escritorio ? "grid h-[calc(100dvh-7.25rem)] grid-cols-[360px_minmax(0,1fr)] gap-5" : ""}>
      {(escritorio || !id) && <Lista activa={id} modo={estado.data.modo} />}
      {id ? <Hilo id={id} plantillas={estado.data.plantillas} /> : escritorio && (
        <div className="tarjeta-suave grid place-items-center p-10 text-center"><div><MessageCircle size={32} className="mx-auto text-navy/30" /><p className="mt-3 subtitulo">Elige una conversación</p><p className="texto-s suave mt-1">Las nuevas llegan solas.</p></div></div>
      )}
    </div>
  );
}

function Desconectado({ estado }) {
  return (
    <div className="max-w-[720px]">
      <Encabezado titulo="Mensajes" grande={false} />
      <section className="tarjeta-flota relative overflow-hidden p-7 sm:p-10">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-yoga/60 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <div className="mb-8 flex items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-[20px] bg-navy text-paper"><Simbolo className="h-7 w-auto" /></span>
            <span className="h-px w-10 border-t border-dashed border-navy/40" aria-hidden="true" />
            <span className="grid h-14 w-14 place-items-center rounded-[20px] bg-yoga text-navy"><MessageCircle size={26} /></span>
          </div>
          <h2 className="titulo max-w-[16ch]">Estamos conectando tu WhatsApp.</h2>
          <p className="lead mt-4 max-w-[44ch]">Cuando esté listo, aquí vas a leer y responder a tus clientas sin salir de Casa Lotus, con sus clases y su saldo al lado de cada conversación.</p>
          {estado.faltan?.length > 0 && (
            <div className="mt-8">
              <p className="etiqueta-sola mb-3">Lo que falta para conectarlo</p>
              <ul className="space-y-2">{estado.faltan.map((f) => <li key={f} className="flex items-center gap-3 text-ink"><span className="grid h-6 w-6 place-items-center rounded-full border border-line"><Plug size={12} className="text-muted" /></span>{f}</li>)}</ul>
            </div>
          )}
          <div className="mt-8 rounded-[22px] bg-mist p-5">
            <p className="font-medium text-navy">Mientras tanto, sigue con tu teléfono</p>
            <p className="texto-s mt-1 text-ink">Responde en WhatsApp como siempre. Los botones de WhatsApp de toda la app abren tu WhatsApp con el mensaje ya escrito.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Lista({ activa, modo }) {
  const [filtro, setFiltro] = useState("abiertas");
  const [q, setQ] = useState("");
  const [deb, setDeb] = useState("");
  useEffect(() => { const t = setTimeout(() => setDeb(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data, isPending, error, refetch } = useConversaciones(filtro, deb);
  const sinLeer = (data || []).filter((c) => c.noLeidos > 0).length;
  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h1 className="titulo">Mensajes</h1>
        {modo === "prueba" && <span className="chip chip-aviso mb-1">Modo prueba</span>}
      </div>
      <div className="relative mb-3">
        <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input className="entrada pl-11 !border-transparent shadow-card" type="search" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar conversación" />
      </div>
      <Segmentado className="mb-4 self-start" etiqueta="Filtro" valor={filtro} onCambio={setFiltro} opciones={[{ valor: "abiertas", texto: "Abiertas" }, { valor: "sin-leer", texto: "Sin leer", insignia: filtro !== "sin-leer" && sinLeer ? sinLeer : null }, { valor: "todas", texto: "Todas" }]} />
      <div className="min-h-0 flex-1 overflow-y-auto sin-barra">
        {isPending ? <EsqueletoLista filas={4} /> : error ? <ErrorCaja error={error} reintentar={refetch} /> : data.length ? (
          <ul className="tarjeta divide-y divide-line overflow-hidden">
            {data.map((c) => (
              <li key={c.id}>
                <Link to={`/admin/mensajes/${c.id}`} aria-current={activa === c.id ? "true" : undefined} className={`flex items-center gap-3 px-4 py-3.5 ${activa === c.id ? "bg-mist" : "hover:bg-mist/60"}`}>
                  <Avatar nombre={c.nombre} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate ${c.noLeidos ? "font-semibold text-navy" : "font-medium text-navy"}`}>{c.nombre}</span>
                      <span className={`shrink-0 text-[0.75rem] ${c.noLeidos ? "font-semibold text-teal" : "text-muted"}`}>{c.ultimoMensaje ? haceTexto(c.ultimoMensaje.ts) : ""}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className={`min-w-0 flex-1 truncate texto-s ${c.noLeidos ? "text-ink" : "text-muted"}`}>{c.ultimoMensaje?.direccion === "saliente" ? "Tú: " : ""}{c.ultimoMensaje?.texto}</p>
                      {c.noLeidos > 0 && <span className="insignia insignia-lima">{c.noLeidos}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : <Vacio titulo={filtro === "sin-leer" ? "Todo leído" : "Sin conversaciones"} />}
      </div>
    </div>
  );
}

function Hilo({ id, plantillas = [] }) {
  const { data, isPending, error, refetch } = useConversacion(id);
  const enviar = useEnviarMensaje(id);
  const ahora = useAhora(60000);
  const { avisar } = useAvisos();
  const navegar = useNavigate();
  const [texto, setTexto] = useState("");
  const [elegir, setElegir] = useState(false);
  const fin = useRef(null);
  const qc = useQueryClient();
  useEffect(() => { fin.current?.scrollIntoView({ block: "end" }); }, [data?.mensajes?.length]);
  // opening a conversation marks it read on the server: refresh the list's badges
  useEffect(() => { if (data?.conversacion?.id) qc.invalidateQueries({ queryKey: ["admin", "wa", "conversaciones"] }); }, [data?.conversacion?.id, qc]);

  if (isPending) return <div className="space-y-3"><Esqueleto className="h-16 rounded-[28px]" /><Esqueleto className="h-80 rounded-[28px]" /></div>;
  if (error) return <ErrorCaja error={error} reintentar={refetch} />;
  const { conversacion: cv, mensajes, clienta } = data;
  const vence = cv.ventanaHasta ? Date.parse(cv.ventanaHasta) - ahora : 0;
  const abierta = vence > 0;
  const mandar = (cuerpo) => enviar.mutate(cuerpo, { onError: (e) => avisar(e.mensaje, { tipo: "error" }) });

  return (
    <section className="flex min-h-[calc(100dvh-12rem)] flex-col lg:min-h-0" aria-label={`Conversación con ${cv.nombre}`}>
      <header className="tarjeta mb-3 flex items-center gap-3 p-3 pr-4">
        <button type="button" onClick={() => navegar("/admin/mensajes")} className="grid h-11 w-11 place-items-center rounded-full text-navy hover:bg-mist lg:hidden" aria-label="Volver"><ArrowLeft size={19} /></button>
        <Avatar nombre={cv.nombre} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-navy">{cv.nombre}</p>
          <p className={`flex items-center gap-1.5 text-[0.8125rem] ${abierta ? "text-teal" : "text-muted"}`}>
            {abierta ? <><span className="vivo !h-1.5 !w-1.5" />Ventana abierta · {duracionCorta(vence)}</> : <><Clock size={13} />Ventana cerrada: solo plantillas</>}
          </p>
        </div>
        {clienta ? <Link to={`/admin/clientas/${clienta.id}`} className="hidden items-center gap-2 sm:flex"><Etapa etapa={clienta.etapa} /><span className="texto-s text-teal underline underline-offset-4">Ver ficha</span></Link>
          : <span className="chip"><UserRound size={13} />Sin ficha</span>}
      </header>

      <div className="tarjeta-suave min-h-0 flex-1 overflow-y-auto p-4 sm:p-5" role="log" aria-live="polite">
        <ol className="flex flex-col gap-2">
          {mensajes.map((msg, i) => {
            const mio = msg.direccion === "saliente";
            const dia = partesBogota(Date.parse(msg.ts)).fecha;
            const nuevoDia = i === 0 || partesBogota(Date.parse(mensajes[i - 1].ts)).fecha !== dia;
            return (
              <li key={msg.id} className="flex flex-col">
                {nuevoDia && <p className="my-3 self-center rounded-full bg-white px-3 py-1 text-[0.75rem] text-muted">{haceTexto(msg.ts).startsWith("hace") || haceTexto(msg.ts) === "ahora" ? "Hoy" : haceTexto(msg.ts)}</p>}
                <m.div initial={msg.estado === "enviando" ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }}
                  className={`max-w-[82%] rounded-[20px] px-4 py-2.5 ${mio ? "self-end rounded-br-md bg-navy text-paper" : "self-start rounded-bl-md bg-white text-ink shadow-card"}`}>
                  {msg.tipo === "plantilla" && <p className={`mb-1 flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] ${mio ? "text-paper/60" : "text-muted"}`}><LayoutTemplate size={11} />Plantilla</p>}
                  {msg.tipo === "imagen" ? <p className="flex items-center gap-2 italic opacity-80"><ImagenIcono size={16} />Imagen (ábrela en WhatsApp)</p>
                    : msg.tipo === "documento" ? <p className="flex items-center gap-2 italic opacity-80"><FileText size={16} />Documento</p>
                      : <p className="whitespace-pre-wrap text-[0.9375rem] leading-snug" data-seleccionable>{msg.texto}</p>}
                  <p className={`mt-1 flex items-center justify-end gap-1 text-[0.6875rem] ${mio ? "text-paper/60" : "text-muted"}`}>
                    {horaLegible(partesBogota(Date.parse(msg.ts)).hora)}
                    {mio && (msg.estado === "enviando" ? <Clock size={12} /> : msg.estado === "leido" ? <CheckCheck size={13} className="text-lime" /> : msg.estado === "entregado" ? <CheckCheck size={13} /> : msg.estado === "fallido" ? <CircleAlert size={13} className="text-error" /> : <Check size={13} />)}
                  </p>
                </m.div>
              </li>
            );
          })}
        </ol>
        <div ref={fin} />
      </div>

      {abierta ? (
        <form className="mt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const t = texto.trim(); if (!t) return; setTexto(""); mandar({ texto: t }); }}>
          <label htmlFor="mensaje" className="sr-only">Escribe un mensaje</label>
          <textarea id="mensaje" rows={1} className="entrada !min-h-[52px] max-h-40 resize-none !rounded-[26px] !py-3.5" placeholder={`Escríbele a ${primerNombre(cv.nombre)}…`} value={texto}
            onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && matchMedia("(hover: hover)").matches) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} />
          <button type="button" onClick={() => setElegir(true)} className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-white text-navy shadow-card" aria-label="Usar una plantilla"><LayoutTemplate size={19} /></button>
          <button type="submit" disabled={!texto.trim()} className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-navy text-paper disabled:opacity-40" aria-label="Enviar"><Send size={19} /></button>
        </form>
      ) : (
        <div className="mt-3 flex items-center gap-3 rounded-[24px] bg-white p-3 pl-5 shadow-card">
          <p className="min-w-0 flex-1 texto-s text-ink">Pasaron más de 24 horas desde su último mensaje. WhatsApp solo deja escribir con una plantilla aprobada.</p>
          <Boton tam="s" icono={<LayoutTemplate size={16} />} onClick={() => setElegir(true)}>Plantilla</Boton>
        </div>
      )}
      <HojaPlantilla abierta={elegir} cerrar={() => setElegir(false)} plantillas={plantillas} nombre={cv.nombre} enviar={(cuerpo) => { setElegir(false); mandar(cuerpo); }} />
    </section>
  );
}

function HojaPlantilla({ abierta, cerrar, plantillas, nombre, enviar }) {
  const aprobadas = plantillas.filter((p) => p.estadoMeta === "APPROVED" && p.categoria !== "AUTHENTICATION");
  const [sel, setSel] = useState(null);
  const [vars, setVars] = useState([]);
  useEffect(() => { if (sel) setVars(sel.variables.map((v) => (v === "nombre" ? primerNombre(nombre) : ""))); }, [sel, nombre]);
  const vista = useMemo(() => (sel ? sel.cuerpo.replace(/\{\{(\d+)\}\}/g, (_, i) => vars[i - 1] || `[${sel.variables[i - 1]}]`) : ""), [sel, vars]);
  const fin = () => { setSel(null); cerrar(); };
  return (
    <Hoja abierta={abierta} alCerrar={fin} titulo={sel ? "Completa la plantilla" : "Elige una plantilla"} descripcion={sel ? sel.uso : "Solo las aprobadas por WhatsApp."}>
      {!sel ? (
        <ul className="space-y-2">
          {aprobadas.map((p) => (
            <li key={p.nombre}><button type="button" onClick={() => setSel(p)} className="tarjeta w-full p-4 text-left">
              <p className="flex items-center justify-between gap-2 font-medium text-navy">{p.nombre.replace(/_/g, " ")}<span className="chip">{p.categoria === "MARKETING" ? "Promoción" : "Servicio"}</span></p>
              <p className="mt-1 line-clamp-2 texto-s suave">{p.cuerpo}</p>
            </button></li>
          ))}
          {!aprobadas.length && <Vacio titulo="Todavía no hay plantillas aprobadas" />}
        </ul>
      ) : (
        <div className="space-y-4">
          {sel.variables.map((v, i) => <Entrada key={v} etiqueta={v[0].toUpperCase() + v.slice(1)} valor={vars[i]} onCambio={(x) => setVars(vars.map((y, j) => (j === i ? x : y)))} />)}
          <div className="rounded-[20px] rounded-br-md bg-navy p-4 text-[0.9375rem] text-paper">{vista}</div>
          <div className="flex gap-2"><Boton variante="suave" onClick={() => setSel(null)}>Otra</Boton><Boton className="flex-1" icono={<Send size={16} />} disabled={vars.some((x) => !x.trim())} onClick={() => enviar({ plantilla: sel.nombre, variables: vars })}>Enviar</Boton></div>
        </div>
      )}
    </Hoja>
  );
}
