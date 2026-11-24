// Pruebas de la tienda en línea (F4) y de la operación del local: cambiar cita, barbero ausente,
// bloqueos, recordatorios, devoluciones y que un cliente no tenga dos citas a la vez.
import assert from "node:assert/strict";
import { test } from "node:test";
import { AgendarCita } from "../src/application/use-cases/agenda/agendar-cita.ts";
import { CancelarCita } from "../src/application/use-cases/agenda/gestionar-cita.ts";
import {
  BloquearHorario,
  EnviarRecordatorios,
  MarcarBarberoAusente,
  ReagendarCita,
  RegistrarClienteSinCita,
} from "../src/application/use-cases/agenda/operacion-del-local.ts";
import { ConsultarDisponibilidad } from "../src/application/use-cases/agenda/consultar-disponibilidad.ts";
import { DevolverPago, VerDevolucionesPendientes } from "../src/application/use-cases/caja/administracion.ts";
import { GenerarCorteDeCaja } from "../src/application/use-cases/caja/corte-de-caja.ts";
import { ConfirmarPago } from "../src/application/use-cases/pagos/confirmar-pago.ts";
import { AvanzarPedido, HacerPedido, LiberarPedidosVencidos } from "../src/application/use-cases/tienda/tienda.ts";
import { ErrorDeDominio } from "../src/domain/errors/errores.ts";
import {
  MemoriaRepositorioBloqueos,
  MemoriaRepositorioCitas,
  MemoriaRepositorioPedidos,
  MemoriaRepositorioUnaVez,
} from "../src/infrastructure/repositories/memoria/memoria-repositorios.ts";
import { DIA, NotificadorFalso, PasarelaFalsa, RelojFijo, a, idsSecuenciales, reposEnMemoria } from "./apoyo.ts";

function armar() {
  const r = reposEnMemoria();
  const citas = r.citas as MemoriaRepositorioCitas;
  const reloj = new RelojFijo(a(9));
  const pasarela = new PasarelaFalsa();
  const notificador = new NotificadorFalso();
  const ids = idsSecuenciales();
  const pedidos = new MemoriaRepositorioPedidos();
  const bloqueos = new MemoriaRepositorioBloqueos(citas);
  const unaVez = new MemoriaRepositorioUnaVez();
  const tienda = { pedidos, productos: r.productos, pasarela, notificador, reloj, ids };
  const confirmar = new ConfirmarPago({ citas, pagos: r.pagos, pasarela, notificador, reloj, pedidos });
  const agendar = new AgendarCita({ citas, catalogo: r.catalogo, pasarela, reloj, ids, pedidos, productos: r.productos });
  const ana = { clienteNombre: "Ana", clienteCorreo: "ana@correo.com" };
  // Agenda y paga una cita (queda confirmada).
  const citaPagada = async (barberoId: string, h: number, extra = {}) => {
    const x = await agendar.ejecutar({ barberoId, servicioId: "corte", inicio: a(h), tipoPago: "anticipo", ...ana, ...extra });
    pasarela.aprobar(x.cita.idCobro!);
    await confirmar.ejecutar({ citaId: x.cita.id });
    return x;
  };
  return { r, citas, reloj, pasarela, notificador, ids, pedidos, bloqueos, unaVez, tienda, confirmar, agendar, ana, citaPagada };
}

const existencia = async (k: ReturnType<typeof armar>, id: string) => (await k.r.productos.buscarPorId(id))!.existencia;

