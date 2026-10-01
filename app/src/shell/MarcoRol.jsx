// The frame for each role: a quiet header, a floating glass pill nav on phones, a floating side rail on
// desktop, and spring route transitions. Ana's frame also carries the live bell.
import { useEffect, useState } from "react";
import { NavLink, Link, useLocation, useOutlet } from "react-router";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import {
  Home, CalendarDays, CalendarPlus, UserRound, Sun, Users, MessageCircle, LayoutGrid, Clock3, Wallet, UsersRound,
  Settings2, ScrollText, WifiOff, ChevronRight, TrendingUp,
} from "lucide-react";
import { Marca, Simbolo } from "../ui/Logo.jsx";
import { Avatar } from "../ui/Basicos.jsx";
import { Hoja } from "../ui/Hoja.jsx";
import { useYo } from "../api/hooks/auth.js";
import { Campana, useNovedadesEnVivo } from "./Campana.jsx";
import { esDemo } from "../api/modo.js";
import { ConMovimiento } from "../ui/ConMovimiento.jsx";

const NAV = {
  clienta: [
    { a: "/mi", texto: "Inicio", Icono: Home, fin: true },
    { a: "/mi/clases", texto: "Mis clases", Icono: CalendarDays },
    { a: "/mi/reservar", texto: "Reservar", Icono: CalendarPlus },
    { a: "/mi/perfil", texto: "Perfil", Icono: UserRound },
  ],
  profe: [
    { a: "/profe", texto: "Mis clases", Icono: CalendarDays, fin: false, activoSi: (p) => p === "/profe" || p.startsWith("/profe/clase") },
    { a: "/profe/cuenta", texto: "Cuenta", Icono: UserRound },
  ],
  admin: [
    { a: "/admin", texto: "Hoy", Icono: Sun, fin: true },
    { a: "/admin/agenda", texto: "Agenda", Icono: CalendarDays },
    { a: "/admin/clientas", texto: "Clientas", Icono: Users },
    { a: "/admin/mensajes", texto: "Mensajes", Icono: MessageCircle },
  ],
};
const MAS = [
  { a: "/admin/atribucion", texto: "Resultados de la web", corto: "Resultados", ayuda: "Qué botones y campañas traen reservas pagadas", Icono: TrendingUp },
  { a: "/admin/horario", texto: "Horario", ayuda: "Las franjas de cada semana y las clases extra", Icono: Clock3 },
  { a: "/admin/pagos", texto: "Pagos", ayuda: "Lo que entró este mes, por medio y por plan", Icono: Wallet },
  { a: "/admin/equipo", texto: "Equipo", ayuda: "Profes, invitaciones y clases del mes", Icono: UsersRound },
  { a: "/admin/ajustes", texto: "Ajustes", ayuda: "Reglas, planes, avisos e instalar la app", Icono: Settings2 },
  { a: "/admin/registro", texto: "Registro", ayuda: "Quién hizo qué y cuándo", Icono: ScrollText },
  { a: "/admin/cuenta", texto: "Tu cuenta", ayuda: "Contraseña y sesiones abiertas", Icono: UserRound },
];
const CUENTA = { clienta: "/mi/perfil", profe: "/profe/cuenta", admin: "/admin/cuenta" };

function useDesplazado() {
  const [s, setS] = useState(false);
  useEffect(() => {
    const f = () => setS(scrollY > 8);
    f();
    addEventListener("scroll", f, { passive: true });
    return () => removeEventListener("scroll", f);
  }, []);
  return s;
}

function useEnLinea() {
  const [en, setEn] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setEn(true), off = () => setEn(false);
    addEventListener("online", on); addEventListener("offline", off);
    return () => { removeEventListener("online", on); removeEventListener("offline", off); };
  }, []);
  return en;
}

/** Route transitions: each screen rises and settles on a spring. Off under reduced motion (MotionConfig). */
function Transicion() {
  const loc = useLocation();
  const outlet = useOutlet();
  useEffect(() => { scrollTo({ top: 0 }); }, [loc.pathname]);
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.div key={loc.pathname} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
        transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.8 }}>
        {outlet}
      </m.div>
    </AnimatePresence>
  );
}

