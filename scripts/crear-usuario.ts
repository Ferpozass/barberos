// Da de alta una cuenta de barbero o de administrador (el registro público solo crea clientes).
// Genera una contraseña al azar y la imprime UNA vez: cámbiala o guárdala en un lugar seguro.
//
//   node scripts/crear-usuario.ts admin  dueno@correo.com "Don Pepe"
//   node scripts/crear-usuario.ts barbero tono@correo.com "Toño" barbero-1
//   Agrega --nube al final para crearla en Supabase (lee .env.nube) en vez de la base local.
import { existsSync } from "node:fs";
import { armarAplicacion } from "../src/infrastructure/config/contenedor.ts";
import type { Conexion } from "../src/infrastructure/db/conexion.ts";
import { ConexionPostgres, ESQUEMA_POSTGRES } from "../src/infrastructure/db/postgres.ts";
import { prepararBase } from "../src/infrastructure/db/conexion.ts";
import { abrirSqlite } from "../src/infrastructure/db/sqlite.ts";

const args = process.argv.slice(2).filter((a) => a !== "--nube");
const enLaNube = process.argv.includes("--nube");
const [rol, correo, nombre, barberoId] = args;

if ((rol !== "admin" && rol !== "barbero") || !correo || !nombre || (rol === "barbero" && !barberoId)) {
  console.error('Uso: node scripts/crear-usuario.ts <admin|barbero> <correo> "<nombre>" [barberoId] [--nube]');
  process.exit(1);
}

let db: Conexion;
if (enLaNube) {
  if (existsSync(".env.nube")) process.loadEnvFile(".env.nube");
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL en .env.nube");
  db = new ConexionPostgres(process.env.DATABASE_URL);
  await prepararBase(db, ESQUEMA_POSTGRES); // por si faltan las tablas nuevas
} else {
  db = await abrirSqlite(process.env.RUTA_BD ?? "data/barberos.db");
}

// 18 caracteres al azar, sin letras que se confundan (0/O, 1/l).
const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const contrasena = Array.from(crypto.getRandomValues(new Uint8Array(18)), (n) => letras[n % letras.length]).join("");

const app = armarAplicacion(db, { urlBase: "" });
const r = await app.crearCuenta.ejecutar({ nombre, correo, contrasena, rol, barberoId: barberoId ?? null });
console.log(`Cuenta creada (${r.usuario.rol}${r.usuario.barberoId ? `, ${r.usuario.barberoId}` : ""}): ${r.usuario.correo}`);
console.log(`Contraseña: ${contrasena}`);
if (db instanceof ConexionPostgres) await db.cerrar();
