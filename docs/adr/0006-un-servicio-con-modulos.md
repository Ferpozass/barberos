# ADR-006. Un solo servicio desplegable con módulos separados por dominio

Estado: aceptada. Escenarios E2 y E3. Todas las funciones.

## Contexto

Tres estudiantes sin personal de operaciones, una sola barbería con 120 a 600 citas al mes y un pico de dos horas a la semana, con infraestructura en planes gratuitos. Las reglas duras no pueden depender de la aplicación del cliente, que corre en un celular ajeno.

## Opciones consideradas

(1) Un solo servicio con módulos por dominio: agenda, pagos, inventario y caja en un mismo despliegue. (2) Un servicio por dominio, desplegado y escalado por separado. (3) Sin capa propia de servidor, con las reglas aplicadas desde el cliente.

## Matriz de decisión

| Criterio | Peso | Un solo servicio | Un servicio por dominio | Sin capa propia |
|---|---|---|---|---|
| Costo de infraestructura al mes | Alto | Un plan | Uno por servicio | El más bajo |
| Reglas duras fuera del alcance del cliente | Alto | Sí | Sí | No |
| Operación que recae en tres estudiantes | Alto | Baja | Alta | Mínima |
| Liberar un módulo sin tocar los demás | Bajo | No | Sí | No aplica |

Decisión: BarberOS se despliega como un solo servicio con módulos por dominio, y toda regla dura se ejecuta en el servidor o en la base, nunca en el cliente.

Alternativa descartada: microservicios. Su ventaja es desplegar y escalar por separado, y ese criterio pesa Bajo aquí: un solo negocio y ningún módulo que crezca distinto de los demás.

Consecuencia aceptada: todo se libera junto y un error en un módulo puede tumbar el servicio completo. Se sostiene porque el despliegue ocurre de madrugada, fuera del horario de 10:00 a 20:00.

Métrica verificable: despliegue completo verificado en 15 minutos o menos de madrugada, con cero interrupciones en horario de atención, y cero citas encimadas en 1,000 intentos hechos contra el servidor sin pasar por la aplicación.
