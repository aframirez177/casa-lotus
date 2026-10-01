// /app/mi/perfil — her ficha (editable), her agreements with dates and versions, notices, sign out.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, m } from "motion/react";
import { LogOut, BellRing, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMi, useEditarPerfil, useFirmar } from "../../api/hooks/clienta.js";
import { useSalir } from "../../api/hooks/auth.js";
import { K } from "../../api/claves.js";
import { Seccion, ErrorCaja, Avatar } from "../../ui/Basicos.jsx";
import { EsqueletoPagina } from "../../ui/Esqueleto.jsx";
import { Boton } from "../../ui/Boton.jsx";
import { Entrada, Interruptor, formatoCelular } from "../../ui/Campos.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { InstalarTarjeta } from "../../shell/Instalar.jsx";
import { FlujoCodigo } from "../entrar/FlujoCodigo.jsx";
import { FormFicha, FormAcuerdos, PERFIL_VACIO, validarFicha, escribioSalud } from "../reservar/Ficha.jsx";
import { CONSENTIMIENTOS, whatsappLegible, partesBogota, fechaLegible, SALUD_SIN_DATOS } from "../../lib/reglas.js";

const fechaDe = (iso) => (iso ? fechaLegible(partesBogota(Date.parse(iso)).fecha) : "");

