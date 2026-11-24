// Raíz de composición: el ÚNICO lugar que sabe qué implementación concreta va detrás de cada puerto.
// La base de datos (SQLite o Supabase) llega ya abierta. Si hay token de Mercado Pago se cobra de verdad;
// si no, se usa la pasarela simulada. Es la única diferencia: los casos de uso son los mismos (ADR-010).
import { ControladorAgenda } from "../../adapters/controllers/controlador-agenda.ts";
import { ControladorCaja } from "../../adapters/controllers/controlador-caja.ts";
import { ControladorCuentas } from "../../adapters/controllers/controlador-cuentas.ts";
import { ControladorTienda } from "../../adapters/controllers/controlador-tienda.ts";
import { ControladorLocal } from "../../adapters/controllers/controlador-local.ts";
import { CambiarApariencia, VerApariencia } from "../../application/use-cases/catalogo/apariencia.ts";
import {
  BloquearHorario,
  EnviarRecordatorios,
  MarcarBarberoAusente,
  ReagendarCita,
  RegistrarClienteSinCita,
} from "../../application/use-cases/agenda/operacion-del-local.ts";
import {
  DevolverPago,
  GuardarBarbero,
  GuardarProducto,
  GuardarServicio,
  VerDevolucionesPendientes,
  VerMiComision,
} from "../../application/use-cases/caja/administracion.ts";
import {
  AvanzarPedido,
  ConfirmarPagoPedido,
  HacerPedido,
  LiberarPedidosVencidos,
  VerMisPedidos,
  VerPedidosPorSurtir,
} from "../../application/use-cases/tienda/tienda.ts";
import { ControladorPagos } from "../../adapters/controllers/controlador-pagos.ts";
import { AgendarCita } from "../../application/use-cases/agenda/agendar-cita.ts";
import { ConsultarDisponibilidad } from "../../application/use-cases/agenda/consultar-disponibilidad.ts";
import {
  CancelarCita,
  ConsultarCita,
  MarcarNoLlego,
  VerAgendaDelDia,
  VerMisCitas,
} from "../../application/use-cases/agenda/gestionar-cita.ts";
import { ActualizarMisDatos, VerMiCuenta } from "../../application/use-cases/cuentas/mi-cuenta.ts";
import { CerrarSesion, CrearCuenta, EntrarConGoogle, IniciarSesion, VerSesion } from "../../application/use-cases/cuentas/cuentas.ts";
import { CerrarCorteDeCaja, GenerarCorteDeCaja } from "../../application/use-cases/caja/corte-de-caja.ts";
import { SincronizarVentas } from "../../application/use-cases/caja/sincronizar-ventas.ts";
import { VerCatalogo } from "../../application/use-cases/catalogo/ver-catalogo.ts";
import { ConciliarPagos, ConfirmarPago } from "../../application/use-cases/pagos/confirmar-pago.ts";
import { NotificadorBuzon } from "../correo/notificador-buzon.ts";
import type { Conexion } from "../db/conexion.ts";
import { PasarelaMercadoPago } from "../pagos/pasarela-mercadopago.ts";
import { PasarelaSimulada } from "../pagos/pasarela-simulada.ts";
import {
  SqlRepositorioCatalogo,
  SqlRepositorioCitas,
  SqlRepositorioCortes,
  SqlRepositorioPagos,
  SqlRepositorioProductos,
  SqlRepositorioSesiones,
  SqlRepositorioPedidos,
  SqlRepositorioBloqueos,
  SqlRepositorioUnaVez,
  SqlRepositorioPerfiles,
  SqlRepositorioConfiguracion,
  SqlRepositorioUsuarios,
  SqlRepositorioVentas,
} from "../repositories/sql/sql-repositorios.ts";
import { CifradorPbkdf2 } from "../seguridad/cifrador-pbkdf2.ts";
import { VerificadorGoogleTokeninfo } from "../seguridad/verificador-google.ts";

export interface Configuracion {
  urlBase: string; // dónde vive la app (para los links de regreso y el webhook de Mercado Pago)
  mpAccessToken?: string; // sin token: pasarela simulada
  googleClientId?: string; // sin él no aparece el botón "Acceder con Google"
}

