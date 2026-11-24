# ADR-011. Entrar con Google

Estado: aceptada (noviembre 2026). Completa a ADR-010 (cuentas).

## Contexto

Crear una cuenta con correo y contraseña es un paso más antes de apartar. La mayoría de los clientes ya tiene cuenta de Google.

## Decisión

Botón oficial "Acceder con Google" (Google Identity Services) en la vista de entrar.
- El navegador recibe de Google un token firmado (`credential`) y lo manda a `POST /api/cuentas/google`.
- El caso de uso `EntrarConGoogle` (UC-26) usa el puerto `VerificadorGoogle`. El adaptador `VerificadorGoogleTokeninfo`
  le pregunta a Google si el token es válido y revisa que sea para esta app (`aud`) y que el correo esté verificado.
- Si ya hay cuenta con ese correo se entra a ella; si no, se crea un **cliente** sin contraseña. Después se abre la misma
  sesión de siempre (tabla `sesiones`), así que roles y permisos no cambian.
- Solo se necesita el ID de cliente de Google (`GOOGLE_CLIENT_ID`), que es público. No hay secreto que guardar.

Se descartó Supabase Auth: maneja sus propias sesiones y habría que conectarlas con las nuestras.

## Consecuencias

- Sin `GOOGLE_CLIENT_ID` el botón no aparece y todo funciona igual con correo y contraseña.
- Una cuenta creada con Google no tiene contraseña; solo entra con Google.
- El ID de cliente solo funciona en los orígenes dados de alta en Google Cloud (la URL publicada y localhost).
