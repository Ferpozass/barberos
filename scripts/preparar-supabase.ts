// Crea las tablas en Supabase y carga el catálogo de ejemplo. Se corre UNA vez: npm run supabase:preparar
// Lee DATABASE_URL del archivo .env (la cadena de conexión del pooler de Supabase).
import { existsSync } from "node:fs";
import { prepararBase } from "../src/infrastructure/db/conexion.ts";
import { ConexionPostgres, ESQUEMA_POSTGRES } from "../src/infrastructure/db/postgres.ts";

// Primero las llaves de la nube (.env.nube); si no existe, el .env normal.
if (existsSync(".env.nube")) process.loadEnvFile(".env.nube");
else if (existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL en .env (Supabase → Connect → Transaction pooler).");
  process.exit(1);
}

const db = new ConexionPostgres(url);
await prepararBase(db, ESQUEMA_POSTGRES);
const n = await db.uno("SELECT (SELECT COUNT(*) FROM barberos) AS barberos, (SELECT COUNT(*) FROM productos) AS productos");
console.log(`Supabase listo: ${n?.barberos} barberos y ${n?.productos} productos.`);
await db.cerrar();
