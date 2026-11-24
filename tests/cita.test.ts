import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Cita } from "../src/domain/entities/cita.ts";
import { ErrorDeDominio } from "../src/domain/errors/errores.ts";
import { fechaDelDia } from "../src/domain/shared/horario-del-local.ts";
import { a } from "./apoyo.ts";

// Pruebas del dominio puro: sin repositorios, sin base de datos, sin HTTP.
const AHORA = a(9);
const nueva = (over: Partial<Parameters<typeof Cita.crear>[0]> = {}) =>
  Cita.crear(
    {
      id: "c1",
      barberoId: "barbero-1",
      servicioId: "corte",
      clienteNombre: "Ana",
      clienteCorreo: "ana@correo.mx",
      inicio: a(11),
      duracionMin: 45,
      precio: 180,
      tipoPago: "anticipo",
      ...over,
    },
    AHORA,
  );

describe("Entidad Cita", () => {
  it("nace apartada por 10 minutos (RN-02)", () => {
    const c = nueva();
    assert.equal(c.estado, "apartada");
    assert.equal(c.apartadoVenceEn!.getTime(), a(9, 10).getTime());
  });

  it("el anticipo es el 40 % y el total es el 100 % (RN-01)", () => {
    assert.equal(nueva().montoAPagarEnLinea(), 72);
    assert.equal(nueva({ tipoPago: "total" }).montoAPagarEnLinea(), 180);
  });

  it("no se confirma con un pago incompleto (RN-01)", () => {
    const c = nueva();
    assert.throws(() => c.confirmarPago(50), ErrorDeDominio);
    c.confirmarPago(72);
    assert.equal(c.estado, "confirmada");
    assert.equal(c.saldoPendiente, 108);
  });

  it("rechaza domingo, antes de las 10 y terminar después de las 20 (RN-05)", () => {
    assert.throws(() => nueva({ inicio: fechaDelDia("2026-11-29", 12) }), /horario/); // domingo
    assert.throws(() => nueva({ inicio: a(9, 30) }), /horario/);
    assert.throws(() => nueva({ inicio: a(19, 30) }), /horario/);
    assert.doesNotThrow(() => nueva({ inicio: a(19, 15) })); // termina 20:00 exacto
  });

  it("solo se cancela con 2 horas o más de anticipación (RN-06)", () => {
    const c = nueva();
    c.confirmarPago(72);
    assert.throws(() => c.cancelar(a(9, 30)), /2 horas/);
    c.cancelar(a(9));
    assert.equal(c.estado, "cancelada");
  });

  it("dos citas del mismo barbero chocan si se enciman, pero no si una empieza cuando acaba la otra (RN-03)", () => {
    const c1 = nueva();
    assert.equal(nueva({ id: "c2", inicio: a(11, 30) }).chocaCon(c1, AHORA), true);
    assert.equal(nueva({ id: "c3", inicio: a(11, 45) }).chocaCon(c1, AHORA), false);
    assert.equal(nueva({ id: "c4", barberoId: "barbero-2" }).chocaCon(c1, AHORA), false);
  });

  it("un apartado vencido ya no ocupa el horario (RN-02)", () => {
    const c = nueva();
    assert.equal(c.ocupaHorario(a(9, 9)), true);
    assert.equal(c.ocupaHorario(a(9, 10)), false);
  });
});
