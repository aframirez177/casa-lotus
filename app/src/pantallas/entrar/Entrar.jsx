// /app/entrar — two doors: «Soy alumna» (a 6-digit code to her WhatsApp or email) and «Equipo» (email + password).
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { AnimatePresence, m } from "motion/react";
import { ArrowLeft, ArrowRight, MessageCircle, KeyRound, Sparkles } from "lucide-react";
import { useYo, useEntrarEquipo, useRecuperar } from "../../api/hooks/auth.js";
import { FlujoCodigo } from "./FlujoCodigo.jsx";
import { inicioDe } from "../../shell/rutas.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Entrada } from "../../ui/Campos.jsx";
import { CampoClave, PaginaSola } from "./comun.jsx";
import { PantallaCarga } from "../../shell/PantallaCarga.jsx";
import { esDemo } from "../../api/modo.js";
import { useQueryClient } from "@tanstack/react-query";
import { K } from "../../api/claves.js";

export default function Entrar() {
  const { data: yo, isPending } = useYo();
  const [params] = useSearchParams();
  const [puerta, setPuerta] = useState(params.get("puerta") || "");
  const volver = params.get("volver");
  if (isPending) return <PantallaCarga />;
  if (yo) return <Navigate to={volver || inicioDe(yo.rol)} replace />;

  return (
    <PaginaSola>
      <AnimatePresence mode="wait" initial={false}>
        {!puerta && (
          <m.section key="puertas" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ type: "spring", stiffness: 280, damping: 30 }}>
            <p className="etiqueta mb-4">Casa Lotus</p>
            <h1 className="saludo">Qué bueno verte.</h1>
            <p className="lead mt-4">Entra para ver tus clases, cambiarlas o reservar otra.</p>
            {params.get("enlace") && (
              <p className="mt-6 rounded-[22px] bg-aviso-bg p-4 text-[0.9375rem] text-aviso" role="alert">
                {params.get("enlace") === "limite" ? "Se usaron demasiados enlaces desde esta conexión. Espera un rato o entra con tu código." : "Ese enlace ya no sirve: venció o ya se usó. Entra con tu código o pídele a Ana uno nuevo."}
              </p>
            )}
            <div className="mt-10 grid gap-4">
              <Puerta onClick={() => setPuerta("alumna")} titulo="Soy alumna" texto="Con tu WhatsApp o tu correo. Te enviamos un código." icono={<MessageCircle size={22} strokeWidth={1.7} />} color="var(--color-yoga)" />
              <Puerta onClick={() => setPuerta("equipo")} titulo="Equipo" texto="Profes y Ana, con correo y contraseña." icono={<KeyRound size={22} strokeWidth={1.7} />} color="var(--color-multinivel)" />
            </div>
            <p className="mt-8 texto-s suave">¿Primera vez? <Link className="enlace" to="/reservar?ref=APP-ENTRAR">Reserva tu clase de prueba</Link> y tu cuenta se crea sola.</p>
            {esDemo && <AccesoDemo volver={volver} />}
          </m.section>
        )}
        {puerta === "alumna" && <m.section key="alumna" {...entrada}><Alumna atras={() => setPuerta("")} volver={volver} /></m.section>}
        {puerta === "equipo" && <m.section key="equipo" {...entrada}><Equipo atras={() => setPuerta("")} volver={volver} /></m.section>}
      </AnimatePresence>
    </PaginaSola>
  );
}

const entrada = { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -16 }, transition: { type: "spring", stiffness: 300, damping: 32 } };

function Puerta({ titulo, texto, icono, color, onClick }) {
  return (
    <button type="button" onClick={onClick} className="tarjeta group flex items-center gap-4 p-5 text-left">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[20px] text-navy" style={{ background: color }}>{icono}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-2xl leading-none tracking-tight text-navy">{titulo}</span>
        <span className="mt-1.5 block texto-s suave">{texto}</span>
      </span>
      <ArrowRight size={20} className="shrink-0 text-navy transition-transform duration-300 group-hover:translate-x-1" />
    </button>
  );
}

function Atras({ onClick }) {
  return <button type="button" onClick={onClick} className="-ml-3 mb-6 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-navy hover:bg-white/70"><ArrowLeft size={18} /> Volver</button>;
}

