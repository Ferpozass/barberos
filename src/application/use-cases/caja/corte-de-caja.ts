import { CorteDeCaja } from "../../../domain/entities/corte-de-caja.ts";
import { ErrorDeDominio } from "../../../domain/errors/errores.ts";
import { esDiaValido } from "../../../domain/shared/horario-del-local.ts";
import type {
  RepositorioCatalogo,
  RepositorioCitas,
  RepositorioCortes,
  RepositorioPagos,
  RepositorioPedidos,
  RepositorioVentas,
} from "../../ports/repositorios.ts";
import type { Reloj } from "../../ports/servicios-externos.ts";

interface Dependencias {
  ventas: RepositorioVentas;
  pagos: RepositorioPagos;
  citas: RepositorioCitas;
  catalogo: RepositorioCatalogo;
  cortes: RepositorioCortes;
  reloj: Reloj;
  pedidos?: RepositorioPedidos;
}

// UC-11 "Hacer corte de caja" — Actor: Administrador.
// Vista previa: suma por forma de pago y comisión de cada barbero (RN-12). Si el día ya se cerró, devuelve el cerrado.
export class GenerarCorteDeCaja {
  private readonly d: Dependencias;

  constructor(d: Dependencias) {
    this.d = d;
  }

  async ejecutar(e: { dia: string }): Promise<CorteDeCaja> {
    if (!esDiaValido(e.dia)) throw new ErrorDeDominio("El día no es válido");
    const cerrado = await this.d.cortes.buscarPorDia(e.dia);
    if (cerrado) return cerrado;
    const [ventas, pagos, citas, barberos] = await Promise.all([
      this.d.ventas.buscarPorDia(e.dia),
      this.d.pagos.buscarPorDia(e.dia),
      this.d.citas.buscarPorDia(e.dia),
      this.d.catalogo.listarBarberos(),
    ]);
    // Lo de la tienda en línea, incluidos los productos que se pagaron junto con una cita
    // (de ese cobro, a "pagos" solo entró la parte de la cita).
    const tienda = this.d.pedidos ? (await this.d.pedidos.buscarPagadosDelDia(e.dia)).map((x) => x.total) : [];
    return CorteDeCaja.calcular({ dia: e.dia, ventas, pagos, citas, barberos, tienda });
  }
}

// Cerrar el corte. No se deja si hay citas sin cobro registrado = ventas sin subir (RN-13).
export class CerrarCorteDeCaja {
  private readonly d: Dependencias;
  private readonly generar: GenerarCorteDeCaja;

  constructor(d: Dependencias) {
    this.d = d;
    this.generar = new GenerarCorteDeCaja(d);
  }

  // efectivoContado: lo que hay en la caja; el corte guarda la diferencia contra lo esperado (F5).
  async ejecutar(e: { dia: string; efectivoContado?: number }): Promise<CorteDeCaja> {
    const corte = await this.generar.ejecutar(e);
    corte.cerrar(this.d.reloj.ahora(), e.efectivoContado);
    await this.d.cortes.guardar(corte);
    return corte;
  }
}
