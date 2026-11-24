// Punto de entrada en la laptop: lee la configuración, abre la base de datos, arma la aplicación
// y levanta el servidor. (En la nube el punto de entrada es worker.ts.)
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { iniciarConciliacion } from "./adapters/tasks/tarea-conciliacion.ts";
import { armarAplicacion } from "./infrastructure/config/contenedor.ts";
import { ConexionPostgres } from "./infrastructure/db/postgres.ts";
import { abrirSqlite } from "./infrastructure/db/sqlite.ts";
import { crearServidor } from "./infrastructure/http/servidor.ts";

if (existsSync(".env")) process.loadEnvFile(".env");

const puerto = Number(process.env.PUERTO ?? 3000);
const conciliarCadaSeg = Number(process.env.CONCILIAR_CADA_SEG ?? 30);

// Con DATABASE_URL usa Supabase; sin ella, SQLite en un archivo local.
const urlSupabase = process.env.DATABASE_URL;
const db = urlSupabase ? new ConexionPostgres(urlSupabase) : await abrirSqlite(process.env.RUTA_BD ?? "data/barberos.db");

// Con MP_ACCESS_TOKEN se cobra de verdad con Mercado Pago; sin él, pasarela simulada.
const mpAccessToken = process.env.MP_ACCESS_TOKEN || undefined;
const googleClientId = process.env.GOOGLE_CLIENT_ID || undefined; // botón "Acceder con Google" (ADR-011)
const app = armarAplicacion(db, { urlBase: process.env.URL_BASE ?? `http://localhost:${puerto}`, mpAccessToken, googleClientId });
const web = fileURLToPath(new URL("../web", import.meta.url));

crearServidor(app, web).listen(puerto, () => {
  console.log(`BarberOS corriendo en http://localhost:${puerto}  (BD: ${urlSupabase ? "Supabase" : "SQLite local"}, pagos: ${mpAccessToken ? "Mercado Pago" : "simulados"})`);
});
iniciarConciliacion(app.conciliar, conciliarCadaSeg);
// Recordatorios 24 h y 2 h antes de cada cita (regla 11): se revisa cada minuto.
setInterval(() => app.recordatorios.ejecutar().catch((e) => console.error("[recordatorios]", e)), 60_000);
