import type { CobroCreado, EstadoDeCobro, PasarelaDePago } from "../../application/ports/servicios-externos.ts";
import type { Conexion, Fila } from "../db/conexion.ts";

// Pasarela de pago SIMULADA para correr sin cuenta ni llaves.
// Se comporta como una real: crea un cobro, tiene su propia página de pago (web/pasarela/pagar.html)
// y avisa por webhook. En producción se cambia por un adaptador de Mercado Pago que implemente
// el mismo puerto (PasarelaDePago); los casos de uso no se tocan.
export class PasarelaSimulada implements PasarelaDePago {
  private readonly db: Conexion;

  constructor(db: Conexion) {
    this.db = db;
  }

  async crearCobro(p: { referencia: string; monto: number; descripcion: string; regresarA?: string }): Promise<CobroCreado> {
    const idCobro = `cobro_${crypto.randomUUID().slice(0, 8)}`;
    await this.db.ejecutar(
      "INSERT INTO cobros_simulados VALUES (?, ?, ?, ?, 'pendiente', NULL)",
      idCobro, p.referencia, p.monto, p.descripcion,
    );
    return { idCobro, urlPago: `/pasarela/pagar?cobro=${idCobro}` };
  }

  async consultarCobro(idCobro: string): Promise<EstadoDeCobro> {
    const f = await this.leer(idCobro);
    if (!f) return { estado: "rechazado", monto: 0, idPago: null };
    return { estado: f.estado as EstadoDeCobro["estado"], monto: f.monto as number, idPago: (f.id_pago as string) ?? null };
  }

  async devolver(p: { idPago: string; monto: number }): Promise<void> {
    await this.db.ejecutar("UPDATE cobros_simulados SET estado = 'devuelto' WHERE id_pago = ?", p.idPago);
  }

  // ---- Lo que hace "el lado de la pasarela" (lo usa su página de pago simulada) ----

  leer(idCobro: string): Promise<Fila | undefined> {
    return this.db.uno("SELECT * FROM cobros_simulados WHERE id_cobro = ?", idCobro);
  }

  // Aprueba el cobro y devuelve la referencia (el id de la cita) para mandar el webhook.
  async aprobar(idCobro: string): Promise<string> {
    const f = await this.leer(idCobro);
    if (!f) throw new Error("Cobro inexistente");
    await this.db.ejecutar(
      "UPDATE cobros_simulados SET estado = 'aprobado', id_pago = ? WHERE id_cobro = ? AND estado = 'pendiente'",
      `pago_${crypto.randomUUID().slice(0, 10)}`, idCobro,
    );
    return f.referencia as string;
  }
}
