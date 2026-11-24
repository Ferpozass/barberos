import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AgendarCita } from "../src/application/use-cases/agenda/agendar-cita.ts";
import { ConsultarDisponibilidad } from "../src/application/use-cases/agenda/consultar-disponibilidad.ts";
import { ErrorDeDominio } from "../src/domain/errors/errores.ts";
import { reposEnMemoria, DIA, PasarelaFalsa, RelojFijo, a, idsSecuenciales, type Repos } from "./apoyo.ts";

describe("AgendarCita", () => {
  let repos: Repos;
  let reloj: RelojFijo;
  let pasarela: PasarelaFalsa;
  let agendar: AgendarCita;

  beforeEach(() => {
    repos = reposEnMemoria();
    reloj = new RelojFijo(a(9));
    pasarela = new PasarelaFalsa();
    agendar = new AgendarCita({ citas: repos.citas, catalogo: repos.catalogo, pasarela, reloj, ids: idsSecuenciales() });
  });

  const entrada = (over = {}) => ({
    barberoId: "barbero-1",
    servicioId: "corte", // 45 min, $180
    inicio: a(11),
    clienteNombre: "Ana",
    clienteCorreo: "ana@correo.mx",
    tipoPago: "anticipo" as const,
    ...over,
  });

  it("aparta el horario, toma duración y precio del catálogo y abre el cobro del anticipo", async () => {
    const r = await agendar.ejecutar(entrada());
    assert.equal(r.cita.estado, "apartada");
    assert.equal(r.cita.duracionMin, 45);
    assert.equal(r.montoAPagar, 72);
    assert.equal(pasarela.cobros.get(r.cita.idCobro!)!.monto, 72);
    assert.equal((await repos.citas.buscarPorBarberoYDia("barbero-1", DIA)).length, 1);
  });

  it("rechaza una cita encimada con el mismo barbero (RN-03)", async () => {
    await agendar.ejecutar(entrada());
    await assert.rejects(agendar.ejecutar(entrada({ inicio: a(11, 30), clienteCorreo: "beto@correo.mx" })), ErrorDeDominio);
    assert.equal((await repos.citas.buscarPorBarberoYDia("barbero-1", DIA)).length, 1);
  });

  it("libera el horario si el apartado venció sin pago (RN-02)", async () => {
    await agendar.ejecutar(entrada());
    reloj.avanzarMinutos(11);
    const r = await agendar.ejecutar(entrada({ clienteCorreo: "beto@correo.mx" }));
    assert.equal(r.cita.estado, "apartada");
  });

  it("la disponibilidad no ofrece el horario ocupado (RN-03, RN-05)", async () => {
    await agendar.ejecutar(entrada());
    const horarios = await new ConsultarDisponibilidad({ citas: repos.citas, catalogo: repos.catalogo, reloj }).ejecutar({
      barberoId: "barbero-1",
      servicioId: "corte",
      dia: DIA,
    });
    const libre = (h: number, m = 0) => horarios.find((x) => x.inicio.getTime() === a(h, m).getTime())?.libre;
    assert.equal(libre(10), true); // 10:00-10:45
    assert.equal(libre(10, 30), false); // 10:30-11:15 se enciman con la de las 11:00
    assert.equal(libre(11), false);
    assert.equal(libre(11, 30), false);
    assert.equal(libre(12), true); // la de las 11:00 acaba 11:45
    assert.equal(horarios.at(-1)!.inicio.getTime(), a(19).getTime()); // 45 min: el último que cabe antes de las 20:00
  });
});
