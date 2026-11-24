# Trazabilidad: requerimientos → código → prueba

De dónde sale cada cosa: las 30 reglas y los 25 casos de uso del documento *Reglas y casos de uso*, y las funciones
F1–F5 y escenarios E1–E3 del *Hito 1*. Las pruebas están en `tests/` (`npm test`).

## Reglas de negocio

| # | Regla | Dónde vive | Prueba |
|---|---|---|---|
| 1 | La cita se confirma solo cuando se paga | `Cita.confirmarPago`, `ConfirmarPago` | `pagos-y-caja.test.ts` |
| 2 | 100 % en línea o anticipo del 40 % | `Cita.montoAPagarEnLinea` | `cita.test.ts` |
| 3 | Si no paga, el horario no se aparta | `Cita.ocupaHorario` (apartado vencido) | `cita.test.ts` |
| 4 | Un barbero no tiene dos citas a la misma hora | `Cita.chocaCon`, `apartarSiLibre` (SQL) | `agenda.test.ts` |
| 5 | Solo se muestran horarios libres | `ConsultarDisponibilidad` (citas y bloqueos) | `agenda.test.ts`, `tienda-y-local.test.ts` |
| 6 | Cambiar o cancelar hasta 2 h antes | `Cita.cancelar`, `Cita.reagendar` | `cita.test.ts`, `tienda-y-local.test.ts` |
| 7 | Si cancela a tiempo, se le devuelve su dinero | `VerDevolucionesPendientes`, `DevolverPago`, `PasarelaDePago.devolver` | `tienda-y-local.test.ts` |
| 8 | Si no llega, pierde su anticipo | `Cita.marcarNoLlego` (no entra a devoluciones) | `cita.test.ts` |
| 9 | Cliente sin cita lo registra el administrador | `RegistrarClienteSinCita` | `tienda-y-local.test.ts` |
| 10 | Los avisos van por correo | puerto `Notificador` (ADR-005) | varias |
| 11 | Recordatorio 24 h y 2 h antes | `EnviarRecordatorios` (cron cada minuto) | `tienda-y-local.test.ts` |
| 12 | Para registrarse acepta el aviso de privacidad | `CrearCuenta` + `web/privacidad.html` | `cuentas.test.ts` |
| 13 | Si un barbero falta, sus citas pasan a otro o se cancelan avisando | `MarcarBarberoAusente` | `tienda-y-local.test.ts` |
| 14 | Cada venta queda a nombre del barbero | `Venta.crear` | `pagos-y-caja.test.ts` |
| 15 | Se cobra sin internet y se sube después | cola local en `web/js/barbero.js` (ADR-001) | `pagos-y-caja.test.ts` |
| 16 | Una venta nunca se cuenta dos veces | `guardarSiNoExiste` (id del celular) | `pagos-y-caja.test.ts` |
| 17 | Un pago nunca se aplica dos veces | `aplicarUnaVez`, `Pedido.confirmarPago` | `pagos-y-caja.test.ts`, `tienda-y-local.test.ts` |
| 18 | Tienda y mostrador usan el mismo inventario | `RepositorioProductos.descontarExistencia` | `tienda-y-local.test.ts` |
| 19 | No se vende lo que no hay | `UPDATE ... WHERE existencia >= ?` | `tienda-y-local.test.ts` |
| 20 | Recoger en la barbería o envío a domicilio | `Pedido.crear` (entrega, dirección, envío) | `tienda-y-local.test.ts` |
| 21 | Pedido: pendiente, pagado, preparado, entregado | `Pedido.avanzar`, `AvanzarPedido` | `tienda-y-local.test.ts` |
| 22 | El corte separa efectivo, tarjeta y en línea | `CorteDeCaja.calcular` | `pagos-y-caja.test.ts` |
| 23 | Comisión = porcentaje de lo que cobró | `comisionDe`, `GuardarBarbero` | `pagos-y-caja.test.ts` |
| 24 | Cada barbero ve solo su comisión | `VerMiComision` (usa el barbero de la sesión) + `exigirRol("barbero")` | prueba en producción |
| 25 | Solo el admin cambia precios, servicios y productos | `ControladorLocal` (`exigirRol("admin")`) | prueba en producción |
| 26 | Un cliente no tiene dos citas a la misma hora | `AgendarCita` (`Cita.seEnciman`) | `tienda-y-local.test.ts` |
| 27 | Al pagar, el horario se aparta 10 minutos | `Cita.crear` (apartado) | `cita.test.ts` |
| 28 | No se agenda fuera de lun–sáb 10:00–20:00 | `dentroDelHorario` | `cita.test.ts` |
| 29 | No se cierra el corte con ventas sin subir | `CorteDeCaja.cerrar` | `pagos-y-caja.test.ts` |
| 30 | El producto se aparta mientras paga | `apartarProductos`, `LiberarPedidosVencidos` | `tienda-y-local.test.ts` |