test("Tienda (reglas 19 y 30): el pedido aparta la existencia y, si no se paga en 10 min, la regresa", async () => {
  const k = armar();
  const antes = await existencia(k, "aceite-barba");
  const { pedido } = await new HacerPedido(k.tienda).ejecutar({
    cliente: { nombre: "Ana", correo: "ana@correo.com" },
    pidio: [{ productoId: "aceite-barba", cantidad: 2 }],
    entrega: "recoger",
  });
  assert.equal(pedido.estado, "pendiente");
  assert.equal(pedido.total, 440); // el precio sale del catálogo, no del navegador
  assert.equal(await existencia(k, "aceite-barba"), antes - 2);
  k.reloj.avanzarMinutos(11);
  const r = await new LiberarPedidosVencidos(k.tienda).ejecutar();
  assert.equal(r.liberados, 1);
  assert.equal(await existencia(k, "aceite-barba"), antes);
  // Correr otra vez no regresa la existencia dos veces.
  await new LiberarPedidosVencidos(k.tienda).ejecutar();
  assert.equal(await existencia(k, "aceite-barba"), antes);
});

test("Tienda (regla 19): no se vende lo que no hay, y si un producto no alcanza no se aparta ninguno", async () => {
  const k = armar();
  const pedir = new HacerPedido(k.tienda);
  const cliente = { nombre: "Ana", correo: "ana@correo.com" };
  await pedir.ejecutar({ cliente, pidio: [{ productoId: "peine", cantidad: 2 }], entrega: "recoger" }); // había 2
  const cera = await existencia(k, "cera-mate");
  await assert.rejects(
    pedir.ejecutar({ cliente, pidio: [{ productoId: "cera-mate", cantidad: 1 }, { productoId: "peine", cantidad: 1 }], entrega: "recoger" }),
    /Ya no hay suficientes piezas de "Peine de madera"/,
  );
  assert.equal(await existencia(k, "cera-mate"), cera);
});

test("Tienda (reglas 17, 20 y 21): a domicilio cobra envío; pagado -> preparado -> entregado, y el pago se aplica una vez", async () => {
  const k = armar();
  const cliente = { nombre: "Ana", correo: "ana@correo.com" };
  await assert.rejects(
    new HacerPedido(k.tienda).ejecutar({ cliente, pidio: [{ productoId: "tonico", cantidad: 1 }], entrega: "domicilio", direccion: "" }),
    ErrorDeDominio,
  );
  const { pedido } = await new HacerPedido(k.tienda).ejecutar({
    cliente, pidio: [{ productoId: "tonico", cantidad: 1 }], entrega: "domicilio", direccion: "Calle Hidalgo 10, Centro, Querétaro",
  });
  assert.equal(pedido.total, 200 + 60);
  k.pasarela.aprobar(pedido.idCobro!);
  const liberar = new LiberarPedidosVencidos(k.tienda); // la conciliación también encuentra el pago de un pedido
  assert.equal((await liberar.ejecutar()).pagados, 1);
  assert.equal((await liberar.ejecutar()).pagados, 0);
  const avanzar = new AvanzarPedido(k.tienda);
  assert.equal((await avanzar.ejecutar({ pedidoId: pedido.id })).estado, "preparado");
  assert.equal((await avanzar.ejecutar({ pedidoId: pedido.id })).estado, "entregado");
  await assert.rejects(avanzar.ejecutar({ pedidoId: pedido.id }), ErrorDeDominio);
  assert.ok(k.notificador.enviados.some((c) => c.asunto === "Tu pedido va en camino"));
});

test("¿Algo más?: los productos van en el mismo cobro de la cita, pero al barbero solo le cuenta la cita", async () => {
  const k = armar();
  const x = await k.citaPagada("barbero-1", 11, { productos: [{ productoId: "cera-mate", cantidad: 1 }] });
  assert.equal(x.montoAPagar, 72 + 190); // 40 % de $180 + la cera
  const [pedido] = await k.pedidos.buscarPorCita(x.cita.id);
  assert.equal(pedido.estado, "pagado");
  const cita = await k.citas.buscarPorId(x.cita.id);
  assert.equal(cita!.pagadoEnLinea, 72);
  const corte = (await new GenerarCorteDeCaja({ ...k.r, reloj: k.reloj, pedidos: k.pedidos }).ejecutar({ dia: DIA })).aDatos();
  assert.equal(corte.enLinea, 72);
  assert.equal(corte.tiendaEnLinea, 190);
  assert.equal(corte.comisiones.find((c) => c.barberoId === "barbero-1")!.cobrado, 72);
});

