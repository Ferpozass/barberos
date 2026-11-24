// Puertos de persistencia. Los define la capa de casos de uso; las implementaciones viven en
// infrastructure/repositories (SQLite para correr, memoria para las pruebas).
import type { Pedido } from "../../domain/entities/pedido.ts";
import type { Perfil } from "../../domain/entities/perfil.ts";
import type { Barbero, Producto, Servicio } from "../../domain/entities/catalogo.ts";
import type { Cita } from "../../domain/entities/cita.ts";
import type { CorteDeCaja } from "../../domain/entities/corte-de-caja.ts";
import type { Pago } from "../../domain/entities/pago.ts";
import type { Usuario } from "../../domain/entities/usuario.ts";
import type { Venta } from "../../domain/entities/venta.ts";

export interface RepositorioCitas {
  buscarPorId(id: string): Promise<Cita | null>;
  buscarPorBarberoYDia(barberoId: string, dia: string): Promise<Cita[]>;
  buscarPorDia(dia: string): Promise<Cita[]>;
  // Guarda la cita solo si el barbero tiene libre ese horario; si no, devuelve false (RN-03).
  apartarSiLibre(cita: Cita, ahora: Date): Promise<boolean>;
  guardar(cita: Cita): Promise<void>;
  // Apartadas que ya tienen un cobro abierto en la pasarela: las revisa la conciliación (ADR-004).
  buscarApartadasConCobro(): Promise<Cita[]>;
  // Las citas de un cliente (por su correo), de la más nueva a la más vieja.
  buscarPorCorreo(correo: string): Promise<Cita[]>;
  // Confirmadas que empiezan entre dos momentos (para los recordatorios, regla 11).
  buscarConfirmadasEntre(desde: Date, hasta: Date): Promise<Cita[]>;
  // Canceladas que tenían algo pagado en línea (candidatas a devolución, regla 7).
  buscarCanceladasConPago(): Promise<Cita[]>;
}

export interface RepositorioPagos {
  // Sin duplicados: si ese idPagoProveedor ya se aplicó, devuelve false y no hace nada (RN-08).
  aplicarUnaVez(pago: Pago): Promise<boolean>;
  buscarPorDia(dia: string): Promise<Pago[]>;
  buscarPorCita(citaId: string): Promise<Pago[]>;
}

export interface RepositorioVentas {
  // Sin duplicados gracias al id generado en el celular (RN-09, ADR-001).
  guardarSiNoExiste(venta: Venta): Promise<boolean>;
  buscarPorDia(dia: string): Promise<Venta[]>;
}

export interface RepositorioProductos {
  listar(): Promise<Producto[]>;
  buscarPorId(id: string): Promise<Producto | null>;
  // Descuenta solo si alcanza la existencia; si no, devuelve false (RN-10).
  descontarExistencia(productoId: string, cantidad: number): Promise<boolean>;
  // Regresa piezas apartadas por un pedido que no se pagó (regla 30).
  devolverExistencia(productoId: string, cantidad: number): Promise<void>;
  guardar(producto: Producto): Promise<void>; // alta o cambio (UC-10)
}

export interface RepositorioPedidos {
  guardar(pedido: Pedido): Promise<void>; // inserta o actualiza
  buscarPorId(id: string): Promise<Pedido | null>;
  buscarPorCorreo(correo: string): Promise<Pedido[]>;
  buscarPorCita(citaId: string): Promise<Pedido[]>;
  // Pendientes con cobro abierto: los revisa la conciliación (igual que las citas apartadas).
  buscarPendientes(): Promise<Pedido[]>;
  // Pagados o preparados: los que el administrador tiene que surtir.
  buscarPorSurtir(): Promise<Pedido[]>;
  buscarPagadosDelDia(dia: string): Promise<Pedido[]>;
  // Cancela solo si sigue pendiente; así dos procesos no devuelven la existencia dos veces.
  cancelarSiPendiente(id: string): Promise<boolean>;
}

export interface RepositorioCatalogo {
  listarBarberos(): Promise<Barbero[]>;
  buscarBarbero(id: string): Promise<Barbero | null>;
  listarServicios(): Promise<Servicio[]>;
  buscarServicio(id: string): Promise<Servicio | null>;
  guardarBarbero(barbero: Barbero): Promise<void>; // UC-24 y UC-25
  guardarServicio(servicio: Servicio): Promise<void>; // UC-10
}

// UC-18: horas en que un barbero no atiende (comida, trámite) o el día completo si falta (regla 13).
export interface Bloqueo {
  id: string;
  barberoId: string;
  dia: string;
  desde: string; // ISO 8601
  hasta: string; // ISO 8601
  motivo: string;
}

export interface RepositorioBloqueos {
  crear(b: Bloqueo): Promise<void>;
  buscarPorBarberoYDia(barberoId: string, dia: string): Promise<Bloqueo[]>;
  buscarPorDia(dia: string): Promise<Bloqueo[]>;
  borrar(id: string): Promise<void>;
}

// "Esto ya se hizo": una tabla con clave única para lo que debe pasar UNA sola vez aunque el
// proceso corra dos veces (recordatorio enviado, devolución hecha, aviso de privacidad aceptado).
export interface RepositorioUnaVez {
  // true si es la primera vez que se marca esa clave; false si ya estaba.
  marcar(clave: string, hechoEn: string, detalle?: string): Promise<boolean>;
  existe(clave: string): Promise<boolean>;
}

export interface RepositorioCortes {
  buscarPorDia(dia: string): Promise<CorteDeCaja | null>;
  guardar(corte: CorteDeCaja): Promise<void>;
}

export interface RepositorioUsuarios {
  buscarPorCorreo(correo: string): Promise<Usuario | null>;
  buscarPorId(id: string): Promise<Usuario | null>;
  // Si ya hay una cuenta con ese correo, devuelve false y no hace nada.
  crear(usuario: Usuario): Promise<boolean>;
  cambiarNombre(id: string, nombre: string): Promise<void>;
  fechaDeAlta(id: string): Promise<string | null>;
  entraConGoogle(id: string): Promise<boolean>; // su cuenta se creó con Google (no tiene contraseña)
}

// Ajustes del negocio (por ahora, la paleta de colores de la página).
export interface RepositorioConfiguracion {
  leer(clave: string): Promise<string | null>;
  guardar(clave: string, valor: string): Promise<void>;
}

export interface RepositorioPerfiles {
  buscar(usuarioId: string): Promise<Perfil | null>;
  guardar(perfil: Perfil): Promise<void>; // inserta o actualiza
}

export interface RepositorioSesiones {
  crear(s: { token: string; usuarioId: string; venceEn: string }): Promise<void>;
  buscar(token: string): Promise<{ usuarioId: string; venceEn: string } | null>;
  borrar(token: string): Promise<void>;
}
