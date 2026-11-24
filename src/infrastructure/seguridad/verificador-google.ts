import type { VerificadorGoogle } from "../../application/ports/servicios-externos.ts";

// Valida el token que regresa el botón "Acceder con Google" (ADR-011).
// Se le pregunta directo a Google (endpoint tokeninfo): él revisa la firma y la fecha.
// Aquí solo falta revisar que el token sea para ESTA aplicación (aud) y que el correo esté verificado.
export class VerificadorGoogleTokeninfo implements VerificadorGoogle {
  private readonly clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  async verificar(credencial: string): Promise<{ correo: string; nombre: string } | null> {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credencial)}`);
    if (!r.ok) return null; // token falso o vencido
    const t = (await r.json()) as { aud?: string; iss?: string; email?: string; email_verified?: string | boolean; name?: string };
    const emisorValido = t.iss === "accounts.google.com" || t.iss === "https://accounts.google.com";
    const verificado = t.email_verified === true || t.email_verified === "true";
    if (t.aud !== this.clientId || !emisorValido || !verificado || !t.email) return null;
    return { correo: t.email, nombre: t.name ?? "" };
  }
}