test("Soltar una cita apartada regresa los productos que se habían apartado con ella", async () => {
  const k = armar();
  const antes = await existencia(k, "kit-barba");
  const x = await k.agendar.ejecutar({ barberoId: "barbero-2", servicioId: "corte", inicio: a(12), tipoPago: "total", ...k.ana, productos: [{ productoId: "kit-barba", cantidad: 1 }] });
  assert.equal(await existencia(k, "kit-barba"), antes - 1);
  await new CancelarCita({ citas: k.citas, notificador: k.notificador, reloj: k.reloj, pedidos: k.pedidos, productos: k.r.productos }).ejecutar({ citaId: x.cita.id });
  assert.equal(await existencia(k, "kit-barba"), antes);
});

test("Regla 26: un cliente no puede tener dos citas a la misma hora, aunque sean con barberos distintos", async () => {
  const k = armar();
  await k.citaPagada("barbero-1", 13);
  await assert.rejects(
    k.agendar.ejecutar({ barberoId: "barbero-2", servicioId: "corte", inicio: a(13, 15), tipoPago: "anticipo", ...k.ana }),
    /Ya tienes otra cita a esa hora/,
  );
});

test("UC-03: cambiar la cita a otra hora libre, solo hasta 2 horas antes", async () => {
  const k = armar();
  const x = await k.citaPagada("barbero-1", 12);
  const reagendar = new ReagendarCita({ citas: k.citas, notificador: k.notificador, reloj: k.reloj });
  const movida = await reagendar.ejecutar({ citaId: x.cita.id, inicio: a(16) });
  assert.equal(movida.inicio.getTime(), a(16).getTime());
  await k.citaPagada("barbero-1", 17, { clienteCorreo: "beto@correo.com", clienteNombre: "Beto" });
  await assert.rejects(reagendar.ejecutar({ citaId: x.cita.id, inicio: a(17) }), /ya no está libre/);
  k.reloj.avanzarMinutos(6 * 60 + 30); // 15:30, falta media hora
  await assert.rejects(reagendar.ejecutar({ citaId: x.cita.id, inicio: a(18) }), /2 horas antes/);
});

test("UC-18: un bloqueo quita esas horas de la disponibilidad y no se deja bloquear encima de una cita", async () => {
  const k = armar();
  const bloquear = new BloquearHorario({ citas: k.citas, bloqueos: k.bloqueos, reloj: k.reloj, ids: k.ids });
  await bloquear.ejecutar({ barberoId: "barbero-3", dia: DIA, desde: "14:00", hasta: "15:00", motivo: "Comida" });
  const horas = await new ConsultarDisponibilidad({ citas: k.citas, catalogo: k.r.catalogo, reloj: k.reloj, bloqueos: k.bloqueos }).ejecutar({
    barberoId: "barbero-3", servicioId: "barba", dia: DIA,
  });
  const libre = (h: number, m = 0) => horas.find((x) => x.inicio.getTime() === a(h, m).getTime())!.libre;
  assert.equal(libre(14), false);
  assert.equal(libre(14, 30), false);
  assert.equal(libre(15), true);
  await assert.rejects(k.agendar.ejecutar({ barberoId: "barbero-3", servicioId: "barba", inicio: a(14), tipoPago: "total", ...k.ana }));
  await k.citaPagada("barbero-3", 11);
  await assert.rejects(bloquear.ejecutar({ barberoId: "barbero-3", dia: DIA, desde: "11:00", hasta: "12:00" }), /cita/);
});

