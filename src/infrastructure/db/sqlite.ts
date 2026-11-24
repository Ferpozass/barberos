import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { prepararBase, type Conexion, type Fila } from "./conexion.ts";

// SQLite integrado en Node 24: para correr el proyecto en la laptop sin instalar ni configurar nada (ADR-007).
const ESQUEMA = `
CREATE TABLE IF NOT EXISTS barberos (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, porcentaje_comision REAL NOT NULL, activo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS servicios (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, duracion_min INTEGER NOT NULL, precio REAL NOT NULL);
CREATE TABLE IF NOT EXISTS productos (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, precio REAL NOT NULL,
  existencia INTEGER NOT NULL CHECK (existencia >= 0));
CREATE TABLE IF NOT EXISTS citas (
  id TEXT PRIMARY KEY,
  barbero_id TEXT NOT NULL REFERENCES barberos(id),
  servicio_id TEXT NOT NULL REFERENCES servicios(id),
  cliente_nombre TEXT NOT NULL, cliente_correo TEXT NOT NULL,
  dia TEXT NOT NULL, inicio TEXT NOT NULL, fin TEXT NOT NULL, duracion_min INTEGER NOT NULL,
  precio REAL NOT NULL, tipo_pago TEXT NOT NULL, estado TEXT NOT NULL,
  apartado_vence_en TEXT, id_cobro TEXT, pagado_en_linea REAL NOT NULL DEFAULT 0, motivo_cancelacion TEXT);
CREATE INDEX IF NOT EXISTS citas_barbero_dia ON citas (barbero_id, dia);
CREATE TABLE IF NOT EXISTS pagos (
  id_pago_proveedor TEXT PRIMARY KEY,
  cita_id TEXT NOT NULL, barbero_id TEXT NOT NULL, monto REAL NOT NULL, aplicado_en TEXT NOT NULL, dia TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ventas (
  id TEXT PRIMARY KEY,
  barbero_id TEXT NOT NULL, cita_id TEXT, metodo TEXT NOT NULL, creada_en TEXT NOT NULL, dia TEXT NOT NULL,
  renglones TEXT NOT NULL, total REAL NOT NULL);
CREATE TABLE IF NOT EXISTS cortes (dia TEXT PRIMARY KEY, datos TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS correos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, para TEXT NOT NULL, asunto TEXT NOT NULL, cuerpo TEXT NOT NULL, enviado_en TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cobros_simulados (
  id_cobro TEXT PRIMARY KEY, referencia TEXT NOT NULL, monto REAL NOT NULL, descripcion TEXT NOT NULL,
  estado TEXT NOT NULL, id_pago TEXT);
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
`;

class ConexionSqlite implements Conexion {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }
  async uno(sql: string, ...params: unknown[]) {
    return this.db.prepare(sql).get(...(params as SQLInputValue[])) as Fila | undefined;
  }
  async todos(sql: string, ...params: unknown[]) {
    return this.db.prepare(sql).all(...(params as SQLInputValue[])) as Fila[];
  }
  async ejecutar(sql: string, ...params: unknown[]) {
    return Number(this.db.prepare(sql).run(...(params as SQLInputValue[])).changes);
  }
}

export async function abrirSqlite(ruta: string): Promise<Conexion> {
  if (ruta !== ":memory:") mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const conexion = new ConexionSqlite(db);
  await prepararBase(conexion, ESQUEMA);
  return conexion;
}
