// Pieces several of Ana's screens share: pending payments, confirm-payment sheet, alerts, stage badges,
// a client picker, a register-payment sheet, and copy/share for links.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { MessageCircle, Clock, AlertTriangle, CalendarCheck, Users, Wallet, Cake, ClipboardList, Hourglass, Sparkles, ChevronRight, Copy, Check, Search, Share2, CircleDollarSign, CalendarClock, UserX, UserRoundSearch } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { Avatar, TagClase } from "../../ui/Basicos.jsx";
import { Selector, Entrada } from "../../ui/Campos.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { useAhora } from "../../ui/useAhora.js";
import { usePlanes, useConfirmar, useClientas, useRegistrarPago } from "../../api/hooks/admin.js";
import { api, id } from "../../api/cliente.js";
import { K } from "../../api/claves.js";
import { foto, restaurar } from "../../api/hooks/comun.js";
import { MEDIOS, dinero, fechaLegible, horaLegible, hoyClave, primerNombre } from "../../lib/reglas.js";
import { duracionCorta, diaRelativo } from "../../lib/fechas.js";
import { nombreClase } from "../../lib/clases.js";
import { textoDetalle } from "../../lib/texto.js";

export const ETAPAS = {
  lead: { texto: "Interesada", clase: "chip" },
  prueba: { texto: "Prueba", clase: "chip !bg-pilates" },
  activa: { texto: "Activa", clase: "chip chip-ok" },
  "en-riesgo": { texto: "En riesgo", clase: "chip chip-aviso" },
  inactiva: { texto: "Inactiva", clase: "chip chip-blanco !text-muted" },
};
export const Etapa = ({ etapa }) => { const e = ETAPAS[etapa] || ETAPAS.lead; return <span className={e.clase}>{e.texto}</span>; };

export function SaldoPill({ saldo }) {
  const n = saldo?.clases ?? 0;
  return <span className={`chip ${n === 0 ? "" : n <= 2 ? "chip-aviso" : "chip-ok"}`}>{n === 0 ? "Sin clases" : n === 1 ? "1 clase" : `${n} clases`}</span>;
}

