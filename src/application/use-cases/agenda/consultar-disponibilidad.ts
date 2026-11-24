import { Cita } from "../../../domain/entities/cita.ts";
import { ErrorDeDominio, NoEncontrado } from "../../../domain/errors/errores.ts";
import {
  HORA_APERTURA,
  HORA_CIERRE,
  dentroDelHorario,
  esDiaValido,
  fechaDelDia,
} from "../../../domain/shared/horario-del-local.ts";
import type { RepositorioBloqueos, RepositorioCatalogo, RepositorioCitas } from "../../ports/repositorios.ts";
import type { Reloj } from "../../ports/servicios-externos.ts";

export interface Horario {
  inicio: Date;
  libre: boolean;
}

const PASO_MIN = 30;

// UC-13 "Ver horarios disponibles" — Actor: Cliente. Solo se ofrecen los horarios libres (RN-03, RN-05).
export class ConsultarDisponibilidad {
  private readonly citas: RepositorioCitas;
  private readonly catalogo: RepositorioCatalogo;
  private readonly reloj: Reloj;
  private readonly bloqueos: RepositorioBloqueos | null;

  constructor(d: { citas: RepositorioCitas; catalogo: RepositorioCatalogo; reloj: Reloj; bloqueos?: RepositorioBloqueos }) {
    this.bloqueos = d.bloqueos ?? null;
    this.citas = d.citas;
    this.catalogo = d.catalogo;
    this.reloj = d.reloj;
  }

  async ejecutar(e: { barberoId: string; servicioId: string; dia: string }): Promise<Horario[]> {
    if (!esDiaValido(e.dia)) throw new ErrorDeDominio("El día no es válido");
    const servicio = await this.catalogo.buscarServicio(e.servicioId);
    if (!servicio) throw new NoEncontrado("Ese servicio no existe");
    const barbero = await this.catalogo.buscarBarbero(e.barberoId);
    if (!barbero) throw new NoEncontrado("Ese barbero no existe");

    const ahora = this.reloj.ahora();
    const ocupadas: { inicio: Date; fin: Date }[] = (await this.citas.buscarPorBarberoYDia(barbero.id, e.dia)).filter((c) =>
      c.ocupaHorario(ahora),
    );
    // UC-18: los bloqueos (descanso, ausencia) también ocupan el horario.
    if (this.bloqueos)
      for (const b of await this.bloqueos.buscarPorBarberoYDia(barbero.id, e.dia))
        ocupadas.push({ inicio: new Date(b.desde), fin: new Date(b.hasta) });

    const horarios: Horario[] = [];
    for (let min = HORA_APERTURA * 60; min < HORA_CIERRE * 60; min += PASO_MIN) {
      const inicio = fechaDelDia(e.dia, Math.floor(min / 60), min % 60);
      if (!dentroDelHorario(inicio, servicio.duracionMin)) continue;
      const fin = inicio.getTime() + servicio.duracionMin * 60_000;
      const choca = ocupadas.some((c) => inicio < c.fin && c.inicio.getTime() < fin);
      horarios.push({ inicio, libre: inicio > ahora && !choca });
    }
    return horarios;
  }
}
