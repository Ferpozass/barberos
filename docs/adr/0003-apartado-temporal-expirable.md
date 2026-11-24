# ADR-003. El espacio se aparta con una reserva temporal antes de cobrar

Estado: aceptada. Escenario E2. Función F1.

## Contexto

El espacio no se aparta sin pago: 100% en línea o anticipo del 40%, no reembolsable. La pasarela cobra 3.5% más IVA, así que devolver cuesta dinero, y el paso por ella tarda de segundos a minutos: en ese lapso otro cliente puede pedir el mismo horario.

## Opciones consideradas

(1) Apartar al seleccionar y cobrar después. (2) Cobrar primero y apartar cuando el pago se confirme. (3) Reserva temporal expirable y luego cobrar: la cita se confirma con el pago y, si no llega, la reserva caduca sola.

## Matriz de decisión

| Criterio | Peso | Apartar y cobrar después | Cobrar y luego apartar | Reserva temporal |
|---|---|---|---|---|
| Espacios muertos sin pago | Alto | Muchos | Ninguno | Ninguno tras expirar |
| Cargos por un horario ya tomado | Alto | Nulo | Alto | Nulo |
| Devoluciones a operar a mano | Alto | Ninguna | Una por cada choque | Ninguna |
| Fricción para el cliente | Medio | Mínima | Baja | Baja: un contador visible |

Decisión: al elegir horario se crea una reserva temporal con expiración, con ella el cliente pasa a pagar, y la cita se confirma solo cuando el pago se acredita.

Alternativa descartada: cobrar primero y apartar después. Dos clientes podrían pagar el mismo horario, y el negocio tendría que devolverle a uno perdiendo la comisión en ambos sentidos.

Consecuencia aceptada: un estado provisional visible para el cliente, y una reserva que debe durar más que la ventana de conciliación del ADR-004 sin bloquear la agenda en el pico.

Métrica verificable: cero cargos a una reserva rechazada en 1,000 intentos concurrentes, y ninguna cita pagada que pierda su espacio mientras el pago está en verificación.
