import { ErrorDeDominio } from "../errors/errores.ts";
import type { Barbero } from "./catalogo.ts";
import { comisionDe } from "./catalogo.ts";
import type { Cita } from "./cita.ts";
import type { Pago } from "./pago.ts";
import type { Venta } from "./venta.ts";

export interface ComisionDeBarbero {
  barberoId: string;
  nombre: string;
  cobrado: number;
  comision: number;
}

export interface DatosCorte {
  dia: string;
  efectivo: number;
  tarjeta: number;
  enLinea: number;
  tiendaEnLinea: number; // pedidos de la tienda pagados ese día (no llevan comisión de barbero)
  total: number;
  // F5: desglose entre servicios y productos.
  servicios: number;
  productos: number;
  // F5: el efectivo que se contó en la caja al cerrar y la diferencia contra lo esperado.
  efectivoContado: number | null;
  diferencia: number | null;
  comisiones: ComisionDeBarbero[];
  citasSinCobrar: { citaId: string; barberoId: string; inicio: string; cliente: string }[];
  cerradoEn: string | null;
}

// El corte del día. Se calcula con lo que ya está en el servidor; si una venta sigue en el
// celular del barbero, su cita aparece como "sin cobrar" y el corte no se deja cerrar (RN-13).
export class CorteDeCaja {
  private d: DatosCorte;

  private constructor(d: DatosCorte) {
    this.d = d;
  }

  static calcular(p: { dia: string; ventas: Venta[]; pagos: Pago[]; citas: Cita[]; barberos: Barbero[]; tienda?: number[] }): CorteDeCaja {
    const suma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
    const efectivo = suma(p.ventas.filter((v) => v.metodo === "efectivo").map((v) => v.total));
    const tarjeta = suma(p.ventas.filter((v) => v.metodo === "tarjeta").map((v) => v.total));
    const enLinea = suma(p.pagos.map((x) => x.monto));
    const tiendaEnLinea = suma(p.tienda ?? []);
    const deTipo = (tipo: "servicio" | "producto") =>
      suma(p.ventas.flatMap((v) => v.renglones.filter((r) => r.tipo === tipo).map((r) => r.cantidad * r.precioUnitario)));
    // Lo pagado en línea por las citas es servicio; lo de la tienda, producto.
    const servicios = suma([deTipo("servicio"), enLinea]);
    const productos = suma([deTipo("producto"), tiendaEnLinea]);

    // RN-12: lo que cobró cada barbero = sus ventas del día + los pagos en línea de sus citas.
    const comisiones = p.barberos.map((b) => {
      const cobrado = suma([
        ...p.ventas.filter((v) => v.barberoId === b.id).map((v) => v.total),
        ...p.pagos.filter((x) => x.barberoId === b.id).map((x) => x.monto),
      ]);
      return { barberoId: b.id, nombre: b.nombre, cobrado, comision: comisionDe(b, cobrado) };
    });

    // RN-13: una cita confirmada que no tiene cobro registrado = una venta que no ha subido (o que falta hacer).
    const citasSinCobrar = p.citas
      .filter((c) => c.estado === "confirmada")
      .map((c) => ({ citaId: c.id, barberoId: c.barberoId, inicio: c.inicio.toISOString(), cliente: c.clienteNombre }));

    return new CorteDeCaja({
      dia: p.dia,
      efectivo,
      tarjeta,
      enLinea,
      tiendaEnLinea,
      total: suma([efectivo, tarjeta, enLinea, tiendaEnLinea]),
      servicios,
      productos,
      efectivoContado: null,
      diferencia: null,
      comisiones,
      citasSinCobrar,
      cerradoEn: null,
    });
  }

  static restaurar(d: DatosCorte): CorteDeCaja {
    return new CorteDeCaja(d);
  }

  get dia(): string {
    return this.d.dia;
  }
  get puedeCerrarse(): boolean {
    return this.d.cerradoEn === null && this.d.citasSinCobrar.length === 0;
  }

  cerrar(ahora: Date, efectivoContado?: number): void {
    if (this.d.cerradoEn) throw new ErrorDeDominio("El corte de este día ya está cerrado");
    if (this.d.citasSinCobrar.length > 0)
      throw new ErrorDeDominio(
        `No se puede cerrar: hay ${this.d.citasSinCobrar.length} cita(s) sin cobro registrado (ventas sin subir)`,
      );
    if (efectivoContado !== undefined && (!Number.isFinite(efectivoContado) || efectivoContado < 0))
      throw new ErrorDeDominio("El efectivo contado no es válido");
    const contado = efectivoContado ?? null;
    const diferencia = contado === null ? null : Math.round((contado - this.d.efectivo) * 100) / 100;
    this.d = { ...this.d, cerradoEn: ahora.toISOString(), efectivoContado: contado, diferencia };
  }

  aDatos(): DatosCorte {
    return structuredClone(this.d);
  }
}
