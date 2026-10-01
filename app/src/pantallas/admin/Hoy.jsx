// /app/admin — Ana's day: the week's occupancy (the number that governs), payments to confirm,
// today's classes as a timeline, alerts by urgency, classes to mark.
import { Link } from "react-router";
import { m } from "motion/react";
import { ArrowRight, Hourglass, Users, Wallet, CircleDollarSign } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTablero } from "../../api/hooks/admin.js";
import { useYo } from "../../api/hooks/auth.js";
import { consultaNovedades } from "../../shell/Campana.jsx";
import { Encabezado, Seccion, ErrorCaja, Vacio } from "../../ui/Basicos.jsx";
import { EsqueletoPagina } from "../../ui/Esqueleto.jsx";
import { Anillo } from "../../ui/Anillo.jsx";
import { ListaEscalonada } from "../../ui/Animado.jsx";
import { useAhora } from "../../ui/useAhora.js";
import { TarjetaClaseEquipo } from "../comun/Clase.jsx";
import { TarjetaPendiente, FilaAlerta } from "./comun.jsx";
import { InstalarTarjeta } from "../../shell/Instalar.jsx";
import { primerNombre, dinero, inicioClase, horaLegible } from "../../lib/reglas.js";
import { mesLegible } from "../../lib/fechas.js";

export default function Hoy() {
  const { data: yo } = useYo();
  const { data: t, isPending, error, refetch } = useTablero();
  const { data: nov } = useQuery({ ...consultaNovedades, enabled: false });
  const ahora = useAhora(60000);
  if (isPending) return <EsqueletoPagina tarjetas={4} />;
  if (error) return <ErrorCaja error={error} reintentar={refetch} />;

  const { kpis } = t;
  const recientes = new Set((nov?.eventos || []).filter((e) => e.tipo === "reserva-web" && ahora - Date.parse(e.ts) < 30 * 60000).map((e) => e.clienta));
  const partes = [];
  partes.push(`La semana va en ${kpis.semana.pct} %.`);
  if (kpis.pendientesPago) partes.push(`Tienes ${kpis.pendientesPago === 1 ? "1 pago" : kpis.pendientesPago + " pagos"} por confirmar`);
  if (t.porMarcar.length) partes.push(`${partes.length > 1 ? "y " : "Tienes "}${t.porMarcar.length === 1 ? "1 clase" : t.porMarcar.length + " clases"} por marcar`);
  const lead = partes.length > 1 ? partes[0] + " " + partes.slice(1).join(" ") + "." : partes[0] + " Todo está al día.";

  return (
    <div>
      <Encabezado eyebrow={t.hoyTexto} titulo={`${t.saludo}, ${primerNombre(yo?.nombre || "Ana")}.`} lead={lead} />

      {/* KPI row: occupancy leads */}
      <div className="scroll-x -mx-5 mb-10 flex scroll-px-5 gap-3 px-5 pb-2 lg:mx-0 lg:grid lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:overflow-visible lg:px-0">
        <m.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="tarjeta-noche flex w-[300px] shrink-0 items-center gap-5 p-5 shadow-float lg:w-auto" aria-label="Ocupación de la semana">
          <Anillo pct={kpis.semana.pct} tam={104} grosor={9} claro etiqueta={`Ocupación de la semana: ${kpis.semana.pct} %`}>
            <span className="font-display text-[1.9rem] leading-none text-paper">{kpis.semana.pct}<span className="text-base text-paper/70"> %</span></span>
          </Anillo>
          <div>
            <p className="etiqueta-sola !text-paper/65">Esta semana</p>
            <p className="mt-2 text-paper"><strong className="font-display text-2xl font-normal">{kpis.semana.ocupados}</strong><span className="text-paper/75"> de {kpis.semana.cupos} columpios</span></p>
            <p className="texto-s text-paper/65">{kpis.semana.clases} clases</p>
          </div>
        </m.section>
        <Kpi a="#por-confirmar" icono={<CircleDollarSign size={18} />} valor={kpis.pendientesPago} texto={kpis.pendientesPago === 1 ? "pago por confirmar" : "pagos por confirmar"} tono={kpis.pendientesPago ? "aviso" : ""} />
        <Kpi a="/admin/clientas?segmento=con-clases" icono={<Users size={18} />} valor={kpis.clientasActivas} texto="clientas con clases" />
        <Kpi a="/admin/pagos" icono={<Wallet size={18} />} valor={dinero(kpis.mes.ingresos)} texto={`en ${mesLegible(t.hoy.slice(0, 7)).split(" ")[0]} · ${kpis.mes.compras} ${kpis.mes.compras === 1 ? "pago" : "pagos"}`} pequeno />
      </div>

      <div className="grid gap-x-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Seccion titulo="Por confirmar" id="por-confirmar" ayuda={t.pendientes.length ? "Cuando llegue el comprobante a tu WhatsApp, confírmalo aquí. Si nadie paga a tiempo, el columpio se libera solo." : null}>
            {t.pendientes.length ? (
              <ListaEscalonada clave="hoy-pendientes" className="grid gap-3">
                {t.pendientes.map((p) => <TarjetaPendiente key={p.reserva} p={p} nueva={recientes.has(p.clienta)} />)}
              </ListaEscalonada>
            ) : <Vacio titulo="Todo al día" texto="No hay reservas esperando pago." />}
          </Seccion>

          <Seccion titulo="Hoy" accion={<Link to="/admin/agenda" className="inline-flex min-h-11 items-center gap-1 texto-s font-medium text-teal">Agenda <ArrowRight size={15} /></Link>}>
            {t.hoyClases.length ? <Linea clases={t.hoyClases} ahora={ahora} /> : (
              <div>
                <Vacio titulo="Hoy no hay clases" texto={t.manana.length ? `Mañana ${t.manana.length === 1 ? "hay 1 clase" : "hay " + t.manana.length + " clases"}, desde las ${horaLegible(t.manana[0].hora)}` : "Tampoco mañana."} />
                {t.manana.length > 0 && <div className="mt-3 grid gap-3">{t.manana.map((c) => <TarjetaClaseEquipo key={c.id} clase={c} a={`/admin/agenda/${encodeURIComponent(c.id)}`} />)}</div>}
              </div>
            )}
          </Seccion>

          {t.porMarcar.length > 0 && (
            <Seccion titulo="Por marcar" ayuda="Clases que ya pasaron y todavía tienen gente sin marcar.">
              <div className="grid gap-3 md:grid-cols-2">{t.porMarcar.map((c) => <TarjetaClaseEquipo key={c.id} clase={c} a={`/admin/agenda/${encodeURIComponent(c.id)}`} mostrarDia compacta />)}</div>
            </Seccion>
          )}
        </div>

        <aside className="min-w-0">
          <Seccion titulo="Avisos" ayuda={t.alertas.length ? "Lo más urgente arriba. Un toque abre WhatsApp con el mensaje listo." : null}>
            {t.alertas.length ? (
              <ul className="tarjeta divide-y divide-line px-4">{t.alertas.slice(0, 12).map((a) => <FilaAlerta key={a.id} a={a} />)}</ul>
            ) : <Vacio titulo="Nada pendiente" texto="Cuando haya algo que avisar, aparece aquí." />}
          </Seccion>
          {kpis.enEspera > 0 && (
            <Link to="/admin/clientas?segmento=agendadas" className="tarjeta mt-4 flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-yoga text-navy"><Hourglass size={18} /></span>
              <span className="flex-1 text-navy"><strong className="font-medium">{kpis.enEspera}</strong> en lista de espera</span>
              <ArrowRight size={16} className="text-muted" />
            </Link>
          )}
          <Seccion titulo="Segmentos">
            <div className="flex flex-wrap gap-2">
              {t.segmentos.filter((s) => s.total > 0).map((s) => (
                <Link key={s.id} to={`/admin/clientas?segmento=${s.id}`} className="chip chip-blanco !min-h-10 !px-3.5 hover:bg-mist">{s.nombre}<span className="font-semibold">{s.total}</span></Link>
              ))}
            </div>
          </Seccion>
          <div className="mt-8"><InstalarTarjeta titulo="Instala el panel" texto="Recibe las reservas al instante, como una app." /></div>
        </aside>
      </div>
    </div>
  );
}

