import { api, avisar, catalogo, dinero, esc, esqueleto, hora, iniciales, almacen, pildora, sesion } from "./comun.js";
import { foto } from "./productos.js";

// Mi cuenta (UC-27 y UC-28): quién es, sus reservas, su historial de cortes, sus pedidos y sus datos.
const SECCIONES = [
  ["reservas", "Mis reservas"],
  ["cortes", "Historial de cortes"],
  ["pedidos", "Mis pedidos"],
  ["datos", "Mis datos"],
];
const LLAVE_SECCION = "barberos.seccionCuenta";
const PASOS_PEDIDO = ["pagado", "preparado", "entregado"];

export function montarCuenta(raiz) {
  const st = { c: null, cat: null, seccion: sessionStorage.getItem(LLAVE_SECCION) ?? "reservas" };

  async function cargar() {
    if (!st.c) raiz.innerHTML = `<div class="cuenta-pagina"><div class="esqueleto portada-esq"></div>${esqueleto(3, "renglon-esq")}</div>`;
    [st.c, st.cat] = await Promise.all([api("/api/mi-cuenta"), catalogo()]);
    pintar();
  }

  const servicio = (id) => st.cat.servicios.find((s) => s.id === id)?.nombre ?? id;
  const barbero = (id) => st.cat.barberos.find((b) => b.id === id)?.nombre ?? id;
  const mes = (iso, opc = { month: "long", year: "numeric" }) => new Date(iso).toLocaleDateString("es-MX", opc);

  function pintar() {
    const { usuario, perfil, resumen, clienteDesde, conGoogle, citas } = st.c;
    const ahora = Date.now();
    const proxima = citas
      .filter((c) => ["confirmada", "apartada"].includes(c.estado) && new Date(c.fin).getTime() > ahora)
      .sort((a, b) => new Date(a.inicio) - new Date(b.inicio))[0];
    const cumple = resumen.diasParaCumpleanos;

    raiz.innerHTML = `
      <div class="cuenta-pagina">
        <section class="cuenta-portada">
          <div class="cuenta-quien">
            <div class="cuenta-avatar">${esc(iniciales(usuario.nombre))}</div>
            <div>
              <div class="eyebrow">Mi cuenta</div>
              <h1>${esc(usuario.nombre)}</h1>
              <p>${esc(usuario.correo)}</p>
              <div class="cuenta-chips">
                ${clienteDesde ? `<span>Cliente desde ${mes(clienteDesde)}</span>` : ""}
                <span>${conGoogle ? "Entras con Google" : "Entras con contraseña"}</span>
                ${usuario.rol !== "cliente" ? `<span>${usuario.rol === "admin" ? "Administrador" : "Barbero"}</span>` : ""}
                ${cumple === 0 ? `<span class="destacado">¡Feliz cumpleaños!</span>` : cumple !== null && cumple <= 30 ? `<span class="destacado">Tu cumpleaños es en ${cumple} día${cumple === 1 ? "" : "s"}</span>` : ""}
              </div>
            </div>
          </div>
          <div class="cuenta-numeros">
            <div><b>${resumen.visitas}</b><span>visita${resumen.visitas === 1 ? "" : "s"}</span></div>
            <div><b>${dinero(resumen.gastado)}</b><span>en cortes y productos</span></div>
            <div><b>${resumen.barberoFrecuenteId ? esc(barbero(resumen.barberoFrecuenteId)) : "—"}</b><span>tu barbero de siempre</span></div>
            <div><b>${proxima ? `${new Date(proxima.inicio).toLocaleDateString("es-MX", { day: "numeric", month: "short" })} · ${hora(proxima.inicio)}` : "Sin cita"}</b><span>próxima cita</span></div>
          </div>
        </section>

        <nav class="cuenta-secciones" role="tablist" aria-label="Secciones de mi cuenta">
          ${SECCIONES.map(([k, t]) => `<button role="tab" data-seccion="${k}" aria-selected="${st.seccion === k}">${t}</button>`).join("")}
        </nav>

        <div class="cuenta-contenido">${
          st.seccion === "reservas" ? pintarReservas() : st.seccion === "cortes" ? pintarCortes() : st.seccion === "pedidos" ? pintarPedidos() : pintarDatos(usuario, perfil)
        }</div>
      </div>`;
  }

  // Una reserva como boleto: el día grande a la izquierda.
  function boleto(c, acciones = "") {
    const d = new Date(c.inicio);
    return `
      <article class="boleto ${c.estado}">
        <div class="boleto-dia"><b>${d.getDate()}</b><span>${d.toLocaleDateString("es-MX", { month: "short" })}</span><small>${d.toLocaleDateString("es-MX", { weekday: "short" })}</small></div>
        <div class="boleto-info">
          <h3>${esc(servicio(c.servicioId))}</h3>
          <p>con ${esc(barbero(c.barberoId))} · ${hora(c.inicio)} · ${c.duracionMin} min</p>
          <div class="boleto-pie">${pildora(c.estado, c.estadoTexto)}<span class="dinero">${dinero(c.precio)}</span></div>
        </div>
        ${acciones ? `<div class="boleto-acciones">${acciones}</div>` : ""}
      </article>`;
  }

  function pintarReservas() {
    const ahora = Date.now();
    const proximas = st.c.citas
      .filter((c) => ["confirmada", "apartada"].includes(c.estado) && new Date(c.fin).getTime() > ahora)
      .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
    const pasadas = st.c.citas.filter((c) => !proximas.includes(c));
    return `
      <div class="cuenta-bloque">
        <div class="cuenta-bloque-cab"><h2>Próximas</h2><a class="boton rojo chico" href="#cliente">Nueva reserva</a></div>
        ${proximas.length
          ? `<div class="boletos">${proximas.map((c) => boleto(c, `<button class="boton chico claro" data-abrir="${esc(c.id)}">${c.estado === "apartada" ? "Terminar pago" : "Ver o cambiar"}</button>`)).join("")}</div>`
          : vacio("No tienes reservas próximas.", "Aparta tu lugar en la silla en menos de un minuto.", "#cliente", "Agendar")}
      </div>
      <div class="cuenta-bloque">
        <div class="cuenta-bloque-cab"><h2>Pasadas</h2><span class="nota">${pasadas.length}</span></div>
        ${pasadas.length ? `<div class="boletos pasadas">${pasadas.map((c) => boleto(c)).join("")}</div>` : `<p class="vacio">Aquí aparecerán tus citas anteriores.</p>`}
      </div>`;
  }

  function pintarCortes() {
    const cortes = st.c.citas.filter((c) => c.estado === "atendida");
    if (!cortes.length) return vacio("Todavía no tienes cortes con nosotros.", "Después de tu primera visita verás aquí cada corte, con quién y cuánto.", "#cliente", "Agendar mi primer corte");
    return `
      <div class="cuenta-bloque">
        <ol class="linea-tiempo">
          ${cortes.map((c) => `
            <li>
              <div class="linea-fecha">${mes(c.inicio, { day: "numeric", month: "long", year: "numeric" })}</div>
              <div class="linea-tarjeta">
                <div><h3>${esc(servicio(c.servicioId))}</h3><p>con ${esc(barbero(c.barberoId))} · ${dinero(c.precio)}</p></div>
                <button class="boton chico claro" data-repetir="${esc(c.servicioId)}|${esc(c.barberoId)}">Repetir</button>
              </div>
            </li>`).join("")}
        </ol>
      </div>`;
  }

  function pintarPedidos() {
    const pedidos = st.c.pedidos;
    if (!pedidos.length) return vacio("Aún no has pedido nada de la tienda.", "Cera, aceite, kits… lo que usamos en la silla.", "#tienda", "Ir a la tienda");
    const entrega = { recoger: "Recoger en la barbería", domicilio: "A domicilio", en_cita: "Te lo damos en tu cita" };
    return `
      <div class="cuenta-bloque pedidos-cuenta">
        ${pedidos.map((p) => {
          const paso = PASOS_PEDIDO.indexOf(p.estado);
          return `
          <article class="pedido-cuenta">
            <div class="pedido-cab">
              <div><b>Pedido del ${mes(p.creadoEn, { day: "numeric", month: "long" })}</b><span>${entrega[p.entrega]}${p.direccion ? ` · ${esc(p.direccion)}` : ""}</span></div>
              <b class="dinero">${dinero(p.total)}</b>
            </div>
            <div class="pedido-fotos">
              ${p.renglones.map((r) => `<div class="pedido-item">${foto(r.productoId) ? `<img src="${foto(r.productoId)}" alt="">` : ""}<span>${r.cantidad} × ${esc(r.nombre)}</span></div>`).join("")}
            </div>
            ${p.estado === "pendiente"
              ? `<p class="nota">Esperando tu pago.</p>`
              : `<ol class="pasos-pedido">${["Pagado", p.entrega === "domicilio" ? "En camino" : "Listo", "Entregado"].map((t, i) => `<li class="${i <= paso ? "hecho" : ""}">${t}</li>`).join("")}</ol>`}
          </article>`;
        }).join("")}
      </div>`;
  }

  function pintarDatos(u, p) {
    return `
      <form class="cuenta-bloque datos-cuenta" id="f-datos">
        <div class="campo"><label for="d-nombre">Nombre</label><input id="d-nombre" name="nombre" value="${esc(u.nombre)}" required minlength="2" autocomplete="name"></div>
        <div class="campo"><label for="d-correo">Correo registrado</label><input id="d-correo" value="${esc(u.correo)}" disabled><small>Es con el que entras y donde te llegan los avisos.</small></div>
        <div class="campo"><label for="d-telefono">Teléfono</label><input id="d-telefono" name="telefono" type="tel" inputmode="tel" value="${esc(p.telefono ?? "")}" placeholder="10 dígitos" autocomplete="tel"></div>
        <div class="campo"><label for="d-nacimiento">Fecha de nacimiento</label><input id="d-nacimiento" name="fechaNacimiento" type="date" value="${esc(p.fechaNacimiento ?? "")}" autocomplete="bday"></div>
        <div class="campo"><label for="d-favorito">Barbero favorito</label>
          <select id="d-favorito" name="barberoFavoritoId"><option value="">Sin preferencia</option>
            ${st.cat.barberos.map((b) => `<option value="${esc(b.id)}" ${b.id === p.barberoFavoritoId ? "selected" : ""}>${esc(b.nombre)}</option>`).join("")}
          </select></div>
        <div class="campo ancho"><label for="d-pref">Cómo te gusta tu corte</label><textarea id="d-pref" name="preferencias" rows="3" maxlength="280" placeholder="Ej. fade bajo, arriba con tijera, barba perfilada">${esc(p.preferencias ?? "")}</textarea><small>Lo guardamos para tu próxima visita.</small></div>
        <div class="datos-pie ancho">
          <a class="nota" href="/privacidad.html" target="_blank">Aviso de privacidad</a>
          <button class="boton rojo" type="submit">Guardar cambios</button>
        </div>
      </form>`;
  }

  const vacio = (titulo, texto, href, boton) => `
    <div class="cuenta-vacio"><h3>${titulo}</h3><p>${texto}</p><a class="boton rojo" href="${href}">${boton}</a></div>`;

  raiz.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.seccion) {
      st.seccion = b.dataset.seccion;
      sessionStorage.setItem(LLAVE_SECCION, st.seccion);
      pintar();
    } else if (b.dataset.abrir) {
      almacen.guardar("barberos.miCita", b.dataset.abrir);
      location.hash = "cliente";
    } else if (b.dataset.repetir) {
      const [servicioId, barberoId] = b.dataset.repetir.split("|");
      sessionStorage.setItem("barberos.borrador", JSON.stringify({ servicioId, barberoId, tipoPago: "anticipo" }));
      location.hash = "cliente";
    }
  };
  raiz.onsubmit = async (e) => {
    e.preventDefault();
    const boton = e.target.querySelector("button[type=submit]");
    boton.disabled = true;
    try {
      const r = await api("/api/mi-cuenta", { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
      sesion.guardar({ ...sesion.actual(), usuario: r.usuario }); // el nombre nuevo también arriba
      avisar("Listo, guardamos tus datos", "ok");
      await cargar();
    } catch (err) {
      avisar(err.message, "error");
      boton.disabled = false;
    }
  };

  cargar().catch((err) => avisar(err.message, "error"));
  return () => {
    raiz.onclick = raiz.onsubmit = null;
  };
}
