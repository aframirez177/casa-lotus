// Ana's bell: live news from the studio (SSE, with polling every 45 s as a fallback), toasts for what
// happened elsewhere, and a sheet with the latest events. Unread = newer than the last time she opened it.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Bell, CalendarPlus, CalendarX2, Repeat2, Wallet, UserCheck, MessageCircle, Hourglass, CalendarDays, Info } from "lucide-react";
import { api } from "../api/cliente.js";
import { K } from "../api/claves.js";
import { abrirStream } from "../api/stream.js";
import { useYo } from "../api/hooks/auth.js";
import { Hoja } from "../ui/Hoja.jsx";
import { useAvisos } from "../ui/Avisos.jsx";
import { haceTexto } from "../lib/fechas.js";
import { textoDetalle } from "../lib/texto.js";
import { Vacio } from "../ui/Basicos.jsx";

export const ICONOS_EVENTO = {
  "reserva-web": CalendarPlus, reserva: CalendarPlus, cancelacion: CalendarX2, reagenda: Repeat2, pago: Wallet,
  asistencia: UserCheck, mensaje: MessageCircle, espera: Hourglass, clase: CalendarDays, sistema: Info,
};

const CLAVE_VISTO = "cl_campana_visto";
const visto = { ts: leerVisto(), oyentes: new Set() };
function leerVisto() { try { return localStorage.getItem(CLAVE_VISTO) || ""; } catch { return ""; } }
function marcarVisto(ts) {
  visto.ts = ts;
  try { localStorage.setItem(CLAVE_VISTO, ts); } catch { /* ignore */ }
  visto.oyentes.forEach((f) => f());
}
const useVisto = () => useSyncExternalStore((cb) => { visto.oyentes.add(cb); return () => visto.oyentes.delete(cb); }, () => visto.ts);

/** One definition for every reader of the bell's cache (a query keeps the options of its last observer). */
const ultimo = { ts: new Date(Date.now() - 3 * 86400000).toISOString() };
export const consultaNovedades = {
  queryKey: K.novedades,
  staleTime: Infinity,
  queryFn: async () => {
    const r = await api.get("/api/admin/novedades", { desde: new Date(Date.now() - 3 * 86400000).toISOString() });
    const eventos = (r.eventos || []).sort((a, b) => (a.ts < b.ts ? 1 : -1));
    if (eventos[0] && eventos[0].ts > ultimo.ts) ultimo.ts = eventos[0].ts;
    if (!visto.ts && eventos[0]) marcarVisto(eventos[Math.min(2, eventos.length - 1)].ts); // first time: only the newest few count as new
    return { eventos };
  },
};

const QUE_REFRESCAR = {
  "reserva-web": [K.tablero, ["admin", "agenda"], ["admin", "clientas"], ["publico"]],
  reserva: [K.tablero, ["admin", "agenda"], ["publico"]],
  cancelacion: [K.tablero, ["admin", "agenda"], ["publico"]],
  reagenda: [K.tablero, ["admin", "agenda"]],
  pago: [K.tablero, ["admin", "pagos"]],
  espera: [K.tablero, K.espera, ["admin", "agenda"]],
  asistencia: [K.tablero, ["admin", "agenda"]],
  mensaje: [["admin", "wa"]],
  clase: [K.tablero, ["admin", "agenda"]],
};

