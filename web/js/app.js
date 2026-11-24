import { montarInicio } from "./inicio.js";
import { montarCliente } from "./cliente.js";
import { montarTienda } from "./tienda.js";
import { montarLocal } from "./local.js";
import { montarCuenta } from "./cuenta.js";
import { carrito } from "./productos.js";
import { cargarPaleta } from "./apariencia.js";
import { montarBarbero } from "./barbero.js";
import { montarAdmin } from "./admin.js";
import { montarEntrar, pedirSesion } from "./entrar.js";
import { api, avisar, esc, sesion } from "./comun.js";

// Cada vista dice quién puede verla. El servidor vuelve a revisar el permiso en cada petición;
// esto solo es para no enseñar pantallas que de todos modos responderían "sin permiso".
const VISTAS = {
  inicio: { montar: montarInicio, roles: null, pestana: "Inicio" },
  cliente: { montar: montarCliente, roles: null, pestana: "Agendar" },
  tienda: { montar: montarTienda, roles: null, pestana: "Tienda" },
  barbero: { montar: montarBarbero, roles: ["barbero", "admin"], pestana: "Barbero" },
  admin: { montar: montarAdmin, roles: ["admin"], pestana: "Caja" },
  local: { montar: montarLocal, roles: ["admin"], pestana: "Local" },
  cuenta: { montar: montarCuenta, roles: ["cliente", "barbero", "admin"], pestana: null },
  entrar: { montar: montarEntrar, roles: null, pestana: null },
};
let limpiar = null;

const puedeVer = (v, u) => !VISTAS[v].roles || (u && VISTAS[v].roles.includes(u.rol));

function pintarBarra() {
  const u = sesion.usuario();
  const actual = location.hash.slice(1) || "inicio";
  const visibles = Object.entries(VISTAS).filter(([v, d]) => d.pestana && (!VISTAS[v].roles || puedeVer(v, u)));
  const nav = document.querySelector(".pestanas");
  // Con una sola vista (cliente o visitante) no hacen falta pestañas.
  nav.hidden = visibles.length < 2;
  const piezas = carrito.piezas();
  nav.innerHTML = visibles
    .map(([v, d]) => `<a href="#${v}" data-vista="${v}" ${v === actual ? 'aria-current="page"' : ""}>${d.pestana}${
      v === "tienda" && piezas ? `<span class="burbuja" aria-label="${piezas} en el carrito">${piezas}</span>` : ""}</a>`)
    .join("");
  document.getElementById("cuenta").innerHTML = u
    ? `<a class="quien" href="#cuenta" title="Mi cuenta · ${esc(u.correo)}"><span class="mini-avatar">${esc(u.nombre.trim()[0] ?? "?").toUpperCase()}</span>${esc(u.nombre.split(" ")[0])}</a><button class="boton claro chico" id="salir">Salir</button>`
    : `<a class="boton chico" href="#entrar">Entrar</a>`;
}

function mostrar() {
  const pedida = location.hash.slice(1);
  let nombre = pedida in VISTAS ? pedida : "inicio";
  const u = sesion.usuario();
  if (nombre === "entrar" && u) nombre = "cliente";
  if (limpiar) limpiar();
  limpiar = null;
  for (const v of Object.keys(VISTAS)) document.getElementById(`vista-${v}`).hidden = v !== nombre;
  document.body.dataset.vista = nombre; // la portada usa todo el ancho
  window.scrollTo(0, 0);
  pintarBarra();
  const raiz = document.getElementById(`vista-${nombre}`);
  if (!puedeVer(nombre, u)) {
    sessionStorage.setItem("barberos.volverA", nombre);
    sessionStorage.setItem("barberos.modoEntrar", "entrar"); // barberos y admin no se registran solos
    pedirSesion(raiz, u ? "Tu cuenta no tiene acceso a esta parte" : "Entra con tu cuenta para ver esto");
    return;
  }
  limpiar = VISTAS[nombre].montar(raiz) ?? null;
}

document.getElementById("cuenta").addEventListener("click", async (e) => {
  if (e.target.id !== "salir") return;
  await api("/api/cuentas/salir", { method: "POST" }).catch(() => {});
  sesion.guardar(null);
  try {
    localStorage.removeItem("barberos.miCita");
  } catch {}
  location.hash = "inicio";
  mostrar();
});

// Enlaces del pie de página que son de ejemplo (blog, políticas, redes): avisan en vez de navegar.
document.querySelector(".pie").addEventListener("click", (e) => {
  const a = e.target.closest("[data-ficticio]");
  if (!a) return;
  e.preventDefault();
  avisar("Esta sección es de ejemplo: La Esquina es una barbería ficticia.");
});

cargarPaleta(api);
// Copia de la app en el celular (web/sw.js): así abre aunque no haya internet en el local (escenario E1).
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
window.addEventListener("hashchange", mostrar);
window.addEventListener("sesion", pintarBarra);
// La burbuja del carrito se actualiza y da un pequeño salto al agregar algo.
window.addEventListener("carrito", () => {
  pintarBarra();
  const b = document.querySelector(".pestanas .burbuja");
  if (b) b.classList.add("salta");
});
// El encabezado toma sombra en cuanto la página baja un poco.
const barra = document.querySelector(".barra");
const sombra = () => barra.classList.toggle("con-sombra", scrollY > 8);
addEventListener("scroll", sombra, { passive: true });
sombra();
mostrar();
