import type { Notificador } from "../../application/ports/servicios-externos.ts";
import type { Conexion } from "../db/conexion.ts";

// Correo SIMULADO: en vez de mandar el correo, lo guarda en un buzón que se ve en el panel del administrador.
// En producción se cambia por un adaptador de correo transaccional (Resend, SES, SMTP) con el mismo puerto.
export class NotificadorBuzon implements Notificador {
  private readonly db: Conexion;

  constructor(db: Conexion) {
    this.db = db;
  }

  async enviarCorreo(p: { para: string; asunto: string; cuerpo: string }): Promise<void> {
    await this.db.ejecutar(
      "INSERT INTO correos (para, asunto, cuerpo, enviado_en) VALUES (?, ?, ?, ?)",
      p.para, p.asunto, p.cuerpo, new Date().toISOString(),
    );
    console.log(`[correo] → ${p.para}: ${p.asunto}`);
  }

  ultimos(limite = 20) {
    return this.db.todos("SELECT * FROM correos ORDER BY id DESC LIMIT ?", limite);
  }
}
