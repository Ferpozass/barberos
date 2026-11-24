import { leerProductos, presentarPedido } from "./controlador-tienda.ts";
import type { AgendarCita } from "../../application/use-cases/agenda/agendar-cita.ts";
import type { ConsultarDisponibilidad } from "../../application/use-cases/agenda/consultar-disponibilidad.ts";
import type {
  CancelarCita,
  ConsultarCita,
  MarcarNoLlego,
  VerAgendaDelDia,
  VerMisCitas,
} from "../../application/use-cases/agenda/gestionar-cita.ts";
import { presentarCita, presentarHorarios } from "../presenters/presentadores.ts";
import type { Cita } from "../../domain/entities/cita.ts";
import { puedeVerCita, type UsuarioSesion } from "../../domain/entities/usuario.ts";
import { SinPermiso } from "../../domain/errors/errores.ts";
import { DatosInvalidos, exigirRol, exigirSesion, fecha, objeto, ok, texto, type Peticion, type Respuesta } from "./peticion.ts";

// El controlador SOLO traduce: lee el DTO, revisa el permiso, llama al caso de uso y pasa el resultado
// al presentador. Ninguna regla de negocio vive aquí (Actividad #2: qué va en el Controller y qué no).
export class ControladorAgenda {
  private readonly uc: {
    agendar: AgendarCita;
    disponibilidad: ConsultarDisponibilidad;
    cancelar: CancelarCita;
    noLlego: MarcarNoLlego;
    agenda: VerAgendaDelDia;
    consultar: ConsultarCita;
    misCitas: VerMisCitas;
  };

  constructor(uc: ControladorAgenda["uc"]) {
    this.uc = uc;
  }

  async disponibilidad(p: Peticion): Promise<Respuesta> {
    const { barberoId, servicioId, dia } = p.query;
    if (!barberoId || !servicioId || !dia) throw new DatosInvalidos("Faltan barberoId, servicioId o dia");
    return ok(presentarHorarios(await this.uc.disponibilidad.ejecutar({ barberoId, servicioId, dia })));
  }

  async agendar(p: Peticion): Promise<Respuesta> {
    // El cliente agenda a su nombre (se toma de su cuenta); el admin puede agendar para alguien más.
    const u = exigirRol(p, "cliente", "admin");
    const b = objeto(p.body);
    const tipoPago = texto(b, "tipoPago");
    if (tipoPago !== "total" && tipoPago !== "anticipo") throw new DatosInvalidos('tipoPago es "total" o "anticipo"');
    const r = await this.uc.agendar.ejecutar({
      barberoId: texto(b, "barberoId"),
      servicioId: texto(b, "servicioId"),
      inicio: fecha(b, "inicio"),
      clienteNombre: u.rol === "cliente" ? u.nombre : texto(b, "clienteNombre"),
      clienteCorreo: u.rol === "cliente" ? u.correo : texto(b, "clienteCorreo"),
      tipoPago,
      productos: leerProductos(b.productos), // "¿algo más?"
    });
    return ok({ cita: presentarCita(r.cita), pedido: r.pedido ? presentarPedido(r.pedido) : null, montoAPagar: r.montoAPagar, urlPago: r.urlPago }, 201);
  }

  async consultar(p: Peticion): Promise<Respuesta> {
    return ok(presentarCita(await this.citaVisible(p, exigirSesion(p))));
  }

  async cancelar(p: Peticion): Promise<Respuesta> {
    const u = exigirRol(p, "cliente", "admin");
    await this.citaVisible(p, u);
    return ok(presentarCita(await this.uc.cancelar.ejecutar({ citaId: p.params.id })));
  }

  async noLlego(p: Peticion): Promise<Respuesta> {
    const u = exigirRol(p, "barbero", "admin");
    await this.citaVisible(p, u);
    return ok(presentarCita(await this.uc.noLlego.ejecutar({ citaId: p.params.id })));
  }

  async agendaDelDia(p: Peticion): Promise<Respuesta> {
    const u = exigirRol(p, "barbero", "admin");
    // El barbero solo ve SU agenda, diga lo que diga la URL.
    const barberoId = u.rol === "barbero" ? u.barberoId : p.query.barberoId;
    const { dia } = p.query;
    if (!barberoId || !dia) throw new DatosInvalidos("Faltan barberoId o dia");
    return ok((await this.uc.agenda.ejecutar({ barberoId, dia })).map(presentarCita));
  }

  async misCitas(p: Peticion): Promise<Respuesta> {
    const u = exigirRol(p, "cliente");
    return ok((await this.uc.misCitas.ejecutar({ correo: u.correo })).map(presentarCita));
  }

  // Trae la cita y revisa que ese usuario la pueda ver (RN-15).
  private async citaVisible(p: Peticion, u: UsuarioSesion): Promise<Cita> {
    const cita = await this.uc.consultar.ejecutar({ citaId: p.params.id });
    if (!puedeVerCita(u, cita)) throw new SinPermiso("Esa cita no es tuya");
    return cita;
  }
}