function Kpi({ a, icono, valor, texto, tono, pequeno }) {
  const Tag = a.startsWith("#") ? "a" : Link;
  const props = a.startsWith("#") ? { href: a } : { to: a };
  return (
    <Tag {...props} className="tarjeta flex w-[168px] shrink-0 flex-col justify-between gap-6 p-5 lg:w-auto">
      <span className={`grid h-9 w-9 place-items-center rounded-full ${tono === "aviso" ? "bg-aviso-bg text-aviso" : "bg-mist text-navy"}`}>{icono}</span>
      <span>
        <span className={`numero block ${pequeno ? "text-[1.6rem]" : "text-[2.5rem]"}`}>{valor}</span>
        <span className="mt-1 block texto-s suave">{texto}</span>
      </span>
    </Tag>
  );
}

/** Today's classes on a vertical line; the dot is lime while a class is happening. */
function Linea({ clases, ahora }) {
  return (
    <ol className="relative ml-2 border-l border-line pl-6">
      {clases.map((c) => {
        const ini = inicioClase(c);
        const enCurso = ahora >= ini && ahora < ini + 75 * 60000;
        const paso = ahora >= ini + 75 * 60000;
        return (
          <li key={c.id} className="relative pb-4 last:pb-0">
            <span className={`absolute -left-[31px] top-6 h-3 w-3 rounded-full border-2 ${enCurso ? "vivo border-lime" : paso ? "border-line bg-line" : "border-navy bg-paper"}`} aria-hidden="true" />
            {enCurso && <p className="mb-2 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-teal">En curso · {horaLegible(c.hora)}</p>}
            <TarjetaClaseEquipo clase={c} a={`/admin/agenda/${encodeURIComponent(c.id)}`} />
          </li>
        );
      })}
    </ol>
  );
}
