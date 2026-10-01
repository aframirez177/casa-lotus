import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, id } from "../cliente.js";
import { K } from "../claves.js";

/** The signed-in person, or null. Never throws on 401. */
export function useYo() {
  return useQuery({
    queryKey: K.yo,
    queryFn: async () => {
      try { return (await api.get("/api/auth/yo", undefined, { silencioso401: true })).usuario; }
      catch (e) { if (e.status === 401) return null; throw e; }
    },
    staleTime: 5 * 60000,
    retry: (n, e) => e?.status !== 401 && n < 2,
  });
}

function alEntrar(qc) {
  return (r) => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "publico" });
    qc.setQueryData(K.yo, r.usuario);
  };
}

/** How the team can sign in: { google: { clientId } | null }. */
export function useConfigAuth() {
  return useQuery({ queryKey: ["auth", "config"], queryFn: () => api.get("/api/auth/config"), staleTime: 30 * 60000, retry: 1 });
}
export function useEntrarGoogle() {
  const qc = useQueryClient();
  // a rejected Google token answers 401: an error for this screen, not «your session ended»
  return useMutation({ mutationFn: (credential) => api.post("/api/auth/google", { credential }, { silencioso401: true }), onSuccess: alEntrar(qc) });
}
export function useInvitacionGoogle(token) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (credential) => api.post(`/api/auth/invitacion/${id(token)}/google`, { credential }, { silencioso401: true }), onSuccess: alEntrar(qc) });
}

export function useEntrarEquipo() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.post("/api/auth/entrar", b), onSuccess: alEntrar(qc) });
}
export function usePedirCodigo() {
  return useMutation({ mutationFn: (b) => api.post("/api/auth/codigo", b) });
}
export function useVerificarCodigo() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.post("/api/auth/verificar", b), onSuccess: alEntrar(qc) });
}
export function useRecuperar() {
  return useMutation({ mutationFn: (b) => api.post("/api/auth/recuperar", b) });
}
export function useRestablecer() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.post("/api/auth/restablecer", b), onSuccess: alEntrar(qc) });
}
export function useInvitacion(token) {
  return useQuery({ queryKey: K.invitacion(token), queryFn: () => api.get(`/api/auth/invitacion/${id(token)}`), retry: false, enabled: Boolean(token) });
}
export function useAceptarInvitacion(token) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.post(`/api/auth/invitacion/${id(token)}`, b), onSuccess: alEntrar(qc) });
}
export function useCambiarPassword() {
  return useMutation({ mutationFn: (b) => api.post("/api/auth/password", b) });
}
/** The 10 most recently used sessions (the current one always included) and how many there are in total. */
export function useSesiones() {
  return useQuery({
    queryKey: K.sesiones,
    queryFn: async () => { const r = await api.get("/api/auth/sesiones"); return Array.isArray(r) ? { sesiones: r, total: r.length } : r; },
    staleTime: 60000,
  });
}
export function useCerrarSesionRemota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idSesion) => api.del(`/api/auth/sesiones/${id(idSesion)}`),
    onMutate: async (idSesion) => {
      const antes = qc.getQueryData(K.sesiones);
      qc.setQueryData(K.sesiones, (d) => {
        if (!d) return d;
        const sesiones = d.sesiones.filter((s) => (idSesion === "otras" ? s.actual : s.id !== idSesion));
        return { sesiones, total: idSesion === "otras" ? sesiones.length : Math.max(sesiones.length, d.total - 1) };
      });
      return { antes };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(K.sesiones, ctx?.antes),
  });
}
export function useEditarCuenta() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b) => api.patch("/api/auth/cuenta", b), onSuccess: (r) => qc.setQueryData(K.yo, r.usuario) });
}

/** Sign out: server session, every private cache, and the service worker's API cache. */
export function useSalir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/api/auth/salir").catch(() => null),
    onSettled: async () => {
      await limpiarCachesPrivadas();
      qc.clear();
      qc.setQueryData(K.yo, null);
    },
  });
}

export async function limpiarCachesPrivadas() {
  try {
    if ("caches" in window) await caches.delete("cl-api");
    navigator.serviceWorker?.controller?.postMessage({ tipo: "salir" });
  } catch { /* nothing cached */ }
  try { localStorage.removeItem("cl_campana_visto"); } catch { /* ignore */ }
}