/** A pending payment: who, which class, how long the hold lasts, and the three actions. */
export function TarjetaPendiente({ p, nueva }) {
  const ahora = useAhora(30000);
  const [confirmar, setConfirmar] = useState(false);
  const qc = useQueryClient();
  const { programar } = useAvisos();
  const vence = p.venceApartado ? Date.parse(p.venceApartado) - ahora : NaN;
  const urgente = Number.isFinite(vence) && vence < 2 * 3600000;
  const liberar = () => {
    const instantanea = foto(qc);
    programar({
      texto: `Liberaste el columpio de ${primerNombre(p.nombre)}.`,
      aplicar: () => qc.setQueryData(K.tablero, (t) => t && { ...t, pendientes: t.pendientes.filter((x) => x.reserva !== p.reserva), kpis: { ...t.kpis, pendientesPago: Math.max(0, t.kpis.pendientesPago - 1) } }),
      revertir: () => restaurar(qc, instantanea),
      confirmar: async () => { await api.post(`/api/admin/reservas/${id(p.reserva)}/liberar`); qc.invalidateQueries({ queryKey: ["admin"] }); },
    });
  };
  return (
    <article className={`tarjeta p-5 ${nueva ? "ring-2 ring-lime" : ""}`}>
      <div className="flex items-start gap-3">
        <Avatar nombre={p.nombre} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/admin/clientas/${p.clienta}`} className="font-medium text-navy hover:underline">{p.nombre}</Link>
            {nueva && <span className="chip !bg-lime !text-navy-900"><Sparkles size={12} />Nueva</span>}
          </div>
          <p className="texto-s text-ink first-letter:uppercase">{diaRelativo(p.clase.fecha)} · {horaLegible(p.clase.hora)} · {nombreClase(p.clase)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Number.isFinite(vence) && <span className={`chip ${urgente ? "chip-error" : "chip-aviso"}`}><Clock size={13} />{vence > 0 ? `Se libera en ${duracionCorta(vence)}` : "Apartado vencido"}</span>}
            {p.origen && <span className="chip">{p.origen}</span>}
          </div>
          {p.saldo > 0 && <p className="mt-2 texto-s text-teal">Tiene {p.saldo === 1 ? "1 clase" : p.saldo + " clases"} en su plan: no necesita pagar esta.</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Boton tam="s" icono={<CircleDollarSign size={16} />} onClick={() => setConfirmar(true)}>{p.saldo > 0 ? "Confirmar" : "Ya pagó"}</Boton>
        <a href={p.waEnlace} target="_blank" rel="noopener noreferrer" className="btn btn-suave btn-s btn-icono" aria-label={`Escribirle a ${primerNombre(p.nombre)} por WhatsApp`} title="WhatsApp"><MessageCircle size={18} /></a>
        <Boton tam="s" variante="fantasma" onClick={liberar}>Liberar</Boton>
      </div>
      <HojaConfirmar p={confirmar ? p : null} cerrar={() => setConfirmar(false)} />
    </article>
  );
}

/** Confirm a hold: with her plan (one tap) or with a payment (plan, medio, valor prefilled). */
export function HojaConfirmar({ p, cerrar }) {
  const planes = usePlanes();
  const confirmar = useConfirmar();
  const { avisar } = useAvisos();
  const lista = (planes.data || []).filter((x) => x.activo && x.tipo !== "Ajuste");
  const [plan, setPlan] = useState("");
  const [medio, setMedio] = useState("Nequi");
  const [valor, setValor] = useState("");
  useEffect(() => {
    if (!p || !lista.length) return;
    const inicial = lista.find((x) => x.nombre === p.plan) || lista.find((x) => x.tipo === "Prueba") || lista[0];
    setPlan(inicial.nombre); setValor(String(inicial.precio));
  }, [p, planes.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const elegir = (n) => { setPlan(n); const x = lista.find((y) => y.nombre === n); if (x) setValor(String(x.precio)); };
  // mutateAsync: the toast shows even when the confirmed card (and this sheet with it) leaves the screen;
  // a failure keeps the sheet open with the reason inside it.
  const enviar = async (conPago) => {
    const nombre = primerNombre(p.nombre);
    try {
      await confirmar.mutateAsync({ reserva: p.reserva, pago: conPago ? { plan, medio, valor: Number(valor.replace(/\D/g, "")) } : undefined });
      avisar(`Listo: ${nombre} quedó confirmada.`);
      cerrar();
    } catch { /* shown below, from confirmar.error */ }
  };
  return (
    <Hoja abierta={Boolean(p)} alCerrar={cerrar} titulo={p ? `Confirmar a ${primerNombre(p.nombre)}` : ""} descripcion={p ? `${fechaLegible(p.clase.fecha)}, ${horaLegible(p.clase.hora)}` : ""}>
      {p && (
        <div className="space-y-5">
          {p.saldo > 0 && (
            <div className="rounded-[22px] bg-[color-mix(in_srgb,var(--color-teal)_8%,white)] p-5">
              <p className="font-medium text-teal">Tiene {p.saldo === 1 ? "1 clase" : p.saldo + " clases"} en su plan.</p>
              <Boton className="mt-3" bloque cargando={confirmar.isPending && !confirmar.variables?.pago} onClick={() => enviar(false)}>Confirmar con su plan</Boton>
              <p className="mt-4 texto-s suave">¿Pagó algo nuevo? Regístralo abajo.</p>
            </div>
          )}
          <Selector etiqueta="¿Qué pagó?" valor={plan} onCambio={elegir} opciones={lista.map((x) => ({ valor: x.nombre, texto: `${x.nombre} · ${dinero(x.precio)}` }))} />
          <div className="grid grid-cols-2 gap-3">
            <Selector etiqueta="¿Por dónde?" valor={medio} onCambio={setMedio} opciones={MEDIOS} />
            <Entrada etiqueta="Valor" valor={valor ? dinero(valor.replace(/\D/g, "")) : ""} onCambio={(v) => setValor(v.replace(/\D/g, ""))} inputMode="numeric" />
          </div>
          {confirmar.isError && <p className="campo-error" role="alert">{confirmar.error.mensaje}</p>}
          <Boton bloque tam="l" punto cargando={confirmar.isPending && Boolean(confirmar.variables?.pago)} onClick={() => enviar(true)}>Ya pagó · Confirmar</Boton>
        </div>
      )}
    </Hoja>
  );
}

const ICONO_ALERTA = {
  "pago-por-vencer": [Clock, "bg-error-bg text-error"], "sin-marcar": [CalendarCheck, "bg-aviso-bg text-aviso"], "poca-gente": [Users, "bg-aviso-bg text-aviso"],
  "saldo-bajo": [Wallet, "bg-mist text-navy"], "vence-pronto": [CalendarClock, "bg-mist text-navy"], "sin-clases": [Wallet, "bg-mist text-navy"],
  "prueba-sin-plan": [Sparkles, "bg-pilates text-navy"], cumple: [Cake, "bg-multinivel text-navy"], "cupo-liberado": [Hourglass, "bg-yoga text-navy"],
  "ficha-incompleta": [ClipboardList, "bg-mist text-navy"], "necesita-reemplazo": [UserX, "bg-error-bg text-error"],
  "sin-profe": [UserRoundSearch, "bg-aviso-bg text-aviso"], "vino-sin-plan": [CircleDollarSign, "bg-error-bg text-error"],
};

/** Server routes are absolute ("/app/admin/…"); the router already lives under /app. */
export const rutaApp = (ruta = "") => ruta.replace(/^\/app(?=\/|$)/, "") || "/";

export function FilaAlerta({ a }) {
  const [Icono, color] = ICONO_ALERTA[a.tipo] || [AlertTriangle, "bg-mist text-navy"];
  const destino = a.accion?.tipo === "abrir" ? rutaApp(a.accion.ruta) : a.clienta ? `/admin/clientas/${a.clienta.id}` : null;
  return (
    <li className="flex items-center gap-3 py-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${color}`}><Icono size={18} strokeWidth={1.8} /></span>
      {destino ? (
        <Link to={destino} className="min-w-0 flex-1 rounded-xl"><span className="block font-medium leading-snug text-navy">{textoDetalle(a.titulo)}</span><span className="block texto-s suave">{textoDetalle(a.detalle)}</span></Link>
      ) : <div className="min-w-0 flex-1"><p className="font-medium leading-snug text-navy">{textoDetalle(a.titulo)}</p><p className="texto-s suave">{textoDetalle(a.detalle)}</p></div>}
      {a.accion?.tipo === "whatsapp" ? (
        <a href={a.accion.enlace} target="_blank" rel="noopener" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-navy text-paper hover:bg-navy-900" aria-label={`Escribir por WhatsApp: ${a.titulo}`}><MessageCircle size={18} /></a>
      ) : destino ? <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" /> : null}
    </li>
  );
}

