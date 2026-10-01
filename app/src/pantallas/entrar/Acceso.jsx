// /app/acceso/:token — the private link Ana sends. The server sets the session and redirects to /app/mi.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { esDemo } from "../../api/modo.js";
import { api, id } from "../../api/cliente.js";
import { K } from "../../api/claves.js";
import { PaginaSola } from "./comun.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Simbolo } from "../../ui/Logo.jsx";

export default function Acceso() {
  const { token } = useParams();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState(null);
  const usado = useRef(false); // the link is single-use: one request, even when React runs effects twice (StrictMode) or remounts
  useEffect(() => {
    if (usado.current) return;
    usado.current = true;
    if (!esDemo) { location.replace(`/api/auth/enlace/${id(token)}`); return; }
    api.get(`/api/auth/enlace/${id(token)}`).then((r) => { qc.setQueryData(K.yo, r.usuario); navegar("/mi", { replace: true }); }).catch(setError);
  }, [token, navegar, qc]);
  return (
    <PaginaSola>
      {error ? (
        <>
          <h1 className="titulo">Este enlace ya no sirve</h1>
          <p className="lead mt-3">Puede que haya vencido. Entra con tu WhatsApp o pídele a Ana uno nuevo.</p>
          <Boton className="mt-8" a="/entrar?puerta=alumna">Entrar con mi WhatsApp</Boton>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center pb-24 text-center" aria-busy="true">
          <Simbolo className="h-12 w-auto animate-respira text-navy" />
          <p className="lead mt-6">Abriendo tu cuenta…</p>
        </div>
      )}
    </PaginaSola>
  );
}
