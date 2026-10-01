/** Colombian mobile as she types it, readable: "3128720888" → "312 872 0888". */
export function formatoCelular(texto) {
  const d = String(texto).replace(/\D/g, "").replace(/^57(?=3\d{9}$)/, "").slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(" ");
}
