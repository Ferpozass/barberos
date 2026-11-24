// Puertos hacia lo que está afuera del sistema: la pasarela, el correo y la hora.
// Los casos de uso hablan con estas interfaces; nunca con Mercado Pago ni con un proveedor de correo.

export interface CobroCreado {
  idCobro: string;
  urlPago: string;
}

export interface EstadoDeCobro {
  estado: "pendiente" | "aprobado" | "rechazado";
  monto: number;
  idPago: string | null; // id del pago acreditado, cuando ya está aprobado
}

export interface PasarelaDePago {
  // regresarA: la vista a la que vuelve el cliente después de pagar ("cliente" o "tienda").
  crearCobro(p: { referencia: string; monto: number; descripcion: string; regresarA?: string }): Promise<CobroCreado>;
  // Se le pregunta a la pasarela; nunca se confía en lo que dice el cuerpo del webhook (ADR-004).
  consultarCobro(idCobro: string): Promise<EstadoDeCobro>;
  // Regla 7: devolver (todo o parte de) un pago ya aplicado.
  devolver(p: { idPago: string; monto: number }): Promise<void>;
}

export interface Notificador {
  // Los avisos van por correo, no por WhatsApp (ADR-005).
  enviarCorreo(p: { para: string; asunto: string; cuerpo: string }): Promise<void>;
}

export interface Reloj {
  ahora(): Date;
}

export interface GeneradorDeIds {
  nuevo(): string;
}

// Cifra contraseñas. El caso de uso no sabe qué algoritmo se usa (en infraestructura: PBKDF2).
export interface Cifrador {
  cifrar(contrasena: string): Promise<string>;
  verificar(contrasena: string, hash: string): Promise<boolean>;
}

// Quién es la persona que entró con Google. La credencial es un token firmado por Google;
// el adaptador la valida y regresa null si es falsa, vencida o es para otra aplicación.
export interface VerificadorGoogle {
  verificar(credencial: string): Promise<{ correo: string; nombre: string } | null>;
}
