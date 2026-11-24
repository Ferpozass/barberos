import { aRespuestaDeError, exigirRol, type Peticion, type Respuesta } from "../../adapters/controllers/peticion.ts";
import type { Aplicacion } from "../config/contenedor.ts";
import { PasarelaMercadoPago } from "../pagos/pasarela-mercadopago.ts";
import { PasarelaSimulada } from "../pagos/pasarela-simulada.ts";

// Tabla de rutas de la API. La usan los dos servidores: node:http en la laptop (servidor.ts)
// y el Worker de Cloudflare en la nube (worker.ts). Así las rutas se escriben una sola vez.

type Manejador = (p: Peticion) => Promise<Respuesta>;
interface Ruta {
  metodo: string;
  patron: RegExp;
  nombres: string[];
  manejar: Manejador;
}

function ruta(metodo: string, plantilla: string, manejar: Manejador): Ruta {
  const nombres: string[] = [];
  const patron = new RegExp("^" + plantilla.replace(/:(\w+)/g, (_m, n) => (nombres.push(n), "([^/]+)")) + "$");
  return { metodo, patron, nombres, manejar };
}

function crearRutas(app: Aplicacion): Ruta[] {
  const { agenda, pagos, caja, cuentas, tienda, local } = app.controladores;
  const rutas = [
    // Cuentas (UC-22 a UC-24)
    ruta("POST", "/api/cuentas/registro", (p) => cuentas.registrar(p)),
    ruta("POST", "/api/cuentas/entrar", (p) => cuentas.iniciar(p)),
    ruta("POST", "/api/cuentas/salir", (p) => cuentas.cerrar(p)),
    ruta("GET", "/api/cuentas/google", (p) => cuentas.configGoogle(p)),
    ruta("POST", "/api/cuentas/google", (p) => cuentas.google(p)),
    ruta("GET", "/api/cuentas/yo", (p) => cuentas.yo(p)),
    ruta("GET", "/api/mi-cuenta", (p) => cuentas.miCuenta(p)),
    ruta("POST", "/api/mi-cuenta", (p) => cuentas.guardarMisDatos(p)),

    ruta("GET", "/api/catalogo", (p) => caja.catalogo(p)),
    ruta("GET", "/api/disponibilidad", (p) => agenda.disponibilidad(p)),
    ruta("POST", "/api/citas", (p) => agenda.agendar(p)),
    ruta("GET", "/api/mis-citas", (p) => agenda.misCitas(p)),
    ruta("GET", "/api/citas/:id", (p) => agenda.consultar(p)),
    ruta("POST", "/api/citas/:id/cancelar", (p) => agenda.cancelar(p)),
    ruta("POST", "/api/citas/:id/no-llego", (p) => agenda.noLlego(p)),
    ruta("POST", "/api/citas/:id/reagendar", (p) => local.reagendar(p)),
    // Operación del local (administrador)
    ruta("POST", "/api/citas-sin-cita", (p) => local.sinCita(p)),
    ruta("GET", "/api/bloqueos", (p) => local.verBloqueos(p)),
    ruta("POST", "/api/bloqueos", (p) => local.bloquear(p)),
    ruta("POST", "/api/bloqueos/:id/quitar", (p) => local.quitarBloqueo(p)),
    ruta("POST", "/api/barberos/ausente", (p) => local.ausente(p)),
    ruta("GET", "/api/devoluciones", (p) => local.devoluciones(p)),
    ruta("POST", "/api/devoluciones/:id", (p) => local.devolver(p)),
    ruta("POST", "/api/catalogo/servicios", (p) => local.guardarServicio(p)),
    ruta("POST", "/api/catalogo/productos", (p) => local.guardarProducto(p)),
    ruta("POST", "/api/catalogo/barberos", (p) => local.guardarBarbero(p)),
    ruta("GET", "/api/mi-comision", (p) => local.miComision(p)),
    ruta("GET", "/api/apariencia", (p) => local.apariencia(p)),
    ruta("POST", "/api/apariencia", (p) => local.cambiarApariencia(p)),
    ruta("GET", "/api/agenda", (p) => agenda.agendaDelDia(p)),
    ruta("POST", "/api/webhooks/pagos", (p) => pagos.webhook(p)),
    ruta("POST", "/api/pagos/conciliar", (p) => pagos.conciliarAhora(p)),
    ruta("POST", "/api/ventas/sincronizar", (p) => caja.sincronizar(p)),
    // Tienda en línea (ADR-012)
    ruta("POST", "/api/pedidos", (p) => tienda.pedir(p)),
    ruta("GET", "/api/mis-pedidos", (p) => tienda.misPedidos(p)),
    ruta("GET", "/api/pedidos/por-surtir", (p) => tienda.porSurtir(p)),
    ruta("GET", "/api/pedidos/:id", (p) => tienda.verPedido(p)),
    ruta("POST", "/api/pedidos/:id/avanzar", (p) => tienda.avanzar(p)),
    ruta("GET", "/api/corte", (p) => caja.verCorte(p)),
    ruta("POST", "/api/corte/cerrar", (p) => caja.cerrarCorte(p)),

    // Buzón de correos de la demo (los correos no salen de verdad): solo el admin.
    ruta("GET", "/api/demo/correos", async (p) => {
      exigirRol(p, "admin");
      return { estado: 200, cuerpo: await app.notificador.ultimos() };
    }),
  ];

  const pasarela = app.pasarela;
  if (pasarela instanceof PasarelaMercadoPago) {
    // Webhook de Mercado Pago. Manda el id del pago (en la URL o en el cuerpo); se le pregunta a
    // Mercado Pago de qué cita es y se sigue el MISMO camino que con la pasarela simulada.
    rutas.push(
      ruta("POST", "/api/webhooks/mercadopago", async (p) => {
        const cuerpo = (p.body ?? {}) as { type?: string; data?: { id?: string | number } };
        const tipo = p.query.type ?? p.query.topic ?? cuerpo.type;
        const idPago = String(p.query["data.id"] ?? p.query.id ?? cuerpo.data?.id ?? "");
        if (tipo !== "payment" || !idPago) return { estado: 200, cuerpo: { ignorado: true } };
        const referencia = await pasarela.referenciaDePago(idPago);
        if (!referencia) return { estado: 200, cuerpo: { ignorado: true } };
        return pagos.webhook({ params: {}, query: {}, body: { referencia } });
      }),
    );
  }
  if (pasarela instanceof PasarelaSimulada) {
    // La pasarela simulada y su página de pago (web/pasarela/pagar.html).
    rutas.push(
      ruta("GET", "/pasarela/cobros/:id", async (p) => {
        const c = await pasarela.leer(p.params.id);
        return c ? { estado: 200, cuerpo: c } : { estado: 404, cuerpo: { error: "Cobro inexistente" } };
      }),
      ruta("POST", "/pasarela/cobros/:id/aprobar", async (p) => {
        const conAviso = (p.body as { webhook?: boolean } | null)?.webhook !== false;
        const referencia = await pasarela.aprobar(p.params.id);
        // La pasarela "avisa" al sistema. Como es simulada y vive en el mismo servidor, el webhook se
        // entrega llamando directo al controlador, igual que si hubiera llegado por HTTP.
        if (conAviso) await pagos.webhook({ params: {}, query: {}, body: { referencia } });
        return { estado: 200, cuerpo: { ok: true, webhook: conAviso } };
      }),
    );
  }
  return rutas;
}

// Busca la ruta y la atiende. Devuelve null si no es una ruta de la API (entonces es un archivo de web/).
export async function atender(
  app: Aplicacion,
  metodo: string,
  url: URL,
  leerCuerpo: () => Promise<unknown>,
  autorizacion: string | null = null, // la cabecera "Authorization: Bearer <token>"
): Promise<Respuesta | null> {
  const r = crearRutas(app).find((x) => x.metodo === metodo && x.patron.test(url.pathname));
  if (!r) return null;
  const m = url.pathname.match(r.patron)!;
  const params = Object.fromEntries(r.nombres.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
  try {
    const token = autorizacion?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
    const usuario = token ? await app.verSesion.ejecutar({ token }) : null;
    const query = Object.fromEntries(url.searchParams);
    return await r.manejar({ params, query, body: await leerCuerpo(), token, usuario });
  } catch (err) {
    return aRespuestaDeError(err);
  }
}

// Lee el cuerpo como JSON; si no es JSON válido devuelve null y el controlador responde 400 si le hacía falta.
export function aJson(texto: string): unknown {
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}
