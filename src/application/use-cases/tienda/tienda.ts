import { diaLocal } from "../../../domain/shared/horario-del-local.ts";
import { Pedido, type Entrega, type Renglon } from "../../../domain/entities/pedido.ts";
import { ErrorDeDominio, NoEncontrado } from "../../../domain/errors/errores.ts";
import type { RepositorioPedidos, RepositorioProductos } from "../../ports/repositorios.ts";
import type { GeneradorDeIds, Notificador, PasarelaDePago, Reloj } from "../../ports/servicios-externos.ts";

// Casos de uso de la tienda en línea (F4 del Hito 1, ADR-012).

interface Deps {
  pedidos: RepositorioPedidos;
  productos: RepositorioProductos;
  pasarela: PasarelaDePago;
  notificador: Notificador;
  reloj: Reloj;
  ids: GeneradorDeIds;
}

export interface Pidio {
  productoId: string;
  cantidad: number;
}

// Arma el pedido con los precios del catálogo (nunca con los que manda el navegador) y aparta
// la existencia. El descuento es un UPDATE condicionado: si dos personas piden la última pieza,
// solo a una le alcanza (regla 19). Si un producto no alcanza, se regresan los ya apartados.
export async function apartarProductos(
  d: Pick<Deps, "productos" | "reloj" | "ids">,
  e: { cliente: { nombre: string; correo: string }; pidio: Pidio[]; entrega: Entrega; direccion?: string | null; citaId?: string | null },
): Promise<Pedido> {
  const renglones: Renglon[] = [];
  for (const x of e.pidio) {
    const prod = await d.productos.buscarPorId(x.productoId);
    if (!prod) throw new NoEncontrado("Uno de los productos ya no existe");
    renglones.push({ productoId: prod.id, nombre: prod.nombre, precio: prod.precio, cantidad: x.cantidad });
  }
  const pedido = Pedido.crear({
    id: d.ids.nuevo(),
    clienteNombre: e.cliente.nombre,
    clienteCorreo: e.cliente.correo,
    renglones,
    entrega: e.entrega,
    direccion: e.direccion,
    citaId: e.citaId,
    ahora: d.reloj.ahora(),
  });
  const apartados: Renglon[] = [];
  for (const r of pedido.renglones) {
    if (!(await d.productos.descontarExistencia(r.productoId, r.cantidad))) {
      for (const a of apartados) await d.productos.devolverExistencia(a.productoId, a.cantidad);
      throw new ErrorDeDominio(`Ya no hay suficientes piezas de "${r.nombre}"`);
    }
    apartados.push(r);
  }
  return pedido;
}

// UC-08 "Comprar producto en línea" — Actor: Cliente.
// Aparta los productos 10 minutos (regla 30) y abre el cobro por el total.
export class HacerPedido {
  private readonly d: Deps;
  constructor(d: Deps) {
    this.d = d;
  }

  async ejecutar(e: {
    cliente: { nombre: string; correo: string };
    pidio: Pidio[];
    entrega: "recoger" | "domicilio";
    direccion?: string | null;
  }): Promise<{ pedido: Pedido; urlPago: string }> {
    const pedido = await apartarProductos(this.d, e);
    await this.d.pedidos.guardar(pedido);
    const cobro = await this.d.pasarela.crearCobro({
      referencia: pedido.id,
      monto: pedido.total,
      regresarA: "tienda",
      descripcion: `Pedido de la tienda (${pedido.renglones.length} producto${pedido.renglones.length === 1 ? "" : "s"})`,
    });
    pedido.asignarCobro(cobro.idCobro);
    await this.d.pedidos.guardar(pedido);
    return { pedido, urlPago: cobro.urlPago };
  }
}

// UC-20 "Confirmar pago en línea", para un pedido — Actor: Sistema (webhook o conciliación).
// Igual que con las citas: se le pregunta a la pasarela y el pago se aplica una sola vez (regla 17).
export class ConfirmarPagoPedido {
  private readonly d: Deps;
  constructor(d: Deps) {
    this.d = d;
  }

