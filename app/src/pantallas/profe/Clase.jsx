// /app/profe/clase/:id — the roster with ficha highlights, attendance toggles and notes.
import { Link, useParams } from "react-router";
import { ArrowLeft, Hourglass } from "lucide-react";
import { useClaseEquipo } from "../../api/hooks/profe.js";
import { ErrorCaja, Seccion } from "../../ui/Basicos.jsx";
import { EsqueletoLista, Esqueleto } from "../../ui/Esqueleto.jsx";
import { CabeceraClase, Roster, NotasClase, HerramientasProfe } from "../comun/Clase.jsx";

export default function ClaseProfe() {
  const { id } = useParams();
  const { data: c, isPending, error, refetch } = useClaseEquipo(id);
  return (
    <div className="max-w-[980px]">
      <Link to="/profe" className="-ml-3 mb-2 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-navy hover:bg-white/70"><ArrowLeft size={18} /> Mis clases</Link>
      {isPending ? <div className="space-y-4 pt-4"><Esqueleto className="h-3 w-24" /><Esqueleto className="h-16 w-48" /><EsqueletoLista filas={4} /></div>
        : error ? <ErrorCaja error={error} reintentar={refetch} /> : (
          <>
            <CabeceraClase clase={c} sinProfe />
            <HerramientasProfe clase={c} />
            <Seccion titulo="Quién viene"><Roster clase={c} /></Seccion>
            {c.espera?.length > 0 && (
              <Seccion titulo="En lista de espera">
                <ul className="flex flex-wrap gap-2">{c.espera.map((e) => <li key={e.id} className="chip chip-blanco"><Hourglass size={13} />{e.nombre}</li>)}</ul>
              </Seccion>
            )}
            <div className="mt-10"><NotasClase clase={c} /></div>
          </>
        )}
    </div>
  );
}