## Casos de uso

| # | Caso de uso | Actor | Pantalla / ruta |
|---|---|---|---|
| 1 | Registrarse | Cliente | `#entrar` · `POST /api/cuentas/registro`, Google (ADR-011) |
| 2 | Agendar y pagar cita | Cliente | `#cliente` · `POST /api/citas` |
| 3 | Cambiar o cancelar cita | Cliente | `#cliente` · `/api/citas/:id/reagendar`, `/cancelar` |
| 4 | Registrar cliente sin cita | Administrador | `#local` · `POST /api/citas-sin-cita` |
| 5 | Enviar recordatorios | Sistema | cron (`worker.ts`, `main.ts`) |
| 6 | Marcar barbero ausente | Administrador | `#local` · `POST /api/barberos/ausente` |
| 7 | Cobrar en el local | Barbero | `#barbero` · `POST /api/ventas/sincronizar` |
| 8 | Comprar producto en línea | Cliente | `#tienda` · `POST /api/pedidos` |
| 9 | Vender en mostrador | Barbero | `#barbero` (venta de mostrador) |
| 10 | Administrar catálogo | Administrador | `#local` · `/api/catalogo/servicios`, `/productos` |
| 11 | Hacer corte de caja | Administrador | `#admin` · `/api/corte`, `/api/corte/cerrar` |
| 12 | Ver mi comisión | Barbero | `#barbero` · `GET /api/mi-comision` |
| 13 | Ver horarios disponibles | Cliente | `#cliente` · `GET /api/disponibilidad` |
| 14 | Cobrar el resto del anticipo | Barbero | `#barbero` (cobrar cita) |
| 15 | Marcar cliente que no llegó | Barbero | `#barbero` · `/api/citas/:id/no-llego` |
| 16 | Devolver dinero por cancelación | Administrador | `#local` · `POST /api/devoluciones/:id` |
| 17 | Ver mi agenda del día | Barbero | `#barbero` · `GET /api/agenda` |
| 18 | Bloquear horario de un barbero | Administrador | `#local` · `POST /api/bloqueos` |
| 19 | Subir ventas pendientes | Sistema | cola del celular (`barbero.js`) |
| 20 | Confirmar pago en línea | Sistema | webhook de Mercado Pago + conciliación |
| 21 | Liberar horario no pagado | Sistema | apartado de 10 min (`Cita.ocupaHorario`) |
| 22 | Liberar producto no pagado | Sistema | `LiberarPedidosVencidos` (con la conciliación) |
| 23 | Actualizar estado del pedido | Administrador | `#local` · `POST /api/pedidos/:id/avanzar` |
| 24 | Cambiar comisión de un barbero | Administrador | `#local` · `POST /api/catalogo/barberos` |
| 25 | Dar de alta un barbero | Administrador | `#local` + `scripts/crear-usuario.ts` (su cuenta) |

## Hito 1: funciones y escenarios

- **F1** agenda con disponibilidad real, pago por adelantado, cambiar/cancelar y sin citas encimadas: reglas 1–9, 26–28.
- **F2** confirmación y recordatorios por correo, con copia al correo del negocio (`CORREO_DEL_NEGOCIO`) y barbero ausente: reglas 10, 11 y 13.
- **F3** cobro en el local con o sin internet, ticket y venta idempotente: reglas 14–16.
- **F4** tienda en línea con inventario único, apartado y entrega: reglas 18–21 y 30 (ADR-012).
- **F5** corte con efectivo/tarjeta/en línea, **desglose servicios y productos**, comisiones y **efectivo contado contra esperado**: reglas 22–24 y 29.
- **E1** sin internet: cola local + correo del negocio como respaldo (ADR-001).
- **E2** sin dobles reservas ni sobreventa: exclusión en la base de datos y, al rechazar, **tres horarios libres cercanos**.
- **E3** pago perdido: webhook + conciliación cada minuto, idempotente; también para pedidos (ADR-004, ADR-012).

## Lo que quedó fuera (y por qué)

- **CFDI 4.0 (factura)**: el Hito 1 la menciona como restricción legal; no es regla ni caso de uso y requiere un PAC.
- **Impresora térmica Bluetooth**: el ticket se muestra en pantalla; imprimir depende del hardware del local.
- **Recepcionista**: rol opcional del Hito 1, sin casos de uso propios; hoy lo cubre el administrador.

## Agregado después de los documentos

- **UC-27 "Ver mi cuenta"** y **UC-28 "Actualizar mis datos"** (Cliente): datos personales (teléfono, fecha de
  nacimiento, barbero favorito, cómo le gusta su corte), reservas próximas y pasadas, historial de cortes y de pedidos.
  Pantalla `#cuenta` · `GET/POST /api/mi-cuenta`. **RN-17**: teléfono de 10 dígitos y fecha de nacimiento creíble
  (`validarPerfil`). Prueba en `cuentas.test.ts`.
