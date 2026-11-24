import type { Cita } from "../../../domain/entities/cita.ts";
import type { Pedido } from "../../../domain/entities/pedido.ts";
import { diasParaCumpleanos, validarPerfil, type Perfil } from "../../../domain/entities/perfil.ts";
import type { UsuarioSesion } from "../../../domain/entities/usuario.ts";
import { ErrorDeDominio } from "../../../domain/errors/errores.ts";
import type { RepositorioCitas, RepositorioPedidos, RepositorioPerfiles, RepositorioUsuarios } from "../../ports/repositorios.ts";
import type { Reloj } from "../../ports/servicios-externos.ts";

interface Deps {
  usuarios: RepositorioUsuarios;
  perfiles: RepositorioPerfiles;
  citas: RepositorioCitas;
  pedidos: RepositorioPedidos;
  reloj: Reloj;
}

export interface MiCuenta {
  usuario: UsuarioSesion;
  perfil: Perfil;
  clienteDesde: string | null;
  conGoogle: boolean;
  citas: Cita[]; // de la más nueva a la más vieja
  pedidos: Pedido[];
  resumen: {
    visitas: number; // citas atendidas
    gastado: number; // servicios atendidos + pedidos pagados
    barberoFrecuenteId: string | null;
    diasParaCumpleanos: number | null;
  };
}

const vacio = (usuarioId: string): Perfil => ({ usuarioId, telefono: null, fechaNacimiento: null, preferencias: null, barberoFavoritoId: null });

// UC-27 "Ver mi cuenta" — Actor: Cliente (también barbero y admin). Solo sus propios datos.
export class VerMiCuenta {
  private readonly d: Deps;
  constructor(d: Deps) {
    this.d = d;
  }

  async ejecutar(e: { usuario: UsuarioSesion }): Promise<MiCuenta> {
    const ahora = this.d.reloj.ahora();
    const [perfil, alta, citasTodas, pedidosTodos, conGoogle] = [
      await this.d.perfiles.buscar(e.usuario.id),
      await this.d.usuarios.fechaDeAlta(e.usuario.id),
      await this.d.citas.buscarPorCorreo(e.usuario.correo),
      await this.d.pedidos.buscarPorCorreo(e.usuario.correo),
      await this.d.usuarios.entraConGoogle(e.usuario.id),
    ];
    // Los apartados que vencieron sin pagar y los pedidos cancelados no son historia del cliente.
    const citas = citasTodas.filter((c) => c.estado !== "apartada" || c.ocupaHorario(ahora));
    const pedidos = pedidosTodos.filter((p) => p.estado !== "cancelado" && !(p.estado === "pendiente" && p.vencido(ahora)));

    const atendidas = citas.filter((c) => c.estado === "atendida");
    const cuenta = new Map<string, number>();
    for (const c of atendidas) cuenta.set(c.barberoId, (cuenta.get(c.barberoId) ?? 0) + 1);
    const frecuente = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const gastado =
      atendidas.reduce((s, c) => s + c.precio, 0) +
      pedidos.filter((p) => p.estado !== "pendiente").reduce((s, p) => s + p.total, 0);

    const p = perfil ?? vacio(e.usuario.id);
    return {
      usuario: e.usuario,
      perfil: p,
      clienteDesde: alta,
      conGoogle,
      citas,
      pedidos,
      resumen: {
        visitas: atendidas.length,
        gastado,
        barberoFrecuenteId: frecuente,
        diasParaCumpleanos: diasParaCumpleanos(p.fechaNacimiento, ahora),
      },
    };
  }
}

// UC-28 "Actualizar mis datos" — Actor: Cliente. El correo no se cambia (es su llave de entrada).
export class ActualizarMisDatos {
  private readonly d: Pick<Deps, "usuarios" | "perfiles" | "reloj">;
  constructor(d: Pick<Deps, "usuarios" | "perfiles" | "reloj">) {
    this.d = d;
  }

  async ejecutar(e: {
    usuario: UsuarioSesion;
    nombre: string;
    telefono?: string | null;
    fechaNacimiento?: string | null;
    preferencias?: string | null;
    barberoFavoritoId?: string | null;
  }): Promise<{ usuario: UsuarioSesion; perfil: Perfil }> {
    const nombre = e.nombre.trim();
    if (nombre.length < 2) throw new ErrorDeDominio("Escribe tu nombre");
    const perfil = validarPerfil(
      {
        usuarioId: e.usuario.id,
        telefono: e.telefono ?? null,
        fechaNacimiento: e.fechaNacimiento ?? null,
        preferencias: e.preferencias ?? null,
        barberoFavoritoId: e.barberoFavoritoId ?? null,
      },
      this.d.reloj.ahora(),
    );
    if (nombre !== e.usuario.nombre) await this.d.usuarios.cambiarNombre(e.usuario.id, nombre);
    await this.d.perfiles.guardar(perfil);
    return { usuario: { ...e.usuario, nombre }, perfil };
  }
}
