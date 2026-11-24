import { Cita } from "../../../domain/entities/cita.ts";
import { ErrorDeDominio, NoEncontrado } from "../../../domain/errors/errores.ts";
import {
  HORA_APERTURA,
  HORA_CIERRE,
  diaLocal,
  esDiaValido,
  fechaDelDia,
  fechaLegible,
} from "../../../domain/shared/horario-del-local.ts";
import type { RepositorioBloqueos, RepositorioCatalogo, RepositorioCitas, RepositorioUnaVez } from "../../ports/repositorios.ts";
import type { GeneradorDeIds, Notificador, Reloj } from "../../ports/servicios-externos.ts";

// Casos de uso del día a día del local que maneja el administrador (y los recordatorios del sistema).

const SIN_CORREO = "mostrador@laesquina.local"; // cliente sin cita que no dejó correo
const avisar = async (n: Notificador, c: Cita, asunto: string, cuerpo: string) => {
  if (c.clienteCorreo !== SIN_CORREO) await n.enviarCorreo({ para: c.clienteCorreo, asunto, cuerpo });
};

// UC-04 "Registrar cliente sin cita" — Actor: Administrador (reglas 4 y 9).
// Llegó sin cita y el barbero está libre: se registra a mano, sin anticipo.
export class RegistrarClienteSinCita {
  private readonly d: { citas: RepositorioCitas; catalogo: RepositorioCatalogo; reloj: Reloj; ids: GeneradorDeIds };
  constructor(d: RegistrarClienteSinCita["d"]) {
    this.d = d;
  }

  async ejecutar(e: { barberoId: string; servicioId: string; clienteNombre: string; clienteCorreo?: string; inicio?: Date }): Promise<Cita> {
    const ahora = this.d.reloj.ahora();
    const barbero = await this.d.catalogo.buscarBarbero(e.barberoId);
    if (!barbero || !barbero.activo) throw new NoEncontrado("Ese barbero no existe o no está disponible");
    const servicio = await this.d.catalogo.buscarServicio(e.servicioId);
    if (!servicio) throw new NoEncontrado("Ese servicio no existe");
    // Por defecto empieza en el siguiente múltiplo de 5 minutos.
    const inicio = e.inicio ?? new Date(Math.ceil((ahora.getTime() + 60_000) / 300_000) * 300_000);
    const cita = Cita.registrarEnLocal(
      { id: this.d.ids.nuevo(), barberoId: barbero.id, servicioId: servicio.id, clienteNombre: e.clienteNombre, clienteCorreo: e.clienteCorreo, inicio, duracionMin: servicio.duracionMin, precio: servicio.precio },
      ahora,
    );
    // Regla 4: aunque sea en el local, no se le encima a otra cita del mismo barbero.
    if (!(await this.d.citas.apartarSiLibre(cita, ahora)))
      throw new ErrorDeDominio(`${barbero.nombre} no está libre a esa hora`);
    return cita;
  }
}

// UC-18 "Bloquear horario de un barbero" — Actor: Administrador (reglas 4 y 5).
// Ese rato ya no se ofrece en línea. No se deja bloquear encima de una cita: primero se mueve la cita.
export class BloquearHorario {
  private readonly d: { citas: RepositorioCitas; bloqueos: RepositorioBloqueos; reloj: Reloj; ids: GeneradorDeIds };
  constructor(d: BloquearHorario["d"]) {
    this.d = d;
  }

  async ejecutar(e: { barberoId: string; dia: string; desde: string; hasta: string; motivo?: string }) {
    if (!esDiaValido(e.dia)) throw new ErrorDeDominio("El día no es válido");
    const [h1, m1] = e.desde.split(":").map(Number);
    const [h2, m2] = e.hasta.split(":").map(Number);
    const desde = fechaDelDia(e.dia, h1, m1);
    const hasta = fechaDelDia(e.dia, h2, m2);
    if (!(desde < hasta)) throw new ErrorDeDominio("La hora final debe ser después de la inicial");
    const ahora = this.d.reloj.ahora();
    const choca = (await this.d.citas.buscarPorBarberoYDia(e.barberoId, e.dia)).filter(
      (c) => c.ocupaHorario(ahora) && c.estado !== "atendida" && c.estado !== "no_llego" && c.inicio < hasta && desde < c.fin,
    );
    if (choca.length) throw new ErrorDeDominio(`Hay ${choca.length} cita(s) en ese rato; muévelas o marca al barbero ausente`);
    const b = { id: this.d.ids.nuevo(), barberoId: e.barberoId, dia: e.dia, desde: desde.toISOString(), hasta: hasta.toISOString(), motivo: e.motivo?.trim() || "Bloqueado" };
    await this.d.bloqueos.crear(b);
    return b;
  }
}

// UC-06 "Marcar barbero ausente" — Actor: Administrador (regla 13).
// Cada cita del día pasa a otro barbero libre a la misma hora; si no hay, se cancela, se avisa
// por correo y queda en la lista de devoluciones. Nadie se entera al llegar al local (F2).
export class MarcarBarberoAusente {
  private readonly d: {
    citas: RepositorioCitas;
    catalogo: RepositorioCatalogo;
    bloqueos: RepositorioBloqueos;
    notificador: Notificador;
    reloj: Reloj;
    ids: GeneradorDeIds;
  };
  constructor(d: MarcarBarberoAusente["d"]) {
    this.d = d;
  }