export default function Perfil() {
  const { data, isPending, error, refetch } = useMi();
  const editar = useEditarPerfil();
  const firmar = useFirmar();
  const salir = useSalir();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { avisar } = useAvisos();
  const [perfil, setPerfil] = useState(PERFIL_VACIO);
  const [errores, setErrores] = useState({});
  const [confirmarWa, setConfirmarWa] = useState(false);

  const original = useMemo(() => (data ? { ...PERFIL_VACIO, ...data.clienta.perfil, whatsapp: formatoCelular(data.clienta.perfil.whatsapp), contactoEmergencia: { nombre: data.clienta.perfil.contactoEmergencia?.nombre || "", whatsapp: formatoCelular(data.clienta.perfil.contactoEmergencia?.whatsapp || "") } } : null), [data]);
  useEffect(() => { if (original) setPerfil(original); }, [original]);
  useEffect(() => { if (data && location.hash === "#ficha") setTimeout(() => document.getElementById("ficha")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300); }, [data]);

  if (isPending) return <EsqueletoPagina tarjetas={2} />;
  if (error) return <ErrorCaja error={error} reintentar={refetch} />;
  const { clienta } = data;
  const cons = clienta.consentimientos || {};
  const sucio = original && JSON.stringify(perfil) !== JSON.stringify(original);
  const cambiar = (p) => { setPerfil((x) => ({ ...x, ...p })); setErrores({}); };

  const guardar = () => {
    const e = validarFicha(perfil);
    if (Object.keys(e).length) { setErrores(e); return document.querySelector("[aria-invalid=true], .campo-error")?.scrollIntoView({ block: "center", behavior: "smooth" }); }
    editar.mutate({ ...perfil, whatsapp: perfil.whatsapp.replace(/\D/g, ""), contactoEmergencia: { ...perfil.contactoEmergencia, whatsapp: perfil.contactoEmergencia.whatsapp.replace(/\D/g, "") } }, {
      onSuccess: (r) => avisar(r.fichaCompleta ? "Guardado. Tu ficha está completa." : "Guardado."),
      onError: (er) => { if (er.campos) setErrores(er.campos); avisar(er.mensaje, { tipo: "error" }); },
    });
  };
  const firmarUno = (nuevo) => {
    const cambios = Object.fromEntries(Object.entries(nuevo).filter(([k, v]) => v?.acepta !== cons[k]?.acepta && typeof v?.acepta === "boolean").map(([k, v]) => [k, { acepta: v.acepta }]));
    if (!Object.keys(cambios).length) return;
    // sensitive data: withdrawing consent also clears what she wrote about her health
    if (cambios.sensibles?.acepta === false && escribioSalud(perfil.salud)) editar.mutate({ salud: SALUD_SIN_DATOS[1] });
    firmar.mutate(cambios, { onSuccess: () => avisar("Guardado.") , onError: (er) => avisar(er.mensaje, { tipo: "error" }) });
  };

  return (
    <div className="max-w-[760px]">
      <header className="mb-10 flex items-center gap-5 pt-4">
        <Avatar nombre={clienta.perfil.nombre} tam={72} />
        <div className="min-w-0">
          <h1 className="titulo">{clienta.perfil.nombre}</h1>
          <p className="mt-2 suave">{whatsappLegible(clienta.perfil.whatsapp)}{clienta.perfil.correo ? ` · ${clienta.perfil.correo}` : ""}</p>
        </div>
      </header>

      {clienta.limitada ? (
        <button type="button" onClick={() => setConfirmarWa(true)} className="tarjeta flex w-full items-center gap-4 p-5 text-left">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-yoga text-navy"><ShieldCheck size={22} /></span>
          <span className="min-w-0 flex-1"><span className="block font-medium text-navy">Confirma tu WhatsApp para ver y editar tu ficha</span><span className="block texto-s suave">Te enviamos un código.</span></span>
        </button>
      ) : (
        <>
          <Seccion titulo="Tus datos">
            <div className="tarjeta grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
              <Entrada etiqueta="Nombre y apellido" valor={perfil.nombre} onCambio={(v) => cambiar({ nombre: v })} autoComplete="name" />
              <Entrada etiqueta="Correo" opcional type="email" valor={perfil.correo} onCambio={(v) => cambiar({ correo: v })} autoComplete="email" ayuda="Para recordatorios y para entrar sin contraseña." />
              <Entrada etiqueta="WhatsApp" valor={perfil.whatsapp} onCambio={(v) => cambiar({ whatsapp: formatoCelular(v) })} inputMode="tel" ayuda="Con este número entras a la app." className="sm:col-span-2" />
            </div>
          </Seccion>

          <Seccion titulo="Tu ficha" id="ficha" ayuda={clienta.fichaCompleta ? "Solo la ven Ana y tu profe." : "Te falta poco: tu profe la necesita antes de tu clase."}>
            <div className="tarjeta p-5 sm:p-6"><FormFicha perfil={perfil} cambiar={cambiar} errores={errores} /></div>
          </Seccion>

          <Seccion titulo="Acuerdos" ayuda="Lo que aceptaste y cuándo. Puedes cambiar lo opcional cuando quieras.">
            <FormAcuerdos sinNovedades valor={cons} cambiar={firmarUno} conSensibles={escribioSalud(perfil.salud) || Boolean(cons.sensibles)}
              fechas={Object.fromEntries(Object.entries(cons).map(([k, v]) => [k, v?.fecha ? `${fechaDe(v.fecha)}${v.version ? ` · versión ${v.version.replace(/^\D+-/, "")}` : ""}` : ""]))} />
          </Seccion>
        </>
      )}

      <Seccion titulo="Avisos">
        <div className="tarjeta divide-y divide-line px-5">
          <div className="flex items-center gap-4 py-4">
            <BellRing size={20} className="shrink-0 text-teal" />
            <div className="min-w-0 flex-1"><p className="font-medium text-navy">Recordatorios de tus clases</p><p className="texto-s suave">Por WhatsApp, un día antes, y el código para entrar. Vienen con tu reserva.</p></div>
          </div>
          {!clienta.limitada && (
            <Interruptor activo={cons.novedades?.acepta === true} onCambio={(v) => firmarUno({ ...cons, novedades: { acepta: v } })} etiqueta={CONSENTIMIENTOS.novedades.titulo} ayuda="Eventos, talleres y promociones. Nunca más de lo necesario." />
          )}
        </div>
      </Seccion>

      <div className="mt-10 grid gap-4">
        <InstalarTarjeta siempre />
        <Boton variante="suave" className="self-start" icono={<LogOut size={17} />} cargando={salir.isPending} onClick={() => salir.mutate(undefined, { onSettled: () => navegar("/entrar", { replace: true }) })}>Cerrar sesión</Boton>
      </div>

      <AnimatePresence>
        {sucio && (
          <m.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="fixed inset-x-0 bottom-[calc(max(14px,env(safe-area-inset-bottom))+76px)] z-40 flex justify-center px-4 lg:bottom-6 lg:pl-[120px]">
            <div className="vidrio flex w-full max-w-[520px] items-center gap-3 rounded-full p-2 pl-5">
              <p className="min-w-0 flex-1 text-[0.9375rem] text-navy">Tienes cambios sin guardar</p>
              <Boton variante="fantasma" tam="s" onClick={() => setPerfil(original)}>Descartar</Boton>
              <Boton tam="s" cargando={editar.isPending} onClick={guardar}>Guardar</Boton>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <Hoja abierta={confirmarWa} alCerrar={() => setConfirmarWa(false)} titulo="Confirma tu WhatsApp">
        <FlujoCodigo compacto whatsappInicial={clienta.perfil.whatsapp} onListo={() => { setConfirmarWa(false); qc.invalidateQueries({ queryKey: K.mi }); }} />
      </Hoja>
    </div>
  );
}
