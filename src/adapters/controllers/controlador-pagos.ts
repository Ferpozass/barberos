import type { ConciliarPagos, ConfirmarPago } from "../../application/use-cases/pagos/confirmar-pago.ts";
import type { ConfirmarPagoPedido } from "../../application/use-cases/tienda/tienda.ts";
import { exigirRol, objeto, ok, texto, type Peticion, type Respuesta } from "./peticion.ts";

export class ControladorPagos {
  private readonly confirmar: ConfirmarPago;
  private readonly conciliar: ConciliarPagos;

  private readonly confirmarPedido: ConfirmarPagoPedido | null;

  constructor(uc: { confirmar: ConfirmarPago; conciliar: ConciliarPagos; confirmarPedido?: ConfirmarPagoPedido }) {
    this.confirmar = uc.confirmar;
    this.conciliar = uc.conciliar;
    this.confirmarPedido = uc.confirmarPedido ?? null;
  }

  // Webhook de la pasarela. Del cuerpo solo se toma la referencia (el id de la cita);
  // el monto y el estado se le preguntan a la pasarela dentro del caso de uso.
  async webhook(p: Peticion): Promise<Respuesta> {
    const referencia = texto(objeto(p.body), "referencia");
    // La referencia es el id de una cita o el de un pedido de la tienda.
    let resultado: string = await this.confirmar.ejecutar({ citaId: referencia });
    if (resultado === "cobro_desconocido" && this.confirmarPedido)
      resultado = await this.confirmarPedido.ejecutar({ pedidoId: referencia });
    // Siempre 200: si la pasarela recibe error, reintenta, y el caso de uso ya es idempotente.
    return ok({ resultado });
  }

  async conciliarAhora(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    return ok(await this.conciliar.ejecutar());
  }
}
