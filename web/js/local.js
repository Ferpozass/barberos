import { api, avisar, catalogo, dinero, diaLocal, esc, fechaLarga, hora } from "./comun.js";
import { PALETAS, aplicarPaleta } from "./apariencia.js";

// Vista "Local" del administrador: lo del día a día que no es el corte de caja.
//  - Pedidos de la tienda por surtir (UC-23)      - Devoluciones pendientes (UC-16)
//  - Cliente sin cita (UC-04)                      - Bloquear horario / barbero ausente (UC-18, UC-06)
//  - Catálogo: precios, productos, comisiones y barberos (UC-10, UC-24, UC-25)
export function montarLocal(raiz) {
  const st = { dia: diaLocal(new Date()), cat: null, pedidos: [], devoluciones: [], bloqueos: [], ausenteListo: null };

  async function cargar() {
    const [cat, pedidos, devoluciones, bloqueos, apariencia] = await Promise.all([
      api("/api/catalogo?todos=1"),
      api("/api/pedidos/por-surtir"),
      api("/api/devoluciones"),
      api(`/api/bloqueos?dia=${st.dia}`),
      api("/api/apariencia"),
    ]);
    Object.assign(st, { cat, pedidos, devoluciones, bloqueos, paleta: apariencia.paleta });
    catalogo({ forzar: true }).catch(() => {}); // refresca el que usan las demás vistas
    pintar();
  }

  const nombreBarbero = (id) => st.cat.barberos.find((b) => b.id === id)?.nombre ?? id;
  const opciones = (xs, sel) => xs.map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? "selected" : ""}>${esc(x.nombre)}</option>`).join("");
  const activos = () => st.cat.barberos.filter((b) => b.activo);

  function pintar() {
    const entrega = { recoger: "Recoge en la barbería", domicilio: "A domicilio", en_cita: "En su cita" };
    raiz.innerHTML = `
      <div class="encabezado">
        <div>
          <div class="eyebrow">Administración</div>
          <h1>El local hoy</h1>
          <p>Pedidos de la tienda, devoluciones, clientes sin cita, horarios y catálogo.</p>
        </div>
      </div>
      <div class="local">
        <div class="tarjeta">
          <div class="cab"><h2>Pedidos por surtir</h2><span class="contador-cab">${st.pedidos.length}</span></div>
          ${st.pedidos.length === 0 ? `<p class="vacio cuerpo">No hay pedidos pendientes de surtir.</p>` : `
          <ul class="lista-local">
            ${st.pedidos.map((p) => `
              <li>
                <div>
                  <b>${esc(p.cliente.nombre)}</b> · ${dinero(p.total)}
                  <div class="que">${p.renglones.map((r) => `${r.cantidad} × ${esc(r.nombre)}`).join(", ")}</div>
                  <div class="que">${entrega[p.entrega]}${p.direccion ? `: ${esc(p.direccion)}` : ""}</div>
                </div>
                <button class="boton chico ${p.estado === "pagado" ? "" : "rojo"}" data-avanzar="${esc(p.id)}">${p.estado === "pagado" ? "Marcar listo" : "Marcar entregado"}</button>
              </li>`).join("")}
          </ul>`}
        </div>

        <div class="tarjeta">
          <div class="cab"><h2>Devoluciones pendientes</h2><span class="contador-cab">${st.devoluciones.length}</span></div>
          ${st.devoluciones.length === 0 ? `<p class="vacio cuerpo">Nada por devolver.</p>` : `
          <ul class="lista-local">
            ${st.devoluciones.map((c) => `
              <li>
                <div><b>${esc(c.cliente.nombre)}</b> · ${fechaLarga(c.inicio)}, ${hora(c.inicio)}
                  <div class="que">${esc(c.motivoCancelacion ?? "Cancelada")}</div></div>
                <button class="boton chico rojo" data-devolver="${esc(c.id)}">Devolver ${dinero(c.pagadoEnLinea)}</button>
              </li>`).join("")}
          </ul>`}
        </div>

        <form class="tarjeta" id="f-sin-cita">
          <div class="cab"><h2>Cliente sin cita</h2></div>
          <div class="cuerpo datos">
            <div class="campo"><label>Barbero</label><select name="barberoId">${opciones(activos())}</select></div>
            <div class="campo"><label>Servicio</label><select name="servicioId">${opciones(st.cat.servicios)}</select></div>
            <div class="campo"><label>Nombre</label><input name="clienteNombre" required minlength="2" placeholder="Don Luis"></div>
            <div class="campo"><label>Correo (opcional)</label><input name="clienteCorreo" type="email" placeholder="para mandarle avisos"></div>
            <button class="boton ancho" type="submit">Registrar ahora</button>
          </div>
        </form>

        <div class="tarjeta">
          <div class="cab"><h2>Horarios</h2><input type="date" id="l-dia" value="${st.dia}"></div>
          <form class="cuerpo datos" id="f-bloqueo">
            <div class="campo"><label>Barbero</label><select name="barberoId">${opciones(activos())}</select></div>
            <div class="campo"><label>Motivo</label><input name="motivo" placeholder="Comida, trámite…"></div>
            <div class="campo"><label>Desde</label><input name="desde" type="time" value="14:00" min="10:00" max="20:00" required></div>
            <div class="campo"><label>Hasta</label><input name="hasta" type="time" value="15:00" min="10:00" max="20:00" required></div>
            <button class="boton ancho" type="submit">Bloquear ese rato</button>
          </form>
          ${st.bloqueos.length ? `<ul class="lista-local">${st.bloqueos.map((b) => `
            <li><div><b>${esc(nombreBarbero(b.barberoId))}</b> · ${hora(b.desde)}–${hora(b.hasta)}<div class="que">${esc(b.motivo)}</div></div>
              <button class="boton chico claro" data-quitar="${esc(b.id)}">Quitar</button></li>`).join("")}</ul>` : ""}
          <div class="cuerpo ausente">
            <p class="nota">¿Faltó un barbero? Sus citas de ese día pasan a otro barbero libre; las que no se puedan, se cancelan avisando al cliente y quedan para devolución.</p>
            <div class="fila-ausente">
              <select id="l-ausente">${opciones(activos())}</select>
              <button class="boton ${st.ausenteListo ? "rojo" : "claro"}" id="b-ausente">${st.ausenteListo ? "Sí, marcar ausente" : "Marcar ausente"}</button>
            </div>
          </div>
        </div>

        <div class="tarjeta apariencia">
          <div class="cab"><h2>Apariencia de tu barbería</h2><span class="nota">Se ve igual para todos tus clientes</span></div>
          <div class="cuerpo paletas">
            ${Object.entries(PALETAS).map(([id, p]) => `
              <button class="paleta" data-paleta="${id}" aria-pressed="${id === st.paleta}">
                <span class="muestras"><i style="background:${p.acento}"></i><i style="background:${p.tinta}"></i><i style="background:${p.crema}"></i></span>
                <span>${p.nombre}</span>
              </button>`).join("")}
          </div>
        </div>

        <div class="tarjeta catalogo-admin">
          <div class="cab"><h2>Catálogo</h2><span class="nota">Solo el administrador cambia precios</span></div>
          <div class="cuerpo">
            <h3>Servicios</h3>
            <table><thead><tr><th>Servicio</th><th>Min</th><th>Precio</th><th></th></tr></thead><tbody>
              ${st.cat.servicios.map((x) => `<tr data-servicio="${esc(x.id)}"><td><input name="nombre" value="${esc(x.nombre)}"></td><td><input name="duracionMin" type="number" min="15" max="180" step="5" value="${x.duracionMin}"></td><td><input name="precio" type="number" min="1" value="${x.precio}"></td><td><button class="boton chico claro" data-guardar="servicio">Guardar</button></td></tr>`).join("")}
            </tbody></table>
            <h3>Productos</h3>
            <table><thead><tr><th>Producto</th><th>Precio</th><th>Piezas</th><th></th></tr></thead><tbody>
              ${st.cat.productos.map((x) => `<tr data-producto="${esc(x.id)}"><td><input name="nombre" value="${esc(x.nombre)}"></td><td><input name="precio" type="number" min="1" value="${x.precio}"></td><td><input name="existencia" type="number" min="0" value="${x.existencia}"></td><td><button class="boton chico claro" data-guardar="producto">Guardar</button></td></tr>`).join("")}
              <tr data-producto=""><td><input name="nombre" placeholder="Producto nuevo"></td><td><input name="precio" type="number" min="1" placeholder="$"></td><td><input name="existencia" type="number" min="0" placeholder="0"></td><td><button class="boton chico" data-guardar="producto">Agregar</button></td></tr>
            </tbody></table>
            <h3>Barberos</h3>
            <table><thead><tr><th>Barbero</th><th>Comisión %</th><th>Activo</th><th></th></tr></thead><tbody>
              ${st.cat.barberos.map((x) => `<tr data-barbero="${esc(x.id)}"><td><input name="nombre" value="${esc(x.nombre)}"></td><td><input name="comision" type="number" min="0" max="100" value="${Math.round(x.porcentajeComision * 100)}"></td><td><input name="activo" type="checkbox" ${x.activo ? "checked" : ""}></td><td><button class="boton chico claro" data-guardar="barbero">Guardar</button></td></tr>`).join("")}
              <tr data-barbero=""><td><input name="nombre" placeholder="Barbero nuevo"></td><td><input name="comision" type="number" min="0" max="100" value="40"></td><td><input name="activo" type="checkbox" checked></td><td><button class="boton chico" data-guardar="barbero">Dar de alta</button></td></tr>
            </tbody></table>
            <p class="nota">Para que un barbero nuevo entre a su agenda, se le crea su cuenta con <code>scripts/crear-usuario.ts</code>.</p>
          </div>
        </div>
      </div>`;
  }

  async function hacer(promesa, texto) {
    try {
      await promesa;
      if (texto) avisar(texto, "ok");
      await cargar();
    } catch (err) {
      avisar(err.message, "error");
    }
  }

  function guardarFila(tipo, tr) {
    const v = (n) => tr.querySelector(`[name="${n}"]`);
    const id = tr.dataset[tipo] || undefined;
    if (tipo === "servicio")
      return hacer(api("/api/catalogo/servicios", { method: "POST", body: { id, nombre: v("nombre").value, duracionMin: Number(v("duracionMin").value), precio: Number(v("precio").value) } }), "Servicio guardado");
    if (tipo === "producto")
      return hacer(api("/api/catalogo/productos", { method: "POST", body: { id, nombre: v("nombre").value, precio: Number(v("precio").value), existencia: Number(v("existencia").value) } }), "Producto guardado");
    return hacer(api("/api/catalogo/barberos", { method: "POST", body: { id, nombre: v("nombre").value, porcentajeComision: Number(v("comision").value) / 100, activo: v("activo").checked } }), "Barbero guardado");
  }

  raiz.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.paleta) {
      aplicarPaleta(b.dataset.paleta); // se ve al instante
      return hacer(api("/api/apariencia", { method: "POST", body: { paleta: b.dataset.paleta } }), "Listo: así se ve ahora tu página");
    }
    if (b.dataset.avanzar) hacer(api(`/api/pedidos/${b.dataset.avanzar}/avanzar`, { method: "POST" }), "Pedido actualizado; avisamos al cliente");
    else if (b.dataset.devolver) {
      b.disabled = true;
      hacer(api(`/api/devoluciones/${b.dataset.devolver}`, { method: "POST" }), "Dinero devuelto; avisamos al cliente");
    } else if (b.dataset.quitar) hacer(api(`/api/bloqueos/${b.dataset.quitar}/quitar`, { method: "POST" }), "Bloqueo quitado");
    else if (b.dataset.guardar) guardarFila(b.dataset.guardar, b.closest("tr"));
    else if (b.id === "b-ausente") {
      const id = raiz.querySelector("#l-ausente").value;
      // Dos pasos en vez de un confirm() del navegador: primero se arma, luego se confirma.
      if (st.ausenteListo !== id) {
        st.ausenteListo = id;
        return pintar();
      }
      st.ausenteListo = null;
      hacer(
        api("/api/barberos/ausente", { method: "POST", body: { barberoId: id, dia: st.dia } }).then((r) =>
          avisar(`${nombreBarbero(id)} ausente: ${r.reasignadas} cita(s) reasignada(s), ${r.canceladas} cancelada(s).`, "ok"),
        ),
      );
    }
  };
  raiz.onsubmit = (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    if (e.target.id === "f-sin-cita") {
      if (!datos.clienteCorreo) delete datos.clienteCorreo;
      hacer(api("/api/citas-sin-cita", { method: "POST", body: datos }), `${datos.clienteNombre} registrado; ya aparece en la agenda del barbero`);
    } else if (e.target.id === "f-bloqueo") {
      hacer(api("/api/bloqueos", { method: "POST", body: { ...datos, dia: st.dia } }), "Horario bloqueado");
    }
  };
  raiz.onchange = (e) => {
    if (e.target.id === "l-dia" && e.target.value) {
      st.dia = e.target.value;
      cargar().catch((err) => avisar(err.message, "error"));
    }
  };

  cargar().catch((err) => avisar(err.message, "error"));
  return () => {
    raiz.onclick = raiz.onsubmit = raiz.onchange = null;
  };
}
