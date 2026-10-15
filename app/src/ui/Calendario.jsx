// «Agregar a Google Calendar» (a link, no file) and «Calendario del iPhone u otro (.ics)».
// On iPhone/iPad the .ics comes first: Safari opens it straight in Apple's calendar.
import { CalendarPlus, CalendarDays } from "lucide-react";
import { Boton } from "./Boton.jsx";
import { useDuracion } from "../api/hooks/publico.js";
import { enlaceGoogleCalendar, abrirIcs } from "../lib/ics.js";
import { esIOS } from "../lib/instalar.js";

const CLARO = {
  principal: { "--bg": "rgb(246 248 252 / .12)", "--fg": "var(--color-paper)", "--bd": "rgb(246 248 252 / .22)" },
  secundario: { "--bg": "transparent", "--fg": "var(--color-paper)", "--bd": "transparent" },
};

export function BotonesCalendario({ clase, codigo, claro = false, tam = "s", className = "" }) {
  const duracionMin = useDuracion(clase);
  if (!clase) return null;
  const ios = esIOS();
  const opciones = { duracionMin, codigo };
  const google = (principal) => (
    <Boton key="g" tam={tam} variante={principal ? "niebla" : "fantasma"} style={claro ? CLARO[principal ? "principal" : "secundario"] : undefined}
      href={enlaceGoogleCalendar(clase, opciones)} icono={<CalendarPlus size={tam === "xs" ? 14 : 16} />}>
      Agregar a Google Calendar
    </Boton>
  );
  const ics = (principal) => (
    <Boton key="i" tam={tam} variante={principal ? "niebla" : "fantasma"} style={claro ? CLARO[principal ? "principal" : "secundario"] : undefined}
      onClick={() => abrirIcs(clase, opciones, { ios })} icono={<CalendarDays size={tam === "xs" ? 14 : 16} />}>
      Calendario del iPhone u otro (.ics)
    </Boton>
  );
  return <div className={`flex flex-wrap items-center gap-x-1 gap-y-2 ${className}`}>{ios ? [ics(true), google(false)] : [google(true), ics(false)]}</div>;
}