function Alumna({ atras, volver }) {
  const navegar = useNavigate();
  const [paso, setPaso] = useState("dato");
  return (
    <div>
      <Atras onClick={atras} />
      <h1 className="titulo">{paso === "codigo" ? "Escribe tu código" : "Entra con un código"}</h1>
      {paso !== "codigo" && <p className="lead mb-8 mt-3">Sin contraseñas: te enviamos 6 números y listo.</p>}
      <div className={paso === "codigo" ? "mt-3" : ""}>
        <FlujoCodigo alCambiarPaso={setPaso} onListo={() => navegar(volver || "/mi", { replace: true })} />
      </div>
    </div>
  );
}

function Equipo({ atras, volver }) {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [olvido, setOlvido] = useState(false);
  const entrar = useEntrarEquipo();
  const recuperar = useRecuperar();
  const navegar = useNavigate();

  if (olvido) {
    return (
      <div>
        <Atras onClick={() => { setOlvido(false); recuperar.reset(); }} />
        <h1 className="titulo">Recupera tu contraseña</h1>
        {recuperar.isSuccess ? (
          <div className="mt-6 tarjeta p-6" role="status">
            <p className="subtitulo">Revisa tu correo</p>
            <p className="mt-2 suave">Si <strong className="font-medium text-navy">{correo}</strong> está en el equipo, te llegó un enlace para crear una contraseña nueva. Vence en una hora.</p>
          </div>
        ) : (
          <>
            <p className="lead mt-3">Escribe tu correo y te enviamos un enlace para crear una nueva.</p>
            <form className="mt-8 space-y-6" onSubmit={(e) => { e.preventDefault(); recuperar.mutate({ correo: correo.trim() }); }}>
              <Entrada etiqueta="Correo" type="email" valor={correo} onCambio={setCorreo} autoComplete="email" required autoFocus />
              <Boton type="submit" bloque tam="l" cargando={recuperar.isPending} disabled={!/^\S+@\S+\.\S+$/.test(correo)}>Enviarme el enlace</Boton>
            </form>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <Atras onClick={atras} />
      <h1 className="titulo">Equipo Casa Lotus</h1>
      <p className="lead mt-3">Entra con tu correo y tu contraseña.</p>
      <form className="mt-8 space-y-5" onSubmit={(e) => { e.preventDefault(); entrar.mutate({ correo: correo.trim(), password: clave }, { onSuccess: (r) => navegar(volver || inicioDe(r.usuario.rol), { replace: true }) }); }}>
        <Entrada etiqueta="Correo" type="email" valor={correo} onCambio={setCorreo} autoComplete="username" required autoFocus />
        <CampoClave valor={clave} onCambio={setClave} />
        {entrar.isError && <p className="campo-error" role="alert">{entrar.error.mensaje}</p>}
        <Boton type="submit" bloque tam="l" cargando={entrar.isPending} disabled={!correo || !clave}>Entrar</Boton>
      </form>
      <button type="button" onClick={() => setOlvido(true)} className="mt-6 enlace texto-s">¿Olvidaste tu contraseña?</button>
    </div>
  );
}

function AccesoDemo({ volver }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const entrar = (rol) => {
    window.__clDemo?.entrarComo(rol);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "publico" });
    qc.invalidateQueries({ queryKey: K.yo });
    navegar(volver || inicioDe(rol), { replace: true });
  };
  return (
    <div className="mt-10 rounded-[28px] border border-dashed border-line bg-white/60 p-5">
      <p className="etiqueta-sola mb-3 flex items-center gap-2"><Sparkles size={14} /> Modo demo · personas inventadas</p>
      <div className="flex flex-wrap gap-2">
        <Boton tam="s" variante="suave" onClick={() => entrar("admin")}>Entrar como Ana</Boton>
        <Boton tam="s" variante="suave" onClick={() => entrar("profe")}>Como profe</Boton>
        <Boton tam="s" variante="suave" onClick={() => entrar("clienta")}>Como alumna</Boton>
      </div>
      <button type="button" className="mt-4 texto-s enlace" onClick={() => { window.__clDemo?.reiniciar(); location.reload(); }}>Reiniciar la demo</button>
    </div>
  );
}