  async ejecutar(e: { pedidoId: string }): Promise<"pagado" | "ya_aplicado" | "pendiente" | "cobro_desconocido"> {
    const pedido = await this.d.pedidos.buscarPorId(e.pedidoId);
    if (!pedido || !pedido.idCobro) return "cobro_desconocido";
    // Lo que se pidió junto con una cita se paga en el mismo cobro: lo confirma ConfirmarPago de la cita.
    if (pedido.entrega === "en_cita") return "pendiente";
    if (pedido.estado !== "pendiente") return "ya_aplicado";
    const cobro = await this.d.pasarela.consultarCobro(pedido.idCobro);
    if (cobro.estado !== "aprobado" || !cobro.idPago) return "pendiente";
    const ahora = this.d.reloj.ahora();
    if (!pedido.confirmarPago({ idPago: cobro.idPago, monto: cobro.monto, ahora, dia: diaLocal(ahora) })) return "ya_aplicado";
    await this.d.pedidos.guardar(pedido);
    await this.d.notificador.enviarCorreo({
      para: pedido.clienteCorreo,
      asunto: "Recibimos el pago de tu pedido",
      cuerpo:
        `Hola ${pedido.clienteNombre}, tu pedido de $${pedido.total} está pagado. ` +
        (pedido.entrega === "domicilio"
          ? "Te avisamos cuando salga a tu domicilio."
          : pedido.entrega === "en_cita"
            ? "Te lo entregamos en tu cita."
            : "Te avisamos cuando esté listo para recoger en la barbería."),
    });
    return "pagado";
  }
}

// UC-22 "Liberar producto no pagado" — Actor: Sistema (corre con la conciliación).
// Antes de soltar un pedido vencido se le pregunta a la pasarela: si sí pagó, no se libera (E3).
export class LiberarPedidosVencidos {
  private readonly d: Deps;
  private readonly confirmar: ConfirmarPagoPedido;
  constructor(d: Deps) {
    this.d = d;
    this.confirmar = new ConfirmarPagoPedido(d);
  }

  async ejecutar(): Promise<{ revisados: number; pagados: number; liberados: number }> {
    const ahora = this.d.reloj.ahora();
    const pendientes = await this.d.pedidos.buscarPendientes();
    let pagados = 0;
    let liberados = 0;
    for (const p of pendientes) {
      if (p.idCobro && (await this.confirmar.ejecutar({ pedidoId: p.id })) === "pagado") {
        pagados++;
        continue;
      }
      // Los de una cita ya se revisaron al conciliar la cita (corre antes); si siguen pendientes, nadie pagó.
      if (!p.vencido(ahora)) continue;
      if (await this.d.pedidos.cancelarSiPendiente(p.id)) {
        for (const r of p.renglones) await this.d.productos.devolverExistencia(r.productoId, r.cantidad);
        liberados++;
      }
    }
    return { revisados: pendientes.length, pagados, liberados };
  }
}

// UC-23 "Actualizar estado del pedido" — Actor: Administrador. pagado -> preparado -> entregado.
export class AvanzarPedido {
  private readonly d: Pick<Deps, "pedidos" | "notificador">;
  constructor(d: Pick<Deps, "pedidos" | "notificador">) {
    this.d = d;
  }

  async ejecutar(e: { pedidoId: string }): Promise<Pedido> {
    const pedido = await this.d.pedidos.buscarPorId(e.pedidoId);
    if (!pedido) throw new NoEncontrado("Ese pedido no existe");
    const nuevo = pedido.avanzar();
    await this.d.pedidos.guardar(pedido);
    if (nuevo === "preparado" && pedido.entrega !== "en_cita") {
      await this.d.notificador.enviarCorreo({
        para: pedido.clienteCorreo,
        asunto: pedido.entrega === "domicilio" ? "Tu pedido va en camino" : "Tu pedido está listo",
        cuerpo:
          pedido.entrega === "domicilio"
            ? `Hola ${pedido.clienteNombre}, tu pedido ya salió a tu domicilio.`
            : `Hola ${pedido.clienteNombre}, tu pedido ya está listo. Pasa por él a La Esquina (lunes a sábado, 10:00 a 20:00).`,
      });
    }
    return pedido;
  }
}

export class VerMisPedidos {
  private readonly pedidos: RepositorioPedidos;
  constructor(d: { pedidos: RepositorioPedidos }) {
    this.pedidos = d.pedidos;
  }
  async ejecutar(e: { correo: string }): Promise<Pedido[]> {
    return (await this.pedidos.buscarPorCorreo(e.correo)).filter((p) => p.estado !== "cancelado");
  }
}

export class VerPedidosPorSurtir {
  private readonly pedidos: RepositorioPedidos;
  constructor(d: { pedidos: RepositorioPedidos }) {
    this.pedidos = d.pedidos;
  }
  async ejecutar(): Promise<Pedido[]> {
    return this.pedidos.buscarPorSurtir();
  }
}
