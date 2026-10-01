// Server values shown as text, never as raw objects (React cannot render them, and Ana should not read JSON).

/** «clave: valor» pairs for objects, readable text for everything else; "" when there is nothing to say. */
export function textoDetalle(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(textoDetalle).filter(Boolean).join(", ");
  if (typeof v === "object") {
    return Object.entries(v)
      .map(([k, x]) => {
        const t = textoDetalle(x);
        if (!t) return "";
        return x && typeof x === "object" && !Array.isArray(x) ? `${k}: (${t})` : `${k}: ${t}`;
      })
      .filter(Boolean)
      .join(" · ");
  }
  return String(v);
}
