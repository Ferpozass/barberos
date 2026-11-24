import { ErrorDeDominio } from "../errors/errores.ts";
import { MINUTO, dentroDelHorario, diaLocal } from "../shared/horario-del-local.ts";

export type EstadoCita = "apartada" | "confirmada" | "cancelada" | "atendida" | "no_llego";
export type TipoPago = "total" | "anticipo";

// Lo necesario para reconstruir una cita guardada (en memoria o en una tabla).
export interface DatosCita {
  id: string;
  barberoId: string;
  servicioId: string;
  clienteNombre: string;
  clienteCorreo: string;
  inicio: string; // ISO 8601
  duracionMin: number;
  precio: number;
  tipoPago: TipoPago;
  estado: EstadoCita;
  apartadoVenceEn: string | null; // ISO 8601
  idCobro: string | null; // cobro abierto en la pasarela
  pagadoEnLinea: number;
  motivoCancelacion: string | null;
}

const MINUTOS_DE_APARTADO = 10; // RN-02
const PORCENTAJE_ANTICIPO = 0.4; // RN-01
const HORAS_MINIMAS_PARA_CANCELAR = 2; // RN-06

export class Cita {
  readonly id: string;
  private _barberoId: string;
  readonly servicioId: string;
  readonly clienteNombre: string;
  readonly clienteCorreo: string;
  private _inicio: Date;
  readonly duracionMin: number;
  readonly precio: number;
  readonly tipoPago: TipoPago;
  private _estado: EstadoCita;
  private _apartadoVenceEn: Date | null;
  private _idCobro: string | null;
  private _pagadoEnLinea: number;
  private _motivoCancelacion: string | null;

  private constructor(d: DatosCita) {
    this.id = d.id;
    this._barberoId = d.barberoId;
    this.servicioId = d.servicioId;
    this.clienteNombre = d.clienteNombre;
    this.clienteCorreo = d.clienteCorreo;
    this._inicio = new Date(d.inicio);
    this.duracionMin = d.duracionMin;
    this.precio = d.precio;
    this.tipoPago = d.tipoPago;
    this._estado = d.estado;
    this._apartadoVenceEn = d.apartadoVenceEn ? new Date(d.apartadoVenceEn) : null;
    this._idCobro = d.idCobro;
    this._pagadoEnLinea = d.pagadoEnLinea;
    this._motivoCancelacion = d.motivoCancelacion;
  }

