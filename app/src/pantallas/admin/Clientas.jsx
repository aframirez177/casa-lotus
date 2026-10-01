// /app/admin/clientas — the CRM: search, segments with counts, rows with stage, balance and next class.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Search, UserPlus, ChevronRight, CalendarDays } from "lucide-react";
import { useClientas, useSegmentos, useCrearClienta } from "../../api/hooks/admin.js";
import { Encabezado, ErrorCaja, Vacio, Avatar } from "../../ui/Basicos.jsx";
import { EsqueletoLista } from "../../ui/Esqueleto.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { Entrada, Selector, formatoCelular } from "../../ui/Campos.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { Etapa, SaldoPill } from "./comun.jsx";
import { COMO_LLEGO, horaLegible } from "../../lib/reglas.js";
import { diaRelativo } from "../../lib/fechas.js";
import { useNavigate } from "react-router";

export default function Clientas() {
  const [params, setParams] = useSearchParams();
  const segmento = params.get("segmento") || "";
  const orden = params.get("orden") || "nombre";
  const [q, setQ] = useState(params.get("q") || "");
  const [deb, setDeb] = useState(q);
  const [nueva, setNueva] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDeb(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const lista = useClientas({ segmento, q: deb, orden });
  const segs = useSegmentos();
  const poner = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };
  const seg = segs.data?.find((s) => s.id === segmento);

  return (
    <div>
      <Encabezado titulo="Clientas" grande={false} lead={seg ? seg.descripcion : "Busca a alguien o filtra por lo que necesitas hacer hoy."}
        accion={<Boton tam="s" icono={<UserPlus size={17} />} onClick={() => setNueva(true)}>Nueva clienta</Boton>} />

      <div className="relative mb-4">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input className="entrada !min-h-[56px] pl-11 shadow-card !border-transparent" type="search" placeholder="Buscar por nombre, WhatsApp o correo" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar clienta" />
      </div>

      <div className="scroll-x -mx-5 mb-6 flex scroll-px-5 gap-2 px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label="Segmentos">
        <button type="button" aria-pressed={!segmento} onClick={() => poner("segmento", "")} className="opcion shrink-0 !min-h-10 !rounded-full">Todas</button>
        {(segs.data || []).map((s) => (
          <button key={s.id} type="button" aria-pressed={segmento === s.id} onClick={() => poner("segmento", segmento === s.id ? "" : s.id)} className="opcion shrink-0 !min-h-10 !rounded-full" title={s.descripcion}>
            {s.nombre}<span className={`text-[0.8125rem] font-semibold ${segmento === s.id ? "text-lime" : "text-muted"}`}>{s.total}</span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="texto-s suave" aria-live="polite">{lista.data ? `${lista.data.length} ${lista.data.length === 1 ? "persona" : "personas"}` : ""}</p>
        <label className="flex items-center gap-2 texto-s text-muted">Ordenar
          <select className="entrada !min-h-10 !w-auto !py-1 !pl-3 text-[0.875rem]" value={orden} onChange={(e) => poner("orden", e.target.value === "nombre" ? "" : e.target.value)}>
            <option value="nombre">Por nombre</option><option value="reciente">Más recientes</option><option value="saldo">Más clases</option><option value="proxima">Próxima clase</option>
          </select>
        </label>
      </div>

      {lista.isPending ? <EsqueletoLista filas={6} /> : lista.isError ? <ErrorCaja error={lista.error} reintentar={lista.refetch} /> : lista.data.length ? (
        <ul className={`tarjeta divide-y divide-line overflow-hidden transition-opacity ${lista.isFetching ? "opacity-70" : ""}`}>
          {lista.data.map((c) => (
            <li key={c.id}>
              <Link to={`/admin/clientas/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-mist/60 sm:gap-4 sm:px-5">
                <Avatar nombre={c.nombre} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-navy">{c.nombre}</span>
                    <Etapa etapa={c.etapa} />
                    {!c.fichaCompleta && <span className="hidden text-[0.75rem] text-muted sm:inline">· ficha incompleta</span>}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate texto-s suave">
                    {c.proxima ? <><CalendarDays size={13} className="shrink-0" /><span className="truncate first-letter:uppercase">{diaRelativo(c.proxima.fecha)} · {horaLegible(c.proxima.hora)}</span></> : c.whatsappTexto}
                  </p>
                </div>
                <SaldoPill saldo={c.saldo} />
                <ChevronRight size={17} className="hidden shrink-0 text-muted sm:block" />
              </Link>
            </li>
          ))}
        </ul>
      ) : <Vacio titulo="Nadie por aquí" texto={q ? "No encontré a nadie con esa búsqueda." : "Este segmento está vacío. ¡Buena señal!"} />}

      <HojaNueva abierta={nueva} cerrar={() => setNueva(false)} />
    </div>
  );
}

function HojaNueva({ abierta, cerrar }) {
  const crear = useCrearClienta();
  const navegar = useNavigate();
  const { avisar } = useAvisos();
  const [f, setF] = useState({ nombre: "", whatsapp: "", correo: "", llego: "", notas: "", acepta: false });
  useEffect(() => { if (abierta) { setF({ nombre: "", whatsapp: "", correo: "", llego: "", notas: "", acepta: false }); crear.reset(); } }, [abierta]); // eslint-disable-line react-hooks/exhaustive-deps
  const e = crear.error?.campos || {};
  return (
    <Hoja abierta={abierta} alCerrar={cerrar} titulo="Nueva clienta" descripcion="Con el nombre y el WhatsApp basta. Ella completa su ficha desde la app.">
      <form className="space-y-5" onSubmit={(ev) => { ev.preventDefault(); crear.mutate({ nombre: f.nombre.trim(), whatsapp: f.whatsapp.replace(/\D/g, ""), correo: f.correo, llego: f.llego, notas: f.notas, consentimientos: f.acepta ? { datos: { acepta: true } } : undefined }, { onSuccess: (c) => { avisar(`${c.nombre} quedó registrada.`); cerrar(); navegar(`/admin/clientas/${c.id}`); } }); }}>
        <Entrada etiqueta="Nombre y apellido" valor={f.nombre} onCambio={(v) => setF({ ...f, nombre: v })} error={e.nombre} autoComplete="off" data-autofoco="" />
        <Entrada etiqueta="WhatsApp" valor={f.whatsapp} onCambio={(v) => setF({ ...f, whatsapp: formatoCelular(v) })} inputMode="tel" placeholder="300 000 0000" error={e.whatsapp} />
        <Entrada etiqueta="Correo" opcional type="email" valor={f.correo} onCambio={(v) => setF({ ...f, correo: v })} error={e.correo} />
        <Selector etiqueta="¿Cómo llegó?" valor={f.llego} onCambio={(v) => setF({ ...f, llego: v })} opciones={COMO_LLEGO} vacio="Sin dato" />
        <Entrada etiqueta="Notas" opcional valor={f.notas} onCambio={(v) => setF({ ...f, notas: v })} />
        <label className="flex items-start gap-3 rounded-2xl bg-mist p-4 text-[0.9375rem] text-ink">
          <input type="checkbox" checked={f.acepta} onChange={(ev) => setF({ ...f, acepta: ev.target.checked })} className="mt-0.5 h-5 w-5 accent-[var(--color-navy)]" />
          Autorizó el tratamiento de sus datos personales (me lo dijo o lo firmó).
        </label>
        {crear.isError && !crear.error.campos && <p className="campo-error" role="alert">{crear.error.mensaje}</p>}
        <Boton type="submit" bloque tam="l" cargando={crear.isPending}>Guardar</Boton>
      </form>
    </Hoja>
  );
}
