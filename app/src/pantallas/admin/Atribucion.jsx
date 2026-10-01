// /app/admin/atribucion — «Resultados de la web»: which buttons of the site and which campaigns bring
// bookings that end up paid, and how much they add up to. Clicks come from the site's beacons; bookings
// and income from the Sheet (GET /api/admin/atribucion).
import { useMemo, useState } from "react";
import { ArrowRight, MousePointerClick, CalendarCheck, CircleDollarSign, Megaphone } from "lucide-react";
import { useAtribucion } from "../../api/hooks/admin.js";
import { Encabezado, Seccion, ErrorCaja, Vacio } from "../../ui/Basicos.jsx";
import { Esqueleto } from "../../ui/Esqueleto.jsx";
import { Segmentado } from "../../ui/Segmentado.jsx";
import { dinero, hoyClave, sumarDias, fechaLegible } from "../../lib/reglas.js";
import { mesMas } from "../../lib/fechas.js";

const PERIODOS = [
  { valor: "mes", texto: "Este mes" },
  { valor: "pasado", texto: "Mes pasado" },
  { valor: "90", texto: "90 días" },
];

function rango(periodo, hoy = hoyClave()) {
  const mes = hoy.slice(0, 7);
  if (periodo === "pasado") { const m = mesMas(mes, -1); return [m + "-01", sumarDias(mes + "-01", -1)]; }
  if (periodo === "90") return [sumarDias(hoy, -89), hoy];
  return [mes + "-01", hoy];
}

/** Ana's words for the site's buttons (the refs keep the v1 scheme: WEB-HERO, WEB-CLASE-PILATES, WEB-HORARIO-SAB-0800, WEB-PLAN-8…). */
const NOMBRES = {
  "WEB-HERO": "Portada", "WEB-HEADER": "Botón de arriba", "WEB-MENU": "Menú", "WEB-PRUEBA": "Clase de prueba", "WEB-CIERRE": "Final de la página",
  "WEB-FOOTER": "Pie de página", "WEB-BARRA-MOVIL": "Barra del celular", "APP-RESERVAR": "Directo a la app", "APP-ENTRAR": "Desde «Entrar»", "(sin ref)": "Sin botón identificado",
};
const DIAS = { LUN: "lunes", MAR: "martes", MIE: "miércoles", JUE: "jueves", VIE: "viernes", SAB: "sábado", DOM: "domingo" };
export function nombreRef(ref = "") {
  if (NOMBRES[ref]) return NOMBRES[ref];
  let m;
  if ((m = ref.match(/^WEB-CLASE-(.+)$/))) return "Clase " + m[1].toLowerCase().replace(/-/g, " ");
  if ((m = ref.match(/^WEB-HORARIO-([A-Z]{3})-(\d{2})(\d{2})$/))) return `Horario del ${DIAS[m[1]] || m[1].toLowerCase()} ${Number(m[2])}:${m[3]}`;
  if ((m = ref.match(/^WEB-PLAN-(.+)$/))) return `Plan de ${m[1].toLowerCase().replace(/-/g, " ")} clases`;
  if ((m = ref.match(/^WEB-VIDEO-(.+)$/))) return "Video " + m[1].toLowerCase().replace(/-/g, " ");
  return ref;
}