function Marco({ rol }) {
  const { data: yo } = useYo();
  const loc = useLocation();
  const desplazado = useDesplazado();
  const enLinea = useEnLinea();
  const [mas, setMas] = useState(false);
  const vivo = useNovedadesEnVivo(rol === "admin");
  const items = NAV[rol];
  const activo = (it) => (it.activoSi ? it.activoSi(loc.pathname) : it.fin ? loc.pathname === it.a : loc.pathname.startsWith(it.a));
  const enMas = rol === "admin" && MAS.some((x) => loc.pathname.startsWith(x.a));

  return (
    <ConMovimiento>
    <LayoutGroup>
      <div className="atmosfera" aria-hidden="true"><i /><i /><i /></div>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-navy focus:px-4 focus:py-3 focus:text-paper">Saltar al contenido</a>

      {/* header (phones and tablets) */}
      <header className={`sticky top-0 z-30 transition-[background-color,box-shadow,backdrop-filter] duration-300 lg:hidden ${desplazado ? "bg-paper/80 shadow-[0_1px_0_var(--color-line)] backdrop-blur-xl" : ""}`}
        style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-3 px-5">
          <Link to={NAV[rol][0].a} aria-label="Casa Lotus, inicio" className="rounded-lg"><Marca /></Link>
          <div className="flex items-center gap-1.5">
            {esDemo && <span className="chip chip-aviso mr-1">Demo</span>}
            {rol === "admin" && <Campana vivo={vivo} />}
            <Link to={CUENTA[rol]} className="grid h-11 w-11 place-items-center rounded-full" aria-label="Tu cuenta">
              <Avatar nombre={yo?.nombre || ""} tam={36} />
            </Link>
          </div>
        </div>
      </header>

      {/* side rail (desktop) */}
      <nav aria-label="Secciones" className="vidrio fixed bottom-4 left-4 top-4 z-30 hidden w-[88px] flex-col items-center rounded-[32px] py-5 lg:flex">
        <Link to={NAV[rol][0].a} aria-label="Casa Lotus, inicio" className="mb-4 rounded-xl p-1 text-navy"><Simbolo className="h-8 w-auto" /></Link>
        <ul className="flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto sin-barra">
          {[...items, ...(rol === "admin" ? MAS.filter((x) => x.a !== "/admin/cuenta") : [])].map((it) => (
            <li key={it.a}><ItemRail it={it} activo={activo(it)} /></li>
          ))}
        </ul>
        <div className="mt-3 flex flex-col items-center gap-2">
          {esDemo && <span className="chip chip-aviso !px-2 text-[0.6875rem]">Demo</span>}
          {rol === "admin" && <Campana vivo={vivo} />}
          <Link to={CUENTA[rol]} className="grid h-12 w-12 place-items-center rounded-full" aria-label="Tu cuenta"><Avatar nombre={yo?.nombre || ""} tam={40} /></Link>
        </div>
      </nav>

      {!enLinea && (
        <div className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 -translate-x-1/2 lg:top-5">
          <p className="chip chip-noche gap-2 !min-h-9 shadow-glass"><WifiOff size={15} /> Sin conexión · ves lo último guardado</p>
        </div>
      )}

      <main id="contenido" className="pagina">
        <Transicion />
      </main>

      {/* floating glass pill (phones and tablets) */}
      <nav aria-label="Secciones" className="fixed inset-x-0 z-30 flex justify-center px-4 lg:hidden" style={{ bottom: "max(14px, env(safe-area-inset-bottom))" }}>
        <ul className="vidrio flex items-center gap-1 rounded-full p-1.5">
          {items.map((it) => <li key={it.a}><ItemPildora it={it} activo={activo(it)} /></li>)}
          {rol === "admin" && (
            <li>
              <button type="button" onClick={() => setMas(true)} aria-haspopup="dialog" aria-expanded={mas}
                className="relative flex h-14 min-w-14 flex-col items-center justify-center gap-0.5 rounded-full px-3 text-navy">
                {enMas && <m.span layoutId="nav-activo" className="absolute inset-0 rounded-full bg-navy" transition={{ type: "spring", stiffness: 480, damping: 38 }} />}
                <LayoutGrid size={21} strokeWidth={1.7} className={`relative ${enMas ? "text-paper" : ""}`} />
                <span className={`relative text-[0.6875rem] font-medium ${enMas ? "text-paper" : ""}`}>Más</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      {rol === "admin" && (
        <Hoja abierta={mas} alCerrar={() => setMas(false)} titulo="Más del estudio">
          <ul className="-mx-2">
            {MAS.map(({ a, texto, ayuda, Icono }) => (
              <li key={a}>
                <Link to={a} onClick={() => setMas(false)} className="flex min-h-16 items-center gap-4 rounded-2xl px-2 py-2 hover:bg-mist">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-mist text-navy"><Icono size={20} strokeWidth={1.7} /></span>
                  <span className="min-w-0 flex-1"><span className="block font-medium text-navy">{texto}</span><span className="block texto-s suave">{ayuda}</span></span>
                  <ChevronRight size={18} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Hoja>
      )}
    </LayoutGroup>
    </ConMovimiento>
  );
}

function ItemPildora({ it, activo }) {
  const { Icono } = it;
  return (
    <NavLink to={it.a} end={it.fin} aria-current={activo ? "page" : undefined}
      className="relative flex h-14 min-w-14 flex-col items-center justify-center gap-0.5 rounded-full px-3 text-navy">
      {activo && <m.span layoutId="nav-activo" className="absolute inset-0 rounded-full bg-navy" transition={{ type: "spring", stiffness: 480, damping: 38 }} />}
      <Icono size={21} strokeWidth={1.7} className={`relative ${activo ? "text-paper" : ""}`} />
      <span className={`relative whitespace-nowrap text-[0.6875rem] font-medium ${activo ? "text-paper" : ""}`}>{it.texto}</span>
    </NavLink>
  );
}

function ItemRail({ it, activo }) {
  const { Icono } = it;
  return (
    <NavLink to={it.a} end={it.fin} aria-current={activo ? "page" : undefined}
      className="relative flex w-[72px] flex-col items-center gap-0.5 rounded-[18px] py-1.5 text-navy hover:bg-white/60">
      {activo && <m.span layoutId="rail-activo" className="absolute inset-0 rounded-[18px] bg-navy" transition={{ type: "spring", stiffness: 480, damping: 38 }} />}
      <Icono size={20} strokeWidth={1.7} className={`relative ${activo ? "text-paper" : ""}`} />
      <span className={`relative text-[0.65rem] font-medium leading-tight ${activo ? "text-paper" : ""}`}>{it.corto || it.texto}</span>
    </NavLink>
  );
}

export const marcos = {
  clienta: () => <Marco rol="clienta" />,
  profe: () => <Marco rol="profe" />,
  admin: () => <Marco rol="admin" />,
};
