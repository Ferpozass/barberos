import type {
  AvanzarPedido,
  HacerPedido,
  VerMisPedidos,
  VerPedidosPorSurtir,
} from "../../application/use-cases/tienda/tienda.ts";
import type { Pedido } from "../../domain/entities/pedido.ts";
import { SinPermiso } from "../../domain/errors/errores.ts";
import { DatosInvalidos, exigirRol, objeto, ok, texto, type Peticion, type Respuesta } from "./peticion.ts";

// Lo que ve el navegador de un pedido.
export function presentarPedido(p: Pedido) {
  const d = p.aDatos();
  return {
    id: d.id,
    estado: d.estado,
    entrega: d.entrega,
    direccion: d.direccion,
    renglones: d.renglones,
    subtotal: p.subtotal,
    envio: d.envio,
    total: p.total,
    creadoEn: d.creadoEn,
    venceEn: d.venceEn,
    citaId: d.citaId,
    cliente: { nombre: d.clienteNombre, correo: d.clienteCorreo },
  };
}

// Lee [{ productoId, cantidad }] del cuerpo.
export function leerProductos(v: unknown): { productoId: string; cantidad: number }[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new DatosInvalidos("productos debe ser una lista");
  return v.map((x) => {
    const o = objeto(x);
    const cantidad = Number(o.cantidad);
    if (!Number.isInteger(cantidad)) throw new DatosInvalidos("La cantidad debe ser un número entero");
    return { productoId: texto(o, "productoId"), cantidad };
  });
}

export class ControladorTienda {
  private readonly uc: { pedir: HacerPedido; misPedidos: VerMisPedidos; porSurtir: VerPedidosPorSurtir; avanzar: AvanzarPedido; ver: (id: string) => Promise<Pedido | null> };

  constructor(uc: ControladorTienda["uc"]) {
    this.uc = uc;
  }

  // Cualquier persona con cuenta puede pedir (el pedido sale a nombre de su cuenta).
  async pedir(p: Peticion): Promise<Respuesta> {
    const u = exigirRol(p, "cliente", "barbero", "admin");
    const b = objeto(p.body);
    const entrega = texto(b, "entrega");
    if (entrega !== "recoger" && entrega !== "domicilio") throw new DatosInvalidos('entrega es "recoger" o "domicilio"');
    const r = await this.uc.pedir.ejecutar({
      cliente: { nombre: u.nombre, correo: u.correo },
      pidio: leerProductos(b.productos),
      entrega,
      direccion: typeof b.direccion === "string" ? b.direccion : null,
    });
    return ok({ pedido: presentarPedido(r.pedido), urlPago: r.urlPago }, 201);
  }

  async misPedidos(p: Peticion): Promise<Respuesta> {
    const u = exigirRol(p, "cliente", "barbero", "admin");
    return ok((await this.uc.misPedidos.ejecutar({ correo: u.correo })).map(presentarPedido));
  }

  async verPedido(p: Peticion): Promise<Respuesta> {
    const u = exigirRol(p, "cliente", "barbero", "admin");
    const pedido = await this.uc.ver(p.params.id);
    if (!pedido || (u.rol !== "admin" && pedido.clienteCorreo !== u.correo)) throw new SinPermiso("Ese pedido no es tuyo");
    return ok(presentarPedido(pedido));
  }

  async porSurtir(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    return ok((await this.uc.porSurtir.ejecutar()).map(presentarPedido));
  }

  async avanzar(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    return ok(presentarPedido(await this.uc.avanzar.ejecutar({ pedidoId: p.params.id })));
  }
}
