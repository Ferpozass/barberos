import { api, avisar, almacen, catalogo, dinero, diaLocal, esc, hora, iniciales, pildora, sesion } from "./comun.js";

// Vista del barbero: su agenda del día y el cobro en el local, con o sin internet.
// Cada venta nace con un id generado AQUÍ (crypto.randomUUID) y se guarda en una cola local;
// cuando hay conexión se manda la cola y el servidor ignora las que ya tenía (ADR-001).
const COLA = "barberos.colaVentas";
const SIN_RED = "barberos.sinInternet";
const ESTE_BARBERO = "barberos.barberoActual";

export const colaDeVentas = () => almacen.leer(COLA, []);

export function montarBarbero(raiz) {
  // El barbero con sesión queda fijo en SU silla; el admin puede ver la de cualquiera.
  const u = sesion.usuario();
  const esBarbero = u?.rol === "barbero";
  const st = { cat: null, barberoId: esBarbero ? u.barberoId : almacen.leer(ESTE_BARBERO, null), dia: diaLocal(), agenda: [], miComision: null };
  const sinInternet = () => almacen.leer(SIN_RED, false) || !navigator.onLine;

  async function iniciar() {
    st.cat = await catalogo();
    st.barberoId ??= st.cat.barberos[0].id;
    await cargarAgenda();
    subirCola();
  }

  async function cargarAgenda() {
    const llave = `barberos.agenda.${st.barberoId}.${st.dia}`;
    if (sinInternet()) {
      st.agenda = almacen.leer(llave, []);
    } else {
      try {
        st.agenda = await api(`/api/agenda?barberoId=${st.barberoId}&dia=${st.dia}`);
        almacen.guardar(llave, st.agenda);
        // UC-12: el barbero ve cuánto lleva de comisión hoy (solo la suya, regla 24).
        if (esBarbero) st.miComision = await api(`/api/mi-comision?dia=${st.dia}`).catch(() => null);
      } catch {
        st.agenda = almacen.leer(llave, []);
      }
    }
    pintar();
  }

  function pintar() {
    const cola = colaDeVentas();
    const barbero = st.cat.barberos.find((b) => b.id === st.barberoId);
    const servicio = (id) => st.cat.servicios.find((s) => s.id === id)?.nombre ?? id;
    const offline = sinInternet();
    const cobradas = new Set(cola.map((v) => v.citaId).filter(Boolean));
    const activas = st.agenda.filter((c) => c.estado !== "cancelada");
    const pendientes = activas.filter((c) => c.estado === "confirmada" && !cobradas.has(c.id));
    const porCobrar = pendientes.reduce((s, c) => s + c.saldoPendiente, 0);
    const misVentasHoy = cola.filter((v) => v.barberoId === st.barberoId);

    raiz.innerHTML = `
      <div class="encabezado">
        <div>
          <div class="eyebrow">Mi día</div>
          <h1>Hola, ${esc(barbero.nombre)}</h1>
          <p>Tus citas de ${new Date(st.dia + "T12:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}. Cobra aunque se caiga el internet: las ventas se suben solas cuando vuelve.</p>
        </div>
        <div class="controles">
          ${esBarbero ? "" : `<div class="segmentado" role="group" aria-label="Barbero">
            ${st.cat.barberos.map((b) => `<button data-barbero="${esc(b.id)}" aria-pressed="${b.id === st.barberoId}">${esc(b.nombre)}</button>`).join("")}
          </div>`}
          <input type="date" id="b-dia" value="${st.dia}" class="campo" style="border:1px solid var(--linea);border-radius:10px;padding:7px 10px;background:var(--papel)">
        </div>
      </div>

      <div class="controles" style="margin-bottom:16px">
        <span class="conexion">
          <button class="interruptor" id="b-red" role="switch" aria-checked="${!offline}" aria-label="Simular internet"></button>
          ${!navigator.onLine ? "Sin internet" : offline ? "Sin internet (simulado)" : "Con internet"}
        </span>
        <span class="cola ${cola.length ? "" : "vacia"}">${cola.length ? `${cola.length} ${cola.length === 1 ? "venta" : "ventas"} sin subir` : "Todo subido"}</span>
        ${cola.length && !offline ? `<button class="boton claro chico" id="b-subir">Subir ahora</button>` : ""}
        <button class="boton chico" id="b-mostrador" style="margin-left:auto">Venta de mostrador</button>
      </div>

      ${offline ? `<div class="franja-offline"><b>●</b> Sin conexión. Sigues cobrando: cada venta queda guardada en este celular con su propio id y se sube sola cuando regrese la señal.</div>` : ""}

      <div class="dia-barbero">
        <div class="tarjeta">
          <div class="cab"><h2>Agenda</h2><span style="color:var(--tinta-3);font-size:14px">${activas.length} ${activas.length === 1 ? "cita" : "citas"}</span></div>
          ${st.agenda.length === 0
            ? `<p class="vacio">No hay citas este día.</p>`
            : `<ul class="agenda">
                ${st.agenda.map((c) => {
                  const enCola = cobradas.has(c.id);
                  const estado = enCola ? "atendida" : c.estado;
                  const texto = enCola ? "Cobrada · sin subir" : c.estadoTexto;
                  const yaEmpezo = new Date(c.inicio) <= new Date();
                  return `<li class="${esc(c.estado)}">
                    <div class="hora">${hora(c.inicio)}<small>${c.duracionMin} min</small></div>
                    <div>
                      <div class="quien">${esc(c.cliente.nombre)}</div>
                      <div class="que">${esc(servicio(c.servicioId))}${c.estado !== "confirmada" ? "" : c.saldoPendiente > 0 ? ` · cobrar <b>${dinero(c.saldoPendiente)}</b>` : " · ya pagó todo"}</div>
                    </div>
                    <div class="acciones">
                      ${pildora(estado, texto)}
                      ${c.estado === "confirmada" && !enCola ? `<button class="boton chico rojo" data-cobrar="${esc(c.id)}">Cobrar</button>` : ""}
                      ${c.estado === "confirmada" && !enCola && yaEmpezo && !offline ? `<button class="boton chico claro" data-nollego="${esc(c.id)}">No llegó</button>` : ""}
                    </div>
                  </li>`;
                }).join("")}
              </ul>`}
        </div>
        <div class="mini-kpi">
          <div class="tarjeta"><div class="etq">Por cobrar en el local</div><div class="val dinero">${dinero(porCobrar)}</div><div class="etq" style="font-weight:500">${pendientes.length} ${pendientes.length === 1 ? "cita pendiente" : "citas pendientes"}</div></div>
          <div class="tarjeta"><div class="etq">Ventas en este celular sin subir</div><div class="val">${misVentasHoy.length}</div></div>
          ${st.miComision
            ? `<div class="tarjeta"><div class="etq">Mi comisión de hoy</div><div class="val dinero">${dinero(st.miComision.comision)}</div><div class="etq" style="font-weight:500">${Math.round(barbero.porcentajeComision * 100)} % de ${dinero(st.miComision.cobrado)} cobrados (ya subidos)</div></div>`
            : `<div class="tarjeta"><div class="etq">Comisión</div><div class="val">${Math.round(barbero.porcentajeComision * 100)} %</div><div class="etq" style="font-weight:500">de lo que cobras (servicios y productos)</div></div>`}
        </div>
      </div>`;
  }

  // ---------- cobrar ----------
  function abrirCobro(cita) {
    const dlg = document.getElementById("dialogo");
    const st2 = { cantidades: {}, metodo: "efectivo" };
    const productos = st.cat.productos;

    const renglones = () => [
      ...(cita && cita.saldoPendiente > 0
        ? [{ tipo: "servicio", productoId: null, concepto: `Saldo: ${st.cat.servicios.find((s) => s.id === cita.servicioId)?.nombre ?? "servicio"}`, cantidad: 1, precioUnitario: cita.saldoPendiente }]
        : []),
      ...productos
        .filter((p) => st2.cantidades[p.id] > 0)
        .map((p) => ({ tipo: "producto", productoId: p.id, concepto: p.nombre, cantidad: st2.cantidades[p.id], precioUnitario: p.precio })),
    ];
    const total = () => renglones().reduce((s, r) => s + r.cantidad * r.precioUnitario, 0);

    function pintarDialogo() {
      dlg.innerHTML = `
        <div class="cab"><h2>${cita ? `Cobrar a ${esc(cita.cliente.nombre)}` : "Venta de mostrador"}</h2><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></div>
        <div class="cuerpo">
          ${cita
            ? cita.saldoPendiente > 0
              ? `<div class="linea-saldo"><span>Resto del servicio (pagó ${dinero(cita.pagadoEnLinea)} en línea)</span><span class="dinero">${dinero(cita.saldoPendiente)}</span></div>`
              : `<div class="linea-saldo"><span>El servicio ya está pagado en línea</span><span>✓</span></div>`
            : ""}
          <div style="font-weight:700;margin:12px 0 4px">Agregar productos</div>
          ${productos.map((p) => {
            const n = st2.cantidades[p.id] ?? 0;
            return `<div class="producto">
              <div><div style="font-weight:600">${esc(p.nombre)}</div><div class="sub">${dinero(p.precio)} · quedan ${p.existencia}</div></div>
              <div class="contador">
                <button data-menos="${esc(p.id)}" ${n === 0 ? "disabled" : ""} aria-label="Quitar">−</button>
                <span>${n}</span>
                <button data-mas="${esc(p.id)}" ${n >= p.existencia ? "disabled" : ""} aria-label="Agregar">+</button>
              </div>
            </div>`;
          }).join("")}
        </div>
        <div class="pie">
          <div class="segmentado" role="group" aria-label="Método de pago" style="justify-self:start">
            <button data-metodo="efectivo" aria-pressed="${st2.metodo === "efectivo"}">Efectivo</button>
            <button data-metodo="tarjeta" aria-pressed="${st2.metodo === "tarjeta"}">Tarjeta (terminal)</button>
          </div>
          <div class="total-cobro"><span>Total a cobrar</span><b class="dinero">${dinero(total())}</b></div>
          <button class="boton rojo ancho" data-confirmar ${renglones().length === 0 && !cita ? "disabled" : ""}>Cobrar e imprimir ticket</button>
        </div>`;
    }

    dlg.onclick = (e) => {
      const b = e.target.closest("button");
      if (e.target === dlg || (b && "cerrar" in b.dataset)) return dlg.close();
      if (!b) return;
      if (b.dataset.mas) st2.cantidades[b.dataset.mas] = (st2.cantidades[b.dataset.mas] ?? 0) + 1;
      if (b.dataset.menos) st2.cantidades[b.dataset.menos] = Math.max(0, (st2.cantidades[b.dataset.menos] ?? 0) - 1);
      if (b.dataset.metodo) st2.metodo = b.dataset.metodo;
      if ("confirmar" in b.dataset) {
        const venta = {
          id: crypto.randomUUID(), // id generado en el celular (RN-09)
          barberoId: st.barberoId,
          citaId: cita?.id ?? null,
          metodo: st2.metodo,
          creadaEn: new Date().toISOString(),
          renglones: renglones(),
        };
        // Se descuenta en la copia local del catálogo para que el mostrador no ofrezca lo que ya no hay.
        for (const r of venta.renglones) {
          const p = productos.find((x) => x.id === r.productoId);
          if (p) p.existencia -= r.cantidad;
        }
        almacen.guardar("barberos.catalogo", st.cat);
        almacen.guardar(COLA, [...colaDeVentas(), venta]);
        mostrarTicket(venta);
        pintar();
        subirCola();
        return;
      }
      pintarDialogo();
    };
    pintarDialogo();
    dlg.showModal();
  }

  function mostrarTicket(venta) {
    const dlg = document.getElementById("dialogo");
    const barbero = st.cat.barberos.find((b) => b.id === venta.barberoId);
    const total = venta.renglones.reduce((s, r) => s + r.cantidad * r.precioUnitario, 0);
    dlg.innerHTML = `
      <div class="cab"><h2>Ticket</h2><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></div>
      <div class="cuerpo">
        <div class="ticket">
          <div class="centro"><b>BARBERÍA · BarberOS</b><br>${new Date(venta.creadaEn).toLocaleString("es-MX")}</div>
          <hr>
          ${venta.renglones.map((r) => `<div class="fila"><span>${r.cantidad} × ${esc(r.concepto)}</span><span>${dinero(r.cantidad * r.precioUnitario)}</span></div>`).join("") || `<div>Servicio pagado en línea</div>`}
          <hr>
          <div class="fila"><b>TOTAL</b><b>${dinero(total)}</b></div>
          <div class="fila"><span>Pago</span><span>${venta.metodo}</span></div>
          <div class="fila"><span>Atendió</span><span>${esc(barbero?.nombre)}</span></div>
          <hr>
          <div class="centro" style="font-size:11px">Folio ${venta.id.slice(0, 8).toUpperCase()}<br>${sinInternet() ? "Guardada en el celular · se sube al volver la señal" : "Enviando al servidor…"}</div>
        </div>
      </div>
      <div class="pie"><button class="boton ancho" data-cerrar>Listo</button></div>`;
    dlg.onclick = (e) => {
      const b = e.target.closest("button");
      if (e.target === dlg || (b && "cerrar" in b.dataset)) dlg.close();
    };
    if (!dlg.open) dlg.showModal();
  }

  // ---------- subir la cola ----------
  let subiendo = false;
  async function subirCola() {
    const cola = colaDeVentas();
    if (subiendo || cola.length === 0 || sinInternet()) return;
    subiendo = true;
    try {
      const { resultados } = await api("/api/ventas/sincronizar", { method: "POST", body: { ventas: cola } });
      const respondidas = new Set(resultados.map((r) => r.ventaId));
      for (const r of resultados) {
        if (r.resultado === "rechazada") avisar(`Venta rechazada: ${r.motivo}`, "error");
        for (const a of r.avisos) avisar(a);
      }
      // Solo salen de la cola las que el servidor contestó; si la conexión se cortó a medias,
      // se reintentan completas y el servidor ignora las que ya tenía (no se duplican).
      almacen.guardar(COLA, colaDeVentas().filter((v) => !respondidas.has(v.id)));
      const guardadas = resultados.filter((r) => r.resultado === "guardada").length;
      if (guardadas) avisar(guardadas === 1 ? "1 venta subida al servidor" : `${guardadas} ventas subidas al servidor`, "ok");
      await catalogo({ forzar: true });
      st.cat = await catalogo();
      await cargarAgenda();
    } catch {
      // sin conexión real: se reintenta en la siguiente vuelta
    } finally {
      subiendo = false;
    }
  }
  const reintento = setInterval(subirCola, 5000);
  // Si la red se cae o regresa DE VERDAD (no solo el interruptor), la pantalla lo dice y la cola se sube sola.
  const alCambiarRed = () => {
    avisar(navigator.onLine ? "Volvió la conexión: subiendo ventas…" : "Se fue el internet: sigues cobrando y las ventas se guardan aquí");
    pintar();
    subirCola();
  };
  addEventListener("online", alCambiarRed);
  addEventListener("offline", alCambiarRed);

  raiz.onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.barbero) {
      st.barberoId = b.dataset.barbero;
      almacen.guardar(ESTE_BARBERO, st.barberoId);
      cargarAgenda();
    } else if (b.id === "b-red") {
      almacen.guardar(SIN_RED, !almacen.leer(SIN_RED, false));
      avisar(sinInternet() ? "Modo sin internet: las ventas se quedan en el celular" : "Volvió la conexión: subiendo ventas…");
      await cargarAgenda();
      subirCola();
    } else if (b.id === "b-subir") {
      subirCola();
    } else if (b.id === "b-mostrador") {
      abrirCobro(null);
    } else if (b.dataset.cobrar) {
      abrirCobro(st.agenda.find((c) => c.id === b.dataset.cobrar));
    } else if (b.dataset.nollego) {
      try {
        await api(`/api/citas/${b.dataset.nollego}/no-llego`, { method: "POST" });
        avisar("Marcada como no llegó: el anticipo no se devuelve");
        cargarAgenda();
      } catch (err) {
        avisar(err.message, "error");
      }
    }
  };
  raiz.onchange = (e) => {
    if (e.target.id === "b-dia" && e.target.value) {
      st.dia = e.target.value;
      cargarAgenda();
    }
  };

  iniciar().catch((err) => avisar(err.message, "error"));
  return () => {
    clearInterval(reintento);
    removeEventListener("online", alCambiarRed);
    removeEventListener("offline", alCambiarRed);
    raiz.onclick = null;
    raiz.onchange = null;
  };
}
