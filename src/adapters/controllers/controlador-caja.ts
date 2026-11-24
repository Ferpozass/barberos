import type { CerrarCorteDeCaja, GenerarCorteDeCaja } from "../../application/use-cases/caja/corte-de-caja.ts";
import type { SincronizarVentas } from "../../application/use-cases/caja/sincronizar-ventas.ts";
import type { VerCatalogo } from "../../application/use-cases/catalogo/ver-catalogo.ts";
import type { DatosVenta, Renglon } from "../../domain/entities/venta.ts";
import { presentarCorte } from "../presenters/presentadores.ts";
import { SinPermiso } from "../../domain/errors/errores.ts";
import { DatosInvalidos, exigirRol, numero, objeto, ok, texto, type Peticion, type Respuesta } from "./peticion.ts";

export class ControladorCaja {
  private readonly uc: {
    sincronizar: SincronizarVentas;
    generarCorte: GenerarCorteDeCaja;
    cerrarCorte: CerrarCorteDeCaja;
    catalogo: VerCatalogo;
  };

  constructor(uc: ControladorCaja["uc"]) {
    this.uc = uc;
  }

  async catalogo(p: Peticion): Promise<Respuesta> {
    return ok(await this.uc.catalogo.ejecutar({ todos: p.query.todos === "1" && p.usuario?.rol === "admin" }));
  }

  // Recibe la cola de ventas del celular del barbero (una o muchas).
  async sincronizar(p: Peticion): Promise<Respuesta> {
    const u = exigirRol(p, "barbero", "admin");
    const b = objeto(p.body);
    if (!Array.isArray(b.ventas)) throw new DatosInvalidos('Falta la lista "ventas"');
    const lote: DatosVenta[] = b.ventas.map((v) => {
      const o = objeto(v);
      if (!Array.isArray(o.renglones)) throw new DatosInvalidos('Cada venta necesita "renglones"');
      const metodo = texto(o, "metodo");
      return {
        id: texto(o, "id"),
        barberoId: texto(o, "barberoId"),
        citaId: typeof o.citaId === "string" && o.citaId ? o.citaId : null,
        metodo: metodo as DatosVenta["metodo"],
        creadaEn: texto(o, "creadaEn"),
        renglones: o.renglones.map((r): Renglon => {
          const x = objeto(r);
          return {
            tipo: texto(x, "tipo") === "producto" ? "producto" : "servicio",
            productoId: typeof x.productoId === "string" ? x.productoId : null,
            concepto: texto(x, "concepto"),
            cantidad: numero(x, "cantidad"),
            precioUnitario: numero(x, "precioUnitario"),
          };
        }),
      };
    });
    // Un barbero solo sube SUS ventas.
    if (u.rol === "barbero" && lote.some((v) => v.barberoId !== u.barberoId)) throw new SinPermiso("Solo puedes subir tus ventas");
    return ok({ resultados: await this.uc.sincronizar.ejecutar(lote) });
  }

  async verCorte(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    if (!p.query.dia) throw new DatosInvalidos("Falta el dia");
    return ok(presentarCorte(await this.uc.generarCorte.ejecutar({ dia: p.query.dia })));
  }

  async cerrarCorte(p: Peticion): Promise<Respuesta> {
    exigirRol(p, "admin");
    const b = objeto(p.body);
    const efectivoContado = typeof b.efectivoContado === "number" ? b.efectivoContado : undefined;
    return ok(presentarCorte(await this.uc.cerrarCorte.ejecutar({ dia: texto(b, "dia"), efectivoContado })));
  }
}
