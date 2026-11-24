import { api, avisar, catalogo, dinero, esc, esqueleto, fechaLarga, pildora, sesion, almacen } from "./comun.js";
import { carrito, foto, info } from "./productos.js";

// Tienda en línea (F4): cualquiera ve los productos; para pedir se necesita cuenta.
// El pedido aparta las piezas 10 minutos mientras se paga con Mercado Pago (regla 30).
const ENVIO = 60; // igual que COSTO_ENVIO del dominio; el servidor es quien cobra de verdad
const ESTADOS = { pendiente: "Por pagar", pagado: "Pagado", preparado: "Listo", entregado: "Entregado", cancelado: "Cancelado" };
const ESTADO_PILDORA = { pendiente: "apartada", pagado: "confirmada", preparado: "confirmada", entregado: "atendida", cancelado: "cancelada" };

export function montarTienda(raiz) {
  const st = { productos: [], entrega: "recoger", direccion: "", misPedidos: [] };
  let sondeo = null;
  let reloj = null;

  async function iniciar() {
    if (!st.productos.length)
      raiz.innerHTML = `<div class="encabezado"><div><div class="eyebrow">Tienda de La Esquina</div><h1>Lo que usamos en la silla, para tu casa</h1></div></div>
        <div class="tienda"><div class="productos-grid">${esqueleto(6, "producto-esq")}</div><div class="esqueleto carrito-esq"></div></div>`;
    const pendiente = almacen.leer("barberos.miPedido", null);
    if (pendiente && sesion.usuario()) {
      const p = await api(`/api/pedidos/${pendiente}`).catch(() => null);
      if (p && p.estado === "pendiente") return pintarPendiente(p);
      if (p && p.estado === "pagado") avisar("¡Pago recibido! Tu pedido está pagado.", "ok");
      almacen.guardar("barberos.miPedido", null);
    }
    st.productos = (await catalogo({ forzar: true })).productos;
    st.misPedidos = sesion.usuario() ? await api("/api/mis-pedidos").catch(() => []) : [];
    pintar();
  }

  const enCarrito = () => {
    const c = carrito.leer();
    return st.productos.filter((p) => c[p.id]).map((p) => ({ ...p, cantidad: Math.min(c[p.id], p.existencia) })).filter((p) => p.cantidad > 0);
  };

  function pintar() {
    const primera = !raiz.querySelector(".productos-grid .producto");
    const u = sesion.usuario();
    const lista = enCarrito();
    const subtotal = lista.reduce((s, p) => s + p.precio * p.cantidad, 0);
    const envio = st.entrega === "domicilio" && lista.length ? ENVIO : 0;
    const piezas = lista.reduce((s, p) => s + p.cantidad, 0);
    const c = carrito.leer();

    raiz.innerHTML = `
      <div class="encabezado">
        <div>
          <div class="eyebrow">Tienda de La Esquina</div>
          <h1>Lo que usamos en la silla, para tu casa</h1>
          <p>Recoges en la barbería o te lo llevamos (Querétaro, ${dinero(ENVIO)}). Pagas con tarjeta en Mercado Pago.</p>
        </div>
      </div>
      <div class="tienda">
        <div class="productos-grid">
          ${st.productos.map((p, i) => {
            const n = c[p.id] ?? 0;
            const agotado = p.existencia <= 0;
            return `
            <article class="producto ${agotado ? "agotado" : ""} ${st.recien === p.id ? "recien" : ""}" style="--i:${i}" data-id="${esc(p.id)}">
              <div class="producto-foto">${foto(p.id) ? `<img src="${foto(p.id)}" alt="${esc(p.nombre)}" loading="lazy">` : ""}
                ${info(p.id).top ? `<span class="sello-top">Recomendado</span>` : ""}</div>
              <div class="producto-info">
                <h3>${esc(p.nombre)}</h3>
                <p>${esc(info(p.id).desc)}</p>
                <div class="producto-pie">
                  <div><b class="dinero">${dinero(p.precio)}</b><span class="quedan">${agotado ? "Agotado" : p.existencia <= 3 ? `Quedan ${p.existencia}` : "Disponible"}</span></div>
                  ${agotado ? "" : n === 0
                    ? `<button class="boton chico" data-mas="${esc(p.id)}">Agregar</button>`
                    : `<div class="contador"><button data-menos="${esc(p.id)}" aria-label="Quitar uno">−</button><span>${n}</span><button data-mas="${esc(p.id)}" aria-label="Agregar uno" ${n >= Math.min(5, p.existencia) ? "disabled" : ""}>+</button></div>`}
                </div>
              </div>
            </article>`;
          }).join("")}
        </div>

        <aside class="tarjeta resumen carrito" id="carrito">
          <div class="cab"><h2>Tu pedido</h2><span class="mono" style="font-size:12px;opacity:.7">${piezas} pieza${piezas === 1 ? "" : "s"}</span></div>
          <div class="cuerpo">
            ${lista.length === 0
              ? `<p class="vacio">Todavía no agregas nada. Empieza por los recomendados.</p>`
              : `${lista.map((p) => `<div class="renglon"><span>${p.cantidad} × ${esc(p.nombre)}</span><span class="dinero">${dinero(p.precio * p.cantidad)}</span></div>`).join("")}
                <div class="tipo-pago entrega">
                  <button class="opcion" data-entrega="recoger" aria-pressed="${st.entrega === "recoger"}"><span class="nombre">Recoger</span><span class="sub">En la barbería, gratis</span></button>
                  <button class="opcion" data-entrega="domicilio" aria-pressed="${st.entrega === "domicilio"}"><span class="nombre">A domicilio</span><span class="sub">Querétaro · ${dinero(ENVIO)}</span></button>
                </div>
                ${st.entrega === "domicilio" ? `<div class="campo"><label for="t-direccion">Dirección de entrega</label><textarea id="t-direccion" rows="2" placeholder="Calle, número, colonia">${esc(st.direccion)}</textarea></div>` : ""}
                ${envio ? `<div class="renglon"><span>Envío</span><span class="dinero">${dinero(envio)}</span></div>` : ""}
                <div class="total"><span>Total</span><b class="dinero">${dinero(subtotal + envio)}</b></div>
                <button class="boton rojo ancho" data-accion="pedir">${u ? "Pagar con Mercado Pago" : "Entrar para pedir"}</button>
                <p class="nota">Tus piezas quedan apartadas 10 minutos mientras pagas.</p>`}
          </div>
        </aside>
      </div>
      ${lista.length ? `<div class="barra-pago tienda-barra"><div><div class="etq">${piezas} pieza${piezas === 1 ? "" : "s"}</div><b class="dinero">${dinero(subtotal + envio)}</b></div><a class="boton rojo" href="#carrito" data-ir-carrito>Ver pedido</a></div>` : ""}
      ${pintarMisPedidos()}`;
    // Solo la primera vez entran escalonadas; al agregar al carrito no vuelven a animarse.
    raiz.querySelector(".productos-grid")?.classList.toggle("entrada", primera);
    st.recien = null; // el pulso es solo una vez
  }

  function pintarMisPedidos() {
    const lista = st.misPedidos.filter((p) => p.estado !== "pendiente");
    if (!lista.length) return "";
    const entrega = { recoger: "Recoger en la barbería", domicilio: "A domicilio", en_cita: "En tu cita" };
    return `
      <div class="tarjeta mis-citas">
        <div class="cab"><h2>Mis pedidos</h2></div>
        <ul>
          ${lista.map((p) => `
            <li>
              <div>
                <div class="cuando">${p.renglones.map((r) => `${r.cantidad} × ${esc(r.nombre)}`).join(", ")}</div>
                <div class="que">${fechaLarga(p.creadoEn)} · ${entrega[p.entrega]} · ${dinero(p.total)}</div>
              </div>
              ${pildora(ESTADO_PILDORA[p.estado], ESTADOS[p.estado])}
            </li>`).join("")}
        </ul>
      </div>`;
  }

  async function pedir() {
    if (!sesion.usuario()) {
      sessionStorage.setItem("barberos.volverA", "tienda");
      sessionStorage.setItem("barberos.modoEntrar", "registro");
      location.hash = "entrar";
      return;
    }
    const lista = enCarrito();
    const boton = raiz.querySelector('[data-accion="pedir"]');
    boton.disabled = true;
    try {
      const r = await api("/api/pedidos", {
        method: "POST",
        body: {
          productos: lista.map((p) => ({ productoId: p.id, cantidad: p.cantidad })),
          entrega: st.entrega,
          direccion: st.entrega === "domicilio" ? st.direccion : null,
        },
      });
      carrito.vaciar();
      almacen.guardar("barberos.miPedido", r.pedido.id);
      almacen.guardar("barberos.urlPagoPedido", r.urlPago);
      pintarPendiente(r.pedido);
    } catch (err) {
      avisar(err.message, "error");
      boton.disabled = false;
      if (/suficientes/.test(err.message)) iniciar();
    }
  }

  function pintarPendiente(p) {
    window.scrollTo({ top: 0 });
    const url = almacen.leer("barberos.urlPagoPedido", "#");
    const externo = url.startsWith("http"); // Mercado Pago: misma pestaña; simulada: otra pestaña
    raiz.innerHTML = `
      <div class="tarjeta estado-cita"><div class="cuerpo">
        <div class="eyebrow">Productos apartados</div>
        <h1 style="font-size:28px">Termina tu pago antes de que se liberen</h1>
        <div class="reloj" id="t-reloj">10:00</div>
        <div style="color:var(--tinta-3);font-size:14px">minutos restantes</div>
        <div class="detalle">
          ${p.renglones.map((r) => `<div class="renglon"><span>${r.cantidad} × ${esc(r.nombre)}</span><span class="dinero">${dinero(r.precio * r.cantidad)}</span></div>`).join("")}
          ${p.envio ? `<div class="renglon"><span>Envío a domicilio</span><span class="dinero">${dinero(p.envio)}</span></div>` : ""}
          <div class="renglon"><span>Entrega</span><span>${p.entrega === "domicilio" ? esc(p.direccion) : "Recoger en la barbería"}</span></div>
        </div>
        <a class="boton rojo ancho" href="${esc(url)}" ${externo ? "" : 'target="_blank"'}>Ir a pagar ${dinero(p.total)}</a>
        <div class="tarjetas-aceptadas"><img src="/img/pagos/tarjetas.webp" alt="Mastercard, Visa y American Express"></div>
        <div class="esperando">Esperando la confirmación del pago…</div>
      </div></div>`;
    const fin = new Date(p.venceEn).getTime();
    const tic = () => {
      const s = Math.max(0, Math.round((fin - Date.now()) / 1000));
      const el = raiz.querySelector("#t-reloj");
      if (!el) return;
      el.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      el.classList.toggle("urgente", s < 120);
      if (s === 0) {
        limpiarRelojes();
        avisar("Se acabó el tiempo y los productos se liberaron.", "error");
        almacen.guardar("barberos.miPedido", null);
        iniciar();
      }
    };
    tic();
    reloj = setInterval(tic, 1000);
    sondeo = setInterval(async () => {
      const x = await api(`/api/pedidos/${p.id}`).catch(() => null);
      if (x && x.estado !== "pendiente") {
        limpiarRelojes();
        almacen.guardar("barberos.miPedido", null);
        if (x.estado === "pagado") avisar("¡Pago recibido! Te avisamos por correo cuando esté listo.", "ok");
        iniciar();
      }
    }, 2500);
  }

  function limpiarRelojes() {
    clearInterval(reloj);
    clearInterval(sondeo);
  }

  raiz.onclick = (e) => {
    const b = e.target.closest("button, a[data-ir-carrito]");
    if (!b) return;
    const c = carrito.leer();
    if (b.dataset.mas) {
      carrito.poner(b.dataset.mas, (c[b.dataset.mas] ?? 0) + 1);
      st.recien = b.dataset.mas; // la tarjeta hace un pequeño pulso (ver .producto.recien)
      if (!c[b.dataset.mas]) avisar(`Agregaste ${st.productos.find((p) => p.id === b.dataset.mas)?.nombre ?? "el producto"}`, "ok");
    }
    else if (b.dataset.menos) (st.recien = null), carrito.poner(b.dataset.menos, (c[b.dataset.menos] ?? 0) - 1);
    else if (b.dataset.entrega) st.entrega = b.dataset.entrega;
    else if (b.dataset.accion === "pedir") return pedir();
    else if (b.hasAttribute("data-ir-carrito")) {
      e.preventDefault(); // no cambiar el hash (cambiaría de vista)
      raiz.querySelector("#carrito").scrollIntoView({ behavior: "smooth" });
      return;
    } else return;
    pintar();
  };
  raiz.oninput = (e) => {
    if (e.target.id === "t-direccion") st.direccion = e.target.value;
  };

  iniciar().catch((err) => avisar(err.message, "error"));
  return () => {
    limpiarRelojes();
    raiz.onclick = null;
    raiz.oninput = null;
  };
}
