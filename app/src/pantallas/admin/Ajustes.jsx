// /app/admin/ajustes — the studio's rules (grouped), plans, notifications on this phone, install, system health.
import { useEffect, useState } from "react";
import { Check, BellRing, Database, MessageCircle, Mail, Smartphone, CircleAlert, FlaskConical } from "lucide-react";
import { useAjustes, useGuardarAjustes, usePlanes, useGuardarPlan, useSalud, useSuscribirPush, usePushClave } from "../../api/hooks/admin.js";
import { Encabezado, Seccion, ErrorCaja } from "../../ui/Basicos.jsx";
import { Esqueleto } from "../../ui/Esqueleto.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { Entrada, Interruptor } from "../../ui/Campos.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { InstalarTarjeta } from "../../shell/Instalar.jsx";
import { suscribirPush, pushDisponible, permisoPush } from "../../lib/push.js";
import { dinero, normalizaWhatsApp } from "../../lib/reglas.js";
import { formatoCelular } from "../../lib/celular.js";
import { esDemo } from "../../api/modo.js";

const GRUPOS = [
  { titulo: "Reservas", claves: ["Horas mínimas para reservar", "Horas para pagar una reserva web", "Horas mínimas para cancelar", "Cambios permitidos clase de prueba"] },
  { titulo: "Clases", claves: ["Cupos por clase", "Mínimo de personas", "Semanas de clases hacia adelante"] },
  { titulo: "Avisos", claves: ["Aviso de saldo bajo (clases)", "Días para avisar vencimiento", "Correo para avisos"] },
  { titulo: "Pagos", claves: ["WhatsApp de reservas", "Llave de pago", "Pago por clase a profes"] },
];
const UNIDAD = { "Horas mínimas para reservar": "horas", "Horas para pagar una reserva web": "horas", "Horas mínimas para cancelar": "horas", "Cambios permitidos clase de prueba": "cambios", "Cupos por clase": "columpios", "Mínimo de personas": "personas", "Semanas de clases hacia adelante": "semanas", "Aviso de saldo bajo (clases)": "clases", "Días para avisar vencimiento": "días" };

export default function Ajustes() {
  const ajustes = useAjustes();
  const [plan, setPlan] = useState(null);
  useEffect(() => { if (location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 400); }, []);
  return (
    <div className="max-w-[860px]">
      <Encabezado titulo="Ajustes" grande={false} lead="Las reglas del estudio. Lo que cambies aquí cambia en la hoja y en la página." />
      {ajustes.isPending ? <Esqueleto className="h-80 rounded-[28px]" /> : ajustes.isError ? <ErrorCaja error={ajustes.error} reintentar={ajustes.refetch} /> : (
        GRUPOS.map((g) => (
          <Seccion key={g.titulo} titulo={g.titulo}>
            <ul className="tarjeta divide-y divide-line px-5">
              {g.claves.map((k) => { const a = ajustes.data.find((x) => x.ajuste === k); return a ? <FilaAjuste key={k} a={a} /> : null; })}
            </ul>
          </Seccion>
        ))
      )}
      <Planes abrir={setPlan} />
      <Notificaciones />
      <Seccion titulo="La app"><InstalarTarjeta siempre titulo="Instala el panel en tu teléfono" texto="Abre más rápido y recibes las reservas como notificación." /></Seccion>
      <Sistema />
      <HojaPlan plan={plan} cerrar={() => setPlan(null)} />
    </div>
  );
}

