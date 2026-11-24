# ADR-002. La exclusión de horarios y de existencias vive en la base de datos, no en el código

Estado: aceptada, con la parte de la restricción de unicidad **reemplazada (Superseded) por [ADR-008](0008-exclusion-por-transaccion-con-traslape.md)**. Escenario E2. Funciones F1 y F4.

## Contexto

Domingo 21:00, hasta 50 usuarios concurrentes. Dos clientes pueden pedir el mismo horario en el mismo segundo, y la última existencia puede pedirse a la vez en mostrador y en línea. El plan es gratuito, con tope de conexiones y sin margen para pagar piezas nuevas.

## Opciones consideradas

(1) Validar en el código: consultar si está libre y luego insertar. (2) Restricción en la base: unicidad sobre barbero, fecha y hora, y descuento de inventario en una transacción que bloquea la fila. (3) Serializar con un componente externo: una cola o un servicio de bloqueo distribuido.

## Matriz de decisión

| Criterio | Peso | Validar en el código | Restricción en la base | Componente externo |
|---|---|---|---|---|
| Dobles reservas en 1,000 intentos | Alto | Varias | Cero | Cero si el componente vive |
| Infraestructura que pagar y cuidar | Alto | Ninguna | Ninguna | Una pieza más |
| Latencia con 50 usuarios | Medio | Baja | Baja con caché por barbero y día | Media |
| Tiempo para implementarlo | Medio | 1 día | 3 días | 2 semanas |

Decisión: la unicidad de barbero, fecha y hora se garantiza con una restricción en la base, y el inventario con una transacción que bloquea la fila y exige existencia mayor a cero.

Alternativa descartada: validar en el código. Entre consultar e insertar queda una ventana de milisegundos, que es justo donde caen las dos solicitudes del mismo segundo.

Consecuencia aceptada: la aplicación tiene que traducir un error de restricción violada en un mensaje claro con tres horarios alternativos, y una regla de negocio queda expresada en el esquema.

Métrica verificable: cero dobles reservas y cero sobreventas en 1,000 intentos concurrentes, y 95% de las consultas de disponibilidad en 1.5 segundos o menos con 50 usuarios.
