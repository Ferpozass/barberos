import { DATOS_DE_EJEMPLO } from "./datos-de-ejemplo.ts";

// Lo mínimo que los repositorios necesitan de una base de datos SQL.
// Hay dos implementaciones: SQLite (para correrlo en la laptop) y PostgreSQL de Supabase (en la nube).
// Los repositorios escriben SQL estándar con "?" y no saben cuál de las dos tienen detrás (ADR-009).
export type Fila = Record<string, unknown>;

export interface Conexion {
  uno(sql: string, ...params: unknown[]): Promise<Fila | undefined>;
  todos(sql: string, ...params: unknown[]): Promise<Fila[]>;
  // Devuelve cuántas filas cambió (sirve para saber si un INSERT ... ON CONFLICT DO NOTHING sí insertó).
  ejecutar(sql: string, ...params: unknown[]): Promise<number>;
}

// Crea las tablas si no existen y llena el catálogo la primera vez.
// Son datos de ejemplo para la demo: el dueño los cambia.
export async function prepararBase(db: Conexion, esquema: string): Promise<void> {
  for (const sentencia of esquema.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.ejecutar(sentencia);
  }
  // Los productos se revisan siempre: si se agregó uno nuevo al catálogo de ejemplo, entra sin tocar los demás.
  for (const x of DATOS_DE_EJEMPLO.productos)
    await db.ejecutar("INSERT INTO productos VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING", x.id, x.nombre, x.precio, x.existencia);
  const f = await db.uno("SELECT COUNT(*) AS n FROM barberos");
  if (Number(f?.n) > 0) return;
  for (const x of DATOS_DE_EJEMPLO.barberos)
    await db.ejecutar("INSERT INTO barberos VALUES (?, ?, ?, 1)", x.id, x.nombre, x.porcentajeComision);
  for (const x of DATOS_DE_EJEMPLO.servicios)
    await db.ejecutar("INSERT INTO servicios VALUES (?, ?, ?, ?)", x.id, x.nombre, x.duracionMin, x.precio);
}
