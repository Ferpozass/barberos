import { crearPago } from "../../../domain/entities/pago.ts";
import { diaLocal, fechaLegible } from "../../../domain/shared/horario-del-local.ts";
import type { RepositorioCitas, RepositorioPagos, RepositorioPedidos } from "../../ports/repositorios.ts";
import type { Notificador, PasarelaDePago, Reloj } from "../../ports/servicios-externos.ts";

// F2: copia de cada cita confirmada al correo del negocio. Si el local se queda sin internet, el
// barbero la lee desde su celular con datos y sabe quién va a llegar (escenario E1).
export const CORREO_DEL_NEGOCIO = "agenda@laesquina.demo";

export type ResultadoConfirmacion = "confirmada" | "ya_aplicado" | "pendiente" | "cobro_desconocido";

// UC-20 "Confirmar pago en línea" — Actor: Sistema (webhook de la pasarela o conciliación).
// Si el mismo aviso llega varias veces, el pago se aplica una sola vez (RN-08).
export class ConfirmarPago {
  private readonly citas: RepositorioCitas;
  private readonly pagos: RepositorioPagos;
  private readonly pasarela: PasarelaDePago;
  private readonly notificador: Notificador;
  private readonly reloj: Reloj;
  private readonly pedidos: RepositorioPedidos | null;

  constructor(d: {
    citas: RepositorioCitas;
    pagos: RepositorioPagos;
    pasarela: PasarelaDePago;
    notificador: Notificador;
    reloj: Reloj;
    pedidos?: RepositorioPedidos;
  }) {
    this.pedidos = d.pedidos ?? null;
    this.citas = d.citas;
    this.pagos = d.pagos;
    this.pasarela = d.pasarela;
    this.notificador = d.notificador;
    this.reloj = d.reloj;
  }

  async ejecutar(e: { citaId: string }): Promise<ResultadoConfirmacion> {
    const cita = await this.citas.buscarPorId(e.citaId);
    if (!cita || !cita.idCobro) return "cobro_desconocido";

    // 1. Preguntarle a la pasarela si el cobro ya se pagó (no confiamos solo en el aviso).
    const cobro = await this.pasarela.consultarCobro(cita.idCobro);
    if (cobro.estado !== "aprobado" || !cobro.idPago) return "pendiente";

    // Si pidió productos junto con la cita ("¿algo más?"), el mismo cobro trae las dos cosas:
    // a la cita solo le toca su parte (para el corte y la comisión del barbero).
    const productos = this.pedidos
      ? (await this.pedidos.buscarPorCita(cita.id)).filter((p) => p.estado === "pendiente")
      : [];
    const deProductos = productos.reduce((suma, p) => suma + p.total, 0);
    const deLaCita = cobro.monto - deProductos;

    // 2. Registrar el pago. Si ese id de pago ya estaba, no se hace nada (RN-08).
    const nuevo = await this.pagos.aplicarUnaVez(
      crearPago({
        idPagoProveedor: cobro.idPago,
        citaId: cita.id,
        barberoId: cita.barberoId,
        monto: deLaCita,
        aplicadoEn: this.reloj.ahora().toISOString(),
        diaServicio: cita.dia,
      }),
    );
    if (!nuevo || cita.estado !== "apartada") return "ya_aplicado";

    // 3. Confirmar la cita (RN-01) y avisar por correo (ADR-005).
    cita.confirmarPago(deLaCita);
    await this.citas.guardar(cita);
    const ahora = this.reloj.ahora();
    for (const p of productos) {
      p.confirmarPago({ idPago: cobro.idPago, monto: p.total, ahora, dia: diaLocal(ahora) });
      await this.pedidos!.guardar(p);
    }
    await this.notificador.enviarCorreo({
      para: cita.clienteCorreo,
      asunto: "Tu cita está confirmada",
      cuerpo:
        `Hola ${cita.clienteNombre}, tu cita del ${fechaLegible(cita.inicio)} quedó confirmada. ` +
        `Pagaste $${cobro.monto} y en el local pagas $${cita.saldoPendiente}. Si no llegas, el anticipo no se devuelve.` +
        (productos.length ? " Tus productos te esperan en la barbería." : ""),
    });
    await this.notificador.enviarCorreo({
      para: CORREO_DEL_NEGOCIO,
      asunto: `Nueva cita: ${fechaLegible(cita.inicio)}`,
      cuerpo: `${cita.clienteNombre} (${cita.clienteCorreo}): pagó $${deLaCita} en línea y paga $${cita.saldoPendiente} en el local.`,
    });
    return "confirmada";
  }
}

// UC-21 "Conciliar pagos" — Actor: Sistema (cada 30 segundos).
// Si el aviso de la pasarela se perdió, aquí se encuentra el pago de todos modos (escenario E3, ADR-004).
export class ConciliarPagos {
  private readonly citas: RepositorioCitas;
  private readonly confirmar: ConfirmarPago;
  private readonly tienda: { ejecutar(): Promise<{ revisados: number; pagados: number; liberados: number }> } | null;

  constructor(d: {
    citas: RepositorioCitas;
    confirmar: ConfirmarPago;
    tienda?: { ejecutar(): Promise<{ revisados: number; pagados: number; liberados: number }> };
  }) {
    this.citas = d.citas;
    this.confirmar = d.confirmar;
    this.tienda = d.tienda ?? null;
  }

  async ejecutar(): Promise<{ revisadas: number; confirmadas: number; pedidos?: { revisados: number; pagados: number; liberados: number } }> {
    const pendientes = await this.citas.buscarApartadasConCobro();
    let confirmadas = 0;
    for (const cita of pendientes) {
      if ((await this.confirmar.ejecutar({ citaId: cita.id })) === "confirmada") confirmadas++;
    }
    // Después, los pedidos de la tienda: los pagados se confirman y los vencidos sueltan su existencia (regla 30).
    const pedidos = this.tienda ? await this.tienda.ejecutar() : undefined;
    return pedidos ? { revisadas: pendientes.length, confirmadas, pedidos } : { revisadas: pendientes.length, confirmadas };
  }
}
