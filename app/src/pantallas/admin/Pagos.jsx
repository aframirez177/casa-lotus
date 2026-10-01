// /app/admin/pagos — the month: total, by payment method, by plan, every payment; register a new one.
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { usePagos } from "../../api/hooks/admin.js";
import { Encabezado, Seccion, ErrorCaja, Vacio, Avatar } from "../../ui/Basicos.jsx";
import { Esqueleto, EsqueletoLista } from "../../ui/Esqueleto.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { HojaPago } from "./comun.jsx";
import { dinero, fechaLegible } from "../../lib/reglas.js";
import { mesActual, mesLegible, mesMas } from "../../lib/fechas.js";

export default function Pagos() {
  const [params, setParams] = useSearchParams();
  const mes = params.get("mes") || mesActual();
  const { data, isPending, error, refetch, isFetching } = usePagos(mes);
  const [nuevo, setNuevo] = useState(false);
  const ir = (n) => setParams(n === 0 ? {} : { mes: mesMas(mes, n) });
  const maxMedio = Math.max(1, ...Object.values(data?.porMedio || {}));
  return (
    <div className="max-w-[1000px]">
      <Encabezado titulo="Pagos" grande={false} accion={<Boton tam="s" icono={<Plus size={17} />} onClick={() => setNuevo(true)}>Registrar pago</Boton>} />
      <div className="mb-6 flex items-center gap-2">
        <Boton variante="suave" tam="s" className="btn-icono !min-w-11" onClick={() => ir(-1)} aria-label="Mes anterior"><ChevronLeft size={18} /></Boton>
        <p className="min-w-[150px] text-center font-medium capitalize text-navy" aria-live="polite">{mesLegible(mes)}</p>
        <Boton variante="suave" tam="s" className="btn-icono !min-w-11" onClick={() => ir(1)} disabled={mes >= mesActual()} aria-label="Mes siguiente"><ChevronRight size={18} /></Boton>
        {mes !== mesActual() && <Boton variante="fantasma" tam="s" onClick={() => ir(0)}>Este mes</Boton>}
      </div>
      {isPending ? <div className="space-y-4"><Esqueleto className="h-40 rounded-[28px]" /><EsqueletoLista filas={4} /></div> : error ? <ErrorCaja error={error} reintentar={refetch} /> : (
        <div className={`transition-opacity ${isFetching ? "opacity-70" : ""}`}>
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <section className="tarjeta-noche p-6 shadow-float">
              <p className="etiqueta-sola !text-paper/65">Entró en {mesLegible(mes).split(" ")[0]}</p>
              <p className="numero mt-3 text-[3.4rem] !text-paper">{dinero(data.total)}</p>
              <p className="mt-2 text-paper/70">{data.compras.length} {data.compras.length === 1 ? "pago" : "pagos"}</p>
            </section>
            <section className="tarjeta p-6" aria-label="Por medio de pago">
              <p className="etiqueta-sola">Por medio</p>
              <ul className="mt-4 space-y-3">
                {Object.entries(data.porMedio).sort((a, b) => b[1] - a[1]).map(([medio, v]) => (
                  <li key={medio}>
                    <div className="flex items-baseline justify-between texto-s"><span className="text-ink">{medio}</span><span className="font-medium text-navy">{dinero(v)}</span></div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-mist"><div className="h-full rounded-full bg-navy" style={{ width: `${(v / maxMedio) * 100}%` }} /></div>
                  </li>
                ))}
                {!Object.keys(data.porMedio).length && <li className="texto-s suave">Sin pagos este mes.</li>}
              </ul>
            </section>
          </div>
          {Object.keys(data.porPlan).length > 0 && (
            <Seccion titulo="Por plan">
              <div className="flex flex-wrap gap-2">{Object.entries(data.porPlan).sort((a, b) => b[1] - a[1]).map(([p, v]) => <span key={p} className="chip chip-blanco !min-h-10 !px-4">{p}<strong className="font-semibold">{dinero(v)}</strong></span>)}</div>
            </Seccion>
          )}
          <Seccion titulo="Cada pago">
            {data.compras.length ? (
              <ul className="tarjeta divide-y divide-line overflow-hidden">
                {data.compras.map((c) => (
                  <li key={c.id}>
                    <Link to={`/admin/clientas/${c.clienta}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-mist/60 sm:px-5">
                      <Avatar nombre={c.nombre} tam={40} />
                      <div className="min-w-0 flex-1"><p className="font-medium text-navy">{c.nombre}</p><p className="texto-s suave">{c.plan} · {c.medio} · {fechaLegible(c.fecha)}</p></div>
                      <span className="font-display text-xl text-navy">{dinero(c.valor)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Vacio titulo="Sin pagos este mes" texto="Cuando confirmes uno, aparece aquí." />}
          </Seccion>
        </div>
      )}
      <HojaPago abierta={nuevo} cerrar={() => setNuevo(false)} />
    </div>
  );
}
