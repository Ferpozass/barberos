// Implementaciones en memoria de los mismos puertos. Las usan las pruebas: corren sin base de datos.
// Si el núcleo está bien desacoplado, los casos de uso no notan la diferencia con SQLite.
import type {
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
import { Cita } from "../../../domain/entities/cita.ts";
import { CorteDeCaja } from "../../../domain/entities/corte-de-caja.ts";
import { diaDelPago, type Pago } from "../../../domain/entities/pago.ts";
import { Pedido } from "../../../domain/entities/pedido.ts";
import type { Perfil } from "../../../domain/entities/perfil.ts";
import type { Usuario } from "../../../domain/entities/usuario.ts";
import { Venta } from "../../../domain/entities/venta.ts";

const copia = (c: Cita) => Cita.restaurar(c.aDatos());

export class MemoriaRepositorioCitas implements RepositorioCitas {
  private readonly items = new Map<string, Cita>();

  async buscarPorId(id: string) {
    const c = this.items.get(id);
    return c ? copia(c) : null;
  }
  async buscarPorBarberoYDia(barberoId: string, dia: string) {
    return [...this.items.values()].filter((c) => c.barberoId === barberoId && c.dia === dia).map(copia);
  }
  async buscarPorDia(dia: string) {
    return [...this.items.values()].filter((c) => c.dia === dia).map(copia);
  }
  bloqueos: Bloqueo[] = []; // las pruebas los comparten con MemoriaRepositorioBloqueos
  async apartarSiLibre(cita: Cita, ahora: Date) {
    if ([...this.items.values()].some((otra) => cita.chocaCon(otra, ahora))) return false;
    if (this.bloqueos.some((b) => b.barberoId === cita.barberoId && new Date(b.desde) < cita.fin && new Date(b.hasta) > cita.inicio))
      return false;
    this.items.set(cita.id, copia(cita));
    return true;
  }
  async guardar(cita: Cita) {
    this.items.set(cita.id, copia(cita));
  }
  async buscarApartadasConCobro() {
    return [...this.items.values()].filter((c) => c.estado === "apartada" && c.idCobro).map(copia);
  }
  async buscarPorCorreo(correo: string) {
    return [...this.items.values()]
      .filter((c) => c.clienteCorreo === correo)
      .sort((a, b) => b.inicio.getTime() - a.inicio.getTime())
      .map(copia);
  }
  async buscarConfirmadasEntre(desde: Date, hasta: Date) {
    return [...this.items.values()].filter((c) => c.estado === "confirmada" && c.inicio > desde && c.inicio <= hasta).map(copia);
  }
  async buscarCanceladasConPago() {
    return [...this.items.values()].filter((c) => c.estado === "cancelada" && c.pagadoEnLinea > 0).map(copia);
  }
}

export class MemoriaRepositorioPagos implements RepositorioPagos {
  private readonly items = new Map<string, Pago>();
  async aplicarUnaVez(p: Pago) {
    if (this.items.has(p.idPagoProveedor)) return false;
    this.items.set(p.idPagoProveedor, { ...p });
    return true;
  }
  async buscarPorDia(dia: string) {
    return [...this.items.values()].filter((p) => diaDelPago(p) === dia);
  }
  async buscarPorCita(citaId: string) {
    return [...this.items.values()].filter((p) => p.citaId === citaId);
  }
}

export class MemoriaRepositorioVentas implements RepositorioVentas {
  private readonly items = new Map<string, Venta>();
  async guardarSiNoExiste(v: Venta) {
    if (this.items.has(v.id)) return false;
    this.items.set(v.id, Venta.restaurar(v.aDatos()));
    return true;
  }
  async buscarPorDia(dia: string) {
    return [...this.items.values()].filter((v) => v.dia === dia);
  }
}

export class MemoriaRepositorioProductos implements RepositorioProductos {
  private readonly items: Map<string, Producto>;
  constructor(productos: Producto[]) {
    this.items = new Map(productos.map((p) => [p.id, { ...p }]));
  }
  async listar() {
    return [...this.items.values()].map((p) => ({ ...p }));
  }
  async buscarPorId(id: string) {
    const p = this.items.get(id);
    return p ? { ...p } : null;
  }
  async descontarExistencia(id: string, cantidad: number) {
    const p = this.items.get(id);
    if (!p || p.existencia < cantidad) return false;
    p.existencia -= cantidad;
    return true;
  }
  async devolverExistencia(id: string, cantidad: number) {
    const p = this.items.get(id);
    if (p) p.existencia += cantidad;
  }
  async guardar(p: Producto) {
    this.items.set(p.id, { ...p });
  }
}

export class MemoriaRepositorioBloqueos implements RepositorioBloqueos {
  // Comparte la lista con el repositorio de citas para que apartarSiLibre también los respete.
  private readonly items: Bloqueo[];
  constructor(citas?: MemoriaRepositorioCitas) {
    this.items = citas ? citas.bloqueos : [];
  }
  async crear(b: Bloqueo) {
    this.items.push({ ...b });
  }
  async buscarPorBarberoYDia(barberoId: string, dia: string) {
    return this.items.filter((b) => b.barberoId === barberoId && b.dia === dia).map((b) => ({ ...b }));
  }
  async buscarPorDia(dia: string) {
    return this.items.filter((b) => b.dia === dia).map((b) => ({ ...b }));
  }
  async borrar(id: string) {
    const i = this.items.findIndex((b) => b.id === id);
    if (i >= 0) this.items.splice(i, 1);
  }
}

export class MemoriaRepositorioUnaVez implements RepositorioUnaVez {
  private readonly claves = new Set<string>();
  async marcar(clave: string) {
    if (this.claves.has(clave)) return false;
    this.claves.add(clave);
    return true;
  }
  async existe(clave: string) {
    return this.claves.has(clave);
  }
}

export class MemoriaRepositorioPedidos implements RepositorioPedidos {
  private readonly items = new Map<string, Pedido>();
  private copia = (p: Pedido) => Pedido.desdeDatos(p.aDatos());
  private todos = () => [...this.items.values()].map(this.copia);
  async guardar(p: Pedido) {
    this.items.set(p.id, this.copia(p));
  }
  async buscarPorId(id: string) {
    const p = this.items.get(id);
    return p ? this.copia(p) : null;
  }
  async buscarPorCorreo(correo: string) {
    return this.todos().filter((p) => p.clienteCorreo === correo).reverse();
  }
  async buscarPorCita(citaId: string) {
    return this.todos().filter((p) => p.citaId === citaId);
  }
  async buscarPendientes() {
    return this.todos().filter((p) => p.estado === "pendiente");
  }
  async buscarPorSurtir() {
    return this.todos().filter((p) => p.estado === "pagado" || p.estado === "preparado");
  }
  async buscarPagadosDelDia(dia: string) {
    return this.todos().filter((p) => p.aDatos().diaPago === dia);
  }
  async cancelarSiPendiente(id: string) {
    const p = this.items.get(id);
    if (!p || p.estado !== "pendiente") return false;
    p.cancelar();
    return true;
  }
}

export class MemoriaRepositorioCatalogo implements RepositorioCatalogo {
  private readonly barberos: Barbero[];
  private readonly servicios: Servicio[];
  constructor(barberos: Barbero[], servicios: Servicio[]) {
    this.barberos = barberos.map((b) => ({ ...b })); // copia: las pruebas no se ensucian entre sí
    this.servicios = servicios.map((x) => ({ ...x }));
  }
  async listarBarberos() {
    return [...this.barberos];
  }
  async buscarBarbero(id: string) {
    return this.barberos.find((b) => b.id === id) ?? null;
  }
  async listarServicios() {
    return [...this.servicios];
  }
  async buscarServicio(id: string) {
    return this.servicios.find((s) => s.id === id) ?? null;
  }
  async guardarBarbero(b: Barbero) {
    const i = this.barberos.findIndex((x) => x.id === b.id);
    if (i >= 0) this.barberos[i] = { ...b };
    else this.barberos.push({ ...b });
  }
  async guardarServicio(x: Servicio) {
    const i = this.servicios.findIndex((y) => y.id === x.id);
    if (i >= 0) this.servicios[i] = { ...x };
    else this.servicios.push({ ...x });
  }
}

export class MemoriaRepositorioCortes implements RepositorioCortes {
  private readonly items = new Map<string, CorteDeCaja>();
  async buscarPorDia(dia: string) {
    const c = this.items.get(dia);
    return c ? CorteDeCaja.restaurar(c.aDatos()) : null;
  }
  async guardar(c: CorteDeCaja) {
    this.items.set(c.dia, CorteDeCaja.restaurar(c.aDatos()));
  }
}

export class MemoriaRepositorioUsuarios implements RepositorioUsuarios {
  private readonly items = new Map<string, Usuario>();
  async buscarPorCorreo(correo: string) {
    return [...this.items.values()].find((u) => u.correo === correo) ?? null;
  }
  async buscarPorId(id: string) {
    return this.items.get(id) ?? null;
  }
  async crear(u: Usuario) {
    if (await this.buscarPorCorreo(u.correo)) return false;
    this.items.set(u.id, { ...u });
    this.altas.set(u.id, new Date().toISOString());
    return true;
  }
  private readonly altas = new Map<string, string>();
  async cambiarNombre(id: string, nombre: string) {
    const u = this.items.get(id);
    if (u) u.nombre = nombre;
  }
  async fechaDeAlta(id: string) {
    return this.altas.get(id) ?? null;
  }
  async entraConGoogle(id: string) {
    return this.items.get(id)?.hash === "google";
  }
}

export class MemoriaRepositorioPerfiles implements RepositorioPerfiles {
  private readonly items = new Map<string, Perfil>();
  async buscar(usuarioId: string) {
    const p = this.items.get(usuarioId);
    return p ? { ...p } : null;
  }
  async guardar(p: Perfil) {
    this.items.set(p.usuarioId, { ...p });
  }
}

export class MemoriaRepositorioSesiones implements RepositorioSesiones {
  private readonly items = new Map<string, { usuarioId: string; venceEn: string }>();
  async crear(s: { token: string; usuarioId: string; venceEn: string }) {
    this.items.set(s.token, { usuarioId: s.usuarioId, venceEn: s.venceEn });
  }
  async buscar(token: string) {
    return this.items.get(token) ?? null;
  }
  async borrar(token: string) {
    this.items.delete(token);
  }
}
