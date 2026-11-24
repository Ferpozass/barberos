# ADR-008. Los horarios se protegen revisando traslapes en la base de datos, no con una restricción de unicidad

Estado: aceptada (noviembre 2026). **Reemplaza (Supersedes)** la parte de ADR-002 que pedía una restricción de unicidad sobre barbero, fecha y hora. El inventario sigue como lo decidió ADR-002.

## Contexto

Al implementar ADR-002 apareció un caso que la restricción de unicidad no cubre: los servicios duran distinto (30, 45 y 60 minutos). Una cita de 11:00 a 11:45 y otra de 11:30 a 12:00 tienen hora de inicio distinta, así que la unicidad sobre (barbero, fecha, hora) las deja pasar aunque se enciman. Además, un apartado vencido (RN-02) debe dejar de ocupar el horario sin que nadie lo borre.

## Opciones consideradas

(1) Mantener la unicidad y partir la agenda en bloques fijos de 15 minutos (una fila por bloque). (2) Antes de insertar, buscar con una consulta SQL si ya hay una cita activa que se encime. (3) Restricción de exclusión de PostgreSQL (`EXCLUDE USING gist` sobre rangos de tiempo).

## Matriz de decisión

| Criterio | Peso | Bloques de 15 min | Consulta de traslape | EXCLUDE de PostgreSQL |
|---|---|---|---|---|
| Detecta traslapes de duraciones distintas | Alto | Sí | Sí | Sí |
| Ignora apartados vencidos sin borrarlos | Alto | No: hay que limpiar filas | Sí: el WHERE compara contra la hora actual | No: hay que limpiar filas |
| Funciona en SQLite y en PostgreSQL | Medio | Sí | Sí | Solo PostgreSQL |
| Filas por cita | Bajo | 2 a 4 | 1 | 1 |

Decisión: `RepositorioCitas.apartarSiLibre()` busca una cita activa del mismo barbero cuyo horario se encime y solo si no hay ninguna guarda la nueva. El caso de uso `AgendarCita` revisa antes con la regla del dominio (`Cita.chocaCon`) para dar un mensaje claro.

Alternativa descartada: los bloques de 15 minutos. Resuelven el traslape pero obligan a borrar filas cuando vence un apartado, y ese borrado es otro proceso que puede fallar.

Consecuencia aceptada: con SQLite las escrituras van una por una, que alcanza para el pico de 50 usuarios del domingo (Hito 1, E2). En PostgreSQL, con muchos usuarios a la vez, habría que meter la consulta y el INSERT en una transacción.

Métrica verificable: la prueba "rechaza una cita encimada con el mismo barbero (RN-03)" de `tests/agenda.test.ts` pasa, y en la página no se puede apartar dos veces el mismo horario.
