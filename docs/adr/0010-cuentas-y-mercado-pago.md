# ADR-010. Cuentas con contraseña y cobro real con Mercado Pago

Estado: aceptada (noviembre 2026). Completa a ADR-004 (webhook + conciliación) y a ADR-009 (versión en la nube).

## Contexto

Con la versión publicada cualquiera podía abrir las pantallas del barbero y del administrador, y el pago era simulado.
Para probarlo con dinero real hacían falta dos cosas: saber quién está usando el sistema y una pasarela de verdad.

## Decisión

**Cuentas.** Tres roles: cliente, barbero y administrador. El cliente se registra solo desde la página; barberos y
administrador los da de alta el dueño con `scripts/crear-usuario.ts` (así nadie se puede registrar como barbero).
- Contraseñas cifradas con PBKDF2-SHA256 (Web Crypto, 100,000 vueltas y sal al azar). Funciona igual en Node y en Workers.
- Al entrar, el servidor guarda una sesión con un token al azar que vence en 7 días. El navegador lo manda en la cabecera
  `Authorization: Bearer`. Se eligió sesión en tabla y no JWT porque cerrar sesión de verdad es borrar el renglón.
- Los permisos los revisa el **controlador** (`exigirRol`) antes de llamar al caso de uso. La regla de quién puede ver
  una cita (RN-15) vive en el dominio (`puedeVerCita`). El cliente agenda a su nombre: el nombre y el correo salen de su cuenta.

**Mercado Pago.** `PasarelaMercadoPago` implementa el mismo puerto `PasarelaDePago` que la simulada. La raíz de
composición elige una u otra según haya `MP_ACCESS_TOKEN`. Los casos de uso no cambiaron.
- `crearCobro` crea una preferencia de Checkout Pro con el id de la cita como `external_reference` y vence en 10 minutos,
  igual que el apartado. Se excluyen OXXO y SPEI porque se acreditan en horas.
- El webhook (`/api/webhooks/mercadopago`) solo trae el id del pago. Se le pregunta a Mercado Pago de qué cita es y se
  sigue el mismo camino que antes (ConfirmarPago, idempotente por id de pago). La conciliación busca pagos aprobados
  por `external_reference`.

## Consecuencias

- La página ya no deja ver la agenda ni el corte sin cuenta; el servidor lo revisa en cada petición.
- No se verifica el correo al registrarse (fuera del alcance de la materia).
- En la versión publicada el cobro es real. Para pruebas locales se usa la pasarela simulada (sin token).
- Las credenciales de Mercado Pago y del personal viven en `.env.nube` (no se sube) y en los secretos de Cloudflare.

Métrica verificable: un cliente no puede abrir `/api/corte` (403), un barbero solo recibe su propia agenda aunque pida
la de otro, y un pago aprobado en Mercado Pago confirma la cita una sola vez aunque el webhook llegue repetido.
