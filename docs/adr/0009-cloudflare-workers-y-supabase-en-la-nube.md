# ADR-009. La versión publicada corre en Cloudflare Workers con PostgreSQL de Supabase

Estado: aceptada (noviembre 2026). Completa a ADR-007: SQLite sigue siendo la opción para correrlo en la laptop.

## Contexto

Además de que cualquiera pueda correrlo en su computadora (ADR-007), queremos un link público para que el profesor y los usuarios lo prueben sin instalar nada. Un servidor en la nube no tiene disco propio donde guardar un archivo SQLite, así que la base de datos tiene que vivir en otro lado. El equipo ya trabaja con Supabase (PostgreSQL) en otros proyectos.

## Opciones consideradas

(1) Cloudflare Workers con PostgreSQL de Supabase. (2) Cloudflare Workers con D1 (la base SQLite de Cloudflare). (3) Un servidor Node en Render o Railway con su propio PostgreSQL.

## Matriz de decisión

| Criterio | Peso | Workers + Supabase | Workers + D1 | Render / Railway |
|---|---|---|---|---|
| Lo conoce el equipo | Alto | Sí | No | Parcial |
| Base de datos de producción (ADR-007 decía PostgreSQL) | Alto | Sí | No: es SQLite | Sí |
| Costo | Medio | $0 (planes gratis) | $0 | Gratis, pero se duerme sin uso |
| Cambios al código | Medio | Solo infraestructura | Solo infraestructura | Casi ninguno |

Decisión: Cloudflare Workers con PostgreSQL de Supabase.

## Cómo quedó (y por qué no se tocó el núcleo)

- Los repositorios SQL (`SqlRepositorioCitas`, …) reciben una `Conexion` con tres métodos (`uno`, `todos`, `ejecutar`). Hay dos implementaciones: `abrirSqlite` (laptop) y `ConexionPostgres` (Supabase). El SQL es el mismo; la de Postgres solo cambia `?` por `$1, $2…`.
- Hay dos puntos de entrada que arman la MISMA aplicación con `armarAplicacion(db)`: `src/main.ts` (node:http, laptop) y `src/worker.ts` (Cloudflare). La tabla de rutas está una sola vez en `http/rutas.ts`.
- La conciliación de pagos (ADR-004) en la laptop es un `setInterval` de 30 s; en Cloudflare es un Cron cada minuto que llama al mismo caso de uso `ConciliarPagos`.
- `domain/` y `application/` no cambiaron. Esa es la prueba de que la regla de dependencia sirve.

Consecuencias aceptadas:
- Cada petición abre y cierra su conexión a Supabase, por eso se usa el pooler de Supabase (puerto 6543).
- La hora del local se fijó en UTC-6 dentro del dominio (`horario-del-local.ts`), porque el servidor de Cloudflare corre en UTC.
- La cadena de conexión es un secreto: va en `.env` en la laptop y con `wrangler secret put` en Cloudflare, nunca en el repositorio.
- Las tablas se crean con RLS activado y sin políticas, para que nadie entre por la API pública de Supabase; el sistema entra con la cadena de conexión del servidor.

Métrica verificable: con la misma base de datos, `npm start` (laptop) y el Worker publicado muestran las mismas citas y el mismo corte de caja.
