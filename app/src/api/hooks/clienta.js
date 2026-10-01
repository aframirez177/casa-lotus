import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, id } from "../cliente.js";
import { K } from "../claves.js";

export function useMi(opciones = {}) {
  return useQuery({ queryKey: K.mi, queryFn: () => api.get("/api/yo"), staleTime: 30000, ...opciones });
}

const refrescar = (qc) => {
  qc.invalidateQueries({ queryKey: K.mi });
  qc.invalidateQueries({ queryKey: ["publico", "disponibilidad"] });
};

export function useReservarMi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clase) => api.post("/api/yo/reservas", { clase }),
    onSuccess: (r) => {
      qc.setQueryData(K.mi, (m) => m && { ...m, proximas: [...m.proximas, r].sort((a, b) => (a.clase.id < b.clase.id ? -1 : 1)) });
      refrescar(qc);
    },
  });
}

/** Cancel: optimistic (the card leaves the list at once), rollback on error. */
export function useCancelarMi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idReserva) => api.post(`/api/yo/reservas/${id(idReserva)}/cancelar`),
    onMutate: async (idReserva) => {
      await qc.cancelQueries({ queryKey: K.mi });
      const antes = qc.getQueryData(K.mi);
      qc.setQueryData(K.mi, (m) => m && { ...m, proximas: m.proximas.filter((r) => r.id !== idReserva) });
      return { antes };
    },
    onError: (_e, _v, ctx) => ctx?.antes && qc.setQueryData(K.mi, ctx.antes),
    onSettled: () => refrescar(qc),
  });
}

export function useReagendarMi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reserva, clase }) => api.post(`/api/yo/reservas/${id(reserva)}/reagendar`, { clase }),
    onSuccess: (r) => qc.setQueryData(K.mi, (m) => m && { ...m, proximas: m.proximas.map((x) => (x.id === r.anterior.id ? r.nueva : x)).sort((a, b) => (a.clase.id < b.clase.id ? -1 : 1)) }),
    onSettled: () => refrescar(qc),
  });
}

export function useEsperaMi() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (clase) => api.post("/api/yo/espera", { clase }), onSuccess: () => refrescar(qc) });
}
export function useSalirEspera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idEspera) => api.del(`/api/yo/espera/${id(idEspera)}`),
    onMutate: async (idEspera) => {
      const antes = qc.getQueryData(K.mi);
      qc.setQueryData(K.mi, (m) => m && { ...m, espera: m.espera.filter((e) => e.id !== idEspera) });
      return { antes };
    },
    onError: (_e, _v, ctx) => ctx?.antes && qc.setQueryData(K.mi, ctx.antes),
    onSettled: () => refrescar(qc),
  });
}

export function useEditarPerfil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (parcial) => api.patch("/api/yo/perfil", parcial),
    onSuccess: (r) => qc.setQueryData(K.mi, (m) => m && { ...m, clienta: { ...m.clienta, perfil: r.perfil, fichaCompleta: r.fichaCompleta } }),
  });
}
export function useFirmar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (parcial) => api.post("/api/yo/consentimientos", parcial),
    onSuccess: (r) => {
      qc.setQueryData(K.mi, (m) => m && { ...m, clienta: { ...m.clienta, consentimientos: r.consentimientos } });
      qc.invalidateQueries({ queryKey: K.mi });
    },
  });
}
