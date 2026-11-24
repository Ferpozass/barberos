import type { Rol, UsuarioSesion } from "../../domain/entities/usuario.ts";
import { AccesoDenegado, ErrorDeDominio, NoEncontrado, SinPermiso } from "../../domain/errors/errores.ts";

// Forma neutra de una petición y su respuesta. El servidor HTTP (infraestructura) traduce a esto;
// así los controladores no dependen de node:http ni de ningún framework web.
export interface Peticion {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  token?: string | null; // el token de sesión que mandó el navegador (cabecera Authorization)
  usuario?: UsuarioSesion | null; // quién es, ya resuelto por el servidor a partir del token
}

export interface Respuesta {
  estado: number;
  cuerpo: unknown;
}

// El DTO que mandó el cliente está mal formado (no es una regla de negocio: es un dato que no se puede leer).
export class DatosInvalidos extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "DatosInvalidos";
  }
}

export const ok = (cuerpo: unknown, estado = 200): Respuesta => ({ estado, cuerpo });

// Traduce los errores del núcleo a códigos HTTP. Es lo único "HTTP" que saben los adaptadores.
export function aRespuestaDeError(err: unknown): Respuesta {
  if (err instanceof DatosInvalidos) return { estado: 400, cuerpo: { error: err.message } };
  if (err instanceof AccesoDenegado) return { estado: 401, cuerpo: { error: err.message } };
  if (err instanceof SinPermiso) return { estado: 403, cuerpo: { error: err.message } };
  if (err instanceof NoEncontrado) return { estado: 404, cuerpo: { error: err.message } };
  if (err instanceof ErrorDeDominio) return { estado: 409, cuerpo: { error: err.message } };
  console.error(err);
  return { estado: 500, cuerpo: { error: "Error interno" } };
}

// Lectores de campos del cuerpo: validan TIPO y presencia, no reglas de negocio.
export function objeto(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new DatosInvalidos("Se esperaba un objeto JSON");
  return v as Record<string, unknown>;
}

export function texto(o: Record<string, unknown>, campo: string): string {
  const v = o[campo];
  if (typeof v !== "string" || v.length === 0) throw new DatosInvalidos(`Falta el campo "${campo}"`);
  return v;
}

export function numero(o: Record<string, unknown>, campo: string): number {
  const v = o[campo];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new DatosInvalidos(`El campo "${campo}" debe ser número`);
  return v;
}

export function fecha(o: Record<string, unknown>, campo: string): Date {
  const d = new Date(texto(o, campo));
  if (Number.isNaN(d.getTime())) throw new DatosInvalidos(`El campo "${campo}" no es una fecha`);
  return d;
}

// Permisos: lo revisa el controlador antes de llamar al caso de uso.
export function exigirSesion(p: Peticion): UsuarioSesion {
  if (!p.usuario) throw new AccesoDenegado("Inicia sesión para continuar");
  return p.usuario;
}

export function exigirRol(p: Peticion, ...roles: Rol[]): UsuarioSesion {
  const u = exigirSesion(p);
  if (!roles.includes(u.rol)) throw new SinPermiso();
  return u;
}
