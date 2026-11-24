import { api, avisar, catalogo, dinero, diaLocal, esc, fechaLarga, hora, iniciales, almacen, pildora, sesion } from "./comun.js";
import { foto, info, recomendados } from "./productos.js";

const BORRADOR = "barberos.borrador"; // lo que el cliente eligió antes de ir a entrar

// Vista del cliente: elegir servicio, barbero, día y hora -> apartar 10 min -> pagar -> confirmada.
export function montarCliente(raiz) {
  // extras = productos de "¿Algo más?" { productoId: cantidad }; se pagan en el mismo cobro y se entregan en la cita.
  const st = { servicio: null, barbero: null, dia: null, inicio: null, tipoPago: "anticipo", horarios: [], cat: null, misCitas: [], extras: {} };
  let temporizador = null;
  let sondeo = null;

  const proximosDias = () => {
    const dias = [];
    const d = new Date();
    while (dias.length < 7) {
      if (d.getDay() !== 0) dias.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return dias;
  };

  async function iniciar() {
    const citaGuardada = almacen.leer("barberos.miCita", null);
    if (citaGuardada) {
      try {
        const cita = await api(`/api/citas/${citaGuardada}`);
        if (cita.estado === "apartada" || cita.estado === "confirmada") return pintarEstado(cita);
      } catch {}
      almacen.guardar("barberos.miCita", null);
    }
    st.cat = await catalogo();
    // Si fue a entrar a medio camino, se recupera lo que había elegido.
    const b = JSON.parse(sessionStorage.getItem(BORRADOR) ?? "null");
    sessionStorage.removeItem(BORRADOR);
    if (b) {
      st.servicio = st.cat.servicios.find((x) => x.id === b.servicioId) ?? null;
      st.barbero = st.cat.barberos.find((x) => x.id === b.barberoId) ?? null;
      st.dia = b.dia;
      st.tipoPago = b.tipoPago;
      st.extras = b.extras ?? {};
    }
    st.servicio ??= st.cat.servicios[0];
    st.barbero ??= st.cat.barberos[0];
    st.dia ??= diaLocal(proximosDias()[0]);
    const u = sesion.usuario();
    st.misCitas = u?.rol === "cliente" ? await api("/api/mis-citas").catch(() => []) : [];
    await cargarHorarios(b?.inicio);
  }

  async function cargarHorarios(conservar = null) {
    st.inicio = null;
    st.horarios = await api(`/api/disponibilidad?barberoId=${st.barbero.id}&servicioId=${st.servicio.id}&dia=${st.dia}`);
    if (conservar && st.horarios.some((h) => h.inicio === conservar && h.libre)) st.inicio = conservar;
    pintarFormulario();
  }

  function pintarFormulario() {
    const { servicio, barbero } = st;
    const anticipo = Math.round(servicio.precio * 0.4);
    const top = recomendados(st.cat.productos ?? []);
    const extras = top.filter((p) => st.extras[p.id]);
    const deExtras = extras.reduce((s, p) => s + p.precio * st.extras[p.id], 0);
    const aPagar = (st.tipoPago === "total" ? servicio.precio : anticipo) + deExtras;
    const libres = st.horarios.filter((h) => h.libre);
    const u = sesion.usuario();
    const textoBoton = u ? "Apartar y pagar" : "Entrar para apartar";

    raiz.innerHTML = `
      <div class="encabezado">
        <div>
          <div class="eyebrow">Agenda en línea</div>
          <h1>Aparta tu lugar en la silla</h1>
          <p>Solo ves horarios libres de verdad. Tu horario queda apartado 10 minutos mientras pagas.</p>
        </div>
      </div>
      <div class="agendar">
        <div class="tarjeta">
          <div class="paso">
            <h3><span class="num">1</span>Servicio</h3>
            <div class="opciones servicios">
              ${st.cat.servicios.map((s) => `
                <button class="opcion" data-servicio="${esc(s.id)}" aria-pressed="${s.id === servicio.id}">
                  <span class="nombre">${esc(s.nombre)}</span>
                  <span class="sub">${s.duracionMin} min · ${dinero(s.precio)}</span>
                </button>`).join("")}
            </div>
          </div>
          <div class="paso">
            <h3><span class="num">2</span>Barbero</h3>
            <div class="opciones barberos">
              ${st.cat.barberos.map((b) => `
                <button class="opcion barbero" data-barbero="${esc(b.id)}" aria-pressed="${b.id === barbero.id}">
                  <span class="avatar">${esc(iniciales(b.nombre))}</span>
                  <span class="nombre">${esc(b.nombre)}</span>
                </button>`).join("")}
            </div>
          </div>
          <div class="paso">
            <h3><span class="num">3</span>Día</h3>
            <div class="opciones dias">
              ${proximosDias().map((d) => {
                const k = diaLocal(d);
                return `<button class="opcion dia" data-dia="${k}" aria-pressed="${k === st.dia}">
                  <span class="sub">${d.toLocaleDateString("es-MX", { weekday: "short" })}</span>
                  <span class="nombre">${d.getDate()}</span>
                </button>`;
              }).join("")}
            </div>
          </div>
          <div class="paso">
            <h3><span class="num">4</span>Hora</h3>
            ${libres.length === 0
              ? `<p class="vacio">No quedan horarios libres este día con ${esc(barbero.nombre)}. Prueba otro día u otro barbero.</p>`
              : `<div class="opciones horas">
                  ${st.horarios.map((h) => `
                    <button class="opcion hora" data-inicio="${h.inicio}" ${h.libre ? "" : "disabled"} aria-pressed="${h.inicio === st.inicio}">${h.hora}</button>`).join("")}
                </div>`}
          </div>
          <div class="paso">
            <h3><span class="num">5</span>A nombre de</h3>
            ${u
              ? `<div class="a-nombre"><span class="avatar">${esc(iniciales(u.nombre))}</span><div><b>${esc(u.nombre)}</b><span>${esc(u.correo)}</span></div></div>`
              : `<div class="a-nombre"><div><b>Necesitas tu cuenta para apartar</b><span>Así ves tus citas y te llega la confirmación. Lo que elegiste no se pierde.</span></div></div>`}
            <div class="tipo-pago">
              <button class="opcion" data-pago="anticipo" aria-pressed="${st.tipoPago === "anticipo"}">
                <span class="nombre">Anticipo 40 % · ${dinero(anticipo)}</span>
                <span class="sub">El resto lo pagas en el local</span>
              </button>
              <button class="opcion" data-pago="total" aria-pressed="${st.tipoPago === "total"}">
                <span class="nombre">Pago total · ${dinero(servicio.precio)}</span>
                <span class="sub">Llegas y te sientas</span>
              </button>
            </div>
          </div>
          ${top.length ? `
          <div class="paso algo-mas">
            <h3><span class="num">6</span>¿Algo más? <small>opcional</small></h3>
            <p class="nota">Lo pagas junto con tu cita y te lo damos en la barbería.</p>
            <div class="extras">
              ${top.map((p) => {
                const n = st.extras[p.id] ?? 0;
                return `
                <div class="extra ${n ? "elegido" : ""}">
                  ${foto(p.id) ? `<img src="${foto(p.id)}" alt="" loading="lazy">` : ""}
                  <div class="extra-info"><b>${esc(p.nombre)}</b><span>${esc(info(p.id).desc)}</span><span class="dinero">${dinero(p.precio)}</span></div>
                  ${n === 0
                    ? `<button class="boton chico claro" data-extra-mas="${esc(p.id)}">Agregar</button>`
                    : `<div class="contador"><button data-extra-menos="${esc(p.id)}" aria-label="Quitar uno">−</button><span>${n}</span><button data-extra-mas="${esc(p.id)}" aria-label="Agregar uno" ${n >= Math.min(5, p.existencia) ? "disabled" : ""}>+</button></div>`}
                </div>`;
              }).join("")}
            </div>
            <a class="ver-tienda" href="#tienda">Ver toda la tienda →</a>
          </div>` : ""}
        </div>

        <aside class="tarjeta resumen">
          <div class="cab"><h2>Tu cita</h2><span class="mono" style="font-size:12px;opacity:.7">BarberOS</span></div>
          <div class="perforado"></div>
          <div class="cuerpo" style="padding-top:6px">
            <div class="renglon"><span>Servicio</span><span>${esc(servicio.nombre)}</span></div>
            <div class="renglon"><span>Barbero</span><span>${esc(barbero.nombre)}</span></div>
            <div class="renglon"><span>Día</span><span>${fechaLarga(st.dia + "T12:00")}</span></div>
            <div class="renglon"><span>Hora</span><span>${st.inicio ? hora(st.inicio) : "—"}</span></div>
            <div class="renglon"><span>Precio</span><span class="dinero">${dinero(servicio.precio)}</span></div>
            ${extras.map((p) => `<div class="renglon"><span>${st.extras[p.id]} × ${esc(p.nombre)}</span><span class="dinero">${dinero(p.precio * st.extras[p.id])}</span></div>`).join("")}
            <div class="total"><span>Pagas ahora</span><b class="dinero">${dinero(aPagar)}</b></div>
            <p class="nota">${st.tipoPago === "anticipo"
              ? `En el local pagas ${dinero(servicio.precio - anticipo)}. Si no llegas, el anticipo no se devuelve.`
              : "Puedes cancelar hasta 2 horas antes."}</p>
            <button class="boton rojo ancho" data-accion="apartar" ${st.inicio ? "" : "disabled"}>${textoBoton}</button>
          </div>
        </aside>
      </div>

      <div class="barra-pago">
        <div>
          <div class="etq">${st.inicio ? `${esc(servicio.nombre)} · ${hora(st.inicio)}` : "Elige una hora"}</div>
          <b class="dinero">${dinero(aPagar)}</b>
        </div>
        <button class="boton rojo" data-accion="apartar" ${st.inicio ? "" : "disabled"}>${textoBoton}</button>
      </div>
      ${pintarMisCitas()}`;
  }

  // Las citas que vienen del cliente con sesión (UC-25).
  function pintarMisCitas() {
    const proximas = st.misCitas.filter((c) => ["confirmada", "apartada"].includes(c.estado) && new Date(c.fin) > new Date());
    if (proximas.length === 0) return "";
    const nombreServicio = (id) => st.cat.servicios.find((s) => s.id === id)?.nombre ?? id;
    const nombreBarbero = (id) => st.cat.barberos.find((b) => b.id === id)?.nombre ?? id;
    return `
      <div class="tarjeta mis-citas">
        <div class="cab"><h2>Mis citas</h2></div>
        <ul>
          ${proximas.map((c) => `
            <li>
              <div>
                <div class="cuando">${fechaLarga(c.inicio)}, ${hora(c.inicio)}</div>
                <div class="que">${esc(nombreServicio(c.servicioId))} con ${esc(nombreBarbero(c.barberoId))}</div>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                ${pildora(c.estado, c.estadoTexto)}
                <button class="boton claro chico" data-ver="${esc(c.id)}">Ver</button>
              </div>
            </li>`).join("")}
        </ul>
      </div>`;
  }

  async function apartar() {
    if (!sesion.usuario()) {
      // Primero la cuenta; al volver, todo sigue elegido.
      sessionStorage.setItem(BORRADOR, JSON.stringify({
        servicioId: st.servicio.id, barberoId: st.barbero.id, dia: st.dia, inicio: st.inicio, tipoPago: st.tipoPago, extras: st.extras,
      }));
      sessionStorage.setItem("barberos.volverA", "cliente");
      sessionStorage.setItem("barberos.modoEntrar", "registro");
      location.hash = "entrar";
      return;
    }
    const botones = raiz.querySelectorAll('[data-accion="apartar"]');
    botones.forEach((b) => (b.disabled = true));
    try {
      const r = await api("/api/citas", {
        method: "POST",
        body: {
          barberoId: st.barbero.id,
          servicioId: st.servicio.id,
          inicio: st.inicio,
          tipoPago: st.tipoPago,
          productos: Object.entries(st.extras).map(([productoId, cantidad]) => ({ productoId, cantidad })),
        },
      });
      st.extras = {};
      almacen.guardar("barberos.miCita", r.cita.id);
      almacen.guardar("barberos.urlPago", r.urlPago);
      // Lo que se paga puede incluir productos: se guarda para el botón "Ir a pagar".
      almacen.guardar("barberos.pagoCita", { citaId: r.cita.id, monto: r.montoAPagar, productos: r.pedido?.renglones ?? [] });
      pintarEstado(r.cita);
    } catch (err) {
      avisar(err.message, "error");
      botones.forEach((b) => (b.disabled = false));
      if (/horario/.test(err.message)) {
        // E2: rechazo claro y al menos tres horarios cercanos con el mismo barbero.
        const pedida = new Date(st.inicio).getTime();
        await cargarHorarios();
        const cerca = st.horarios
          .filter((h) => h.libre)
          .sort((x, y) => Math.abs(new Date(x.inicio) - pedida) - Math.abs(new Date(y.inicio) - pedida))
          .slice(0, 3)
          .sort((x, y) => new Date(x.inicio) - new Date(y.inicio));
        if (cerca.length) avisar(`Ese horario se acaba de ocupar. Libres cerca: ${cerca.map((h) => h.hora).join(", ")}`, "error");
      }
      if (/suficientes/.test(err.message)) catalogo({ forzar: true }).then((c) => ((st.cat = c), pintarFormulario()));
      if (err.estado === 401) location.hash = "entrar";
    }
  }

  function pintarEstado(cita) {
    window.scrollTo({ top: 0 });
    clearInterval(temporizador);
    clearInterval(sondeo);
    const cat = st.cat ?? almacen.leer("barberos.catalogo", { servicios: [], barberos: [] });
    const pago = almacen.leer("barberos.pagoCita", null);
    const conProductos = pago && pago.citaId === cita.id ? pago : { monto: cita.montoEnLinea, productos: [] };
    const servicio = cat.servicios.find((s) => s.id === cita.servicioId);
    const barbero = cat.barberos.find((b) => b.id === cita.barberoId);
    const detalle = `
      <div class="detalle">
        <div class="renglon"><span>Servicio</span><span>${esc(servicio?.nombre ?? cita.servicioId)}</span></div>
        <div class="renglon"><span>Barbero</span><span>${esc(barbero?.nombre ?? cita.barberoId)}</span></div>
        <div class="renglon"><span>Cuándo</span><span>${fechaLarga(cita.inicio)}, ${hora(cita.inicio)}</span></div>
        <div class="renglon"><span>${cita.estado === "confirmada" ? "Pagaste" : "Por pagar"}</span><span class="dinero">${dinero(cita.estado === "confirmada" ? cita.pagadoEnLinea : cita.montoEnLinea)}</span></div>
        <div class="renglon"><span>En el local</span><span class="dinero">${dinero(cita.estado === "confirmada" ? cita.saldoPendiente : cita.precio - cita.montoEnLinea)}</span></div>
        ${conProductos.productos.map((r) => `<div class="renglon"><span>${r.cantidad} × ${esc(r.nombre)}</span><span class="dinero">${dinero(r.precio * r.cantidad)}</span></div>`).join("")}
      </div>`;

    if (cita.estado === "apartada") {
      raiz.innerHTML = `
        <div class="tarjeta estado-cita"><div class="cuerpo">
          <div class="eyebrow">Horario apartado</div>
          <h1 style="font-size:28px">Termina tu pago antes de que se libere</h1>
          <div class="reloj" id="c-reloj">10:00</div>
          <div style="color:var(--tinta-3);font-size:14px">minutos restantes</div>
          ${detalle}
          <a class="boton rojo ancho" href="${esc(almacen.leer("barberos.urlPago", "#"))}">Ir a pagar ${dinero(conProductos.monto)}</a>
          <div class="tarjetas-aceptadas"><img src="/img/pagos/tarjetas.webp" alt="Mastercard, Visa y American Express"></div>
          <p class="nota">Pagas con tarjeta o saldo en Mercado Pago. Al terminar regresas aquí solo.</p>
          <div class="esperando">Esperando la confirmación del pago…</div>
          <p><button class="boton claro chico" id="c-soltar">Soltar el horario</button></p>
        </div></div>`;
      const fin = new Date(cita.apartadoVenceEn).getTime();
      const tic = () => {
        const s = Math.max(0, Math.round((fin - Date.now()) / 1000));
        const el = raiz.querySelector("#c-reloj");
        if (!el) return;
        el.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
        el.classList.toggle("urgente", s < 120);
        if (s === 0) {
          clearInterval(temporizador);
          avisar("Se acabó el tiempo y el horario se liberó. Elige otro.", "error");
          almacen.guardar("barberos.miCita", null);
          iniciar();
        }
      };
      tic();
      temporizador = setInterval(tic, 1000);
      sondeo = setInterval(async () => {
        const c = await api(`/api/citas/${cita.id}`).catch(() => null);
        if (c && c.estado !== "apartada") {
          if (c.estado === "confirmada") avisar("¡Pago recibido! Tu cita está confirmada.", "ok");
          if (c.estado === "cancelada") avisar(c.motivoCancelacion ?? "La cita se canceló", "error");
          c.estado === "confirmada" ? pintarEstado(c) : (almacen.guardar("barberos.miCita", null), iniciar());
        }
      }, 2000);
      raiz.querySelector("#c-soltar").onclick = () => cancelar(cita.id);
      return;
    }

    raiz.innerHTML = `
      <div class="tarjeta estado-cita"><div class="cuerpo">
        <div class="sello"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
        <div class="eyebrow" style="color:var(--verde)">Cita confirmada</div>
        <h1 style="font-size:30px">Nos vemos, ${esc(cita.cliente.nombre.split(" ")[0])}</h1>
        <p style="color:var(--tinta-2)">Te mandamos la confirmación a <b>${esc(cita.cliente.correo)}</b>.</p>
        ${detalle}
        <div style="display:grid;gap:10px">
          <button class="boton ancho" id="c-otra">Agendar otra cita</button>
          <button class="boton claro" id="c-cambiar">Cambiar la hora</button>
          <button class="boton claro" id="c-cancelar">Cancelar cita</button>
        </div>
        <p style="font-size:13px;color:var(--tinta-3);margin-bottom:0">Se puede cambiar o cancelar hasta 2 horas antes. Si cancelas a tiempo, te devolvemos lo que pagaste.</p>
      </div></div>`;
    raiz.querySelector("#c-otra").onclick = () => {
      almacen.guardar("barberos.miCita", null);
      iniciar();
    };
    raiz.querySelector("#c-cancelar").onclick = () => cancelar(cita.id);
    raiz.querySelector("#c-cambiar").onclick = () => cambiarHora(cita);
  }

  // UC-03 "Cambiar cita": mismo barbero y servicio, otra hora libre (hasta 2 horas antes).
  async function cambiarHora(cita) {
    const dlg = document.getElementById("dialogo");
    const dias = proximosDias().map(diaLocal);
    let dia = dias.includes(cita.dia) ? cita.dia : dias[0];
    let elegido = null;
    async function pintarDlg() {
      const horas = await api(`/api/disponibilidad?barberoId=${cita.barberoId}&servicioId=${cita.servicioId}&dia=${dia}`).catch(() => []);
      dlg.innerHTML = `
        <div class="cab"><h2>Cambiar la hora</h2><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></div>
        <div class="cuerpo">
          <div class="opciones dias">${dias.map((k) => `<button class="opcion dia" data-d="${k}" aria-pressed="${k === dia}"><span class="nombre">${new Date(k + "T12:00").getDate()}</span><span class="sub">${new Date(k + "T12:00").toLocaleDateString("es-MX", { weekday: "short" })}</span></button>`).join("")}</div>
          <div class="opciones horas" style="margin-top:14px">${horas.map((h) => `<button class="opcion hora" data-h="${h.inicio}" ${h.libre ? "" : "disabled"} aria-pressed="${h.inicio === elegido}">${h.hora}</button>`).join("") || '<p class="vacio">Sin horarios este día.</p>'}</div>
        </div>
        <div class="pie"><button class="boton rojo ancho" data-guardar ${elegido ? "" : "disabled"}>Cambiar a esa hora</button></div>`;
    }
    dlg.onclick = async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-cerrar")) return dlg.close();
      if (b.dataset.d) { dia = b.dataset.d; elegido = null; return pintarDlg(); }
      if (b.dataset.h) { elegido = b.dataset.h; return pintarDlg(); }
      if (b.hasAttribute("data-guardar")) {
        try {
          const c = await api(`/api/citas/${cita.id}/reagendar`, { method: "POST", body: { inicio: elegido } });
          dlg.close();
          avisar("Listo, cambiamos tu cita. Te mandamos un correo.", "ok");
          pintarEstado(c);
        } catch (err) {
          avisar(err.message, "error");
        }
      }
    };
    await pintarDlg();
    dlg.showModal();
  }

  async function cancelar(id) {
    try {
      await api(`/api/citas/${id}/cancelar`, { method: "POST" });
      avisar("Cita cancelada. Te avisamos por correo.", "ok");
      almacen.guardar("barberos.miCita", null);
      clearInterval(temporizador);
      clearInterval(sondeo);
      iniciar();
    } catch (err) {
      avisar(err.message, "error");
    }
  }

  raiz.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b || !raiz.contains(b)) return;
    if (b.dataset.servicio) {
      st.servicio = st.cat.servicios.find((s) => s.id === b.dataset.servicio);
      cargarHorarios();
    } else if (b.dataset.barbero) {
      st.barbero = st.cat.barberos.find((x) => x.id === b.dataset.barbero);
      cargarHorarios();
    } else if (b.dataset.dia) {
      st.dia = b.dataset.dia;
      cargarHorarios();
    } else if (b.dataset.inicio) {
      st.inicio = b.dataset.inicio;
      guardarCamposYRepintar();
    } else if (b.dataset.pago) {
      st.tipoPago = b.dataset.pago;
      guardarCamposYRepintar();
    } else if (b.dataset.extraMas || b.dataset.extraMenos) {
      const id = b.dataset.extraMas ?? b.dataset.extraMenos;
      const n = (st.extras[id] ?? 0) + (b.dataset.extraMas ? 1 : -1);
      if (n > 0) st.extras[id] = Math.min(5, n);
      else delete st.extras[id];
      guardarCamposYRepintar();
    } else if (b.dataset.accion === "apartar") {
      apartar();
    } else if (b.dataset.ver) {
      api(`/api/citas/${b.dataset.ver}`).then((c) => {
        almacen.guardar("barberos.miCita", c.id);
        pintarEstado(c);
      }).catch((err) => avisar(err.message, "error"));
    }
  };

  function guardarCamposYRepintar() {
    pintarFormulario();
  }

  iniciar().catch((err) => avisar(err.message, "error"));
  return () => {
    clearInterval(temporizador);
    clearInterval(sondeo);
    raiz.onclick = null;
  };
}
