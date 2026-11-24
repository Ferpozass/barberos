# ADR-004. El pago se confirma por dos caminos, no solo por la notificación de la pasarela

Estado: aceptada. Escenario E3. Funciones F1 y F4.

## Contexto

El cliente paga, ve el cargo en su banco, y la notificación hacia el sistema se pierde: la cita queda sin confirmar con el dinero ya cobrado. El plan gratuito limita las tareas programadas al día, así que no cabe una tarea por pago; con 20 a 100 servicios diarios, los pendientes caben en un lote.

## Opciones consideradas

(1) Confiar solo en la notificación de la pasarela. (2) Notificación más conciliación programada por lotes. (3) Consultar desde el cliente cada vez que abre la pantalla.

## Matriz de decisión

| Criterio | Peso | Solo notificación | Notificación más lotes | Consultar desde el cliente |
|---|---|---|---|---|
| Pagos sin conciliar si el aviso se pierde | Alto | Todos los del hueco | Ninguno tras la corrida | Solo los de quien regrese |
| Cuota de tareas programadas | Alto | Nulo | Bajo: una por lote | Nulo |
| Riesgo de aplicar dos veces el pago | Alto | Bajo | Existe: obliga a idempotencia | Alto |
| Complejidad que se agrega | Medio | Mínima | Media | Baja |

Decisión: además del receptor de notificaciones, un proceso programado consulta por lotes el estado real de los pagos pendientes, y ambos caminos llegan al mismo manejador idempotente por identificador de pago.

Alternativa descartada: confiar solo en la notificación. Funciona el 99% de las veces, pero el 1% restante es un cliente que pagó y llega al mostrador sin cita.

Consecuencia aceptada: el mismo pago puede procesarse por los dos caminos, y hay una ventana de hasta 10 minutos en la que el cliente ve su cita como pendiente.

Métrica verificable: 99% o más de los pagos conciliados en 10 minutos o menos, ninguna cita pagada sin confirmar más de 30 minutos, y cero descuentos dobles reenviando la misma notificación cinco veces.
