import type {
  BloquearHorario,
  MarcarBarberoAusente,
  ReagendarCita,
  RegistrarClienteSinCita,
} from "../../application/use-cases/agenda/operacion-del-local.ts";
import type {
  DevolverPago,
  GuardarBarbero,
  GuardarProducto,
  GuardarServicio,
  VerDevolucionesPendientes,
  VerMiComision,
} from "../../application/use-cases/caja/administracion.ts";
import type { RepositorioBloqueos, RepositorioCitas } from "../../application/ports/repositorios.ts";
import type { CambiarApariencia, VerApariencia } from "../../application/use-cases/catalogo/apariencia.ts";
import { SinPermiso } from "../../domain/errors/errores.ts";
import { presentarCita } from "../presenters/presentadores.ts";
import { DatosInvalidos, exigirRol, fecha, numero, objeto, ok, texto, type Peticion, type Respuesta } from "./peticion.ts";
import { puedeVerCita } from "../../domain/entities/usuario.ts";

// Lo que hace el administrador en el día a día (y el barbero con su comisión y el cliente al cambiar su cita).
export class ControladorLocal {
  private readonly uc: {
    sinCita: RegistrarClienteSinCita;
    bloquear: BloquearHorario;
    ausente: MarcarBarberoAusente;
    reagendar: ReagendarCita;
    devoluciones: VerDevolucionesPendientes;
    devolver: DevolverPago;
    guardarServicio: GuardarServicio;
    guardarProducto: GuardarProducto;
    guardarBarbero: GuardarBarbero;
    miComision: VerMiComision;
    bloqueos: RepositorioBloqueos;
    citas: RepositorioCitas;
    verApariencia: VerApariencia;
    cambiarApariencia: CambiarApariencia;
  };

  constructor(uc: ControladorLocal["uc"]) {
    this.uc = uc;
  }

  // UC-04
  async sinCita(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    const b = objeto(p.body);
    const cita = await this.uc.sinCita.ejecutar({
      barberoId: texto(b, "barberoId"),
      servicioId: texto(b, "servicioId"),
      clienteNombre: texto(b, "clienteNombre"),
      clienteCorreo: typeof b.clienteCorreo === "string" ? b.clienteCorreo : undefined,
      inicio: b.inicio ? fecha(b, "inicio") : undefined,
    });
    return ok(presentarCita(cita), 201);
  }

  // UC-18
  async bloquear(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    const b = objeto(p.body);
    return ok(
      await this.uc.bloquear.ejecutar({
        barberoId: texto(b, "barberoId"),
        dia: texto(b, "dia"),
        desde: texto(b, "desde"),
        hasta: texto(b, "hasta"),
        motivo: typeof b.motivo === "string" ? b.motivo : undefined,
      }),
      201,
    );
  }

  async verBloqueos(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin", "barbero");
    return ok(await this.uc.bloqueos.buscarPorDia(p.query.dia ?? ""));
  }

  async quitarBloqueo(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    await this.uc.bloqueos.borrar(p.params.id);
    return ok({ ok: true });
  }

  // UC-06
  async ausente(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    const b = objeto(p.body);
    return ok(await this.uc.ausente.ejecutar({ barberoId: texto(b, "barberoId"), dia: texto(b, "dia") }));
  }

  // UC-03 (cambiar): el cliente con su cita, o el admin con cualquiera.
  async reagendar(p: Peticion): Promise<Respuesta> {
    const u = exigirRol(p, "cliente", "admin");
    const cita = await this.uc.citas.buscarPorId(p.params.id);
    if (!cita || !puedeVerCita(u, cita)) throw new SinPermiso("Esa cita no es tuya");
    return ok(presentarCita(await this.uc.reagendar.ejecutar({ citaId: cita.id, inicio: fecha(objeto(p.body), "inicio") })));
  }

  // UC-16
  async devoluciones(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    return ok((await this.uc.devoluciones.ejecutar()).map(presentarCita));
  }

  async devolver(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    return ok(await this.uc.devolver.ejecutar({ citaId: p.params.id }));
  }

  // UC-10, UC-24, UC-25 (regla 25: solo el administrador)
  async guardarServicio(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    const b = objeto(p.body);
    return ok(await this.uc.guardarServicio.ejecutar({ id: opcional(b.id), nombre: texto(b, "nombre"), duracionMin: numero(b, "duracionMin"), precio: numero(b, "precio") }));
  }

  async guardarProducto(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    const b = objeto(p.body);
    return ok(await this.uc.guardarProducto.ejecutar({ id: opcional(b.id), nombre: texto(b, "nombre"), precio: numero(b, "precio"), existencia: numero(b, "existencia") }));
  }

  async guardarBarbero(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    const b = objeto(p.body);
    return ok(
      await this.uc.guardarBarbero.ejecutar({
        id: opcional(b.id),
        nombre: texto(b, "nombre"),
        porcentajeComision: numero(b, "porcentajeComision"),
        activo: b.activo === undefined ? true : b.activo === true,
      }),
    );
  }

  // UC-29: la paleta de colores. Leerla es público (la página la necesita al abrir); cambiarla, solo el admin.
  async apariencia(_p: Peticion): Promise<Respuesta> {
    return ok(await this.uc.verApariencia.ejecutar());
  }

  async cambiarApariencia(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    return ok(await this.uc.cambiarApariencia.ejecutar({ paleta: texto(objeto(p.body), "paleta") }));
  }

  // UC-12: el barbero ve SOLO su comisión (regla 24).
  async miComision(p: Peticion): Promise<Respuesta> {
    const u = exigirRol(p, "barbero");
    if (!u.barberoId) throw new DatosInvalidos("Tu cuenta no tiene silla asignada");
    return ok(await this.uc.miComision.ejecutar({ barberoId: u.barberoId, dia: p.query.dia ?? "" }));
  }
}

const opcional = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
