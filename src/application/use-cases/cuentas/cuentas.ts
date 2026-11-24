import { normalizarCorreo, validarCuenta, type Rol, type UsuarioSesion } from "../../../domain/entities/usuario.ts";
import { AccesoDenegado, ErrorDeDominio } from "../../../domain/errors/errores.ts";
import type { RepositorioSesiones, RepositorioUnaVez, RepositorioUsuarios } from "../../ports/repositorios.ts";
import type { Cifrador, GeneradorDeIds, Reloj, VerificadorGoogle } from "../../ports/servicios-externos.ts";

const DIAS_DE_SESION = 7;

interface Deps {
  usuarios: RepositorioUsuarios;
  sesiones: RepositorioSesiones;
  cifrador: Cifrador;
  reloj: Reloj;
  ids: GeneradorDeIds;
  unaVez?: RepositorioUnaVez; // dónde queda la constancia de que aceptó el aviso de privacidad
}

// Regla 12 (LFPDPPP): queda guardado cuándo aceptó el aviso de privacidad.
async function anotarPrivacidad(d: Deps, usuarioId: string) {
  await d.unaVez?.marcar(`privacidad:${usuarioId}`, d.reloj.ahora().toISOString());
}

export interface SesionIniciada {
  token: string;
  usuario: UsuarioSesion;
}

const sinHash = ({ hash: _h, ...u }: { hash: string } & UsuarioSesion): UsuarioSesion => u;

// Abre una sesión: un token al azar que vence en 7 días.
async function abrirSesion(d: Deps, usuario: UsuarioSesion): Promise<SesionIniciada> {
  const token = d.ids.nuevo() + d.ids.nuevo(); // dos UUID aleatorios: imposible de adivinar
  const vence = new Date(d.reloj.ahora().getTime() + DIAS_DE_SESION * 24 * 60 * 60 * 1000);
  await d.sesiones.crear({ token, usuarioId: usuario.id, venceEn: vence.toISOString() });
  return { token, usuario };
}

// UC-22 "Crear cuenta" — Actor: Cliente (se registra solo) o el dueño (da de alta barberos y admin).
export class CrearCuenta {
  private readonly d: Deps;
  constructor(d: Deps) {
    this.d = d;
  }

  async ejecutar(e: {
    nombre: string;
    correo: string;
    contrasena: string;
    rol?: Rol;
    barberoId?: string | null;
    aceptaPrivacidad?: boolean;
  }): Promise<SesionIniciada> {
    validarCuenta(e); // RN-14
    const rol = e.rol ?? "cliente";
    if (rol === "cliente" && e.aceptaPrivacidad !== true)
      throw new ErrorDeDominio("Para crear tu cuenta acepta el aviso de privacidad"); // regla 12
    const usuario = {
      id: this.d.ids.nuevo(),
      nombre: e.nombre.trim(),
      correo: normalizarCorreo(e.correo),
      rol,
      barberoId: e.barberoId ?? null,
      hash: await this.d.cifrador.cifrar(e.contrasena),
    };
    if (!(await this.d.usuarios.crear(usuario))) throw new ErrorDeDominio("Ya hay una cuenta con ese correo");
    if (e.aceptaPrivacidad) await anotarPrivacidad(this.d, usuario.id);
    return abrirSesion(this.d, sinHash(usuario));
  }
}

// UC-23 "Iniciar sesión" — Actor: Cliente, Barbero o Administrador.
export class IniciarSesion {
  private readonly d: Deps;
  constructor(d: Deps) {
    this.d = d;
  }

  async ejecutar(e: { correo: string; contrasena: string }): Promise<SesionIniciada> {
    const usuario = await this.d.usuarios.buscarPorCorreo(normalizarCorreo(e.correo));
    // El mismo mensaje en los dos casos: así no se puede averiguar qué correos tienen cuenta.
    if (!usuario || !(await this.d.cifrador.verificar(e.contrasena, usuario.hash)))
      throw new AccesoDenegado("Correo o contraseña incorrectos");
    return abrirSesion(this.d, sinHash(usuario));
  }
}

// UC-26 "Entrar con Google" — Actor: Cliente.
// Google ya comprobó que el correo es suyo. Si ya hay cuenta con ese correo se entra a ella;
// si no, se crea un cliente nuevo. Esa cuenta no tiene contraseña (su hash no es válido),
// así que solo se puede entrar con Google.
export const SIN_CONTRASENA = "google";

export class EntrarConGoogle {
  private readonly d: Deps & { google: VerificadorGoogle };
  constructor(d: Deps & { google: VerificadorGoogle }) {
    this.d = d;
  }

  async ejecutar(e: { credencial: string }): Promise<SesionIniciada> {
    const persona = await this.d.google.verificar(e.credencial);
    if (!persona) throw new AccesoDenegado("Google no confirmó tu cuenta. Intenta de nuevo.");
    const correo = normalizarCorreo(persona.correo);
    const existente = await this.d.usuarios.buscarPorCorreo(correo);
    if (existente) return abrirSesion(this.d, sinHash(existente));
    const nuevo = {
      id: this.d.ids.nuevo(),
      nombre: persona.nombre.trim() || correo.split("@")[0],
      correo,
      rol: "cliente" as const,
      barberoId: null,
      hash: SIN_CONTRASENA,
    };
    await this.d.usuarios.crear(nuevo);
    // El botón de Google dice "al continuar aceptas el aviso de privacidad" (regla 12).
    await anotarPrivacidad(this.d, nuevo.id);
    return abrirSesion(this.d, sinHash(nuevo));
  }
}

// UC-24 "Cerrar sesión".
export class CerrarSesion {
  private readonly sesiones: RepositorioSesiones;
  constructor(d: { sesiones: RepositorioSesiones }) {
    this.sesiones = d.sesiones;
  }

  async ejecutar(e: { token: string }): Promise<void> {
    await this.sesiones.borrar(e.token);
  }
}

// Quién es el dueño de este token (o nadie, si no existe o ya venció).
export class VerSesion {
  private readonly d: Pick<Deps, "usuarios" | "sesiones" | "reloj">;
  constructor(d: Pick<Deps, "usuarios" | "sesiones" | "reloj">) {
    this.d = d;
  }

  async ejecutar(e: { token: string }): Promise<UsuarioSesion | null> {
    const s = await this.d.sesiones.buscar(e.token);
    if (!s || new Date(s.venceEn) <= this.d.reloj.ahora()) return null;
    const u = await this.d.usuarios.buscarPorId(s.usuarioId);
    return u ? sinHash(u) : null;
  }
}
