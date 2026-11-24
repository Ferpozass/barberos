import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AgendarCita } from "../src/application/use-cases/agenda/agendar-cita.ts";
import { CerrarCorteDeCaja, GenerarCorteDeCaja } from "../src/application/use-cases/caja/corte-de-caja.ts";
import { SincronizarVentas } from "../src/application/use-cases/caja/sincronizar-ventas.ts";
import { ConciliarPagos, ConfirmarPago } from "../src/application/use-cases/pagos/confirmar-pago.ts";
import { ErrorDeDominio } from "../src/domain/errors/errores.ts";
import type { DatosVenta } from "../src/domain/entities/venta.ts";
import { reposEnMemoria, DIA, NotificadorFalso, PasarelaFalsa, RelojFijo, a, idsSecuenciales, type Repos } from "./apoyo.ts";

describe("Pagos, ventas y corte", () => {
  let repos: Repos;
  let reloj: RelojFijo;
  let pasarela: PasarelaFalsa;
  let correo: NotificadorFalso;
  let agendar: AgendarCita;
  let confirmar: ConfirmarPago;
  let sincronizar: SincronizarVentas;

  beforeEach(() => {
    repos = reposEnMemoria();
    reloj = new RelojFijo(a(9));
    pasarela = new PasarelaFalsa();
    correo = new NotificadorFalso();
    agendar = new AgendarCita({ citas: repos.citas, catalogo: repos.catalogo, pasarela, reloj, ids: idsSecuenciales() });
    confirmar = new ConfirmarPago({ citas: repos.citas, pagos: repos.pagos, pasarela, notificador: correo, reloj });
    sincronizar = new SincronizarVentas(repos);
  });

  const citaPagada = async (correoCliente = "ana@correo.mx", hora = 11) => {
    const { cita } = await agendar.ejecutar({
      barberoId: "barbero-1", servicioId: "corte", inicio: a(hora),
      clienteNombre: "Ana", clienteCorreo: correoCliente, tipoPago: "anticipo",
    });
    pasarela.aprobar(cita.idCobro!);
    await confirmar.ejecutar({ citaId: cita.id });
    return cita.id;
  };

  const venta = (over: Partial<DatosVenta> = {}): DatosVenta => ({
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    barberoId: "barbero-1",
    citaId: null,
    metodo: "efectivo",
    creadaEn: a(12).toISOString(),
    renglones: [{ tipo: "producto", productoId: "cera-mate", concepto: "Cera mate", cantidad: 1, precioUnitario: 190 }],
    ...over,
  });

  it("el mismo aviso de pago tres veces confirma la cita y registra el pago UNA vez (RN-08)", async () => {
    const { cita } = await agendar.ejecutar({
      barberoId: "barbero-1", servicioId: "corte", inicio: a(11),
      clienteNombre: "Ana", clienteCorreo: "ana@correo.mx", tipoPago: "anticipo",
    });
    assert.equal(await confirmar.ejecutar({ citaId: cita.id }), "pendiente"); // aún no paga
    pasarela.aprobar(cita.idCobro!);
    const r = [];
    for (let i = 0; i < 3; i++) r.push(await confirmar.ejecutar({ citaId: cita.id }));
    assert.deepEqual(r, ["confirmada", "ya_aplicado", "ya_aplicado"]);
    assert.equal((await repos.pagos.buscarPorDia(DIA)).length, 1);
    assert.equal(correo.enviados.filter((c) => c.asunto.includes("confirmada")).length, 1);
  });

  it("si el webhook se pierde, la conciliación encuentra el pago (escenario E3, ADR-004)", async () => {
    const { cita } = await agendar.ejecutar({
      barberoId: "barbero-1", servicioId: "corte", inicio: a(11),
      clienteNombre: "Ana", clienteCorreo: "ana@correo.mx", tipoPago: "total",
    });
    pasarela.aprobar(cita.idCobro!); // la pasarela cobró, pero el aviso nunca llegó
    const r = await new ConciliarPagos({ citas: repos.citas, confirmar }).ejecutar();
    assert.deepEqual(r, { revisadas: 1, confirmadas: 1 });
    assert.equal((await repos.citas.buscarPorId(cita.id))!.estado, "confirmada");
  });

  it("reenviar la cola de ventas no duplica la venta ni descuenta dos veces (RN-09, ADR-001)", async () => {
    const antes = (await repos.productos.buscarPorId("cera-mate"))!.existencia;
    const r1 = await sincronizar.ejecutar([venta()]);
    const r2 = await sincronizar.ejecutar([venta()]); // la señal se cortó y el celular reintenta
    assert.equal(r1[0].resultado, "guardada");
    assert.equal(r2[0].resultado, "duplicada");
    assert.equal((await repos.ventas.buscarPorDia(DIA)).length, 1);
    assert.equal((await repos.productos.buscarPorId("cera-mate"))!.existencia, antes - 1);
  });

  it("una venta sin existencia suficiente se guarda (ya ocurrió) pero avisa para revisar inventario (RN-10)", async () => {
    const [r] = await sincronizar.ejecutar([
      venta({ renglones: [{ tipo: "producto", productoId: "peine", concepto: "Peine", cantidad: 5, precioUnitario: 90 }] }),
    ]);
    assert.equal(r.resultado, "guardada");
    assert.match(r.avisos[0], /revisar inventario/);
  });

  it("el corte no se cierra mientras una cita pagada no tenga su cobro subido (RN-13)", async () => {
    const citaId = await citaPagada();
    const deps = { ...repos, reloj };
    const corte = await new GenerarCorteDeCaja(deps).ejecutar({ dia: DIA });
    assert.equal(corte.puedeCerrarse, false);
    await assert.rejects(new CerrarCorteDeCaja(deps).ejecutar({ dia: DIA }), ErrorDeDominio);

    // El barbero cobra el saldo ($108) sin internet; al volver la señal sube la venta.
    await sincronizar.ejecutar([
      venta({
        citaId,
        metodo: "efectivo",
        renglones: [{ tipo: "servicio", productoId: null, concepto: "Saldo del corte", cantidad: 1, precioUnitario: 108 }],
      }),
    ]);
    const cerrado = await new CerrarCorteDeCaja(deps).ejecutar({ dia: DIA });
    const d = cerrado.aDatos();
    assert.equal(d.efectivo, 108);
    assert.equal(d.enLinea, 72);
    assert.equal(d.total, 180);
    assert.equal(d.comisiones.find((c) => c.barberoId === "barbero-1")!.comision, 72); // 40 % de 180 (RN-12)
  });
});