test("UC-06 (regla 13): si un barbero falta, su cita pasa a otro; si nadie está libre, se cancela y se le avisa", async () => {
  const k = armar();
  const x = await k.citaPagada("barbero-1", 11);
  // A las 12 están ocupados los tres: esa no se puede reasignar.
  const y = await k.citaPagada("barbero-1", 12, { clienteCorreo: "beto@correo.com", clienteNombre: "Beto" });
  await k.citaPagada("barbero-2", 12, { clienteCorreo: "c@correo.com", clienteNombre: "Caro" });
  await k.citaPagada("barbero-3", 12, { clienteCorreo: "d@correo.com", clienteNombre: "Dani" });
  const r = await new MarcarBarberoAusente({ citas: k.citas, catalogo: k.r.catalogo, bloqueos: k.bloqueos, notificador: k.notificador, reloj: k.reloj, ids: k.ids })
    .ejecutar({ barberoId: "barbero-1", dia: DIA });
  assert.deepEqual(r, { reasignadas: 1, canceladas: 1 });
  assert.notEqual((await k.citas.buscarPorId(x.cita.id))!.barberoId, "barbero-1");
  assert.equal((await k.citas.buscarPorId(y.cita.id))!.estado, "cancelada");
  assert.ok(k.notificador.enviados.some((c) => c.para === "beto@correo.com" && c.asunto === "Tuvimos que cancelar tu cita"));
  // Ya no se le puede agendar a él ese día.
  await assert.rejects(k.agendar.ejecutar({ barberoId: "barbero-1", servicioId: "corte", inicio: a(17), tipoPago: "total", ...k.ana }));
});

test("UC-16 (regla 7): lo cancelado a tiempo se devuelve una sola vez; si no llegó, no hay devolución", async () => {
  const k = armar();
  const x = await k.citaPagada("barbero-2", 15);
  await new CancelarCita({ citas: k.citas, notificador: k.notificador, reloj: k.reloj }).ejecutar({ citaId: x.cita.id });
  const ver = new VerDevolucionesPendientes({ citas: k.citas, unaVez: k.unaVez });
  assert.equal((await ver.ejecutar()).length, 1);
  const devolver = new DevolverPago({ citas: k.citas, pagos: k.r.pagos, unaVez: k.unaVez, pasarela: k.pasarela, notificador: k.notificador, reloj: k.reloj });
  assert.deepEqual(await devolver.ejecutar({ citaId: x.cita.id }), { devuelto: 72 });
  await assert.rejects(devolver.ejecutar({ citaId: x.cita.id }), /ya se hizo/);
  assert.equal(k.pasarela.devueltos.length, 1);
  assert.equal((await ver.ejecutar()).length, 0);
});

test("UC-05 (regla 11): recordatorio 24 h y 2 h antes, cada uno una sola vez", async () => {
  const k = armar();
  await k.citaPagada("barbero-1", 18);
  const rec = new EnviarRecordatorios({ citas: k.citas, unaVez: k.unaVez, notificador: k.notificador, reloj: k.reloj, urlBase: "https://barberos.test" });
  assert.equal((await rec.ejecutar()).enviados, 1); // a las 9:00 la cita de las 18:00 está dentro de 24 h
  assert.equal((await rec.ejecutar()).enviados, 0);
  k.reloj.avanzarMinutos(7 * 60 + 30); // 16:30
  assert.equal((await rec.ejecutar()).enviados, 1);
  assert.equal((await rec.ejecutar()).enviados, 0);
  assert.deepEqual(k.notificador.enviados.filter((c) => c.asunto.includes("cita")).map((c) => c.asunto).slice(-2), ["Mañana es tu cita", "Tu cita es en 2 horas"]);
});

test("UC-04: el cliente sin cita se registra confirmado y sin anticipo, sin encimarse", async () => {
  const k = armar();
  k.reloj.avanzarMinutos(2 * 60); // 11:00
  const sinCita = new RegistrarClienteSinCita({ citas: k.citas, catalogo: k.r.catalogo, reloj: k.reloj, ids: k.ids });
  const c = await sinCita.ejecutar({ barberoId: "barbero-2", servicioId: "barba", clienteNombre: "Don Luis" });
  assert.equal(c.estado, "confirmada");
  assert.equal(c.saldoPendiente, 120);
  await assert.rejects(sinCita.ejecutar({ barberoId: "barbero-2", servicioId: "barba", clienteNombre: "Otro" }), /no está libre/);
});
