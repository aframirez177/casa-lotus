import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, id } from "../cliente.js";
import { K } from "../claves.js";
import { ponerClase, foto, restaurar } from "./comun.js";

const q = (clave, ruta, consulta, staleTime = 30000, extra = {}) => ({ queryKey: clave, queryFn: () => api.get(ruta, consulta), staleTime, ...extra });

export const useTablero = () => useQuery(q(K.tablero, "/api/admin/tablero", undefined, 20000, { refetchInterval: 120000 }));
export const useAgenda = (desde, hasta) => useQuery(q(K.agenda(desde, hasta), "/api/admin/agenda", { desde, hasta }, 30000, { placeholderData: keepPreviousData }));
export const useHorario = () => useQuery(q(K.horario, "/api/admin/horario", undefined, 60000));
export const useClientas = (f) => useQuery(q(K.clientas(f), "/api/admin/clientas", f, 60000, { placeholderData: keepPreviousData }));
export const useSegmentos = () => useQuery(q(K.segmentos, "/api/admin/segmentos", undefined, 60000));
export const useClienta = (idc) => useQuery(q(K.clienta(idc), `/api/admin/clientas/${id(idc)}`, undefined, 30000, { enabled: Boolean(idc) }));
export const usePagos = (mes) => useQuery(q(K.pagos(mes), "/api/admin/pagos", { mes }, 60000, { placeholderData: keepPreviousData }));
export const useEsperaAdmin = () => useQuery(q(K.espera, "/api/admin/espera"));
export const useProfesLista = () => useQuery(q(["admin", "profes"], "/api/admin/profes", undefined, 5 * 60000));
export const useEquipo = () => useQuery(q(K.equipo, "/api/admin/equipo", undefined, 60000));
export const useAjustes = () => useQuery(q(K.ajustes, "/api/admin/ajustes", undefined, 5 * 60000));
export const usePlanes = () => useQuery(q(K.planes, "/api/admin/planes", undefined, 5 * 60000));
export const useRegistro = () => useQuery(q(K.registro, "/api/admin/registro", { limite: 100 }));
/** Admin's class detail; shares the cache key with the profe view so every write patches both. */
export const useClaseAdmin = (idc) => useQuery(q(K.profeClase(idc), `/api/admin/clases/${id(idc)}`, undefined, 15000, { enabled: Boolean(idc) }));
export const usePushClave = () => useQuery(q(["admin", "push", "clave"], "/api/admin/push/clave", undefined, 60 * 60000));
export const useAtribucion = (desde, hasta) => useQuery(q(K.atribucion(desde, hasta), "/api/admin/atribucion", { desde, hasta }, 60000, { placeholderData: keepPreviousData }));
export const useSalud = () => useQuery(q(K.salud, "/api/admin/salud", undefined, 5 * 60000));
export const useWaEstado = () => useQuery(q(K.waEstado, "/api/admin/whatsapp/estado", undefined, 60000));
export const useConversaciones = (filtro, busca, enabled = true) => useQuery(q(K.waConversaciones(filtro, busca), "/api/admin/whatsapp/conversaciones", { filtro, q: busca }, 15000, { enabled, refetchInterval: 30000, placeholderData: keepPreviousData }));
export const useConversacion = (idc) => useQuery(q(K.waConversacion(idc), `/api/admin/whatsapp/conversaciones/${id(idc)}`, undefined, 5000, { enabled: Boolean(idc), refetchInterval: 15000 }));

/** After a write that touches bookings: patch what we got, refresh the rest in the background. */
function trasReserva(qc, r) {
  if (r?.clase?.gente) ponerClase(qc, r.clase);
  qc.invalidateQueries({ queryKey: K.tablero });
  qc.invalidateQueries({ queryKey: ["admin", "clientas"] });
  qc.invalidateQueries({ queryKey: ["admin", "clienta"] });
  qc.invalidateQueries({ queryKey: K.segmentos });
  qc.invalidateQueries({ queryKey: K.espera });
  qc.invalidateQueries({ queryKey: ["publico"] });
}

/** Optimistic removal of a pending payment from the dashboard. */
function sinPendiente(qc, reserva) {
  const instantanea = foto(qc);
  qc.setQueryData(K.tablero, (t) => t && { ...t, pendientes: t.pendientes.filter((p) => p.reserva !== reserva), kpis: { ...t.kpis, pendientesPago: Math.max(0, t.kpis.pendientesPago - 1) } });
  return { instantanea };
}

