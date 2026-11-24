// Implementaciones concretas de los puertos con SQL. Aquí SÍ se habla SQL; en el dominio, nunca.
// Funcionan igual con SQLite (local) o con PostgreSQL de Supabase (nube): reciben una Conexion (ADR-009).
import type {
  RepositorioConfiguracion,
  RepositorioPerfiles,
  Bloqueo,
  RepositorioBloqueos,
  RepositorioUnaVez,
  RepositorioCatalogo,
  RepositorioCitas,
  RepositorioCortes,
  RepositorioPagos,
  RepositorioPedidos,
  RepositorioProductos,
  RepositorioSesiones,
  RepositorioUsuarios,
  RepositorioVentas,
} from "../../../application/ports/repositorios.ts";
import type { Barbero, Producto, Servicio } from "../../../domain/entities/catalogo.ts";
import { Cita, type DatosCita } from "../../../domain/entities/cita.ts";
import { CorteDeCaja } from "../../../domain/entities/corte-de-caja.ts";
import { diaDelPago, type Pago } from "../../../domain/entities/pago.ts";
import { Pedido, type DatosPedido } from "../../../domain/entities/pedido.ts";
import type { Perfil } from "../../../domain/entities/perfil.ts";
import type { Rol, Usuario } from "../../../domain/entities/usuario.ts";
import { Venta } from "../../../domain/entities/venta.ts";
import type { Conexion, Fila } from "../../db/conexion.ts";

// ---------- Citas ----------
const aCita = (f: Fila): Cita =>
  Cita.restaurar({
    id: f.id as string,
    barberoId: f.barbero_id as string,
    servicioId: f.servicio_id as string,
    clienteNombre: f.cliente_nombre as string,
    clienteCorreo: f.cliente_correo as string,
    inicio: f.inicio as string,
    duracionMin: f.duracion_min as number,
    precio: f.precio as number,
    tipoPago: f.tipo_pago as DatosCita["tipoPago"],
    estado: f.estado as DatosCita["estado"],
    apartadoVenceEn: (f.apartado_vence_en as string | null) ?? null,
    idCobro: (f.id_cobro as string | null) ?? null,
    pagadoEnLinea: f.pagado_en_linea as number,
    motivoCancelacion: (f.motivo_cancelacion as string | null) ?? null,
  });

export class SqlRepositorioCitas implements RepositorioCitas {
  private readonly db: Conexion;
  constructor(db: Conexion) {
    this.db = db;
  }

  async buscarPorId(id: string) {
    const f = await this.db.uno("SELECT * FROM citas WHERE id = ?", id);
    return f ? aCita(f) : null;
  }

  async buscarPorBarberoYDia(barberoId: string, dia: string) {
    return (await this.db.todos("SELECT * FROM citas WHERE barbero_id = ? AND dia = ?", barberoId, dia)).map(aCita);
  }

  async buscarPorDia(dia: string) {
    return (await this.db.todos("SELECT * FROM citas WHERE dia = ? ORDER BY inicio", dia)).map(aCita);
  }

  // Revisa si el barbero ya tiene una cita activa que se encime y, si no, la guarda (RN-03).
  async apartarSiLibre(cita: Cita, ahora: Date) {
    const d = cita.aDatos();
    const choque = await this.db.uno(
      `SELECT 1 FROM citas
        WHERE barbero_id = ? AND id <> ? AND inicio < ? AND fin > ?
          AND (estado IN ('confirmada','atendida','no_llego')
               OR (estado = 'apartada' AND apartado_vence_en > ?))`,
      d.barberoId, d.id, cita.fin.toISOString(), d.inicio, ahora.toISOString(),
    );
    if (choque) return false;
    // UC-18: tampoco se aparta encima de un bloqueo del barbero (descanso o ausencia).
    const bloqueado = await this.db.uno(
      "SELECT 1 FROM bloqueos WHERE barbero_id = ? AND desde < ? AND hasta > ?",
      d.barberoId, cita.fin.toISOString(), d.inicio,
    );
    if (bloqueado) return false;
    await this.insertarOActualizar(cita);
    return true;
  }

  async guardar(cita: Cita) {
    await this.insertarOActualizar(cita);
  }

  async buscarApartadasConCobro() {
    return (await this.db.todos("SELECT * FROM citas WHERE estado = 'apartada' AND id_cobro IS NOT NULL")).map(aCita);
  }

