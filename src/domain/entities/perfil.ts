import { ErrorDeDominio } from "../errors/errores.ts";

// Datos personales del cliente, aparte de la cuenta (nombre, correo y contraseña viven en Usuario).
// Todo es opcional: el cliente llena lo que quiera desde "Mi cuenta".
export interface Perfil {
  usuarioId: string;
  telefono: string | null; // 10 dígitos (México)
  fechaNacimiento: string | null; // AAAA-MM-DD
  preferencias: string | null; // "cómo te gusta tu corte", para el barbero
  barberoFavoritoId: string | null;
}

const MAX_PREFERENCIAS = 280;

// RN-17: el perfil se guarda solo con datos que tengan sentido.
export function validarPerfil(p: Perfil, hoy: Date): Perfil {
  const telefono = p.telefono ? p.telefono.replace(/[\s()-]/g, "").replace(/^\+?52/, "") : null;
  if (telefono && !/^\d{10}$/.test(telefono)) throw new ErrorDeDominio("El teléfono debe tener 10 dígitos");

  let fechaNacimiento: string | null = null;
  if (p.fechaNacimiento) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fechaNacimiento)) throw new ErrorDeDominio("La fecha de nacimiento no es válida");
    const f = new Date(p.fechaNacimiento + "T12:00:00");
    if (Number.isNaN(f.getTime())) throw new ErrorDeDominio("La fecha de nacimiento no es válida");
    const edad = (hoy.getTime() - f.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (edad < 3 || edad > 110) throw new ErrorDeDominio("Revisa tu fecha de nacimiento");
    fechaNacimiento = p.fechaNacimiento;
  }

  const preferencias = p.preferencias?.trim() || null;
  if (preferencias && preferencias.length > MAX_PREFERENCIAS)
    throw new ErrorDeDominio(`Las preferencias van en máximo ${MAX_PREFERENCIAS} caracteres`);

  return { usuarioId: p.usuarioId, telefono, fechaNacimiento, preferencias, barberoFavoritoId: p.barberoFavoritoId || null };
}

// ¿Cuántos días faltan para su cumpleaños? (0 = hoy). Null si no lo ha dicho.
export function diasParaCumpleanos(fechaNacimiento: string | null, hoy: Date): number | null {
  if (!fechaNacimiento) return null;
  const [, m, d] = fechaNacimiento.split("-").map(Number);
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let siguiente = new Date(hoy.getFullYear(), m - 1, d);
  if (siguiente < base) siguiente = new Date(hoy.getFullYear() + 1, m - 1, d);
  return Math.round((siguiente.getTime() - base.getTime()) / (24 * 60 * 60 * 1000));
}
