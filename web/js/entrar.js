import { api, avisar, esc, sesion } from "./comun.js";

// Vista de entrar / crear cuenta. Al terminar regresa a donde iba (o a la vista de su rol).
const INICIO_POR_ROL = { cliente: "cliente", barbero: "barbero", admin: "admin" };

export function montarEntrar(raiz) {
  let modo = sessionStorage.getItem("barberos.modoEntrar") === "registro" ? "registro" : "entrar";
  const volverA = () => sessionStorage.getItem("barberos.volverA");

  function pintar() {
    const registro = modo === "registro";
    raiz.innerHTML = `
      <div class="entrar">
        <div class="tarjeta">
          <div class="cuerpo">
            <div class="eyebrow">${registro ? "Cuenta nueva" : "Bienvenido"}</div>
            <h1>${registro ? "Crea tu cuenta" : "Entra a tu cuenta"}</h1>
            <p class="nota">${registro
              ? "Con tu cuenta apartas citas, pagas en línea y ves o cancelas tus citas."
              : "Clientes, barberos y administración entran por aquí."}</p>
            <div class="segmentado" role="tablist" aria-label="Entrar o registrarse">
              <button type="button" data-modo="entrar" aria-pressed="${!registro}">Entrar</button>
              <button type="button" data-modo="registro" aria-pressed="${registro}">Crear cuenta</button>
            </div>
            <form id="f-cuenta" class="datos" novalidate>
              ${registro ? `<div class="campo"><label for="e-nombre">Nombre</label><input id="e-nombre" name="nombre" autocomplete="name" required placeholder="Como quieres que te llamemos"></div>` : ""}
              <div class="campo"><label for="e-correo">Correo</label><input id="e-correo" name="correo" type="email" autocomplete="email" required placeholder="tu@correo.com"></div>
              <div class="campo"><label for="e-contrasena">Contraseña</label><input id="e-contrasena" name="contrasena" type="password" autocomplete="${registro ? "new-password" : "current-password"}" required minlength="8" placeholder="${registro ? "Mínimo 8 caracteres" : ""}"></div>
              ${registro ? `<label class="acepto"><input type="checkbox" name="aceptaPrivacidad" required> <span>Leí y acepto el <a href="/privacidad.html" target="_blank">aviso de privacidad</a> y recibir por correo los avisos de mis citas.</span></label>` : ""}
              <button class="boton rojo ancho" type="submit">${registro ? "Crear cuenta" : "Entrar"}</button>
            </form>
            <div class="con-google" hidden>
              <div class="separador"><span>o</span></div>
              <div id="boton-google"></div>
              <p class="nota centro">Si entras con Google por primera vez, aceptas el <a href="/privacidad.html" target="_blank">aviso de privacidad</a>.</p>
            </div>
          </div>
        </div>
      </div>`;
    raiz.querySelector(registro ? "#e-nombre" : "#e-correo").focus();
    pintarGoogle(registro);
  }

  // Lo mismo después de entrar con contraseña o con Google.
  function yaEntro(r) {
    sesion.guardar(r);
    avisar(`Hola, ${r.usuario.nombre.split(" ")[0]}`, "ok");
    const destino = volverA() ?? INICIO_POR_ROL[r.usuario.rol];
    sessionStorage.removeItem("barberos.volverA");
    sessionStorage.removeItem("barberos.modoEntrar");
    location.hash = destino;
  }

  // Botón oficial de Google (Google Identity Services). Google regresa un token firmado
  // ("credential") y el servidor lo valida antes de abrir la sesión (ADR-011).
  async function pintarGoogle(registro) {
    const clientId = await idDeGoogle();
    const caja = raiz.querySelector(".con-google");
    if (!clientId || !caja || !(await cargarGoogle())) return;
    google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        try {
          yaEntro(await api("/api/cuentas/google", { method: "POST", body: { credencial: credential } }));
        } catch (err) {
          avisar(err.message, "error");
        }
      },
    });
    const ancho = Math.min(400, raiz.querySelector("#f-cuenta").offsetWidth);
    google.accounts.id.renderButton(caja.querySelector("#boton-google"), {
      theme: "outline", size: "large", shape: "rectangular", width: ancho, locale: "es",
      text: registro ? "signup_with" : "signin_with",
    });
    caja.hidden = false;
  }

  async function enviar(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const boton = e.target.querySelector("button[type=submit]");
    boton.disabled = true;
    try {
      const datos = Object.fromEntries(f);
      if (modo === "registro" && !datos.aceptaPrivacidad) throw new Error("Para crear tu cuenta acepta el aviso de privacidad");
      if (datos.aceptaPrivacidad) datos.aceptaPrivacidad = true;
      yaEntro(await api(modo === "registro" ? "/api/cuentas/registro" : "/api/cuentas/entrar", { method: "POST", body: datos }));
    } catch (err) {
      avisar(err.message, "error");
      boton.disabled = false;
    }
  }

  raiz.onclick = (e) => {
    const b = e.target.closest("[data-modo]");
    if (!b) return;
    modo = b.dataset.modo;
    sessionStorage.setItem("barberos.modoEntrar", modo);
    pintar();
  };
  raiz.onsubmit = enviar;

  pintar();
  return () => {
    raiz.onclick = null;
    raiz.onsubmit = null;
  };
}

// El id de la app en Google y el script de Google se piden una sola vez.
let promesaId = null;
let promesaScript = null;
function idDeGoogle() {
  promesaId ??= api("/api/cuentas/google").then((r) => r.clientId).catch(() => null);
  return promesaId;
}
function cargarGoogle() {
  promesaScript ??= new Promise((listo) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => listo(true);
    s.onerror = () => listo(false); // sin internet o bloqueado: solo queda correo y contraseña
    document.head.append(s);
  });
  return promesaScript;
}

// Mensaje para las vistas que necesitan sesión.
export function pedirSesion(raiz, texto) {
  raiz.innerHTML = `
    <div class="entrar"><div class="tarjeta"><div class="cuerpo">
      <div class="eyebrow">Solo con cuenta</div>
      <h1>${esc(texto)}</h1>
      <a class="boton rojo ancho" href="#entrar">Entrar</a>
    </div></div></div>`;
}
