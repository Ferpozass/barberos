# ADR-007. La versión entregable corre con SQLite y con pasarela y correo simulados

Estado: aceptada (noviembre 2026). Afecta a ADR-004 y ADR-005 solo en su implementación, no en su decisión.

## Contexto

La entrega exige que cualquier persona (el profesor, un reclutador, un compañero) clone el repositorio y lo corra. Instalar PostgreSQL, crear una cuenta de Mercado Pago y conseguir llaves de un proveedor de correo son tres barreras que hacen que nadie lo corra. Node 24 ya trae SQLite integrado (`node:sqlite`).

## Opciones consideradas

(1) PostgreSQL con Docker y llaves reales de Mercado Pago en `.env`. (2) SQLite integrado más una pasarela y un correo simulados detrás de los mismos puertos. (3) Todo en memoria, sin persistencia.

## Matriz de decisión

| Criterio | Peso | PostgreSQL + llaves reales | SQLite + simulados | Todo en memoria |
|---|---|---|---|---|
| Pasos para correrlo desde cero | Alto | 6 o más, con cuentas externas | 2 (`cp .env.example .env` y `npm start`) | 1 |
| Demuestra las garantías de la BD (transacción, unicidad) | Alto | Sí | Sí | No |
| Riesgo de subir una llave al repo | Alto | Real | Nulo: no hay llaves | Nulo |
| Parecido con producción | Medio | Total | Alto: mismo SQL estándar | Bajo |

Decisión: la versión local usa SQLite y adaptadores simulados (`PasarelaSimulada`, `NotificadorBuzon`) que implementan los mismos puertos que usarían Mercado Pago y el correo real.

Alternativa descartada: todo en memoria. Es lo más fácil de correr, pero no demuestra la exclusión en la base de datos (ADR-002), que es la decisión más importante del sistema.

Consecuencia aceptada: SQLite permite un solo escritor a la vez; para una barbería de 1 a 5 barberos sobra, pero producción iría a PostgreSQL. Ese cambio toca solo `src/infrastructure/db` y `src/infrastructure/repositories`.

Métrica verificable: el proyecto arranca desde cero con dos comandos (`cp .env.example .env` y `npm start`) y las pruebas pasan con `npm test`.