/** Find a clienta by name or WhatsApp. */
export function BuscarClienta({ onElegir, excluir = [] }) {
  const [q, setQ] = useState("");
  const [deb, setDeb] = useState("");
  useEffect(() => { const t = setTimeout(() => setDeb(q), 220); return () => clearTimeout(t); }, [q]);
  const { data, isFetching } = useClientas({ q: deb, orden: "nombre" });
  const lista = (data || []).filter((c) => !excluir.includes(c.id)).slice(0, 30);
  return (
    <div>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input className="entrada pl-11" type="search" placeholder="Buscar por nombre o WhatsApp" value={q} onChange={(e) => setQ(e.target.value)} data-autofoco="" aria-label="Buscar clienta" />
      </div>
      <ul className={`mt-3 transition-opacity ${isFetching ? "opacity-60" : ""}`}>
        {lista.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onElegir(c)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-mist">
              <Avatar nombre={c.nombre} tam={38} />
              <span className="min-w-0 flex-1"><span className="block font-medium text-navy">{c.nombre}</span><span className="block texto-s suave">{c.whatsappTexto}</span></span>
              <SaldoPill saldo={c.saldo} />
            </button>
          </li>
        ))}
        {!lista.length && !isFetching && <li className="py-6 text-center texto-s suave">No encontré a nadie con ese nombre.</li>}
      </ul>
    </div>
  );
}

