import { Cita, type TipoPago } from "../../../domain/entities/cita.ts";
import { ErrorDeDominio, NoEncontrado } from "../../../domain/errors/errores.ts";
import type { Pedido } from "../../../domain/entities/pedido.ts";
import type { RepositorioCatalogo, RepositorioCitas, RepositorioPedidos, RepositorioProductos } from "../../ports/repositorios.ts";
import { apartarProductos, type Pidio } from "../tienda/tienda.ts";
import type { GeneradorDeIds, PasarelaDePago, Reloj } from "../../ports/servicios-externos.ts";

export interface AgendarCitaEntrada {
  barberoId: string;
  servicioId: string;
  inicio: Date;
  clienteNombre: string;
  clienteCorreo: string;
  tipoPago: TipoPago;
  productos?: Pidio[]; // "¿algo más?": se apartan y se pagan en el mismo cobro; se entregan en la cita
}

export interface AgendarCitaSalida {
  cita: Cita;
  pedido: Pedido | null;
  montoAPagar: number;
  urlPago: string;
}

// UC-02 "Agendar y pagar cita" — Actor: Cliente.
// Aparta el horario 10 minutos (RN-02) sin encimarlo con otra cita (RN-03) y abre el cobro en la pasarela (RN-01).
export class AgendarCita {
  private readonly citas: RepositorioCitas;
  private readonly catalogo: RepositorioCatalogo;
  private readonly pasarela: PasarelaDePago;
  private readonly reloj: Reloj;
  private readonly ids: GeneradorDeIds;
  private readonly tienda: { pedidos: RepositorioPedidos; productos: RepositorioProductos } | null;

  constructor(d: {
    citas: RepositorioCitas;
    catalogo: RepositorioCatalogo;
    pasarela: PasarelaDePago;
    reloj: Reloj;
    ids: GeneradorDeIds;
    pedidos?: RepositorioPedidos;
    productos?: RepositorioProductos;
  }) {
    this.tienda = d.pedidos && d.productos ? { pedidos: d.pedidos, productos: d.productos } : null;
    this.citas = d.citas;
    this.catalogo = d.catalogo;
    this.pasarela = d.pasarela;
    this.reloj = d.reloj;
    this.ids = d.ids;
  }

  async ejecutar(e: AgendarCitaEntrada): Promise<AgendarCitaSalida> {
    const ahora = this.reloj.ahora();

    const barbero = await this.catalogo.buscarBarbero(e.barberoId);
    if (!barbero || !barbero.activo) throw new NoEncontrado("Ese barbero no existe o no está disponible");
    const servicio = await this.catalogo.buscarServicio(e.servicioId);
    if (!servicio) throw new NoEncontrado("Ese servicio no existe");

    // 1. La entidad valida datos, pasado y horario del local (RN-05). Nace "apartada" por 10 min (RN-02).
    const cita = Cita.crear(
      {
        id: this.ids.nuevo(),
        barberoId: barbero.id,
        servicioId: servicio.id,
        clienteNombre: e.clienteNombre,
        clienteCorreo: e.clienteCorreo,
        inicio: e.inicio,
        duracionMin: servicio.duracionMin,
        precio: servicio.precio,
        tipoPago: e.tipoPago,
      },
      ahora,
    );

    // 2. Revisión con las reglas del dominio, para dar un mensaje claro (RN-03).
    const delDia = await this.citas.buscarPorBarberoYDia(barbero.id, cita.dia);
    if (delDia.some((otra) => cita.chocaCon(otra, ahora)))
      throw new ErrorDeDominio("El barbero ya tiene una cita en ese horario");
    // Regla 26: el cliente tampoco puede tener dos citas a la misma hora (aunque sean con barberos distintos).
    const suyas = await this.citas.buscarPorCorreo(cita.clienteCorreo);
    if (suyas.some((otra) => otra.ocupaHorario(ahora) && cita.seEnciman(otra)))
      throw new ErrorDeDominio("Ya tienes otra cita a esa hora");

    // 3. Si eligió productos ("¿algo más?"), se apartan antes; si no alcanzan, no se aparta nada.
    let pedido: Pedido | null = null;
    if (e.productos?.length) {
      if (!this.tienda) throw new ErrorDeDominio("La tienda no está disponible");
      pedido = await apartarProductos(
        { productos: this.tienda.productos, reloj: this.reloj, ids: this.ids },
        { cliente: { nombre: cita.clienteNombre, correo: cita.clienteCorreo }, pidio: e.productos, entrega: "en_cita", citaId: cita.id },
      );
    }

    // 4. Guardar. El repositorio vuelve a revisar en la base de datos por si alguien ganó el horario.
    if (!(await this.citas.apartarSiLibre(cita, ahora))) {
      if (pedido && this.tienda)
        for (const r of pedido.renglones) await this.tienda.productos.devolverExistencia(r.productoId, r.cantidad);
      throw new ErrorDeDominio("Alguien acaba de apartar ese horario; elige otro");
    }

    // 5. Un solo cobro por lo que toca pagar en línea (RN-01) más los productos, si hay.
    const monto = cita.montoAPagarEnLinea() + (pedido?.total ?? 0);
    const cobro = await this.pasarela.crearCobro({
      referencia: cita.id,
      monto,
      descripcion: `${servicio.nombre} con ${barbero.nombre}${pedido ? " + productos" : ""}`,
    });
    cita.asignarCobro(cobro.idCobro);
    await this.citas.guardar(cita);
    if (pedido && this.tienda) {
      pedido.asignarCobro(cobro.idCobro);
      await this.tienda.pedidos.guardar(pedido);
    }

    return { cita, pedido, montoAPagar: monto, urlPago: cobro.urlPago };
  }
}
