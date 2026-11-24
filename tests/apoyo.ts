// Dobles de prueba: implementaciones de los puertos externos que controlan el tiempo, la pasarela y el correo.
import type { EstadoDeCobro, Notificador, PasarelaDePago, Reloj } from "../src/application/ports/servicios-externos.ts";
import type { RepositorioCatalogo, RepositorioCitas, RepositorioPagos, RepositorioProductos, RepositorioVentas, RepositorioCortes } from "../src/application/ports/repositorios.ts";
import { fechaDelDia } from "../src/domain/shared/horario-del-local.ts";
import { DATOS_DE_EJEMPLO } from "../src/infrastructure/db/datos-de-ejemplo.ts";
import {
  MemoriaRepositorioCatalogo,
  MemoriaRepositorioCitas,
  MemoriaRepositorioCortes,
  MemoriaRepositorioPagos,
  MemoriaRepositorioProductos,
  MemoriaRepositorioVentas,
} from "../src/infrastructure/repositories/memoria/memoria-repositorios.ts";
// Lunes 23 de noviembre de 2026, 9:00 hora local. El local abre a las 10:00.
export const DIA = "2026-11-23";
export const a = (h: number, m = 0) => fechaDelDia(DIA, h, m);

export class RelojFijo implements Reloj {
  private actual: Date;
  constructor(actual: Date) {
    this.actual = actual;
  }
  ahora() {
    return this.actual;
  }
  avanzarMinutos(n: number) {
    this.actual = new Date(this.actual.getTime() + n * 60_000);
  }
}

export class PasarelaFalsa implements PasarelaDePago {
  readonly cobros = new Map<string, { referencia: string; monto: number; estado: EstadoDeCobro["estado"]; idPago: string | null }>();
  private n = 0;
  async crearCobro(p: { referencia: string; monto: number }) {
    const idCobro = `cobro-${++this.n}`;
    this.cobros.set(idCobro, { referencia: p.referencia, monto: p.monto, estado: "pendiente", idPago: null });
    return { idCobro, urlPago: `https://pasarela.test/${idCobro}` };
  }
  async consultarCobro(idCobro: string): Promise<EstadoDeCobro> {
    const c = this.cobros.get(idCobro);
    return c ? { estado: c.estado, monto: c.monto, idPago: c.idPago } : { estado: "rechazado", monto: 0, idPago: null };
  }
  readonly devueltos: { idPago: string; monto: number }[] = [];
  async devolver(p: { idPago: string; monto: number }) {
    this.devueltos.push(p);
  }
  aprobar(idCobro: string) {
    const c = this.cobros.get(idCobro)!;
    c.estado = "aprobado";
    c.idPago = `pago-${idCobro}`;
  }
}

export class NotificadorFalso implements Notificador {
  readonly enviados: { para: string; asunto: string; cuerpo: string }[] = [];
  async enviarCorreo(p: { para: string; asunto: string; cuerpo: string }) {
    this.enviados.push(p);
  }
}

export interface Repos {
  citas: RepositorioCitas;
  pagos: RepositorioPagos;
  ventas: RepositorioVentas;
  productos: RepositorioProductos;
  catalogo: RepositorioCatalogo;
  cortes: RepositorioCortes;
}

export function reposEnMemoria(): Repos {
  return {
    citas: new MemoriaRepositorioCitas(),
    pagos: new MemoriaRepositorioPagos(),
    ventas: new MemoriaRepositorioVentas(),
    productos: new MemoriaRepositorioProductos(DATOS_DE_EJEMPLO.productos),
    catalogo: new MemoriaRepositorioCatalogo(DATOS_DE_EJEMPLO.barberos, DATOS_DE_EJEMPLO.servicios),
    cortes: new MemoriaRepositorioCortes(),
  };
}

let contador = 0;
export const idsSecuenciales = () => ({ nuevo: () => `cita-${++contador}` });