  // Cita nueva: pasa por todas las validaciones y nace "apartada" por 10 minutos (RN-02).
  static crear(
    p: {
      id: string;
      barberoId: string;
      servicioId: string;
      clienteNombre: string;
      clienteCorreo: string;
      inicio: Date;
      duracionMin: number;
      precio: number;
      tipoPago: TipoPago;
    },
    ahora: Date,
  ): Cita {
    if (!p.id) throw new ErrorDeDominio("La cita necesita un id");
    if (!p.barberoId) throw new ErrorDeDominio("La cita necesita un barbero");
    if (!p.servicioId) throw new ErrorDeDominio("La cita necesita un servicio");
    if (p.clienteNombre.trim().length < 2) throw new ErrorDeDominio("Escribe tu nombre");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.clienteCorreo))
      throw new ErrorDeDominio("El correo no es válido"); // los avisos van por correo (ADR-005)
    if (p.tipoPago !== "total" && p.tipoPago !== "anticipo")
      throw new ErrorDeDominio("Elige pagar el total o el anticipo");
    if (Number.isNaN(p.inicio.getTime())) throw new ErrorDeDominio("La hora de inicio no es válida");
    if (!Number.isInteger(p.duracionMin) || p.duracionMin < 15 || p.duracionMin > 180)
      throw new ErrorDeDominio("La duración debe ser de 15 a 180 minutos");
    if (!(p.precio > 0)) throw new ErrorDeDominio("El servicio necesita un precio");
    if (p.inicio.getTime() <= ahora.getTime()) throw new ErrorDeDominio("No se puede agendar en el pasado");
    if (!dentroDelHorario(p.inicio, p.duracionMin))
      throw new ErrorDeDominio("Fuera del horario del local (lunes a sábado, 10:00 a 20:00)"); // RN-05

    return new Cita({
      ...p,
      clienteNombre: p.clienteNombre.trim(),
      clienteCorreo: p.clienteCorreo.trim().toLowerCase(),
      inicio: p.inicio.toISOString(),
      estado: "apartada",
      apartadoVenceEn: new Date(ahora.getTime() + MINUTOS_DE_APARTADO * MINUTO).toISOString(),
      idCobro: null,
      pagadoEnLinea: 0,
      motivoCancelacion: null,
    });
  }

  // UC-04 "Registrar cliente sin cita": el cliente ya está en el local, así que nace confirmada y
  // sin anticipo (todo se cobra en el local). El correo es opcional.
  static registrarEnLocal(
    p: { id: string; barberoId: string; servicioId: string; clienteNombre: string; clienteCorreo?: string; inicio: Date; duracionMin: number; precio: number },
    ahora: Date,
  ): Cita {
    const correo = p.clienteCorreo?.trim() || "mostrador@laesquina.local";
    const cita = Cita.crear({ ...p, clienteCorreo: correo, tipoPago: "total" }, new Date(Math.min(ahora.getTime(), p.inicio.getTime() - 1)));
    cita._estado = "confirmada";
    cita._apartadoVenceEn = null;
    return cita;
  }

  // Cita que ya existía: no se vuelve a validar contra la hora actual.
  static restaurar(d: DatosCita): Cita {
    return new Cita(d);
  }

  get barberoId(): string {
    return this._barberoId;
  }
  get inicio(): Date {
    return this._inicio;
  }
  get estado(): EstadoCita {
    return this._estado;
  }
  get apartadoVenceEn(): Date | null {
    return this._apartadoVenceEn;
  }
  get idCobro(): string | null {
    return this._idCobro;
  }
  get pagadoEnLinea(): number {
    return this._pagadoEnLinea;
  }
  get motivoCancelacion(): string | null {
    return this._motivoCancelacion;
  }
  get fin(): Date {
    return new Date(this.inicio.getTime() + this.duracionMin * MINUTO);
  }
  get dia(): string {
    return diaLocal(this.inicio);
  }
  // Lo que falta por cobrar en el local (el resto del anticipo).
  get saldoPendiente(): number {
    return Math.max(0, this.precio - this._pagadoEnLinea);
  }

  // RN-01: se paga el 100% en línea, o un anticipo del 40% y el resto en el local.
  montoAPagarEnLinea(): number {
    return this.tipoPago === "total" ? this.precio : Math.round(this.precio * PORCENTAJE_ANTICIPO);
  }

  apartadoVencido(ahora: Date): boolean {
    return this._estado === "apartada" && this._apartadoVenceEn !== null && this._apartadoVenceEn <= ahora;
  }

  // ¿Esta cita todavía ocupa el horario? Una cancelada o un apartado vencido ya no (RN-02).
  ocupaHorario(ahora: Date): boolean {
    if (this._estado === "cancelada") return false;
    if (this.apartadoVencido(ahora)) return false;
    return true;
  }

  // RN-03: chocan si son del mismo barbero y sus intervalos se enciman.
  // Que una termine justo cuando empieza la otra NO es choque.
  chocaCon(otra: Cita, ahora: Date): boolean {
    if (otra.id === this.id) return false;
    if (otra.barberoId !== this.barberoId) return false;
    if (!otra.ocupaHorario(ahora)) return false;
    return this.inicio < otra.fin && otra.inicio < this.fin;
  }

  // Regla 26: ¿los dos horarios se enciman? (sin importar el barbero)
  seEnciman(otra: Cita): boolean {
    return otra.id !== this.id && this.inicio < otra.fin && otra.inicio < this.fin;
  }

  asignarCobro(idCobro: string): void {
    if (this._estado !== "apartada") throw new ErrorDeDominio("Solo se cobra una cita apartada");
    this._idCobro = idCobro;
  }

  // RN-01: la cita se confirma solo cuando llega el pago completo de lo que tocaba pagar en línea.
  confirmarPago(monto: number): void {
    if (this._estado !== "apartada") throw new ErrorDeDominio(`La cita ya está ${this._estado}`);
    if (monto < this.montoAPagarEnLinea())
      throw new ErrorDeDominio("El pago no cubre lo que se debía pagar en línea");
    this._pagadoEnLinea = monto;
    this._estado = "confirmada";
    this._apartadoVenceEn = null;
  }

  // RN-06: se cancela hasta 2 horas antes. Un apartado sin pagar se puede soltar cuando sea.
  cancelar(ahora: Date, motivo = "Cancelada por el cliente"): void {
    if (this._estado !== "apartada" && this._estado !== "confirmada")
      throw new ErrorDeDominio(`No se puede cancelar una cita ${this._estado}`);
    if (
      this._estado === "confirmada" &&
      this.inicio.getTime() - ahora.getTime() < HORAS_MINIMAS_PARA_CANCELAR * 60 * MINUTO
    )
      throw new ErrorDeDominio("Solo se puede cancelar hasta 2 horas antes de la cita");
    this._estado = "cancelada";
    this._motivoCancelacion = motivo;
  }

  // UC-03 "Cambiar cita": misma regla que cancelar (hasta 2 horas antes) y la nueva hora debe estar
  // en el futuro y dentro del horario del local. Que esté libre lo revisa el repositorio.
  reagendar(nuevoInicio: Date, ahora: Date): void {
    if (this._estado !== "confirmada") throw new ErrorDeDominio("Solo se cambia una cita confirmada");
    if (this._inicio.getTime() - ahora.getTime() < HORAS_MINIMAS_PARA_CANCELAR * 60 * MINUTO)
      throw new ErrorDeDominio("Solo se puede cambiar hasta 2 horas antes de la cita");
    if (Number.isNaN(nuevoInicio.getTime()) || nuevoInicio <= ahora) throw new ErrorDeDominio("Elige una hora en el futuro");
    if (!dentroDelHorario(nuevoInicio, this.duracionMin))
      throw new ErrorDeDominio("Fuera del horario del local (lunes a sábado, 10:00 a 20:00)");
    this._inicio = nuevoInicio;
  }

  // Regla 13: si el barbero falta, la cita pasa a otro barbero a la misma hora.
  reasignar(barberoId: string): void {
    if (this._estado !== "confirmada" && this._estado !== "apartada")
      throw new ErrorDeDominio(`No se puede reasignar una cita ${this._estado}`);
    this._barberoId = barberoId;
  }

  // El local cancela (barbero ausente): no aplica el límite de 2 horas y se devuelve lo pagado (regla 13).
  cancelarPorElLocal(motivo: string): void {
    if (this._estado !== "apartada" && this._estado !== "confirmada")
      throw new ErrorDeDominio(`No se puede cancelar una cita ${this._estado}`);
    this._estado = "cancelada";
    this._motivoCancelacion = motivo;
  }

  // El barbero cobró el servicio en el local.
  registrarAtencion(): void {
    if (this._estado !== "confirmada") throw new ErrorDeDominio(`No se puede cobrar una cita ${this._estado}`);
    this._estado = "atendida";
  }

  // RN-07: si no llega, pierde su anticipo (no se devuelve nada).
  marcarNoLlego(ahora: Date): void {
    if (this._estado !== "confirmada") throw new ErrorDeDominio(`No se puede marcar una cita ${this._estado}`);
    if (ahora < this.inicio) throw new ErrorDeDominio("Todavía no es la hora de la cita");
    this._estado = "no_llego";
  }

  aDatos(): DatosCita {
    return {
      id: this.id,
      barberoId: this.barberoId,
      servicioId: this.servicioId,
      clienteNombre: this.clienteNombre,
      clienteCorreo: this.clienteCorreo,
      inicio: this.inicio.toISOString(),
      duracionMin: this.duracionMin,
      precio: this.precio,
      tipoPago: this.tipoPago,
      estado: this._estado,
      apartadoVenceEn: this._apartadoVenceEn ? this._apartadoVenceEn.toISOString() : null,
      idCobro: this._idCobro,
      pagadoEnLinea: this._pagadoEnLinea,
      motivoCancelacion: this._motivoCancelacion,
    };
  }
}
