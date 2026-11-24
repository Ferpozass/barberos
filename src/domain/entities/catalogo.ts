import { ErrorDeDominio } from "../errors/errores.ts";

// Barbero, Servicio y Producto: entidades sencillas del catálogo que administra el dueño.

export interface Barbero {
  id: string;
  nombre: string;
  porcentajeComision: number; // 0.40 = 40 %  (RN-12)
  activo: boolean;
}

export interface Servicio {
  id: string;
  nombre: string;
  duracionMin: number;
  precio: number;
}

export interface Producto {
  id: string;
  nombre: string;
  precio: number;
  existencia: number; // una sola existencia para mostrador y línea (RN-10)
}

// RN-12: la comisión del barbero es un porcentaje de lo que cobró.
export function comisionDe(barbero: Barbero, cobrado: number): number {
  if (barbero.porcentajeComision < 0 || barbero.porcentajeComision > 1)
    throw new ErrorDeDominio("El porcentaje de comisión debe estar entre 0 y 100 %");
  return Math.round(cobrado * barbero.porcentajeComision * 100) / 100;
}
