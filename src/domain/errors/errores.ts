// Errores del núcleo. No saben nada de HTTP: el controlador decide qué código de respuesta les toca.

// Una regla de negocio no se cumple (ej. "el barbero ya tiene una cita en ese horario").
export class ErrorDeDominio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDeDominio";
  }
}

// Se pidió algo que no existe (una cita, un barbero, un servicio).
export class NoEncontrado extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "NoEncontrado";
  }
}

// No hay sesión, o el correo y la contraseña no coinciden.
export class AccesoDenegado extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "AccesoDenegado";
  }
}

// Hay sesión, pero ese usuario no puede hacer eso (ej. un cliente quiere ver el corte de caja).
export class SinPermiso extends Error {
  constructor(mensaje = "No tienes permiso para esto") {
    super(mensaje);
    this.name = "SinPermiso";
  }
}
