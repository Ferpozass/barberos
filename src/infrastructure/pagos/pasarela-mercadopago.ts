import type { CobroCreado, EstadoDeCobro, PasarelaDePago } from "../../application/ports/servicios-externos.ts";

// Pasarela REAL: Mercado Pago Checkout Pro (ADR-010). Implementa el MISMO puerto que la simulada,
// así que los casos de uso no cambiaron. Se usa fetch directo a la API (sin SDK) para que corra
// igual en Node y en Cloudflare Workers.
//
// - crearCobro: crea una "preferencia" y regresa su link de pago (init_point).
// - El id del cobro es el id de la cita: va como external_reference y así se busca el pago después.
// - consultarCobro: busca en Mercado Pago un pago APROBADO con esa referencia (ADR-004: no se confía
//   en el cuerpo del webhook; siempre se le pregunta a la pasarela).
const API = "https://api.mercadopago.com";
const MINUTOS_PARA_PAGAR = 10; // igual que el apartado (RN-02)

interface PagoMp {
  id: number;
  status: string;
  transaction_amount: number;
  external_reference: string | null;
}

export class PasarelaMercadoPago implements PasarelaDePago {
  private readonly token: string;
  private readonly urlBase: string;

  constructor(d: { token: string; urlBase: string }) {
    this.token = d.token;
    this.urlBase = d.urlBase.replace(/\/$/, "");
  }

  private async pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
    const r = await fetch(API + ruta, {
      ...opciones,
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json", ...opciones.headers },
    });
    const datos = (await r.json().catch(() => ({}))) as T & { message?: string };
    if (!r.ok) throw Object.assign(new Error(`Mercado Pago respondió ${r.status}: ${datos.message ?? "sin detalle"}`), { estado: r.status });
    return datos;
  }

  async crearCobro(p: { referencia: string; monto: number; descripcion: string; regresarA?: string }): Promise<CobroCreado> {
    const publica = this.urlBase.startsWith("https://"); // Mercado Pago no puede avisarle a localhost
    const regreso = `${this.urlBase}/#${p.regresarA ?? "cliente"}`;
    const preferencia = await this.pedir<{ id: string; init_point: string }>("/checkout/preferences", {
      method: "POST",
      headers: { "x-idempotency-key": `barberos-${p.referencia}` },
      body: JSON.stringify({
        items: [{ id: p.referencia, title: p.descripcion, quantity: 1, unit_price: p.monto, currency_id: "MXN" }],
        external_reference: p.referencia,
        statement_descriptor: "BARBEROS",
        // Solo tarjeta y saldo de Mercado Pago: OXXO y SPEI tardan horas y el apartado dura 10 minutos.
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }],
          installments: 1,
        },
        expires: true,
        expiration_date_to: new Date(Date.now() + MINUTOS_PARA_PAGAR * 60_000).toISOString(),
        back_urls: { success: regreso, pending: regreso, failure: regreso },
        ...(publica ? { auto_return: "approved", notification_url: `${this.urlBase}/api/webhooks/mercadopago` } : {}),
      }),
    });
    return { idCobro: p.referencia, urlPago: preferencia.init_point };
  }

  async consultarCobro(idCobro: string): Promise<EstadoDeCobro> {
    const busqueda = await this.pedir<{ results: PagoMp[] }>(
      `/v1/payments/search?external_reference=${encodeURIComponent(idCobro)}&sort=date_created&criteria=desc`,
    );
    const aprobado = busqueda.results.find((x) => x.status === "approved");
    if (!aprobado) return { estado: "pendiente", monto: 0, idPago: null };
    return { estado: "aprobado", monto: aprobado.transaction_amount, idPago: String(aprobado.id) };
  }

  // Regla 7: devolución total o parcial. La llave de idempotencia evita devolver dos veces lo mismo.
  async devolver(p: { idPago: string; monto: number }): Promise<void> {
    await this.pedir(`/v1/payments/${encodeURIComponent(p.idPago)}/refunds`, {
      method: "POST",
      headers: { "x-idempotency-key": `barberos-devolucion-${p.idPago}-${p.monto}` },
      body: JSON.stringify({ amount: p.monto }),
    });
  }

  // Para el webhook: Mercado Pago solo manda el id del pago; aquí se averigua de qué cita es.
  async referenciaDePago(idPago: string): Promise<string | null> {
    try {
      const pago = await this.pedir<PagoMp>(`/v1/payments/${encodeURIComponent(idPago)}`);
      return pago.external_reference ?? null;
    } catch (err) {
      // Un pago que no existe se ignora; cualquier otro error se deja pasar para que Mercado Pago reintente.
      if ((err as { estado?: number }).estado === 404) return null;
      throw err;
    }
  }
}
