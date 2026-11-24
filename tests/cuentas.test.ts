import assert from "node:assert/strict";
import { test } from "node:test";
import { CrearCuenta, EntrarConGoogle, IniciarSesion, VerSesion } from "../src/application/use-cases/cuentas/cuentas.ts";
import { puedeVerCita } from "../src/domain/entities/usuario.ts";
import { AccesoDenegado, ErrorDeDominio } from "../src/domain/errors/errores.ts";
import { ActualizarMisDatos, VerMiCuenta } from "../src/application/use-cases/cuentas/mi-cuenta.ts";
import {
  MemoriaRepositorioCitas,
  MemoriaRepositorioPedidos,
  MemoriaRepositorioPerfiles,
  MemoriaRepositorioSesiones,
  MemoriaRepositorioUsuarios,
} from "../src/infrastructure/repositories/memoria/memoria-repositorios.ts";
import { CifradorPbkdf2 } from "../src/infrastructure/seguridad/cifrador-pbkdf2.ts";
import { RelojFijo, a } from "./apoyo.ts";

function armar() {
  let n = 0;
  const reloj = new RelojFijo(a(9));
  const d = {
    usuarios: new MemoriaRepositorioUsuarios(),
    sesiones: new MemoriaRepositorioSesiones(),
    cifrador: new CifradorPbkdf2(),
    reloj,
    ids: { nuevo: () => `id-${++n}` },
  };
  return { reloj, crear: new CrearCuenta(d), iniciar: new IniciarSesion(d), ver: new VerSesion(d) };
}

test("RN-14: el cliente se registra, inicia sesión y su sesión vence a los 7 días", async () => {
  const { reloj, crear, iniciar, ver } = armar();
  await crear.ejecutar({ nombre: "Ana López", correo: " Ana@Correo.com ", contrasena: "secreta123", aceptaPrivacidad: true });
  const s = await iniciar.ejecutar({ correo: "ana@correo.com", contrasena: "secreta123" });
  assert.equal(s.usuario.rol, "cliente");
  assert.equal((await ver.ejecutar({ token: s.token }))?.correo, "ana@correo.com");
  reloj.avanzarMinutos(7 * 24 * 60 + 1);
  assert.equal(await ver.ejecutar({ token: s.token }), null);
});

test("RN-14: no se repiten correos, la contraseña corta no pasa y la incorrecta tampoco", async () => {
  const { crear, iniciar } = armar();
  await crear.ejecutar({ nombre: "Ana", correo: "ana@correo.com", contrasena: "secreta123", aceptaPrivacidad: true });
  await assert.rejects(crear.ejecutar({ nombre: "Otra", correo: "ANA@correo.com", contrasena: "otraclave1", aceptaPrivacidad: true }), ErrorDeDominio);
  await assert.rejects(crear.ejecutar({ nombre: "Beto", correo: "beto@correo.com", contrasena: "corta", aceptaPrivacidad: true }), ErrorDeDominio);
  // Regla 12: sin aceptar el aviso de privacidad no hay cuenta.
  await assert.rejects(crear.ejecutar({ nombre: "Carla", correo: "carla@correo.com", contrasena: "secreta123" }), /aviso de privacidad/);
  await assert.rejects(iniciar.ejecutar({ correo: "ana@correo.com", contrasena: "equivocada" }), AccesoDenegado);
  await assert.rejects(iniciar.ejecutar({ correo: "nadie@correo.com", contrasena: "secreta123" }), AccesoDenegado);
});

test("RN-15: cada quien ve solo sus citas", () => {
  const cita = { clienteCorreo: "ana@correo.com", barberoId: "barbero-1" };
  const base = { id: "u", nombre: "x", barberoId: null };
  assert.ok(puedeVerCita({ ...base, correo: "ana@correo.com", rol: "cliente" }, cita));
  assert.ok(!puedeVerCita({ ...base, correo: "beto@correo.com", rol: "cliente" }, cita));
  assert.ok(puedeVerCita({ ...base, correo: "t@b.com", rol: "barbero", barberoId: "barbero-1" }, cita));
  assert.ok(!puedeVerCita({ ...base, correo: "m@b.com", rol: "barbero", barberoId: "barbero-2" }, cita));
  assert.ok(puedeVerCita({ ...base, correo: "admin@b.com", rol: "admin" }, cita));
});

test("UC-26: entrar con Google crea un cliente la primera vez y después entra a la misma cuenta", async () => {
  let n = 0;
  const usuarios = new MemoriaRepositorioUsuarios();
  const google = {
    verificar: async (c: string) => (c === "token-bueno" ? { correo: "Ana@Gmail.com", nombre: "Ana López" } : null),
  };
  const d = { usuarios, sesiones: new MemoriaRepositorioSesiones(), cifrador: new CifradorPbkdf2(), reloj: new RelojFijo(a(9)), ids: { nuevo: () => `id-${++n}` }, google };
  const entrar = new EntrarConGoogle(d);
  const s1 = await entrar.ejecutar({ credencial: "token-bueno" });
  const s2 = await entrar.ejecutar({ credencial: "token-bueno" });
  assert.equal(s1.usuario.rol, "cliente");
  assert.equal(s1.usuario.correo, "ana@gmail.com");
  assert.equal(s2.usuario.id, s1.usuario.id);
  await assert.rejects(entrar.ejecutar({ credencial: "token-falso" }), AccesoDenegado);
  // La cuenta creada con Google no tiene contraseña: nadie puede entrar adivinando una.
  await assert.rejects(new IniciarSesion(d).ejecutar({ correo: "ana@gmail.com", contrasena: "google" }), AccesoDenegado);
});

test("UC-27/28 (RN-17): mi cuenta junta datos, reservas e historial, y solo guarda datos válidos", async () => {
  const usuarios = new MemoriaRepositorioUsuarios();
  const perfiles = new MemoriaRepositorioPerfiles();
  const reloj = new RelojFijo(a(9));
  const u = { id: "u-1", nombre: "Ana López", correo: "ana@correo.com", rol: "cliente" as const, barberoId: null };
  await usuarios.crear({ ...u, hash: "x" });
  const datos = new ActualizarMisDatos({ usuarios, perfiles, reloj });
  await assert.rejects(datos.ejecutar({ usuario: u, nombre: "Ana", telefono: "12345" }), /10 dígitos/);
  await assert.rejects(datos.ejecutar({ usuario: u, nombre: "Ana", fechaNacimiento: "2030-01-01" }), /fecha de nacimiento/);
  const r = await datos.ejecutar({ usuario: u, nombre: "Ana Sofía", telefono: "+52 442 123 4567", fechaNacimiento: "1999-11-25", preferencias: "Fade bajo" });
  assert.equal(r.perfil.telefono, "4421234567");
  assert.equal((await usuarios.buscarPorId("u-1"))!.nombre, "Ana Sofía");
  const cuenta = await new VerMiCuenta({ usuarios, perfiles, citas: new MemoriaRepositorioCitas(), pedidos: new MemoriaRepositorioPedidos(), reloj })
    .ejecutar({ usuario: r.usuario });
  assert.equal(cuenta.perfil.preferencias, "Fade bajo");
  assert.equal(cuenta.resumen.diasParaCumpleanos, 2); // lunes 23 → miércoles 25 de noviembre
  assert.equal(cuenta.resumen.visitas, 0);
});
