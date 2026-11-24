import { ErrorDeDominio } from "../errors/errores.ts";

// Pedido de la tienda en línea (F4 del Hito 1, ADR-012).
// Estados (regla 21): pendiente -> pagado -> preparado -> entregado.  También: cancelado.
// Mientras está "pendiente" aparta la existencia 10 minutos; si no se paga, la suelta sola (reglas 19 y 30).
export type EstadoPedido = "pendiente" | "pagado" | "preparado" | "entregado" | "cancelado";
// Regla 20: recoger en la barbería o envío a domicilio. "en_cita" = lo pidió al agendar ("¿algo más?").
export type Entrega = "recoger" | "domicilio" | "en_cita";

export interface Renglon {
  productoId: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

export const MINUTOS_PARA_PAGAR_PEDIDO = 10;
export const MAX_POR_PRODUCTO = 5; // RN-16
export const COSTO_ENVIO = 60; // envío a domicilio dentro de Querétaro (precio de ejemplo)

export interface DatosPedido {
  id: string;
  clienteNombre: string;
  clienteCorreo: string;
  renglones: Renglon[];
  entrega: Entrega;
  direccion: string | null;
  envio: number;
  estado: EstadoPedido;
  creadoEn: string;
  venceEn: string | null;
  idCobro: string | null;
  idPago: string | null;
  citaId: string | null;
  diaPago: string | null; // día en que se pagó (para el corte de caja)
}

const SIGUIENTE: Partial<Record<EstadoPedido, EstadoPedido>> = { pagado: "preparado", preparado: "entregado" };

export class Pedido {
  private d: DatosPedido;

  private constructor(d: DatosPedido) {
    this.d = d;
  }

  // RN-16: al menos un producto, de 1 a 5 piezas de cada uno, sin renglones repetidos.
  // A domicilio se necesita la dirección.
  static crear(e: {
    id: string;
    clienteNombre: string;
    clienteCorreo: string;
    renglones: Renglon[];
    entrega: Entrega;
    direccion?: string | null;
    citaId?: string | null;
    ahora: Date;
  }): Pedido {
    if (e.renglones.length === 0) throw new ErrorDeDominio("El pedido no tiene productos");
    const vistos = new Set<string>();
    for (const r of e.renglones) {
      if (!Number.isInteger(r.cantidad) || r.cantidad < 1 || r.cantidad > MAX_POR_PRODUCTO)
        throw new ErrorDeDominio(`Puedes pedir de 1 a ${MAX_POR_PRODUCTO} piezas de cada producto`);
      if (vistos.has(r.productoId)) throw new ErrorDeDominio("Hay un producto repetido en el pedido");
      vistos.add(r.productoId);
    }
    const direccion = e.direccion?.trim() || null;
    if (e.entrega === "domicilio" && (!direccion || direccion.length < 10))
      throw new ErrorDeDominio("Escribe la dirección completa para el envío");
    if (e.entrega === "en_cita" && !e.citaId) throw new ErrorDeDominio("El pedido para tu cita necesita la cita");
    return new Pedido({
      id: e.id,
      clienteNombre: e.clienteNombre,
      clienteCorreo: e.clienteCorreo,
      renglones: e.renglones.map((r) => ({ ...r })),
      entrega: e.entrega,
      direccion: e.entrega === "domicilio" ? direccion : null,
      envio: e.entrega === "domicilio" ? COSTO_ENVIO : 0,
      estado: "pendiente",
      creadoEn: e.ahora.toISOString(),
      venceEn: new Date(e.ahora.getTime() + MINUTOS_PARA_PAGAR_PEDIDO * 60_000).toISOString(),
      idCobro: null,
      idPago: null,
      citaId: e.citaId ?? null,
      diaPago: null,
    });
  }

  static desdeDatos(d: DatosPedido): Pedido {
    return new Pedido({ ...d, renglones: d.renglones.map((r) => ({ ...r })) });
  }

  get id() { return this.d.id; }
  get estado() { return this.d.estado; }
  get entrega() { return this.d.entrega; }
  get clienteCorreo() { return this.d.clienteCorreo; }
  get clienteNombre() { return this.d.clienteNombre; }
  get renglones() { return this.d.renglones; }
  get idCobro() { return this.d.idCobro; }
  get citaId() { return this.d.citaId; }
  get subtotal(): number {
    return this.d.renglones.reduce((s, r) => s + r.precio * r.cantidad, 0);
  }
  get total(): number {
    return this.subtotal + this.d.envio;
  }

  // Un pendiente que pasó sus 10 minutos ya no aparta nada (regla 30).
  vencido(ahora: Date): boolean {
    return this.d.estado === "pendiente" && !!this.d.venceEn && new Date(this.d.venceEn) <= ahora;
  }

  // ¿Ocupa piezas que todavía no salen del local? (para no vender lo que no hay, regla 19)
  apartaExistencia(ahora: Date): boolean {
    if (this.d.estado === "pendiente") return !this.vencido(ahora);
    return this.d.estado === "pagado" || this.d.estado === "preparado";
  }

  asignarCobro(idCobro: string) {
    this.d.idCobro = idCobro;
  }

  // Regla 17: se aplica una sola vez. Si ya no está pendiente, no hace nada y regresa false.
  confirmarPago(e: { idPago: string; monto: number; ahora: Date; dia: string }): boolean {
    if (this.d.estado !== "pendiente") return false;
    if (e.monto < this.total) throw new ErrorDeDominio("El pago no cubre el total del pedido");
    this.d.estado = "pagado";
    this.d.idPago = e.idPago;
    this.d.venceEn = null;
    this.d.diaPago = e.dia;
    return true;
  }

  // UC-23 "Actualizar estado del pedido": pagado -> preparado -> entregado.
  avanzar(): EstadoPedido {
    const sig = SIGUIENTE[this.d.estado];
    if (!sig) throw new ErrorDeDominio(`Un pedido ${this.d.estado} no puede avanzar`);
    this.d.estado = sig;
    return sig;
  }

  cancelar() {
    if (this.d.estado !== "pendiente") throw new ErrorDeDominio("Solo se cancela un pedido que no se ha pagado");
    this.d.estado = "cancelado";
  }

  aDatos(): DatosPedido {
    return { ...this.d, renglones: this.d.renglones.map((r) => ({ ...r })) };
  }
}