  async buscarPorCorreo(correo: string) {
    return (await this.db.todos("SELECT * FROM citas WHERE cliente_correo = ? ORDER BY inicio DESC", correo)).map(aCita);
  }

  async buscarConfirmadasEntre(desde: Date, hasta: Date) {
    return (
      await this.db.todos(
        "SELECT * FROM citas WHERE estado = 'confirmada' AND inicio > ? AND inicio <= ?",
        desde.toISOString(), hasta.toISOString(),
      )
    ).map(aCita);
  }

  async buscarCanceladasConPago() {
    return (await this.db.todos("SELECT * FROM citas WHERE estado = 'cancelada' AND pagado_en_linea > 0 ORDER BY inicio")).map(aCita);
  }

  private async insertarOActualizar(cita: Cita) {
    const d = cita.aDatos();
    await this.db.ejecutar(
      `INSERT INTO citas (id, barbero_id, servicio_id, cliente_nombre, cliente_correo, dia, inicio, fin, duracion_min,
                            precio, tipo_pago, estado, apartado_vence_en, id_cobro, pagado_en_linea, motivo_cancelacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET estado = excluded.estado, apartado_vence_en = excluded.apartado_vence_en,
           id_cobro = excluded.id_cobro, pagado_en_linea = excluded.pagado_en_linea,
           motivo_cancelacion = excluded.motivo_cancelacion`,
      d.id, d.barberoId, d.servicioId, d.clienteNombre, d.clienteCorreo, cita.dia, d.inicio, cita.fin.toISOString(),
      d.duracionMin, d.precio, d.tipoPago, d.estado, d.apartadoVenceEn, d.idCobro, d.pagadoEnLinea, d.motivoCancelacion,
    );
  }
}

// ---------- Pagos ----------
export class SqlRepositorioPagos implements RepositorioPagos {
  private readonly db: Conexion;
  constructor(db: Conexion) {
    this.db = db;
  }

  // La PRIMARY KEY sobre id_pago_proveedor hace el trabajo: un segundo INSERT del mismo pago no hace nada.
  async aplicarUnaVez(p: Pago) {
    const cambios = await this.db.ejecutar(
      "INSERT INTO pagos VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id_pago_proveedor) DO NOTHING",
      p.idPagoProveedor, p.citaId, p.barberoId, p.monto, p.aplicadoEn, diaDelPago(p),
    );
    return cambios === 1;
  }

  async buscarPorCita(citaId: string) {
    return (await this.db.todos("SELECT * FROM pagos WHERE cita_id = ?", citaId)).map(this.aPago);
  }

  private aPago = (f: Fila): Pago => ({
    idPagoProveedor: f.id_pago_proveedor as string,
    citaId: f.cita_id as string,
    barberoId: f.barbero_id as string,
    monto: f.monto as number,
    aplicadoEn: f.aplicado_en as string,
    diaServicio: f.dia as string,
  });

  async buscarPorDia(dia: string) {
    return (await this.db.todos("SELECT * FROM pagos WHERE dia = ?", dia)).map((f) => ({
      idPagoProveedor: f.id_pago_proveedor as string,
      citaId: f.cita_id as string,
      barberoId: f.barbero_id as string,
      monto: f.monto as number,
      aplicadoEn: f.aplicado_en as string,
      diaServicio: f.dia as string,
    }));
  }
}

// ---------- Ventas ----------
export class SqlRepositorioVentas implements RepositorioVentas {
  private readonly db: Conexion;
  constructor(db: Conexion) {
    this.db = db;
  }

  async guardarSiNoExiste(v: Venta) {
    const d = v.aDatos();
    const cambios = await this.db.ejecutar(
      "INSERT INTO ventas VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
      d.id, d.barberoId, d.citaId, d.metodo, d.creadaEn, v.dia, JSON.stringify(d.renglones), v.total,
    );
    return cambios === 1;
  }

  async buscarPorDia(dia: string) {
    return (await this.db.todos("SELECT * FROM ventas WHERE dia = ? ORDER BY creada_en", dia)).map((f) =>
      Venta.restaurar({
        id: f.id as string,
        barberoId: f.barbero_id as string,
        citaId: (f.cita_id as string | null) ?? null,
        metodo: f.metodo as "efectivo" | "tarjeta",
        creadaEn: f.creada_en as string,
        dia: f.dia as string,
        renglones: JSON.parse(f.renglones as string),
      }),
    );
  }
}

