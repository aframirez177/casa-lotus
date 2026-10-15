// «Completa tu perfil (1 minuto)»: the optional half of Ana's form (birthday, barrio, EPS, interests, how she
// found the studio), asked after booking instead of before. «Cómo llegó» comes prefilled from the visit's source.
import { useState } from "react";
import { UserRoundPen, ArrowRight } from "lucide-react";
import { useEditarPerfil } from "../../api/hooks/clienta.js";
import { Boton } from "../../ui/Boton.jsx";
import { Hoja } from "../../ui/Hoja.jsx";
import { useAvisos } from "../../ui/Avisos.jsx";
import { FormPerfilExtra } from "../reservar/Ficha.jsx";
import { perfilPorCompletar, CAMPOS_PERFIL } from "../reservar/reglasFicha.js";
import { llegoDesdeAtribucion } from "../../lib/atribucion.js";

const LUEGO = "cl_perfil_luego";
const leerLuego = () => { try { return Number(localStorage.getItem(LUEGO) || 0) > Date.now(); } catch { return false; } };
const ponerLuego = (dias) => { try { localStorage.setItem(LUEGO, String(Date.now() + dias * 86400000)); } catch { /* private mode */ } };

export function CompletaPerfil({ perfil }) {
  const [abierta, setAbierta] = useState(false);
  const [luego, setLuego] = useState(leerLuego);
  const [datos, setDatos] = useState(null);
  const editar = useEditarPerfil();
  const { avisar } = useAvisos();
  if (luego || !perfilPorCompletar(perfil)) return null;

  const abrir = () => {
    setDatos({ ...Object.fromEntries(CAMPOS_PERFIL.map((k) => [k, perfil[k] ?? (k === "intereses" ? [] : "")])), llego: perfil.llego || llegoDesdeAtribucion() });
    setAbierta(true);
  };
  const guardar = () => editar.mutate(datos, {
    onSuccess: () => { setAbierta(false); ponerLuego(60); setLuego(true); avisar("Guardado. ¡Gracias por contarnos!"); },
    onError: (e) => avisar(e.mensaje, { tipo: "error" }),
  });

  return (
    <div className="tarjeta p-5">
      <button type="button" onClick={abrir} className="flex w-full items-center gap-4 text-left">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-multinivel text-navy"><UserRoundPen size={21} /></span>
        <span className="min-w-0 flex-1"><span className="block font-medium text-navy">Completa tu perfil (1&nbsp;minuto)</span><span className="block texto-s suave">Tu cumpleaños, tu barrio y lo que buscas en clase. Así te conocemos mejor.</span></span>
        <ArrowRight size={18} className="shrink-0 text-navy" />
      </button>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={() => { ponerLuego(30); setLuego(true); }} className="min-h-10 px-2 texto-s text-muted hover:text-navy">Ahora no</button>
      </div>
      <Hoja abierta={abierta} alCerrar={() => setAbierta(false)} titulo="Completa tu perfil" descripcion="Todo es opcional. Lo ven Ana y tu profe."
        pie={<div className="flex justify-end gap-2"><Boton variante="suave" onClick={() => setAbierta(false)}>Después</Boton><Boton punto cargando={editar.isPending} onClick={guardar}>Guardar</Boton></div>}>
        {datos && <FormPerfilExtra perfil={datos} cambiar={(p) => setDatos((x) => ({ ...x, ...p }))} />}
      </Hoja>
    </div>
  );
}
