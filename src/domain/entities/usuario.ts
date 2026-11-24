import { ErrorDeDominio } from "../errors/errores.ts";

// Quién usa el sistema. El cliente se registra solo; barberos y administrador los da de alta el dueño.
export type Rol = "cliente" | "barbero" | "admin";

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  barberoId: string | null; // solo los barberos: cuál de la tabla barberos es
  hash: string; // la contraseña cifrada, nunca la contraseña
}

// Lo que se sabe de quien inició sesión (sin el hash).
export type UsuarioSesion = Omit<Usuario, "hash">;

export const MIN_CONTRASENA = 8;

export const normalizarCorreo = (correo: string) => correo.trim().toLowerCase();

// RN-14: nombre, correo válido y contraseña de al menos 8 caracteres.
export function validarCuenta(d: { nombre: string; correo: string; contrasena: string }): void {
  if (d.nombre.trim().length < 2) throw new ErrorDeDominio("Escribe tu nombre");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarCorreo(d.correo))) throw new ErrorDeDominio("Ese correo no es válido");
  if (d.contrasena.length < MIN_CONTRASENA)
    throw new ErrorDeDominio(`La contraseña necesita al menos ${MIN_CONTRASENA} caracteres`);
}

// RN-15: quién puede ver una cita. El cliente, la suya; el barbero, las de su silla; el admin, todas.
export function puedeVerCita(u: UsuarioSesion, cita: { clienteCorreo: string; barberoId: string }): boolean {
  if (u.rol === "admin") return true;
  if (u.rol === "barbero") return u.barberoId === cita.barberoId;
  return normalizarCorreo(cita.clienteCorreo) === u.correo;
}
