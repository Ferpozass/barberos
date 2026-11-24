import type { Cita } from "../../../domain/entities/cita.ts";
import { NoEncontrado } from "../../../domain/errors/errores.ts";
import type { RepositorioCitas, RepositorioPedidos, RepositorioProductos } from "../../ports/repositorios.ts";
import { fechaLegible } from "../../../domain/shared/horario-del-local.ts";
import type { Notificador, Reloj } from "../../ports/servicios-externos.ts";

// UC-03 "Cambiar o cancelar cita" — Actor: Cliente. Hasta 2 horas antes (RN-06).
export class CancelarCita {
  private readonly citas: RepositorioCitas;
  private readonly notificador: Notificador;
  private readonly reloj: Reloj;
  private readonly tienda: { pedidos: RepositorioPedidos; productos: RepositorioProductos } | null;

  constructor(d: { citas: RepositorioCitas; notificador: Notificador; reloj: Reloj; pedidos?: RepositorioPedidos; productos?: RepositorioProductos }) {
    this.tienda = d.pedidos && d.productos ? { pedidos: d.pedidos, productos: d.productos } : null;
    this.citas = d.citas;
    this.notificador = d.notificador;
    this.reloj = d.reloj;
  }

  async ejecutar(e: { citaId: string }): Promise<Cita> {
    const cita = await this.citas.buscarPorId(e.citaId);
    if (!cita) throw new NoEncontrado("Esa cita no existe");
    const estabaPagada = cita.estado === "confirmada";
    cita.cancelar(this.reloj.ahora());
    await this.citas.guardar(cita);
    // Si había apartado productos con la cita y no los pagó, regresan al inventario (regla 30).
    if (this.tienda)
      for (const p of await this.tienda.pedidos.buscarPorCita(cita.id))
        if (await this.tienda.pedidos.cancelarSiPendiente(p.id))
          for (const r of p.renglones) await this.tienda.productos.devolverExistencia(r.productoId, r.cantidad);
    await this.notificador.enviarCorreo({
      para: cita.clienteCorreo,
      asunto: "Tu cita en la barbería quedó cancelada",
      cuerpo: estabaPagada
        ? `Hola ${cita.clienteNombre}, cancelaste tu cita del ${fechaLegible(cita.inicio)}. Te devolveremos $${cita.pagadoEnLinea} a tu tarjeta (regla 7).`
        : `Hola ${cita.clienteNombre}, soltamos el horario que tenías apartado para el ${fechaLegible(cita.inicio)}.`,
    });
    return cita;
  }
}

// UC-15 "Marcar cliente que no llegó" — Actor: Barbero. Pierde su anticipo (RN-07).
export class MarcarNoLlego {
  private readonly citas: RepositorioCitas;
  private readonly reloj: Reloj;

  constructor(d: { citas: RepositorioCitas; reloj: Reloj }) {
    this.citas = d.citas;
    this.reloj = d.reloj;
  }

  async ejecutar(e: { citaId: string }): Promise<Cita> {
    const cita = await this.citas.buscarPorId(e.citaId);
    if (!cita) throw new NoEncontrado("Esa cita no existe");
    cita.marcarNoLlego(this.reloj.ahora());
    await this.citas.guardar(cita);
    return cita;
  }
}

// UC-17 "Ver mi agenda del día" — Actor: Barbero. Consultas sin efectos.
export class VerAgendaDelDia {
  private readonly citas: RepositorioCitas;
  private readonly reloj: Reloj;

  constructor(d: { citas: RepositorioCitas; reloj: Reloj }) {
    this.citas = d.citas;
    this.reloj = d.reloj;
  }

  async ejecutar(e: { barberoId: string; dia: string }): Promise<Cita[]> {
    const ahora = this.reloj.ahora();
    const citas = await this.citas.buscarPorBarberoYDia(e.barberoId, e.dia);
    // Los apartados vencidos sin pagar no le sirven al barbero: no son citas.
    return citas
      .filter((c) => c.estado !== "apartada" || c.ocupaHorario(ahora))
      .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }
}

export class ConsultarCita {
  private readonly citas: RepositorioCitas;

  constructor(d: { citas: RepositorioCitas }) {
    this.citas = d.citas;
  }

  async ejecutar(e: { citaId: string }): Promise<Cita> {
    const cita = await this.citas.buscarPorId(e.citaId);
    if (!cita) throw new NoEncontrado("Esa cita no existe");
    return cita;
  }
}

// UC-25 "Ver mis citas" — Actor: Cliente con sesión.
export class VerMisCitas {
  private readonly citas: RepositorioCitas;
  private readonly reloj: Reloj;

  constructor(d: { citas: RepositorioCitas; reloj: Reloj }) {
    this.citas = d.citas;
    this.reloj = d.reloj;
  }

  async ejecutar(e: { correo: string }): Promise<Cita[]> {
    const ahora = this.reloj.ahora();
    // Igual que en la agenda: un apartado que venció sin pagar ya no cuenta.
    return (await this.citas.buscarPorCorreo(e.correo)).filter((c) => c.estado !== "apartada" || c.ocupaHorario(ahora));
  }
}