// ---------- Productos ----------
const aProducto = (f: Fila): Producto => ({
  id: f.id as string,
  nombre: f.nombre as string,
  precio: f.precio as number,
  existencia: f.existencia as number,
});

export class SqlRepositorioProductos implements RepositorioProductos {
  private readonly db: Conexion;
  constructor(db: Conexion) {
    this.db = db;
  }

  async listar() {
    return (await this.db.todos("SELECT * FROM productos ORDER BY nombre")).map(aProducto);
  }

  async buscarPorId(id: string) {
    const f = await this.db.uno("SELECT * FROM productos WHERE id = ?", id);
    return f ? aProducto(f) : null;
  }

  // Un solo UPDATE condicionado: si no alcanza, no cambia ninguna fila (RN-10).
  async descontarExistencia(id: string, cantidad: number) {
    const cambios = await this.db.ejecutar(
      "UPDATE productos SET existencia = existencia - ? WHERE id = ? AND existencia >= ?",
      cantidad, id, cantidad,
    );
    return cambios === 1;
  }

  async devolverExistencia(id: string, cantidad: number) {
    await this.db.ejecutar("UPDATE productos SET existencia = existencia + ? WHERE id = ?", cantidad, id);
  }

  async guardar(p: Producto) {
    await this.db.ejecutar(
      `INSERT INTO productos VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET nombre = excluded.nombre, precio = excluded.precio, existencia = excluded.existencia`,
      p.id, p.nombre, p.precio, p.existencia,
    );
  }
}

// ---------- Pedidos de la tienda ----------
// Las columnas sueltas sirven para buscar; el pedido completo va como JSON en "datos" (igual que los renglones de una venta).
const aPedido = (f: Fila): Pedido => Pedido.desdeDatos(JSON.parse(String(f.datos)) as DatosPedido);

export class SqlRepositorioPedidos implements RepositorioPedidos {
  private readonly db: Conexion;
  constructor(db: Conexion) {
    this.db = db;
  }

  async guardar(p: Pedido) {
    const d = p.aDatos();
    await this.db.ejecutar(
      `INSERT INTO pedidos (id, cliente_correo, estado, cita_id, id_cobro, dia_pago, creado_en, datos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET estado = excluded.estado, id_cobro = excluded.id_cobro,
         dia_pago = excluded.dia_pago, datos = excluded.datos`,
      d.id, d.clienteCorreo, d.estado, d.citaId, d.idCobro, d.diaPago, d.creadoEn, JSON.stringify(d),
    );
  }

  async buscarPorId(id: string) {
    const f = await this.db.uno("SELECT * FROM pedidos WHERE id = ?", id);
    return f ? aPedido(f) : null;
  }

  async buscarPorCorreo(correo: string) {
    return (await this.db.todos("SELECT * FROM pedidos WHERE cliente_correo = ? ORDER BY creado_en DESC", correo)).map(aPedido);
  }

  async buscarPorCita(citaId: string) {
    return (await this.db.todos("SELECT * FROM pedidos WHERE cita_id = ?", citaId)).map(aPedido);
  }

  async buscarPendientes() {
    return (await this.db.todos("SELECT * FROM pedidos WHERE estado = 'pendiente'")).map(aPedido);
  }

  async buscarPorSurtir() {
    return (await this.db.todos("SELECT * FROM pedidos WHERE estado IN ('pagado', 'preparado') ORDER BY creado_en")).map(aPedido);
  }

  async buscarPagadosDelDia(dia: string) {
    return (await this.db.todos("SELECT * FROM pedidos WHERE dia_pago = ?", dia)).map(aPedido);
  }

  // El UPDATE condicionado decide quién gana: solo uno ve "1 fila cambiada".
  async cancelarSiPendiente(id: string) {
    const f = await this.db.uno("SELECT * FROM pedidos WHERE id = ? AND estado = 'pendiente'", id);
    if (!f) return false;
    const p = aPedido(f);
    p.cancelar();
    const cambios = await this.db.ejecutar(
      "UPDATE pedidos SET estado = 'cancelado', datos = ? WHERE id = ? AND estado = 'pendiente'",
      JSON.stringify(p.aDatos()), id,
    );
    return cambios === 1;
  }
}

