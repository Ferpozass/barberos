import type { Barbero, Producto, Servicio } from "../../../domain/entities/catalogo.ts";
import type { RepositorioCatalogo, RepositorioProductos } from "../../ports/repositorios.ts";

// Consulta del catálogo para las pantallas: barberos activos, servicios y productos con su existencia.
export class VerCatalogo {
  private readonly catalogo: RepositorioCatalogo;
  private readonly productos: RepositorioProductos;

  constructor(d: { catalogo: RepositorioCatalogo; productos: RepositorioProductos }) {
    this.catalogo = d.catalogo;
    this.productos = d.productos;
  }

  // todos = también los barberos dados de baja (para la pantalla de catálogo del administrador).
  async ejecutar(e: { todos?: boolean } = {}): Promise<{ barberos: Barbero[]; servicios: Servicio[]; productos: Producto[] }> {
    const [barberos, servicios, productos] = await Promise.all([
      this.catalogo.listarBarberos(),
      this.catalogo.listarServicios(),
      this.productos.listar(),
    ]);
    return { barberos: e.todos ? barberos : barberos.filter((b) => b.activo), servicios, productos };
  }
}
