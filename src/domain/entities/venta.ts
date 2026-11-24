import { ErrorDeDominio } from "../errors/errores.ts";
import { diaLocal } from "../shared/horario-del-local.ts";

export type MetodoDePago = "efectivo" | "tarjeta";

export interface Renglon {
  tipo: "servicio" | "producto";
  productoId: string | null;
  concepto: string;
  cantidad: number;
  precioUnitario: number;
}

export interface DatosVenta {
  id: string; // lo genera el celular del barbero, aunque no haya internet (RN-09, ADR-001)
  barberoId: string;
  citaId: string | null;
  renglones: Renglon[];
  metodo: MetodoDePago;
  creadaEn: string; // ISO 8601, hora del celular
  // Día al que pertenece en el corte. Si cobra una cita, es el día de la cita; si no, el día en que se creó.
  dia?: string;
}

// Una venta en el local: el resto de una cita, productos de mostrador o las dos cosas.
export class Venta {
  private readonly d: DatosVenta;

  private constructor(d: DatosVenta) {
    this.d = d;
  }

  static crear(d: DatosVenta): Venta {
    if (!d.id) throw new ErrorDeDominio("La venta necesita un id");
    if (!d.barberoId) throw new ErrorDeDominio("Cada venta queda a nombre de un barbero"); // RN-12
    if (d.metodo !== "efectivo" && d.metodo !== "tarjeta")
      throw new ErrorDeDominio("El método de pago es efectivo o tarjeta");
    if (Number.isNaN(new Date(d.creadaEn).getTime())) throw new ErrorDeDominio("La fecha de la venta no es válida");
    if (d.renglones.length === 0 && !d.citaId) throw new ErrorDeDominio("La venta no tiene nada que cobrar");
    for (const r of d.renglones) {
      if (!Number.isInteger(r.cantidad) || r.cantidad < 1)
        throw new ErrorDeDominio(`Cantidad inválida en "${r.concepto}"`);
      if (!(r.precioUnitario >= 0)) throw new ErrorDeDominio(`Precio inválido en "${r.concepto}"`);
      if (r.tipo === "producto" && !r.productoId)
        throw new ErrorDeDominio(`"${r.concepto}" necesita el id del producto`);
    }
    return new Venta({ ...d, renglones: d.renglones.map((r) => ({ ...r })) });
  }

  static restaurar(d: DatosVenta): Venta {
    return new Venta(d);
  }

  get id(): string {
    return this.d.id;
  }
  get barberoId(): string {
    return this.d.barberoId;
  }
  get citaId(): string | null {
    return this.d.citaId;
  }
  get metodo(): MetodoDePago {
    return this.d.metodo;
  }
  get renglones(): readonly Renglon[] {
    return this.d.renglones;
  }
  get creadaEn(): Date {
    return new Date(this.d.creadaEn);
  }
  get dia(): string {
    return this.d.dia ?? diaLocal(this.creadaEn);
  }
  get total(): number {
    return this.d.renglones.reduce((s, r) => s + r.cantidad * r.precioUnitario, 0);
  }

  aDatos(): DatosVenta {
    return { ...this.d, renglones: this.d.renglones.map((r) => ({ ...r })) };
  }
}