/**
 * Confirm a hold. The pending card is removed only after the server says yes (it owns the sheet that shows
 * the result), so a failure stays visible inside the sheet instead of silently putting the card back.
 */
export function useConfirmar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reserva, pago }) => api.post(`/api/admin/reservas/${id(reserva)}/confirmar`, pago ? { pago } : {}),
    onSuccess: (r, { reserva }) => { sinPendiente(qc, reserva); trasReserva(qc, r); qc.invalidateQueries({ queryKey: ["admin", "pagos"] }); },
  });
}
export function useLiberar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reserva }) => api.post(`/api/admin/reservas/${id(reserva)}/liberar`),
    onMutate: ({ reserva }) => sinPendiente(qc, reserva),
    onError: (_e, _v, ctx) => restaurar(qc, ctx?.instantanea),
    onSuccess: (r) => trasReserva(qc, r),
  });
}
export function useCancelarReserva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reserva, sinCosto }) => api.post(`/api/admin/reservas/${id(reserva)}/cancelar`, { sinCosto }),
    onMutate: ({ reserva, clase }) => {
      const instantanea = foto(qc);
      if (clase) ponerClase(qc, { ...clase, ocupados: clase.ocupados - 1, libres: clase.libres + 1, gente: clase.gente.map((g) => (g.reserva === reserva ? { ...g, estado: "Cancelada" } : g)) });
      return { instantanea };
    },
    onError: (_e, _v, ctx) => restaurar(qc, ctx?.instantanea),
    onSuccess: (r) => trasReserva(qc, r),
  });
}
export function useReservarAdmin() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.post("/api/admin/reservas", b), onSuccess: (r) => trasReserva(qc, r) });
}
export function useReagendarAdmin() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ reserva, clase }) => api.post(`/api/admin/reservas/${id(reserva)}/reagendar`, { clase }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); qc.invalidateQueries({ queryKey: ["profe"] }); } });
}
export function useAgregarEspera() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.post("/api/admin/espera", b), onSuccess: () => { qc.invalidateQueries({ queryKey: ["profe", "clase"] }); qc.invalidateQueries({ queryKey: ["admin"] }); } });
}
export function useTomarEspera() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (idEspera) => api.post(`/api/admin/espera/${id(idEspera)}/tomar`), onSuccess: (r) => trasReserva(qc, r) });
}
export function useEstadoEspera() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id: idEspera, estado }) => api.patch(`/api/admin/espera/${id(idEspera)}`, { estado }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); qc.invalidateQueries({ queryKey: ["profe"] }); } });
}

export function useCrearClase() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.post("/api/admin/clases", b), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "agenda"] }); qc.invalidateQueries({ queryKey: K.tablero }); qc.invalidateQueries({ queryKey: ["publico"] }); } });
}
export function useEditarClase() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id: idc, ...b }) => api.patch(`/api/admin/clases/${id(idc)}`, b), onSuccess: (c) => { ponerClase(qc, c); qc.invalidateQueries({ queryKey: ["publico"] }); } });
}
export function useCancelarClase() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id: idc, motivo }) => api.post(`/api/admin/clases/${id(idc)}/cancelar`, { motivo }), onSuccess: (r) => trasReserva(qc, r) });
}

export function useCrearFranja() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.post("/api/admin/horario", b), onSuccess: () => { qc.invalidateQueries({ queryKey: K.horario }); qc.invalidateQueries({ queryKey: ["admin", "agenda"] }); qc.invalidateQueries({ queryKey: ["publico"] }); } });
}
export function useEditarFranja() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id: ids, ...b }) => api.patch(`/api/admin/horario/${id(ids)}`, b),
    onMutate: ({ id: ids, ...b }) => {
      const antes = qc.getQueryData(K.horario);
      qc.setQueryData(K.horario, (l) => l?.map((s) => (s.id === ids ? { ...s, ...b } : s)));
      return { antes };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(K.horario, ctx?.antes),
    onSettled: () => { qc.invalidateQueries({ queryKey: K.horario }); qc.invalidateQueries({ queryKey: ["admin", "agenda"] }); },
  });
}
export function useDesactivarFranja() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (ids) => api.del(`/api/admin/horario/${id(ids)}`), onSuccess: () => { qc.invalidateQueries({ queryKey: K.horario }); qc.invalidateQueries({ queryKey: ["admin", "agenda"] }); qc.invalidateQueries({ queryKey: ["publico"] }); } });
}