// ---------- Catálogo ----------
export class SqlRepositorioCatalogo implements RepositorioCatalogo {
  private readonly db: Conexion;
  constructor(db: Conexion) {
    this.db = db;
  }

  private aBarbero = (f: Fila): Barbero => ({
    id: f.id as string,
    nombre: f.nombre as string,
    porcentajeComision: f.porcentaje_comision as number,
    activo: f.activo === 1,
  });
  private aServicio = (f: Fila): Servicio => ({
    id: f.id as string,
    nombre: f.nombre as string,
    duracionMin: f.duracion_min as number,
    precio: f.precio as number,
  });

  async listarBarberos() {
    return (await this.db.todos("SELECT * FROM barberos ORDER BY id")).map(this.aBarbero);
  }
  async buscarBarbero(id: string) {
    const f = await this.db.uno("SELECT * FROM barberos WHERE id = ?", id);
    return f ? this.aBarbero(f) : null;
  }
  async listarServicios() {
    return (await this.db.todos("SELECT * FROM servicios ORDER BY precio")).map(this.aServicio);
  }
  async buscarServicio(id: string) {
    const f = await this.db.uno("SELECT * FROM servicios WHERE id = ?", id);
    return f ? this.aServicio(f) : null;
  }
  async guardarBarbero(b: Barbero) {
    await this.db.ejecutar(
      `INSERT INTO barberos VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET nombre = excluded.nombre, porcentaje_comision = excluded.porcentaje_comision, activo = excluded.activo`,
      b.id, b.nombre, b.porcentajeComision, b.activo ? 1 : 0,
    );
  }
  async guardarServicio(x: Servicio) {
    await this.db.ejecutar(
      `INSERT INTO servicios VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET nombre = excluded.nombre, duracion_min = excluded.duracion_min, precio = excluded.precio`,
      x.id, x.nombre, x.duracionMin, x.precio,
    );
  }
}

// ---------- Bloqueos (UC-18) ----------
const aBloqueo = (f: Fila): Bloqueo => ({
  id: f.id as string,
  barberoId: f.barbero_id as string,
  dia: f.dia as string,
  desde: f.desde as string,
  hasta: f.hasta as string,
  motivo: f.motivo as string,
});

export class SqlRepositorioBloqueos implements RepositorioBloqueos {
  private readonly db: Conexion;
  constructor(db: Conexion) {
    this.db = db;
  }
  async crear(b: Bloqueo) {
    await this.db.ejecutar("INSERT INTO bloqueos VALUES (?, ?, ?, ?, ?, ?)", b.id, b.barberoId, b.dia, b.desde, b.hasta, b.motivo);
  }
  async buscarPorBarberoYDia(barberoId: string, dia: string) {
    return (await this.db.todos("SELECT * FROM bloqueos WHERE barbero_id = ? AND dia = ? ORDER BY desde", barberoId, dia)).map(aBloqueo);
  }
  async buscarPorDia(dia: string) {
    return (await this.db.todos("SELECT * FROM bloqueos WHERE dia = ? ORDER BY desde", dia)).map(aBloqueo);
  }
  async borrar(id: string) {
    await this.db.ejecutar("DELETE FROM bloqueos WHERE id = ?", id);
  }
}

// ---------- "Esto ya se hizo" ----------
export class SqlRepositorioUnaVez implements RepositorioUnaVez {
  private readonly db: Conexion;
  constructor(db: Conexion) {
    this.db = db;
  }
  async marcar(clave: string, hechoEn: string, detalle = "") {
    return (await this.db.ejecutar("INSERT INTO una_vez VALUES (?, ?, ?) ON CONFLICT (clave) DO NOTHING", clave, hechoEn, detalle)) === 1;
  }
  async existe(clave: string) {
    return !!(await this.db.uno("SELECT 1 FROM una_vez WHERE clave = ?", clave));
  }
}

// ---------- Cortes ----------
export class SqlRepositorioCortes implements RepositorioCortes {
  private readonly db: Conexion;
  constructor(db: Conexion) {
    this.db = db;
  }

  async buscarPorDia(dia: string) {
    const f = await this.db.uno("SELECT datos FROM cortes WHERE dia = ?", dia);
    return f ? CorteDeCaja.restaurar(JSON.parse(f.datos as string)) : null;
  }