/** Opens the live stream while Ana's frame is mounted. Returns whether it is live. */
export function useNovedadesEnVivo(activo) {
  const qc = useQueryClient();
  const { data: yo } = useYo();
  const { avisar } = useAvisos();
  const navegar = useNavigate();
  const [vivo, setVivo] = useState(false);
  const yoRef = useRef(yo);
  yoRef.current = yo;
  const vivoRef = useRef(vivo);
  vivoRef.current = vivo;

  // first load: the last three days
  useQuery({ ...consultaNovedades, enabled: activo });

  useEffect(() => {
    if (!activo) return;
    const recibir = (e) => {
      if (!e?.id) return;
      let nuevo = false;
      qc.setQueryData(K.novedades, (d) => {
        const lista = d?.eventos || [];
        if (lista.some((x) => x.id === e.id)) return d;
        nuevo = true;
        return { eventos: [e, ...lista].slice(0, 150) };
      });
      if (e.ts > ultimo.ts) ultimo.ts = e.ts;
      if (!nuevo) return;
      for (const clave of QUE_REFRESCAR[e.tipo] || [K.tablero]) qc.invalidateQueries({ queryKey: clave });
      const mio = e.actor?.id && e.actor.id === yoRef.current?.id;
      if (!mio && ["reserva-web", "reserva", "cancelacion", "reagenda", "espera", "mensaje"].includes(e.tipo)) {
        avisar(`${textoDetalle(e.titulo)}${textoDetalle(e.detalle) ? " · " + textoDetalle(e.detalle) : ""}`, {
          tipo: "nuevo", duracion: 8000,
          accion: e.tipo === "reserva-web" ? { texto: "Ver", fn: () => navegar("/admin") } : e.clienta ? { texto: "Ver", fn: () => navegar("/admin/clientas/" + e.clienta) } : undefined,
        });
        try { if (e.tipo === "reserva-web") navigator.vibrate?.([90, 70, 90]); } catch { /* not allowed */ }
      }
    };
    const cerrar = abrirStream(recibir, setVivo);
    // polling fallback: only while the stream is down
    const t = setInterval(async () => {
      if (vivoRef.current || document.hidden) return;
      try {
        const r = await api.get("/api/admin/novedades", { desde: ultimo.ts });
        (r.eventos || []).sort((a, b) => (a.ts < b.ts ? -1 : 1)).forEach(recibir);
      } catch { /* next round */ }
    }, 45000);
    return () => { cerrar(); clearInterval(t); };
  }, [activo, qc, avisar, navegar]);

  return vivo;
}

export function Campana({ vivo }) {
  const [abierta, setAbierta] = useState(false);
  const { data } = useQuery({ ...consultaNovedades, enabled: false });
  const vistoTs = useVisto();
  const eventos = data?.eventos || [];
  const sinLeer = eventos.filter((e) => e.ts > vistoTs).length;
  const navegar = useNavigate();
  const [sacudir, setSacudir] = useState(0);
  const previo = useRef(sinLeer);
  useEffect(() => { if (sinLeer > previo.current) setSacudir((x) => x + 1); previo.current = sinLeer; }, [sinLeer]);

  const abrir = () => { setAbierta(true); };
  const cerrar = () => { setAbierta(false); if (eventos[0]) marcarVisto(eventos[0].ts); };

  return (
    <>
      <button type="button" onClick={abrir} className="relative grid h-11 w-11 place-items-center rounded-full text-navy hover:bg-white/70"
        aria-label={sinLeer ? `Novedades, ${sinLeer} sin ver` : "Novedades"}>
        <Bell key={sacudir} size={21} strokeWidth={1.7} className={sacudir ? "origin-top animate-[mecer_1.2s_var(--ease-out)]" : ""} />
        {sinLeer > 0 && <span className="insignia insignia-lima absolute -right-0.5 -top-0.5">{sinLeer > 9 ? "9+" : sinLeer}</span>}
        <span className={`absolute bottom-1.5 right-1.5 ${vivo ? "vivo" : "hidden"}`} style={{ width: 7, height: 7 }} title="En vivo" />
      </button>
      <Hoja abierta={abierta} alCerrar={cerrar} titulo="Novedades" descripcion={vivo ? "En vivo: lo nuevo llega solo." : "Se actualiza cada minuto."}>
        {!eventos.length ? <Vacio titulo="Todo tranquilo" texto="Cuando alguien reserve, pague o cancele, aparece aquí." /> : (
          <ol className="relative -mx-1 space-y-1">
            {eventos.slice(0, 40).map((e) => {
              const Icono = ICONOS_EVENTO[e.tipo] || Info;
              const nueva = e.ts > vistoTs;
              return (
                <li key={e.id}>
                  <button type="button" disabled={!e.clienta && !e.clase}
                    onClick={() => { cerrar(); navegar(e.clienta ? "/admin/clientas/" + e.clienta : "/admin/agenda/" + encodeURIComponent(e.clase)); }}
                    className="flex w-full items-start gap-3 rounded-2xl px-2 py-3 text-left enabled:hover:bg-mist">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${nueva ? "bg-navy text-lime" : "bg-mist text-navy"}`}><Icono size={18} strokeWidth={1.8} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-medium text-navy">{e.titulo}</span>
                        <span className="shrink-0 text-[0.8125rem] text-muted">{haceTexto(e.ts)}</span>
                      </span>
                      {textoDetalle(e.detalle) && <span className="mt-0.5 block texto-s text-ink">{textoDetalle(e.detalle)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Hoja>
    </>
  );
}
