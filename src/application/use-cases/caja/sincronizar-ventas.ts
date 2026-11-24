import { Venta, type DatosVenta } from "../../../domain/entities/venta.ts";
import { ErrorDeDominio } from "../../../domain/errors/errores.ts";
import type { RepositorioCatalogo, RepositorioCitas, RepositorioProductos, RepositorioVentas } from "../../ports/repositorios.ts";

export interface ResultadoDeVenta {
  ventaId: string;
  resultado: "guardada" | "duplicada" | "rechazada";
  motivo?: string;
  avisos: string[];
}

// UC-07 "Cobrar en el local" + UC-19 "Subir ventas pendientes" — Actores: Barbero / Sistema.
// El celular del barbero cobra aunque no haya internet y manda la cola cuando vuelve la señal.
// Cada venta trae su id generado en el celular, así que reenviar la cola no duplica nada (RN-09, ADR-001).
export class SincronizarVentas {
  private readonly ventas: RepositorioVentas;
  private readonly productos: RepositorioProductos;
  private readonly citas: RepositorioCitas;
  private readonly catalogo: RepositorioCatalogo;

  constructor(d: {
    ventas: RepositorioVentas;
    productos: RepositorioProductos;
    citas: RepositorioCitas;
    catalogo: RepositorioCatalogo;
  }) {
    this.ventas = d.ventas;
    this.productos = d.productos;
    this.citas = d.citas;
    this.catalogo = d.catalogo;
  }

  async ejecutar(lote: DatosVenta[]): Promise<ResultadoDeVenta[]> {
    const resultados: ResultadoDeVenta[] = [];
    for (const datos of lote) resultados.push(await this.una(datos));
    return resultados;
  }

  private async una(datos: DatosVenta): Promise<ResultadoDeVenta> {
    const avisos: string[] = [];
    let venta: Venta;
    // La venta de una cita cuenta en el día de la cita (igual que su pago en línea).
    const cita = datos.citaId ? await this.citas.buscarPorId(datos.citaId) : null;
    try {
      venta = Venta.crear({ ...datos, dia: cita?.dia });
      if (!(await this.catalogo.buscarBarbero(venta.barberoId)))
        throw new ErrorDeDominio("La venta es de un barbero que no existe");
    } catch (err) {
      if (err instanceof ErrorDeDominio)
        return { ventaId: datos.id, resultado: "rechazada", motivo: err.message, avisos };
      throw err;
    }

    // 1. Guardar solo si ese id no existe todavía (RN-09). Si ya estaba, no se vuelve a descontar nada.
    if (!(await this.ventas.guardarSiNoExiste(venta))) return { ventaId: venta.id, resultado: "duplicada", avisos };

    // 2. Descontar del inventario único (RN-10). La venta sin internet ya ocurrió en el mostrador,
    //    así que no se rechaza: se avisa para revisar el inventario (consecuencia aceptada en ADR-001).
    for (const r of venta.renglones) {
      if (r.tipo !== "producto" || !r.productoId) continue;
      if (!(await this.productos.descontarExistencia(r.productoId, r.cantidad)))
        avisos.push(`No alcanzaba la existencia de "${r.concepto}": revisar inventario`);
    }

    // 3. Si la venta cobra una cita, la cita queda atendida.
    if (venta.citaId) {
      if (cita && cita.estado === "confirmada") {
        cita.registrarAtencion();
        await this.citas.guardar(cita);
      } else if (cita) {
        avisos.push(`La cita ya estaba ${cita.estado}`);
      }
    }
    return { ventaId: venta.id, resultado: "guardada", avisos };
  }
}
