import type { Barbero, Producto, Servicio } from "../../../domain/entities/catalogo.ts";
import type { Cita } from "../../../domain/entities/cita.ts";
import { ErrorDeDominio, NoEncontrado } from "../../../domain/errors/errores.ts";
import { fechaLegible } from "../../../domain/shared/horario-del-local.ts";
import type {
  RepositorioCatalogo,
  RepositorioCitas,
  RepositorioPagos,
  RepositorioProductos,
  RepositorioUnaVez,
} from "../../ports/repositorios.ts";
import type { Notificador, PasarelaDePago, Reloj } from "../../ports/servicios-externos.ts";
import type { GenerarCorteDeCaja } from "./corte-de-caja.ts";

// ---------- Devoluciones (regla 7) ----------
// Cancelada a tiempo (o por el local) con algo pagado en línea = hay que devolverle su dinero.
// Si no llegó, NO se devuelve (regla 8): esa cita queda "no_llego", no "cancelada".

export class VerDevolucionesPendientes {
  private readonly d: { citas: RepositorioCitas; unaVez: RepositorioUnaVez };
  constructor(d: VerDevolucionesPendientes["d"]) {
    this.d = d;
  }
  async ejecutar(): Promise<Cita[]> {
    const canceladas = await this.d.citas.buscarCanceladasConPago();
    const pendientes: Cita[] = [];
    for (const c of canceladas) if (!(await this.d.unaVez.existe(`devolucion:${c.id}`))) pendientes.push(c);
    return pendientes;
  }
}

// UC-16 "Devolver dinero por cancelación" — Actor: Administrador.
// La clave única "devolucion:<cita>" impide devolver dos veces aunque se dé doble clic.
export class DevolverPago {
  private readonly d: {
    citas: RepositorioCitas;
    pagos: RepositorioPagos;
    unaVez: RepositorioUnaVez;
    pasarela: PasarelaDePago;
    notificador: Notificador;
    reloj: Reloj;
  };
  constructor(d: DevolverPago["d"]) {
    this.d = d;
  }

  async ejecutar(e: { citaId: string }): Promise<{ devuelto: number }> {
    const cita = await this.d.citas.buscarPorId(e.citaId);
    if (!cita) throw new NoEncontrado("Esa cita no existe");
    if (cita.estado !== "cancelada" || cita.pagadoEnLinea <= 0) throw new ErrorDeDominio("Esa cita no tiene nada que devolver");
    const [pago] = await this.d.pagos.buscarPorCita(cita.id);
    if (!pago) throw new ErrorDeDominio("No se encontró el pago en línea de esa cita");
    if (await this.d.unaVez.existe(`devolucion:${cita.id}`)) throw new ErrorDeDominio("Esa devolución ya se hizo");
    // Primero la pasarela (con llave de idempotencia: un doble clic no devuelve dos veces) y luego se anota.
    await this.d.pasarela.devolver({ idPago: pago.idPagoProveedor, monto: cita.pagadoEnLinea });
    await this.d.unaVez.marcar(`devolucion:${cita.id}`, this.d.reloj.ahora().toISOString(), String(cita.pagadoEnLinea));
    await this.d.notificador.enviarCorreo({
      para: cita.clienteCorreo,
      asunto: "Te devolvimos tu dinero",
      cuerpo: `Hola ${cita.clienteNombre}, te devolvimos $${cita.pagadoEnLinea} de tu cita del ${fechaLegible(cita.inicio)}. Según tu banco, puede tardar unos días en verse.`,
    });
    return { devuelto: cita.pagadoEnLinea };
  }
}

// ---------- Catálogo (regla 25: solo el administrador) ----------
const idDe = (nombre: string) =>
  nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// UC-10 "Administrar catálogo": alta o cambio de servicios y productos.
export class GuardarServicio {
  private readonly catalogo: RepositorioCatalogo;
  constructor(d: { catalogo: RepositorioCatalogo }) {
    this.catalogo = d.catalogo;
  }
  async ejecutar(e: { id?: string; nombre: string; duracionMin: number; precio: number }): Promise<Servicio> {
    if (e.nombre.trim().length < 3) throw new ErrorDeDominio("El servicio necesita un nombre");
    if (!Number.isInteger(e.duracionMin) || e.duracionMin < 15 || e.duracionMin > 180) throw new ErrorDeDominio("La duración va de 15 a 180 minutos");
    if (!(e.precio > 0)) throw new ErrorDeDominio("El precio debe ser mayor a cero");
    const s = { id: e.id || idDe(e.nombre), nombre: e.nombre.trim(), duracionMin: e.duracionMin, precio: e.precio };
    await this.catalogo.guardarServicio(s);
    return s;
  }
}

export class GuardarProducto {
  private readonly productos: RepositorioProductos;
  constructor(d: { productos: RepositorioProductos }) {
    this.productos = d.productos;
  }
  async ejecutar(e: { id?: string; nombre: string; precio: number; existencia: number }): Promise<Producto> {
    if (e.nombre.trim().length < 3) throw new ErrorDeDominio("El producto necesita un nombre");
    if (!(e.precio > 0)) throw new ErrorDeDominio("El precio debe ser mayor a cero");
    if (!Number.isInteger(e.existencia) || e.existencia < 0) throw new ErrorDeDominio("La existencia es un entero de 0 en adelante");
    const p = { id: e.id || idDe(e.nombre), nombre: e.nombre.trim(), precio: e.precio, existencia: e.existencia };
    await this.productos.guardar(p);
    return p;
  }
}

// UC-24 "Cambiar comisión de un barbero" y UC-25 "Dar de alta un barbero" (regla 23).
export class GuardarBarbero {
  private readonly catalogo: RepositorioCatalogo;
  constructor(d: { catalogo: RepositorioCatalogo }) {
    this.catalogo = d.catalogo;
  }
  async ejecutar(e: { id?: string; nombre: string; porcentajeComision: number; activo?: boolean }): Promise<Barbero> {
    if (e.nombre.trim().length < 2) throw new ErrorDeDominio("El barbero necesita un nombre");
    if (!(e.porcentajeComision >= 0 && e.porcentajeComision <= 1)) throw new ErrorDeDominio("La comisión va de 0 a 100 %");
    let id = e.id;
    if (!id) {
      const n = (await this.catalogo.listarBarberos()).length + 1;
      id = `barbero-${n}`;
    }
    const b = { id, nombre: e.nombre.trim(), porcentajeComision: e.porcentajeComision, activo: e.activo ?? true };
    await this.catalogo.guardarBarbero(b);
    return b;
  }
}

// UC-12 "Ver mi comisión" — Actor: Barbero (regla 24: solo la suya).
export class VerMiComision {
  private readonly corte: GenerarCorteDeCaja;
  constructor(d: { corte: GenerarCorteDeCaja }) {
    this.corte = d.corte;
  }
  async ejecutar(e: { barberoId: string; dia: string }) {
    const c = (await this.corte.ejecutar({ dia: e.dia })).aDatos();
    const mia = c.comisiones.find((x) => x.barberoId === e.barberoId);
    return { dia: e.dia, cobrado: mia?.cobrado ?? 0, comision: mia?.comision ?? 0 };
  }
}
