import { Simbolo } from "../ui/Logo.jsx";
/** First paint while we learn who is here: the mark, breathing. */
export function PantallaCarga() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="Cargando Casa Lotus">
      <Simbolo className="h-12 w-auto animate-respira text-navy/80" />
    </div>
  );
}
