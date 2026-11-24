# ADR-012. Tienda en línea con existencia apartada

Estado: aceptada (noviembre 2026). Implementa F4 del Hito 1 y completa ADR-003 (apartado que vence) y ADR-004 (conciliación).

## Contexto

El Hito 1 pide vender productos en mostrador y en línea sobre **un solo inventario** (reglas 18 y 19), con recoger en la
barbería o envío a domicilio (regla 20) y un pedido que pasa por pendiente, pagado, preparado y entregado (regla 21).
El riesgo es el mismo que con las citas: dos personas quieren la última pieza, o alguien aparta y nunca paga.

## Decisión

- **El pedido descuenta la existencia al crearse**, con el mismo `UPDATE ... WHERE existencia >= ?` que ya usaba la venta
  de mostrador. Si dos personas piden la última pieza, la base de datos deja pasar solo a una (E2). Si un producto del
  pedido no alcanza, se regresan los que ya se habían apartado y no se crea nada.
- **Aparta 10 minutos** (regla 30), igual que el horario de una cita. La conciliación, que ya corría cada minuto, ahora
  también revisa los pedidos pendientes: primero le pregunta a la pasarela si se pagó (E3) y, si no, lo cancela y
  regresa las piezas. La cancelación es un `UPDATE ... WHERE estado = 'pendiente'`: aunque corra dos veces, la existencia
  se regresa una sola vez.
- **Mismo puerto de pago** (`PasarelaDePago`). La referencia del cobro es el id del pedido; el webhook prueba primero con
  una cita y, si no existe, con un pedido.
- **"¿Algo más?" al agendar**: los productos recomendados se agregan al **mismo cobro** de la cita (un solo pago para el
  cliente). Al confirmarse, el pago se reparte: a la cita solo le toca su parte (para el corte y la comisión del barbero)
  y el resto marca pagado el pedido, que se entrega en la cita.
- El precio sale siempre del catálogo en el servidor, nunca del navegador.

## Alternativas descartadas

- Descontar al pagar: más simple, pero entre el pedido y el pago otra persona podría llevarse la pieza (sobreventa).
- Dos cobros separados para la cita y los productos: más fácil de programar, pero el cliente pagaría dos veces seguidas.

## Consecuencias

- Una pieza apartada no se puede vender en mostrador por hasta 10 minutos.
- El corte de caja muestra aparte la "tienda en línea" (no lleva comisión de barbero).
- El envío a domicilio tiene un costo fijo de ejemplo ($60) y no se integra con paqueterías.

Métrica verificable: 0 sobreventas cuando dos pedidos piden la última pieza a la vez, y la existencia vuelve completa
cuando un pedido no se paga en 10 minutos (pruebas en `tests/tienda-y-local.test.ts`).
