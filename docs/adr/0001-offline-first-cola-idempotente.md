# ADR-001. La aplicación del barbero opera sin conexión y sincroniza después

Estado: aceptada. Escenario E1. Función F3.

## Contexto

Internet doméstico sin respaldo ni UPS, con cortes de minutos a horas. Caso medido: sábado 12:00, cuatro barberos, 45 minutos sin red, 3 cobros de servicio y 1 venta. El barbero cobra de pie y con el cliente enfrente; la terminal bancaria trae su propia conexión.

## Opciones consideradas

(1) Exigir conexión: sin red se anota en papel y se captura después. (2) Caché de solo lectura: se ve la agenda sin red, pero cobrar requiere conexión. (3) Offline-first con cola: se cobra e imprime sin red y la operación se encola con un identificador único generado en el dispositivo.

## Matriz de decisión

| Criterio | Peso | Exigir conexión | Caché de solo lectura | Offline-first con cola |
|---|---|---|---|---|
| Cobros perdidos en una caída de 45 min | Alto | Los 4 | Los 4 | Ninguno |
| Riesgo de venta duplicada al sincronizar | Alto | Alto: recaptura a mano | Alto: recaptura a mano | Nulo: identificador de origen |
| Experiencia del barbero | Alto | Se bloquea | Ve la cita pero no cobra | Sin cambio |
| Complejidad que se agrega | Medio | Mínima | Baja | Alta |

Decisión: la aplicación del barbero es offline-first, con cola local de operaciones e identificador único generado en el dispositivo que el servidor trata de forma idempotente.

Alternativa descartada: el caché de solo lectura. Ver la cita sin poder cobrarla no resuelve lo que duele, que es el dinero del sábado.

Consecuencia aceptada: datos desfasados entre dispositivo y servidor, y un corte de caja que no cierra mientras queden operaciones sin sincronizar.

Métrica verificable: 100% de las operaciones sin red sincronizadas en 2 minutos o menos, sin duplicados. Se prueba con 200 operaciones encoladas en modo avión y reenviadas dos veces: deben quedar 200 ventas.
