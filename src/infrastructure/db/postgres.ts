import postgres from "postgres";
import type { Conexion, Fila } from "./conexion.ts";

// PostgreSQL de Supabase: la base de datos de la versión publicada (ADR-009).
// Mismas tablas que en SQLite, con los tipos de Postgres (el dinero en double precision, no en real).
export const ESQUEMA_POSTGRES = `
CREATE TABLE IF NOT EXISTS barberos (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, porcentaje_comision DOUBLE PRECISION NOT NULL, activo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS servicios (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, duracion_min INTEGER NOT NULL, precio DOUBLE PRECISION NOT NULL);
CREATE TABLE IF NOT EXISTS productos (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, precio DOUBLE PRECISION NOT NULL,
  existencia INTEGER NOT NULL CHECK (existencia >= 0));
CREATE TABLE IF NOT EXISTS citas (
  id TEXT PRIMARY KEY,
  barbero_id TEXT NOT NULL REFERENCES barberos(id),
  servicio_id TEXT NOT NULL REFERENCES servicios(id),
  cliente_nombre TEXT NOT NULL, cliente_correo TEXT NOT NULL,
  dia TEXT NOT NULL, inicio TEXT NOT NULL, fin TEXT NOT NULL, duracion_min INTEGER NOT NULL,
  precio DOUBLE PRECISION NOT NULL, tipo_pago TEXT NOT NULL, estado TEXT NOT NULL,
  apartado_vence_en TEXT, id_cobro TEXT, pagado_en_linea DOUBLE PRECISION NOT NULL DEFAULT 0, motivo_cancelacion TEXT);
CREATE INDEX IF NOT EXISTS citas_barbero_dia ON citas (barbero_id, dia);
CREATE TABLE IF NOT EXISTS pagos (
  id_pago_proveedor TEXT PRIMARY KEY,
  cita_id TEXT NOT NULL, barbero_id TEXT NOT NULL, monto DOUBLE PRECISION NOT NULL, aplicado_en TEXT NOT NULL, dia TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ventas (
  id TEXT PRIMARY KEY,
  barbero_id TEXT NOT NULL, cita_id TEXT, metodo TEXT NOT NULL, creada_en TEXT NOT NULL, dia TEXT NOT NULL,
  renglones TEXT NOT NULL, total DOUBLE PRECISION NOT NULL);
CREATE TABLE IF NOT EXISTS cortes (dia TEXT PRIMARY KEY, datos TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS correos (
  id SERIAL PRIMARY KEY, para TEXT NOT NULL, asunto TEXT NOT NULL, cuerpo TEXT NOT NULL, enviado_en TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cobros_simulados (
  id_cobro TEXT PRIMARY KEY, referencia TEXT NOT NULL, monto DOUBLE PRECISION NOT NULL, descripcion TEXT NOT NULL,
  estado TEXT NOT NULL, id_pago TEXT);
ALTER TABLE barberos ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortes ENABLE ROW LEVEL SECURITY;
ALTER TABLE correos ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS bloqueos (
  id TEXT PRIMARY KEY, barbero_id TEXT NOT NULL, dia TEXT NOT NULL, desde TEXT NOT NULL, hasta TEXT NOT NULL, motivo TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS bloqueos_barbero_dia ON bloqueos (barbero_id, dia);
CREATE TABLE IF NOT EXISTS una_vez (clave TEXT PRIMARY KEY, hecho_en TEXT NOT NULL, detalle TEXT);
CREATE TABLE IF NOT EXISTS configuracion (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS perfiles (
  usuario_id TEXT PRIMARY KEY, telefono TEXT, fecha_nacimiento TEXT, preferencias TEXT, barbero_favorito_id TEXT);
CREATE TABLE IF NOT EXISTS pedidos (
  id TEXT PRIMARY KEY, cliente_correo TEXT NOT NULL, estado TEXT NOT NULL, cita_id TEXT,
  id_cobro TEXT, dia_pago TEXT, creado_en TEXT NOT NULL, datos TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS pedidos_correo ON pedidos (cliente_correo);
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, correo TEXT NOT NULL UNIQUE, hash TEXT NOT NULL,
  rol TEXT NOT NULL, barbero_id TEXT, creado_en TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sesiones (token TEXT PRIMARY KEY, usuario_id TEXT NOT NULL, vence_en TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS citas_correo ON citas (cliente_correo);
ALTER TABLE cobros_simulados ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueos ENABLE ROW LEVEL SECURITY;
ALTER TABLE una_vez ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY
`;
// RLS encendido y sin políticas: nadie entra por la API pública de Supabase (la llave "anon").
// El sistema entra directo con la cadena de conexión del servidor, que no está sujeta a RLS.

// Los repositorios escriben "?" (estilo SQLite); Postgres quiere $1, $2, ...
const aPostgres = (sql: string) => {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
};

export class ConexionPostgres implements Conexion {
  private readonly sql: postgres.Sql;

  constructor(url: string) {
    // prepare: false porque el pooler de Supabase (puerto 6543) no guarda sentencias preparadas.
    this.sql = postgres(url, { prepare: false, max: 1, fetch_types: false, onnotice: () => {} });
  }

  // Las consultas van en fila, una por una. Con una sola conexión al pooler de Supabase, mandar
  // varias a la vez (un Promise.all) a veces dejaba la conexión trabada y la petición nunca respondía.
  private fila: Promise<unknown> = Promise.resolve();

  private correr(sql: string, params: unknown[]) {
    const consulta = this.fila.then(() => this.sql.unsafe(aPostgres(sql), params as postgres.ParameterOrJSON<never>[]));
    this.fila = consulta.catch(() => {}); // un error no detiene a las que siguen
    return consulta;
  }
  async uno(sql: string, ...params: unknown[]) {
    return (await this.correr(sql, params))[0] as Fila | undefined;
  }
  async todos(sql: string, ...params: unknown[]) {
    return [...(await this.correr(sql, params))] as Fila[];
  }
  async ejecutar(sql: string, ...params: unknown[]) {
    return (await this.correr(sql, params)).count;
  }

  cerrar() {
    return this.sql.end();
  }
}