  async guardar(c: CorteDeCaja) {
    await this.db.ejecutar(
      "INSERT INTO cortes VALUES (?, ?) ON CONFLICT (dia) DO UPDATE SET datos = excluded.datos",
      c.dia, JSON.stringify(c.aDatos()),
    );
  }
}

// ---------- Usuarios y sesiones ----------
const aUsuario = (f: Fila): Usuario => ({
  id: f.id as string,
  nombre: f.nombre as string,
  correo: f.correo as string,
  rol: f.rol as Rol,
  barberoId: (f.barbero_id as string | null) ?? null,
  hash: f.hash as string,
});

export class SqlRepositorioUsuarios implements RepositorioUsuarios {
  private readonly db: Conexion;
  constructor(db: Conexion) {
    this.db = db;
  }

  async buscarPorCorreo(correo: string) {
    const f = await this.db.uno("SELECT * FROM usuarios WHERE correo = ?", correo);
    return f ? aUsuario(f) : null;
  }
  async buscarPorId(id: string) {
    const f = await this.db.uno("SELECT * FROM usuarios WHERE id = ?", id);
    return f ? aUsuario(f) : null;
  }
  // El UNIQUE de correo evita cuentas repetidas aunque lleguen dos registros al mismo tiempo.
  async crear(u: Usuario) {
    const cambios = await this.db.ejecutar(
      "INSERT INTO usuarios VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (correo) DO NOTHING",
      u.id, u.nombre, u.correo, u.hash, u.rol, u.barberoId, new Date().toISOString(),
    );
    return cambios === 1;
  }
  async cambiarNombre(id: string, nombre: string) {
    await this.db.ejecutar("UPDATE usuarios SET nombre = ? WHERE id = ?", nombre, id);
  }
  async fechaDeAlta(id: string) {
    return ((await this.db.uno("SELECT creado_en FROM usuarios WHERE id = ?", id))?.creado_en as string) ?? null;
  }
  async entraConGoogle(id: string) {
    return (await this.db.uno("SELECT hash FROM usuarios WHERE id = ?", id))?.hash === "google";
  }
}

export class SqlRepositorioPerfiles implements RepositorioPerfiles {
  private readonly db: Conexion;
  constructor(db: Conexion) {
    this.db = db;
  }
  async buscar(usuarioId: string): Promise<Perfil | null> {
    const f = await this.db.uno("SELECT * FROM perfiles WHERE usuario_id = ?", usuarioId);
    return f
      ? {
          usuarioId,
          telefono: (f.telefono as string) ?? null,
          fechaNacimiento: (f.fecha_nacimiento as string) ?? null,
          preferencias: (f.preferencias as string) ?? null,
          barberoFavoritoId: (f.barbero_favorito_id as string) ?? null,
        }
      : null;
  }
  async guardar(p: Perfil) {
    await this.db.ejecutar(
      `INSERT INTO perfiles VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (usuario_id) DO UPDATE SET telefono = excluded.telefono, fecha_nacimiento = excluded.fecha_nacimiento,
         preferencias = excluded.preferencias, barbero_favorito_id = excluded.barbero_favorito_id`,
      p.usuarioId, p.telefono, p.fechaNacimiento, p.preferencias, p.barberoFavoritoId,
    );
  }
}

export class SqlRepositorioConfiguracion implements RepositorioConfiguracion {
  private readonly db: Conexion;
  constructor(db: Conexion) {
    this.db = db;
  }
  async leer(clave: string) {
    return ((await this.db.uno("SELECT valor FROM configuracion WHERE clave = ?", clave))?.valor as string) ?? null;
  }
  async guardar(clave: string, valor: string) {
    await this.db.ejecutar(
      "INSERT INTO configuracion VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor",
      clave, valor,
    );
  }
}

export class SqlRepositorioSesiones implements RepositorioSesiones {
  private readonly db: Conexion;
  constructor(db: Conexion) {
    this.db = db;
  }

  async crear(s: { token: string; usuarioId: string; venceEn: string }) {
    await this.db.ejecutar("INSERT INTO sesiones VALUES (?, ?, ?)", s.token, s.usuarioId, s.venceEn);
  }
  async buscar(token: string) {
    const f = await this.db.uno("SELECT * FROM sesiones WHERE token = ?", token);
    return f ? { usuarioId: f.usuario_id as string, venceEn: f.vence_en as string } : null;
  }
  async borrar(token: string) {
    await this.db.ejecutar("DELETE FROM sesiones WHERE token = ?", token);
  }
}