export function useCrearClienta() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.post("/api/admin/clientas", b), onSuccess: (c) => { qc.setQueryData(K.clienta(c.id), c); qc.invalidateQueries({ queryKey: ["admin", "clientas"] }); qc.invalidateQueries({ queryKey: K.segmentos }); } });
}
/** Notes, tags and ficha edits: optimistic on the detail, rollback on error. */
export function useEditarClienta(idc) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b) => api.patch(`/api/admin/clientas/${id(idc)}`, b),
    onMutate: (b) => {
      const antes = qc.getQueryData(K.clienta(idc));
      if (antes) qc.setQueryData(K.clienta(idc), { ...antes, ...("notas" in b ? { notas: b.notas } : {}), ...("etiquetas" in b ? { etiquetas: b.etiquetas } : {}), perfil: { ...antes.perfil, ...b } });
      return { antes };
    },
    onError: (_e, _v, ctx) => ctx?.antes && qc.setQueryData(K.clienta(idc), ctx.antes),
    onSuccess: (c) => { qc.setQueryData(K.clienta(idc), c); qc.invalidateQueries({ queryKey: ["admin", "clientas"] }); },
  });
}
export function useEnlaceAcceso() {
  return useMutation({ mutationFn: (idc) => api.post(`/api/admin/clientas/${id(idc)}/acceso`) });
}
export function useRegistrarPago() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.post("/api/admin/pagos", b), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); } });
}

export function useInvitar() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.post("/api/admin/equipo", b), onSuccess: () => qc.invalidateQueries({ queryKey: K.equipo }) });
}
export function useEditarStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id: idu, ...b }) => api.patch(`/api/admin/equipo/${id(idu)}`, b),
    onMutate: ({ id: idu, ...b }) => {
      const antes = qc.getQueryData(K.equipo);
      qc.setQueryData(K.equipo, (l) => l?.map((u) => (u.id === idu ? { ...u, ...b } : u)));
      return { antes };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(K.equipo, ctx?.antes),
    onSettled: () => qc.invalidateQueries({ queryKey: K.equipo }),
  });
}
export function useNuevaInvitacion() {
  return useMutation({ mutationFn: (idu) => api.post(`/api/admin/equipo/${id(idu)}/invitacion`) });
}
export function useGuardarAjustes() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.patch("/api/admin/ajustes", b), onSuccess: (l) => { qc.setQueryData(K.ajustes, l); qc.invalidateQueries({ queryKey: ["publico"] }); qc.invalidateQueries({ queryKey: K.tablero }); } });
}
export function useGuardarPlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.patch("/api/admin/planes", b), onSuccess: (l) => { qc.setQueryData(K.planes, l); qc.invalidateQueries({ queryKey: ["publico"] }); } });
}

export function useEnviarMensaje(idc) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b) => api.post(`/api/admin/whatsapp/conversaciones/${id(idc)}/mensajes`, b),
    onMutate: (b) => {
      const antes = qc.getQueryData(K.waConversacion(idc));
      const temp = { id: "tmp-" + Date.now(), direccion: "saliente", tipo: b.plantilla ? "plantilla" : "texto", texto: b.texto || "…", estado: "enviando", ts: new Date().toISOString(), autor: { tipo: "admin", nombre: "" } };
      if (antes) qc.setQueryData(K.waConversacion(idc), { ...antes, mensajes: [...antes.mensajes, temp] });
      return { antes, temp };
    },
    onError: (_e, _v, ctx) => ctx?.antes && qc.setQueryData(K.waConversacion(idc), ctx.antes),
    onSuccess: (m, _v, ctx) => qc.setQueryData(K.waConversacion(idc), (d) => d && { ...d, mensajes: d.mensajes.map((x) => (x.id === ctx.temp.id ? m : x)) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin", "wa", "conversaciones"] }),
  });
}
export function useEditarConversacion(idc) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.patch(`/api/admin/whatsapp/conversaciones/${id(idc)}`, b), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "wa"] }) });
}

export function useSuscribirPush() {
  return useMutation({ mutationFn: (sub) => api.post("/api/admin/push/suscribir", sub) });
}
