// «Instala la app»: Android/desktop get the browser's prompt; iOS gets the two taps it needs.
import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { useInstalar } from "../lib/instalar.js";
import { Boton } from "../ui/Boton.jsx";
import { Hoja } from "../ui/Hoja.jsx";
import { Simbolo } from "../ui/Logo.jsx";

export function InstalarTarjeta({ titulo = "Instala Casa Lotus", texto = "Ábrela desde tu pantalla de inicio, sin buscar el enlace.", siempre = false }) {
  const { puede, ios, instalada, descartada, instalar, descartar } = useInstalar();
  const [guia, setGuia] = useState(false);
  if (instalada || (!puede && !ios && !siempre) || (descartada && !siempre)) return null;
  return (
    <div className="tarjeta relative flex items-center gap-4 overflow-hidden p-5">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-navy text-paper shadow-card"><Simbolo className="h-7 w-auto" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-navy">{titulo}</p>
        <p className="texto-s suave mt-0.5">{texto}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {puede ? <Boton tam="s" icono={<Download size={16} />} onClick={instalar}>Instalar</Boton>
            : ios ? <Boton tam="s" icono={<Share size={16} />} onClick={() => setGuia(true)}>Cómo instalarla</Boton>
              : <p className="texto-s suave">Ábrela en el navegador de tu teléfono para instalarla.</p>}
        </div>
      </div>
      {!siempre && <button type="button" onClick={descartar} className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-mist" aria-label="Ahora no"><X size={18} /></button>}
      <Hoja abierta={guia} alCerrar={() => setGuia(false)} titulo="Instálala en tu iPhone" descripcion="Dos toques en Safari.">
        <ol className="space-y-4">
          <li className="flex items-center gap-4 rounded-[22px] bg-mist p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-navy"><Share size={20} /></span><span>Toca <strong className="font-medium text-navy">Compartir</strong>, abajo en el centro de la pantalla.</span></li>
          <li className="flex items-center gap-4 rounded-[22px] bg-mist p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-navy"><SquarePlus size={20} /></span><span>Baja y elige <strong className="font-medium text-navy">Agregar a inicio</strong>. Listo: Casa Lotus queda con tus apps.</span></li>
        </ol>
        <Boton bloque className="mt-6" onClick={() => setGuia(false)}>Entendido</Boton>
      </Hoja>
    </div>
  );
}