/** Register a payment (a plan bought, or a one-time balance adjustment). */
export function HojaPago({ abierta, cerrar, clienta: fija }) {
  const planes = usePlanes();
  const pagar = useRegistrarPago();
  const { avisar } = useAvisos();
  const [clienta, setClienta] = useState(fija || null);
  const [plan, setPlan] = useState("");
  const [medio, setMedio] = useState("Nequi");
  const [valor, setValor] = useState("");
  const [inicio, setInicio] = useState(hoyClave());
  const [clases, setClases] = useState("");
  const lista = useMemo(() => (planes.data || []).filter((x) => x.activo), [planes.data]);
  const elegido = lista.find((x) => x.nombre === plan);
  useEffect(() => { if (abierta) { setClienta(fija || null); setInicio(hoyClave()); setClases(""); pagar.reset(); } }, [abierta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!plan && lista.length) { const x = lista.find((y) => y.nombre === "8 clases al mes") || lista[0]; setPlan(x.nombre); setValor(String(x.precio)); } }, [lista, plan]);
  const elegir = (n) => { setPlan(n); const x = lista.find((y) => y.nombre === n); if (x) setValor(String(x.precio)); };
  return (
    <Hoja abierta={abierta} alCerrar={cerrar} titulo="Registrar un pago" descripcion={clienta ? `${clienta.nombre}. Las clases se suman a su saldo desde el día de inicio.` : "¿Quién pagó?"}>
      {!clienta ? <BuscarClienta onElegir={setClienta} /> : (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); pagar.mutate({ clienta: clienta.id, plan, medio, valor: Number(valor || 0), inicio, clases: elegido?.tipo === "Ajuste" ? Number(clases) : undefined }, { onSuccess: (r) => { avisar(`Pago guardado. ${primerNombre(clienta.nombre)} tiene ${r.saldo.clases === 1 ? "1 clase" : r.saldo.clases + " clases"}.`); cerrar(); } }); }}>
          {!fija && <button type="button" className="flex w-full items-center gap-3 rounded-2xl bg-mist p-3 text-left" onClick={() => setClienta(null)}><Avatar nombre={clienta.nombre} tam={36} /><span className="flex-1 font-medium text-navy">{clienta.nombre}</span><span className="texto-s text-teal">Cambiar</span></button>}
          <Selector etiqueta="Plan" valor={plan} onCambio={elegir} opciones={lista.map((x) => ({ valor: x.nombre, texto: x.tipo === "Ajuste" ? x.nombre : `${x.nombre} · ${dinero(x.precio)}` }))} />
          {elegido?.tipo === "Ajuste" && <Entrada etiqueta="¿Cuántas clases le quedaban?" valor={clases} onCambio={(v) => setClases(v.replace(/\D/g, ""))} inputMode="numeric" ayuda="Úsalo una sola vez, para pasar al sistema el saldo que traía." error={pagar.error?.campos?.clases} />}
          <div className="grid grid-cols-2 gap-3">
            <Selector etiqueta="¿Por dónde?" valor={medio} onCambio={setMedio} opciones={MEDIOS} />
            <Entrada etiqueta="Valor" valor={valor ? dinero(valor) : ""} onCambio={(v) => setValor(v.replace(/\D/g, ""))} inputMode="numeric" />
          </div>
          <Entrada etiqueta="¿Desde qué día cuenta?" type="date" valor={inicio} onCambio={setInicio} />
          {pagar.isError && !pagar.error.campos && <p className="campo-error" role="alert">{pagar.error.mensaje}</p>}
          <Boton type="submit" bloque tam="l" cargando={pagar.isPending}>Guardar el pago</Boton>
        </form>
      )}
    </Hoja>
  );
}

/** A link to share: WhatsApp (prefilled), copy, or the native share sheet. */
export function Compartir({ enlace, waEnlace, waTexto, titulo = "Casa Lotus" }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => { try { await navigator.clipboard.writeText(enlace); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* visible anyway */ } };
  return (
    <div className="space-y-4">
      <p className="break-all rounded-[18px] bg-mist p-4 font-mono text-[0.8125rem] text-ink" data-seleccionable>{enlace}</p>
      <div className="flex flex-wrap gap-2">
        {waEnlace && <Boton href={waEnlace} punto icono={<MessageCircle size={17} />}>Enviar por WhatsApp</Boton>}
        <Boton variante="suave" onClick={copiar} icono={copiado ? <Check size={17} /> : <Copy size={17} />}>{copiado ? "Copiado" : "Copiar"}</Boton>
        {typeof navigator !== "undefined" && navigator.share && <Boton variante="suave" icono={<Share2 size={17} />} onClick={() => navigator.share({ title: titulo, text: waTexto, url: enlace }).catch(() => {})}>Compartir</Boton>}
      </div>
    </div>
  );
}

export { TagClase };
