import { ErrorDeDominio } from "../errors/errores.ts";

// Un pago en línea ya acreditado por la pasarela. El idPagoProveedor es la llave contra duplicados (RN-08).
export interface Pago {
  idPagoProveedor: string;
  citaId: string;
  barberoId: string;
  monto: number;
  aplicadoEn: string; // ISO 8601
  diaServicio: string; // el día de la cita: el corte y la comisión cuentan el pago en ese día
}

export function crearPago(p: Pago): Pago {
  if (!p.idPagoProveedor) throw new ErrorDeDominio("El pago necesita el id que le dio la pasarela");
  if (!(p.monto > 0)) throw new ErrorDeDominio("El monto del pago debe ser mayor a cero");
  return { ...p };
}

export function diaDelPago(p: Pago): string {
  return p.diaServicio;
}
