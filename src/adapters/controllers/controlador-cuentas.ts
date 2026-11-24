import type { CerrarSesion, CrearCuenta, EntrarConGoogle, IniciarSesion } from "../../application/use-cases/cuentas/cuentas.ts";
import type { ActualizarMisDatos, VerMiCuenta } from "../../application/use-cases/cuentas/mi-cuenta.ts";
import { presentarCita } from "../presenters/presentadores.ts";
import { presentarPedido } from "./controlador-tienda.ts";
import { exigirSesion, objeto, ok, texto, type Peticion, type Respuesta } from "./peticion.ts";

export class ControladorCuentas {
  private readonly uc: { crear: CrearCuenta; iniciar: IniciarSesion; cerrar: CerrarSesion; google: EntrarConGoogle | null; googleClientId: string | null; miCuenta: VerMiCuenta; misDatos: ActualizarMisDatos };

  constructor(uc: ControladorCuentas["uc"]) {
    this.uc = uc;
  }

  // Registro público: SIEMPRE crea un cliente. Barberos y admin los da de alta el dueño con un script.
  async registrar(p: Peticion): Promise<Respuesta> {
    const b = objeto(p.body);
    const r = await this.uc.crear.ejecutar({
      nombre: texto(b, "nombre"),
      correo: texto(b, "correo"),
      contrasena: texto(b, "contrasena"),
      rol: "cliente",
      aceptaPrivacidad: b.aceptaPrivacidad === true || b.aceptaPrivacidad === "on",
    });
    return ok(r, 201);
  }

  async iniciar(p: Peticion): Promise<Respuesta> {
    const b = objeto(p.body);
    return ok(await this.uc.iniciar.ejecutar({ correo: texto(b, "correo"), contrasena: texto(b, "contrasena") }));
  }

  // El navegador necesita el id público de la app para pintar el botón de Google (no es secreto).
  async configGoogle(_p: Peticion): Promise<Respuesta> {
    return ok({ clientId: this.uc.googleClientId });
  }

  async google(p: Peticion): Promise<Respuesta> {
    if (!this.uc.google) return ok({ error: "Entrar con Google no está activado" }, 404);
    const b = objeto(p.body);
    return ok(await this.uc.google.ejecutar({ credencial: texto(b, "credencial") }));
  }

  async cerrar(p: Peticion): Promise<Respuesta> {
    if (p.token) await this.uc.cerrar.ejecutar({ token: p.token });
    return ok({ ok: true });
  }

  // UC-27: todo lo del cliente en una sola respuesta (datos, reservas, cortes y pedidos).
  async miCuenta(p: Peticion): Promise<Respuesta> {
    const c = await this.uc.miCuenta.ejecutar({ usuario: exigirSesion(p) });
    return ok({ ...c, citas: c.citas.map(presentarCita), pedidos: c.pedidos.map(presentarPedido) });
  }

  // UC-28
  async guardarMisDatos(p: Peticion): Promise<Respuesta> {
    const b = objeto(p.body);
    const t = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : null);
    return ok(
      await this.uc.misDatos.ejecutar({
        usuario: exigirSesion(p),
        nombre: texto(b, "nombre"),
        telefono: t("telefono"),
        fechaNacimiento: t("fechaNacimiento"),
        preferencias: t("preferencias"),
        barberoFavoritoId: t("barberoFavoritoId"),
      }),
    );
  }

  async yo(p: Peticion): Promise<Respuesta> {
    return ok({ usuario: p.usuario ?? null });
  }
}