function FilaAjuste({ a }) {
  const guardar = useGuardarAjustes();
  const numerico = Boolean(UNIDAD[a.ajuste]);
  const dinero_ = a.ajuste === "Pago por clase a profes";
  const celular = a.ajuste === "WhatsApp de reservas";
  const [v, setV] = useState(celular ? formatoCelular(a.valor) : a.valor);
  const [ok, setOk] = useState(false);
  useEffect(() => setV(celular ? formatoCelular(a.valor) : a.valor), [a.valor, celular]);
  const enviar = () => {
    const valor = celular ? normalizaWhatsApp(v) : v;
    if (celular && !valor) { setV(formatoCelular(a.valor)); return; }
    if (String(valor) === String(a.valor)) return;
    guardar.mutate({ [a.ajuste]: valor }, { onSuccess: () => { setOk(true); setTimeout(() => setOk(false), 1800); } });
  };
  return (
    <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <label htmlFor={`aj-${a.ajuste}`} className="font-medium text-navy">{a.ajuste}</label>
        <p className="texto-s suave">{a.ayuda}{dinero_ ? " Solo lo ves tú." : ""}</p>
      </div>
      <div className="flex items-center gap-2 sm:w-[240px]">
        <input id={`aj-${a.ajuste}`} className="entrada !min-h-11 text-right" value={dinero_ && v ? dinero(v) : v} inputMode={celular ? "tel" : numerico || dinero_ ? "numeric" : undefined}
          onChange={(e) => setV(celular ? formatoCelular(e.target.value) : numerico || dinero_ ? e.target.value.replace(/\D/g, "") : e.target.value)} onBlur={enviar} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} placeholder={dinero_ ? "Sin definir" : ""} />
        {UNIDAD[a.ajuste] && <span className="w-16 shrink-0 texto-s suave">{UNIDAD[a.ajuste]}</span>}
        <span className="grid h-6 w-6 shrink-0 place-items-center" aria-live="polite">{ok && <Check size={18} className="text-teal" aria-label="Guardado" />}{guardar.isError && <CircleAlert size={18} className="text-error" aria-label={guardar.error.mensaje} />}</span>
      </div>
    </li>
  );
}

