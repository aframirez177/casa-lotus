import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, id } from "../cliente.js";
import { K } from "../claves.js";
import { ponerClase, conAsistencia, foto, restaurar } from "./comun.js";

export function useClasesProfe() {
  return useQuery({ queryKey: K.profeClases(), queryFn: () => api.get("/api/profe/clases"), staleTime: 30000 });
}
export function useClaseEquipo(idClase, opciones = {}) {
  return useQuery({ queryKey: K.profeClase(idClase), queryFn: () => api.get(`/api/profe/clases/${id(idClase)}`), staleTime: 15000, enabled: Boolean(idClase), ...opciones });
}
export function useResumenProfe(mes) {
  return useQuery({ queryKey: K.profeResumen(mes), queryFn: () => api.get("/api/profe/resumen", { mes }), staleTime: 5 * 60000 });
}

/** «Vino» / «No vino»: optimistic in every list showing the class, rollback on error. */
export function useAsistencia({ admin = false } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reserva, vino }) => api.post(`/api/${admin ? "admin" : "profe"}/reservas/${id(reserva)}/asistencia`, { vino }),
    onMutate: async ({ clase, reserva, vino }) => {
      const instantanea = foto(qc);
      const actual = qc.getQueryData(K.profeClase(clase.id)) || clase;
      ponerClase(qc, conAsistencia(actual, reserva, vino));
      return { instantanea };
    },
    onError: (_e, _v, ctx) => restaurar(qc, ctx?.instantanea),
    onSuccess: (r) => ponerClase(qc, admin ? r.clase : r),
    onSettled: () => qc.invalidateQueries({ queryKey: K.tablero }),
  });
}

export function useNotasClase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clase, texto }) => api.post(`/api/profe/clases/${id(clase.id)}/notas`, { texto }),
    onMutate: ({ clase, texto }) => {
      const instantanea = foto(qc);
      ponerClase(qc, { ...(qc.getQueryData(K.profeClase(clase.id)) || clase), notas: texto });
      return { instantanea };
    },
    onError: (_e, _v, ctx) => restaurar(qc, ctx?.instantanea),
    onSuccess: (c) => ponerClase(qc, c),
  });
}

/** People a profe can add to the roster (no balances, no health data). */
export function useClientasProfe(q) {
  return useQuery({ queryKey: ["profe", "clientas", q], queryFn: () => api.get("/api/profe/clientas", { q }), staleTime: 60000, placeholderData: (x) => x, enabled: q.length >= 2 });
}
export function useAgregarAsistente({ admin = false } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clase, clienta }) => api.post(`/api/profe/clases/${id(clase.id)}/asistentes`, { clienta }),
    onSuccess: (r) => { ponerClase(qc, r.clase || r); if (admin) qc.invalidateQueries({ queryKey: K.tablero }); },
  });
}
export function useCerrarLista() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clase) => api.post(`/api/profe/clases/${id(clase.id)}/cerrar`),
    onSuccess: (c) => { ponerClase(qc, c); qc.invalidateQueries({ queryKey: K.tablero }); },
  });
}
export function usePedirReemplazo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clase, motivo }) => api.post(`/api/profe/clases/${id(clase.id)}/reemplazo`, { motivo }),
    onSuccess: (c) => ponerClase(qc, c),
  });
}
export const usePushClaveProfe = () => useQuery({ queryKey: ["profe", "push", "clave"], queryFn: () => api.get("/api/profe/push/clave"), staleTime: 60 * 60000 });
export function useSuscribirPushProfe() {
  return useMutation({ mutationFn: (sub) => api.post("/api/profe/push/suscribir", sub) });
}
