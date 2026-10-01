// Casa Lotus · the single in-process write lock. Every write to the Sheet runs inside it, and
// re-reads what it needs inside it, so two web bookings never take the same last swing.
// One process serves the API (one container), so an in-memory FIFO mutex is enough.

export function crearCandado({ esperaMaxMs = 30000 } = {}) {
  let cola = Promise.resolve();
  let ocupado = 0;

  /** Runs fn alone. Waits for earlier holders (FIFO); gives up after esperaMaxMs. */
  async function con(fn) {
    let soltar;
    const turno = new Promise((ok) => (soltar = ok));
    const anterior = cola;
    cola = cola.then(() => turno);
    ocupado++;
    let reloj;
    try {
      await Promise.race([
        anterior,
        new Promise((_, falla) => {
          reloj = setTimeout(() => falla(Object.assign(new Error("El sistema está ocupado. Intenta de nuevo en unos segundos."), { candado: true })), esperaMaxMs);
        }),
      ]);
    } catch (e) {
      clearTimeout(reloj);
      ocupado--;
      // keep the chain intact: our turn passes as soon as the previous holder finishes
      anterior.then(() => soltar());
      throw e;
    }
    clearTimeout(reloj);
    try {
      return await fn();
    } finally {
      ocupado--;
      soltar();
    }
  }

  return { con, get ocupado() { return ocupado; } };
}
