// Routes (contract §8). Every screen is its own chunk, so /app/reservar loads only the booking flow.
import { createBrowserRouter, Navigate, Outlet, useLocation, useRouteError, isRouteErrorResponse } from "react-router";
import { useYo } from "../api/hooks/auth.js";
import { PantallaCarga } from "./PantallaCarga.jsx";
import { Boton } from "../ui/Boton.jsx";
import { Simbolo } from "../ui/Logo.jsx";

const lazy = (cargar) => () => cargar().then((mod) => ({ Component: mod.default }));

export const inicioDe = (rol) => (rol === "admin" ? "/admin" : rol === "profe" ? "/profe" : rol === "clienta" ? "/mi" : "/entrar");

function Inicio() {
  const { data: yo, isPending } = useYo();
  if (isPending) return <PantallaCarga />;
  return <Navigate to={inicioDe(yo?.rol)} replace />;
}

function Guardia({ roles }) {
  const { data: yo, isPending } = useYo();
  const loc = useLocation();
  if (isPending) return <PantallaCarga />;
  if (!yo) return <Navigate to={`/entrar?volver=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!roles.includes(yo.rol)) return <Navigate to={inicioDe(yo.rol)} replace />;
  return <Outlet />;
}

function ErrorRuta() {
  const e = useRouteError();
  const noExiste = isRouteErrorResponse(e) && e.status === 404;
  const chunk = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(String(e?.message || ""));
  return (
    <main className="pagina-sola flex min-h-dvh flex-col justify-center">
      <Simbolo className="mb-8 h-10 w-auto text-navy" />
      <h1 className="titulo">{noExiste ? "Esta página no existe" : chunk ? "Hay una versión nueva" : "Algo se enredó"}</h1>
      <p className="lead mt-4">{noExiste ? "Puede que el enlace esté incompleto." : chunk ? "Actualiza para seguir con la app al día." : "Intenta de nuevo. Si sigue pasando, escríbele a Ana."}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Boton onClick={() => location.reload()}>Actualizar</Boton>
        <Boton variante="suave" a="/">Ir al inicio</Boton>
      </div>
    </main>
  );
}

function NoExiste() {
  return (
    <main className="pagina-sola flex min-h-dvh flex-col justify-center">
      <Simbolo className="mb-8 h-10 w-auto text-navy" />
      <h1 className="titulo">Esta página no existe</h1>
      <p className="lead mt-4">Puede que el enlace esté incompleto o ya no sirva.</p>
      <div className="mt-8"><Boton a="/">Ir al inicio</Boton></div>
    </main>
  );
}

const marco = (rol) => lazy(() => import("./MarcoRol.jsx").then((x) => ({ default: x.marcos[rol] })));

export const router = createBrowserRouter([
  {
    path: "/",
    errorElement: <ErrorRuta />,
    hydrateFallbackElement: <PantallaCarga />,
    children: [
      { index: true, element: <Inicio /> },
      { path: "entrar", lazy: lazy(() => import("../pantallas/entrar/Entrar.jsx")) },
      { path: "acceso/:token", lazy: lazy(() => import("../pantallas/entrar/Acceso.jsx")) },
      { path: "invitacion/:token", lazy: lazy(() => import("../pantallas/entrar/Invitacion.jsx")) },
      { path: "restablecer/:token", lazy: lazy(() => import("../pantallas/entrar/Restablecer.jsx")) },
      { path: "reservar", lazy: lazy(() => import("../pantallas/reservar/Reservar.jsx")) },
      {
        path: "mi",
        element: <Guardia roles={["clienta"]} />,
        children: [{
          lazy: marco("clienta"),
          children: [
            { index: true, lazy: lazy(() => import("../pantallas/clienta/Inicio.jsx")) },
            { path: "clases", lazy: lazy(() => import("../pantallas/clienta/MisClases.jsx")) },
            { path: "reservar", lazy: lazy(() => import("../pantallas/clienta/ReservarMi.jsx")) },
            { path: "perfil", lazy: lazy(() => import("../pantallas/clienta/Perfil.jsx")) },
          ],
        }],
      },
      {
        path: "profe",
        element: <Guardia roles={["profe"]} />,
        children: [{
          lazy: marco("profe"),
          children: [
            { index: true, lazy: lazy(() => import("../pantallas/profe/Inicio.jsx")) },
            { path: "clase/:id", lazy: lazy(() => import("../pantallas/profe/Clase.jsx")) },
            { path: "cuenta", lazy: lazy(() => import("../pantallas/comun/Cuenta.jsx")) },
          ],
        }],
      },
      {
        path: "admin",
        element: <Guardia roles={["admin"]} />,
        children: [{
          lazy: marco("admin"),
          children: [
            { index: true, lazy: lazy(() => import("../pantallas/admin/Hoy.jsx")) },
            { path: "agenda", lazy: lazy(() => import("../pantallas/admin/Agenda.jsx")) },
            { path: "agenda/:id", lazy: lazy(() => import("../pantallas/admin/ClaseDetalle.jsx")) },
            { path: "horario", lazy: lazy(() => import("../pantallas/admin/Horario.jsx")) },
            { path: "clientas", lazy: lazy(() => import("../pantallas/admin/Clientas.jsx")) },
            { path: "clientas/:id", lazy: lazy(() => import("../pantallas/admin/ClientaDetalle.jsx")) },
            { path: "mensajes", lazy: lazy(() => import("../pantallas/admin/Mensajes.jsx")) },
            { path: "mensajes/:id", lazy: lazy(() => import("../pantallas/admin/Mensajes.jsx")) },
            { path: "pagos", lazy: lazy(() => import("../pantallas/admin/Pagos.jsx")) },
            { path: "equipo", lazy: lazy(() => import("../pantallas/admin/Equipo.jsx")) },
            { path: "ajustes", lazy: lazy(() => import("../pantallas/admin/Ajustes.jsx")) },
            { path: "cuenta", lazy: lazy(() => import("../pantallas/comun/Cuenta.jsx")) },
            { path: "registro", lazy: lazy(() => import("../pantallas/admin/Registro.jsx")) },
          ],
        }],
      },
      { path: "*", element: <NoExiste /> },
    ],
  },
], { basename: "/app" });