  async ejecutar(e: { barberoId: string; dia: string }): Promise<{ reasignadas: number; canceladas: number }> {
    if (!esDiaValido(e.dia)) throw new ErrorDeDominio("El día no es válido");
    const ausente = await this.d.catalogo.buscarBarbero(e.barberoId);
    if (!ausente) throw new NoEncontrado("Ese barbero no existe");
    const ahora = this.d.reloj.ahora();

    // 1. Se bloquea su día completo para que ya no le caigan citas en línea.
    await this.d.bloqueos.crear({
      id: this.d.ids.nuevo(),
      barberoId: ausente.id,
      dia: e.dia,
      desde: fechaDelDia(e.dia, HORA_APERTURA).toISOString(),
      hasta: fechaDelDia(e.dia, HORA_CIERRE).toISOString(),
      motivo: "Ausente",
    });

    // 2. Sus citas activas: a otro barbero, o se cancelan.
    const otros = (await this.d.catalogo.listarBarberos()).filter((b) => b.activo && b.id !== ausente.id);
    const suyas = (await this.d.citas.buscarPorBarberoYDia(ausente.id, e.dia)).filter(
      (c) => (c.estado === "confirmada" || c.estado === "apartada") && c.ocupaHorario(ahora),
    );
    let reasignadas = 0;
    let canceladas = 0;
    for (const cita of suyas) {
      let nuevo = null;
      for (const b of otros) {
        cita.reasignar(b.id);
        if (await this.d.citas.apartarSiLibre(cita, ahora)) {
          nuevo = b;
          break;
        }
      }
      if (nuevo) {
        reasignadas++;
        await avisar(this.d.notificador, cita, "Cambió tu barbero",
          `Hola ${cita.clienteNombre}, ${ausente.nombre} no podrá atenderte el ${fechaLegible(cita.inicio)}. Te atiende ${nuevo.nombre} a la misma hora.`);
      } else {
        cita.reasignar(ausente.id);
        const pagado = cita.pagadoEnLinea;
        cita.cancelarPorElLocal(`${ausente.nombre} no vino y no había otro barbero libre`);
        await this.d.citas.guardar(cita);
        canceladas++;
        await avisar(this.d.notificador, cita, "Tuvimos que cancelar tu cita",
          `Hola ${cita.clienteNombre}, una disculpa: ${ausente.nombre} no podrá atenderte el ${fechaLegible(cita.inicio)} y no hay otro barbero libre a esa hora.` +
            (pagado > 0 ? ` Te devolvemos tus $${pagado}.` : ""));
      }
    }
    return { reasignadas, canceladas };
  }
}

// UC-03 "Cambiar cita" — Actor: Cliente (regla 6). Hasta 2 horas antes, a una hora libre del mismo barbero.
export class ReagendarCita {
  private readonly d: { citas: RepositorioCitas; notificador: Notificador; reloj: Reloj };
  constructor(d: ReagendarCita["d"]) {
    this.d = d;
  }

  async ejecutar(e: { citaId: string; inicio: Date }): Promise<Cita> {
    const cita = await this.d.citas.buscarPorId(e.citaId);
    if (!cita) throw new NoEncontrado("Esa cita no existe");
    const ahora = this.d.reloj.ahora();
    const antes = cita.inicio;
    cita.reagendar(e.inicio, ahora);
    // Mismo candado que al agendar: el repositorio revisa que esté libre (y sin bloqueo) antes de guardar.
    if (!(await this.d.citas.apartarSiLibre(cita, ahora))) throw new ErrorDeDominio("Esa hora ya no está libre; elige otra");
    await avisar(this.d.notificador, cita, "Cambiaste tu cita",
      `Hola ${cita.clienteNombre}, tu cita pasó del ${fechaLegible(antes)} al ${fechaLegible(cita.inicio)}.`);
    return cita;
  }
}

// UC-05 "Enviar recordatorios" — Actor: Sistema (reglas 10 y 11). Corre cada minuto con la conciliación.
// Un recordatorio 24 horas antes y otro 2 horas antes, cada uno UNA sola vez aunque el proceso se repita.
export class EnviarRecordatorios {
  private readonly d: { citas: RepositorioCitas; unaVez: RepositorioUnaVez; notificador: Notificador; reloj: Reloj; urlBase: string };
  constructor(d: EnviarRecordatorios["d"]) {
    this.d = d;
  }

  async ejecutar(): Promise<{ enviados: number }> {
    const ahora = this.d.reloj.ahora();
    const en = (horas: number) => new Date(ahora.getTime() + horas * 60 * 60_000);
    let enviados = 0;
    for (const [tipo, horas] of [["24h", 24], ["2h", 2]] as const) {
      // Las de dentro de 2 horas solo reciben el de 2 h (el de 24 h ya no tiene caso).
      const citas = await this.d.citas.buscarConfirmadasEntre(tipo === "24h" ? en(2) : ahora, en(horas));
      for (const c of citas) {
        if (!(await this.d.unaVez.marcar(`recordatorio-${tipo}:${c.id}`, ahora.toISOString()))) continue;
        await avisar(this.d.notificador, c, tipo === "24h" ? "Mañana es tu cita" : "Tu cita es en 2 horas",
          `Hola ${c.clienteNombre}, te recordamos tu cita del ${fechaLegible(c.inicio)}. ` +
            `Si necesitas cambiarla o cancelarla (hasta 2 horas antes), entra aquí: ${this.d.urlBase}/#cliente`);
        enviados++;
      }
    }
    return { enviados };
  }
}

export const hoyEn = (r: Reloj) => diaLocal(r.ahora());
