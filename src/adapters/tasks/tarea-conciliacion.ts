import type { ConciliarPagos } from "../../application/use-cases/pagos/confirmar-pago.ts";

// Tarea programada: cada N segundos le pregunta a la pasarela por los cobros abiertos (ADR-004).
// Es un adaptador "de entrada" igual que un controlador, solo que lo dispara el reloj y no una petición.
export function iniciarConciliacion(conciliar: ConciliarPagos, cadaSegundos: number): () => void {
  const id = setInterval(async () => {
    try {
      const r = await conciliar.ejecutar();
      if (r.confirmadas > 0) console.log(`[conciliación] ${r.confirmadas} pago(s) encontrados sin webhook`);
    } catch (err) {
      console.error("[conciliación] falló, se reintenta en la siguiente vuelta:", err);
    }
  }, cadaSegundos * 1000);
  return () => clearInterval(id);
}
