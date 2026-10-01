import { StrictMode, useEffect } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { LazyMotion, MotionConfig } from "motion/react";
import { ProveedorAvisos } from "./ui/Avisos.jsx";
import { alPerderSesion } from "./api/cliente.js";
import { K } from "./api/claves.js";
import { router } from "./shell/rutas.jsx";

const cargarMotion = () => import("./ui/motion-funciones.js").then((r) => r.default);

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      // offlineFirst: let the request reach the service worker, which answers from cache when offline
      networkMode: "offlineFirst",
      retry: (n, e) => (e?.status >= 400 && e?.status < 500 ? false : n < 2),
      refetchOnWindowFocus: true,
      staleTime: 30000,
    },
    mutations: { networkMode: "offlineFirst", retry: false },
  },
});

function SesionPerdida() {
  const cliente = useQueryClient();
  useEffect(() => alPerderSesion(() => cliente.setQueryData(K.yo, null)), [cliente]);
  return null;
}

export function App() {
  return (
    <StrictMode>
      <QueryClientProvider client={qc}>
        <MotionConfig reducedMotion="user">
          <LazyMotion features={cargarMotion} strict>
            <ProveedorAvisos>
              <SesionPerdida />
              <RouterProvider router={router} />
            </ProveedorAvisos>
          </LazyMotion>
        </MotionConfig>
      </QueryClientProvider>
    </StrictMode>
  );
}