function Planes({ abrir }) {
  const { data, isPending } = usePlanes();
  return (
    <Seccion titulo="Planes" ayuda="Los precios que ve la página y los que se proponen al confirmar un pago.">
      {isPending ? <Esqueleto className="h-48 rounded-[28px]" /> : (
        <ul className="tarjeta divide-y divide-line px-5">
          {data.map((p) => (
            <li key={p.nombre}>
              <button type="button" onClick={() => abrir(p)} className={`flex w-full items-center gap-4 py-3.5 text-left ${p.activo ? "" : "opacity-50"}`}>
                <div className="min-w-0 flex-1"><p className="font-medium text-navy">{p.nombre}</p><p className="texto-s suave">{p.tipo === "Ajuste" ? "Para pasar saldos viejos" : `${p.clases} ${p.clases === 1 ? "clase" : "clases"} · ${p.vigencia} días`}{p.activo ? "" : " · inactivo"}</p></div>
                <span className="font-display text-xl text-navy">{p.tipo === "Ajuste" ? "—" : dinero(p.precio)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}

function HojaPlan({ plan, cerrar }) {
  const guardar = useGuardarPlan();
  const { avisar } = useAvisos();
  const [f, setF] = useState({});
  useEffect(() => { if (plan) setF({ precio: String(plan.precio), clases: String(plan.clases), vigencia: String(plan.vigencia), activo: plan.activo }); }, [plan]);
  return (
    <Hoja abierta={Boolean(plan)} alCerrar={cerrar} titulo={plan?.nombre} descripcion={plan?.tipo}>
      {plan && (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); guardar.mutate({ nombre: plan.nombre, precio: Number(f.precio), clases: Number(f.clases), vigencia: Number(f.vigencia), activo: f.activo }, { onSuccess: () => { avisar("Plan guardado."); cerrar(); } }); }}>
          <Entrada etiqueta="Precio" valor={f.precio ? dinero(f.precio) : ""} onCambio={(v) => setF({ ...f, precio: v.replace(/\D/g, "") })} inputMode="numeric" />
          <div className="grid grid-cols-2 gap-3">
            <Entrada etiqueta="Clases" valor={f.clases} onCambio={(v) => setF({ ...f, clases: v.replace(/\D/g, "") })} inputMode="numeric" />
            <Entrada etiqueta="Vigencia (días)" valor={f.vigencia} onCambio={(v) => setF({ ...f, vigencia: v.replace(/\D/g, "") })} inputMode="numeric" />
          </div>
          <Interruptor activo={f.activo} onCambio={(v) => setF({ ...f, activo: v })} etiqueta="Activo" ayuda="Si lo apagas, deja de verse en la página." />
          {guardar.isError && <p className="campo-error" role="alert">{guardar.error.mensaje}</p>}
          <Boton type="submit" bloque tam="l" cargando={guardar.isPending}>Guardar</Boton>
        </form>
      )}
    </Hoja>
  );
}

function Notificaciones() {
  const clave = usePushClave();
  const suscribir = useSuscribirPush();
  const { avisar } = useAvisos();
  const [permiso, setPermiso] = useState(permisoPush());
  const activar = async () => {
    if (esDemo) return avisar("En la demo no se envían notificaciones. En tu teléfono, con la app instalada, sí.");
    try {
      const sub = await suscribirPush(clave.data?.clavePublica);
      await suscribir.mutateAsync(sub);
      setPermiso("granted");
      avisar("Listo: las reservas nuevas te llegan como notificación.");
    } catch (e) { setPermiso(permisoPush()); avisar(e.mensaje || e.message, { tipo: "error" }); }
  };
  return (
    <Seccion titulo="Notificaciones" id="notificaciones">
      <div className="tarjeta flex items-center gap-4 p-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-mist text-navy"><BellRing size={21} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-navy">Avisos en este teléfono</p>
          <p className="texto-s suave">{permiso === "granted" ? "Activados: te avisamos de reservas, pagos y cancelaciones." : permiso === "denied" ? "Están bloqueados. Actívalos en los ajustes del teléfono para esta app." : !pushDisponible() ? "Instala la app para recibirlos (en iPhone, desde Safari)." : "Una notificación cuando alguien reserve, pague o cancele."}</p>
        </div>
        {permiso !== "granted" && permiso !== "denied" && <Boton tam="s" cargando={suscribir.isPending} onClick={activar}>Activar</Boton>}
      </div>
    </Seccion>
  );
}

function Sistema() {
  const { data } = useSalud();
  const [waOff, setWaOff] = useState(() => { try { return sessionStorage.getItem("cl_demo_wa") === "off"; } catch { return false; } });
  if (!data) return null;
  const filas = [
    { Icono: Database, t: "Datos", v: data.datos === "sheets" ? "Conectado a la hoja" : "En memoria (demo o prueba)", ok: data.datos === "sheets" || esDemo },
    { Icono: Database, t: "La hoja", v: data.hoja?.ok ? "Completa" : `Faltan columnas: ${(data.hoja?.faltan || []).join(", ")}`, ok: data.hoja?.ok },
    { Icono: MessageCircle, t: "WhatsApp", v: data.whatsapp?.modo === "produccion" ? "Conectado" : data.whatsapp?.modo === "prueba" ? "Modo prueba" : "Sin conectar", ok: data.whatsapp?.modo !== "desconectado" },
    { Icono: Mail, t: "Correo", v: data.correo?.ok ? "Funciona" : "Sin configurar", ok: data.correo?.ok },
    { Icono: Smartphone, t: "Notificaciones", v: data.push?.activo ? `${data.push.suscripciones || 0} teléfonos` : "Sin configurar", ok: data.push?.activo },
  ];
  return (
    <Seccion titulo="Estado del sistema" id="sistema" ayuda={`Versión ${data.version}`}>
      <ul className="tarjeta divide-y divide-line px-5">
        {filas.map(({ Icono, t, v, ok }) => (
          <li key={t} className="flex items-center gap-3 py-3.5">
            <Icono size={18} className="shrink-0 text-muted" />
            <span className="flex-1 text-navy">{t}</span>
            <span className={`chip ${ok ? "chip-ok" : "chip-aviso"}`}>{v}</span>
          </li>
        ))}
      </ul>
      {esDemo && (
        <div className="mt-4 rounded-[22px] border border-dashed border-line p-4">
          <p className="mb-1 flex items-center gap-2 etiqueta-sola"><FlaskConical size={14} />Demo</p>
          <Interruptor activo={waOff} etiqueta="Simular WhatsApp sin conectar" ayuda="Para ver cómo se ve Mensajes antes de conectar Meta."
            onCambio={(v) => { setWaOff(v); try { if (v) sessionStorage.setItem("cl_demo_wa", "off"); else sessionStorage.removeItem("cl_demo_wa"); } catch { /* ignore */ } location.reload(); }} />
        </div>
      )}
    </Seccion>
  );
}