export function armarAplicacion(db: Conexion, config: Configuracion) {
  // Infraestructura concreta detrás de cada puerto
  const citas = new SqlRepositorioCitas(db);
  const pagos = new SqlRepositorioPagos(db);
  const ventas = new SqlRepositorioVentas(db);
  const productos = new SqlRepositorioProductos(db);
  const catalogo = new SqlRepositorioCatalogo(db);
  const cortes = new SqlRepositorioCortes(db);
  const usuarios = new SqlRepositorioUsuarios(db);
  const sesiones = new SqlRepositorioSesiones(db);
  const pedidos = new SqlRepositorioPedidos(db);
  const bloqueos = new SqlRepositorioBloqueos(db);
  const unaVez = new SqlRepositorioUnaVez(db);
  const perfiles = new SqlRepositorioPerfiles(db);
  const ajustes = new SqlRepositorioConfiguracion(db);
  const pasarela = config.mpAccessToken
    ? new PasarelaMercadoPago({ token: config.mpAccessToken, urlBase: config.urlBase })
    : new PasarelaSimulada(db);
  const notificador = new NotificadorBuzon(db);
  const reloj = { ahora: () => new Date() };
  const ids = { nuevo: () => crypto.randomUUID() };

  // Casos de uso
  const confirmar = new ConfirmarPago({ citas, pagos, pasarela, notificador, reloj, pedidos });
  const depsTienda = { pedidos, productos, pasarela, notificador, reloj, ids };
  const conciliar = new ConciliarPagos({ citas, confirmar, tienda: new LiberarPedidosVencidos(depsTienda) });
  const depsCaja = { ventas, pagos, citas, catalogo, cortes, reloj, pedidos };
  const depsCuentas = { usuarios, sesiones, cifrador: new CifradorPbkdf2(), reloj, ids, unaVez };

  // Adaptadores de entrada
  const agenda = new ControladorAgenda({
    agendar: new AgendarCita({ citas, catalogo, pasarela, reloj, ids, pedidos, productos }),
    disponibilidad: new ConsultarDisponibilidad({ citas, catalogo, reloj, bloqueos }),
    cancelar: new CancelarCita({ citas, notificador, reloj, pedidos, productos }),
    noLlego: new MarcarNoLlego({ citas, reloj }),
    agenda: new VerAgendaDelDia({ citas, reloj }),
    consultar: new ConsultarCita({ citas }),
    misCitas: new VerMisCitas({ citas, reloj }),
  });
  const cuentas = new ControladorCuentas({
    crear: new CrearCuenta(depsCuentas),
    iniciar: new IniciarSesion(depsCuentas),
    cerrar: new CerrarSesion({ sesiones }),
    google: config.googleClientId
      ? new EntrarConGoogle({ ...depsCuentas, google: new VerificadorGoogleTokeninfo(config.googleClientId) })
      : null,
    googleClientId: config.googleClientId ?? null,
    miCuenta: new VerMiCuenta({ usuarios, perfiles, citas, pedidos, reloj }),
    misDatos: new ActualizarMisDatos({ usuarios, perfiles, reloj }),
  });
  const generarCorte = new GenerarCorteDeCaja(depsCaja);
  const local = new ControladorLocal({
    sinCita: new RegistrarClienteSinCita({ citas, catalogo, reloj, ids }),
    bloquear: new BloquearHorario({ citas, bloqueos, reloj, ids }),
    ausente: new MarcarBarberoAusente({ citas, catalogo, bloqueos, notificador, reloj, ids }),
    reagendar: new ReagendarCita({ citas, notificador, reloj }),
    devoluciones: new VerDevolucionesPendientes({ citas, unaVez }),
    devolver: new DevolverPago({ citas, pagos, unaVez, pasarela, notificador, reloj }),
    guardarServicio: new GuardarServicio({ catalogo }),
    guardarProducto: new GuardarProducto({ productos }),
    guardarBarbero: new GuardarBarbero({ catalogo }),
    miComision: new VerMiComision({ corte: generarCorte }),
    bloqueos,
    citas,
    verApariencia: new VerApariencia({ config: ajustes }),
    cambiarApariencia: new CambiarApariencia({ config: ajustes }),
  });
  const pagosCtl = new ControladorPagos({ confirmar, conciliar, confirmarPedido: new ConfirmarPagoPedido(depsTienda) });
  const tienda = new ControladorTienda({
    pedir: new HacerPedido(depsTienda),
    misPedidos: new VerMisPedidos({ pedidos }),
    porSurtir: new VerPedidosPorSurtir({ pedidos }),
    avanzar: new AvanzarPedido({ pedidos, notificador }),
    ver: (id) => pedidos.buscarPorId(id),
  });
  const caja = new ControladorCaja({
    sincronizar: new SincronizarVentas({ ventas, productos, citas, catalogo }),
    generarCorte: new GenerarCorteDeCaja(depsCaja),
    cerrarCorte: new CerrarCorteDeCaja(depsCaja),
    catalogo: new VerCatalogo({ catalogo, productos }),
  });

  return {
    controladores: { agenda, pagos: pagosCtl, caja, cuentas, tienda, local },
    recordatorios: new EnviarRecordatorios({ citas, unaVez, notificador, reloj, urlBase: config.urlBase }),
    verSesion: new VerSesion(depsCuentas),
    crearCuenta: new CrearCuenta(depsCuentas), // lo usa el script que da de alta barberos y admin
    conciliar,
    pasarela,
    notificador,
  };
}

export type Aplicacion = ReturnType<typeof armarAplicacion>;