export default function Atribucion() {
  const [periodo, setPeriodo] = useState("mes");
  const [desde, hasta] = rango(periodo);
  const { data, isPending, error, refetch, isFetching } = useAtribucion(desde, hasta);
  const total = useMemo(() => (data?.porRef || []).reduce((t, f) => ({ clics: t.clics + f.clics, reservas: t.reservas + f.reservas, confirmadas: t.confirmadas + f.confirmadas, ingresos: t.ingresos + f.ingresos }), { clics: 0, reservas: 0, confirmadas: 0, ingresos: 0 }), [data]);
  const vacio = data && !total.clics && !total.reservas;
  const maxClics = Math.max(1, ...(data?.porRef || []).map((f) => Math.max(f.clics, f.reservas)));

  return (
    <div className="max-w-[920px]">
      <Encabezado titulo="Resultados de la web" grande={false} lead="Qué botones de la página y qué campañas traen reservas que terminan pagadas." />
      <Segmentado className="mb-6" etiqueta="Periodo" valor={periodo} onCambio={setPeriodo} opciones={PERIODOS} />
      <p className="-mt-3 mb-6 texto-s suave">Del {fechaLegible(desde)} al {fechaLegible(hasta)}.</p>

      {isPending ? <div className="space-y-4"><Esqueleto className="h-44 rounded-[28px]" /><Esqueleto className="h-64 rounded-[28px]" /></div>
        : error ? <ErrorCaja error={error} reintentar={refetch} />
          : vacio ? (
            <Vacio titulo="Todavía no hay datos en este periodo" texto="Cuando alguien toque un botón de la página o reserve desde ella, aparece aquí. Las reservas que llegan por WhatsApp o en persona no se cuentan." />
          ) : (
            <div className={`transition-opacity ${isFetching ? "opacity-70" : ""}`}>
              <section className="tarjeta-noche p-6 shadow-float sm:p-7" aria-labelledby="titular">
                <p id="titular" className="etiqueta-sola !text-paper/70">Reservas pagadas que llegaron por la web</p>
                <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
                  <p className="numero text-[4rem] !text-paper">{total.confirmadas}</p>
                  <p className="pb-2"><span className="block font-display text-[2rem] leading-none text-lime">{dinero(total.ingresos)}</span><span className="text-[0.875rem] text-paper/70">en planes y clases pagadas</span></p>
                </div>
                <p className="mt-4 text-[0.9375rem] text-paper/75">{total.clics} {total.clics === 1 ? "toque" : "toques"} en botones · {total.reservas} {total.reservas === 1 ? "reserva" : "reservas"} desde la web · {total.confirmadas} {total.confirmadas === 1 ? "pagada" : "pagadas"}</p>
              </section>

              <Seccion titulo="Por botón de la página" ayuda="Ordenado por lo que trajo en dinero. Cada fila va de toques a reservas, a pagadas, a ingresos.">
                <ol className="space-y-3">
                  {data.porRef.map((f, i) => (
                    <li key={f.ref} className="tarjeta p-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0"><span className="mr-2 text-[0.8125rem] font-semibold text-muted">{i + 1}</span><span className="font-medium text-navy">{nombreRef(f.ref)}</span><span className="ml-2 font-mono text-[0.75rem] text-muted">{f.ref}</span></p>
                        <span className="shrink-0 font-display text-xl text-navy">{dinero(f.ingresos)}</span>
                      </div>
                      <Embudo f={f} max={maxClics} />
                    </li>
                  ))}
                </ol>
              </Seccion>

              {data.porCampana?.some((f) => f.campana !== "(sin campaña)" || f.source) && (
                <Seccion titulo="Por campaña" ayuda="Según los enlaces con etiquetas (utm) de Instagram, Google y otros.">
                  <ul className="tarjeta divide-y divide-line px-5">
                    {data.porCampana.map((f) => (
                      <li key={f.campana + f.source + f.medium} className="py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Megaphone size={16} className="text-teal" aria-hidden="true" />
                          <span className="font-medium text-navy">{f.campana === "(sin campaña)" ? "Sin campaña" : f.campana}</span>
                          {f.source && <span className="chip">{f.source}{f.medium ? ` · ${f.medium}` : ""}</span>}
                          <span className="ml-auto font-display text-lg text-navy">{dinero(f.ingresos)}</span>
                        </div>
                        <p className="mt-2 texto-s text-ink">{f.clics} {f.clics === 1 ? "toque" : "toques"} <ArrowRight size={12} className="inline text-muted" /> {f.reservas} {f.reservas === 1 ? "reserva" : "reservas"} <ArrowRight size={12} className="inline text-muted" /> {f.confirmadas} {f.confirmadas === 1 ? "pagada" : "pagadas"}</p>
                      </li>
                    ))}
                  </ul>
                </Seccion>
              )}
              <p className="mt-8 texto-s suave">Un toque es cada vez que alguien abre la reserva desde un botón de la página. Una reserva cuenta como pagada cuando Ana la confirma con un pago o con el plan que ya tenía; el ingreso es el valor de ese pago, una sola vez.</p>
            </div>
          )}
    </div>
  );
}

/** A small funnel: toques → reservas → pagadas, as nested bars on the same scale, plus the conversion. */
function Embudo({ f, max }) {
  const pasos = [
    { Icono: MousePointerClick, n: f.clics, t: f.clics === 1 ? "toque" : "toques" },
    { Icono: CalendarCheck, n: f.reservas, t: f.reservas === 1 ? "reserva" : "reservas" },
    { Icono: CircleDollarSign, n: f.confirmadas, t: f.confirmadas === 1 ? "pagada" : "pagadas" },
  ];
  const base = Math.max(f.clics, f.reservas, 1);
  const conversion = f.clics ? Math.round((f.confirmadas / f.clics) * 100) : null;
  return (
    <div className="mt-4">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-mist" style={{ width: `${Math.max(12, (base / max) * 100)}%` }} aria-hidden="true">
        <span className="absolute inset-y-0 left-0 rounded-full bg-multinivel" style={{ width: "100%" }} />
        <span className="absolute inset-y-0 left-0 rounded-full bg-navy/45" style={{ width: `${(f.reservas / base) * 100}%` }} />
        <span className="absolute inset-y-0 left-0 rounded-full bg-navy" style={{ width: `${(f.confirmadas / base) * 100}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 texto-s text-ink">
        {pasos.map(({ Icono, n, t }, i) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            {i > 0 && <ArrowRight size={13} className="text-muted" aria-hidden="true" />}
            <Icono size={14} className="text-muted" aria-hidden="true" /><strong className="font-semibold text-navy">{n}</strong> {t}
          </span>
        ))}
        {conversion !== null && <span className="ml-auto text-[0.8125rem] text-muted">{conversion} % de los toques terminó pagando</span>}
      </div>
    </div>
  );
}
