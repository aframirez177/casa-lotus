import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../cliente.js";
import { K } from "../claves.js";
import { hoyClave } from "../../lib/reglas.js";

export function useDisponibilidad(dias = 21) {
  const desde = hoyClave();
  return useQuery({ queryKey: K.disponibilidad(desde, dias), queryFn: () => api.get("/api/publico/disponibilidad", { desde, dias }), staleTime: 30000, refetchInterval: 90000 });
}
export function usePlanesPublicos() {
  return useQuery({ queryKey: K.planesPublicos, queryFn: () => api.get("/api/publico/planes"), staleTime: 10 * 60000 });
}
export function useEstudio() {
  return useQuery({ queryKey: K.estudio, queryFn: () => api.get("/api/publico/estudio"), staleTime: 10 * 60000 });
}
export function useReservaPublica() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b) => api.post("/api/publico/reservas", b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["publico", "disponibilidad"] });
      qc.invalidateQueries({ queryKey: K.yo }); // the booking opened a session on this device
      qc.invalidateQueries({ queryKey: K.mi });
    },
  });
}
export function useEsperaPublica() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.post("/api/publico/espera", b), onSuccess: () => qc.invalidateQueries({ queryKey: ["publico", "disponibilidad"] }) });
}
