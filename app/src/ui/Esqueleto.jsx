export function Esqueleto({ className = "", style }) {
  return <div className={`esqueleto ${className}`} style={style} aria-hidden="true" />;
}

/** A page of floating cards while data arrives (never a spinner). */
export function EsqueletoPagina({ tarjetas = 3, saludo = true }) {
  return (
    <div aria-busy="true" aria-label="Cargando">
      {saludo && (
        <div className="mb-8 space-y-3 pt-6">
          <Esqueleto className="h-3 w-40" />
          <Esqueleto className="h-14 w-72 max-w-full rounded-2xl" />
          <Esqueleto className="h-4 w-64 max-w-full" />
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: tarjetas }, (_, i) => (
          <div key={i} className="tarjeta space-y-4 p-5">
            <div className="flex items-center gap-3"><Esqueleto className="h-11 w-11 rounded-full" /><div className="flex-1 space-y-2"><Esqueleto className="h-4 w-1/2" /><Esqueleto className="h-3 w-1/3" /></div></div>
            <Esqueleto className="h-5 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EsqueletoLista({ filas = 5 }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="tarjeta flex items-center gap-3 p-4">
          <Esqueleto className="h-11 w-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2"><Esqueleto className="h-4" style={{ width: `${55 + ((i * 17) % 30)}%` }} /><Esqueleto className="h-3 w-1/3" /></div>
        </div>
      ))}
    </div>
  );
}
