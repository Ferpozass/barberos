import { api, avisar, dinero, diaLocal, esc, hora } from "./comun.js";

// Vista del administrador: corte de caja del día, comisiones y buzón de correos (demo).
export function montarAdmin(raiz) {
  const st = { dia: diaLocal(), corte: null, correos: [] };

  async function cargar() {
    [st.corte, st.correos] = await Promise.all([api(`/api/corte?dia=${st.dia}`), api("/api/demo/correos")]);
    pintar();
  }

  function pintar() {
    const c = st.corte;
    const maxCobrado = Math.max(1, ...c.comisiones.map((x) => x.cobrado));
    raiz.innerHTML = `
      <div class="encabezado">
        <div>
          <div class="eyebrow">Administración</div>
          <h1>Corte de caja</h1>
          <p>Efectivo, tarjeta y pagos en línea del día, y la comisión de cada barbero. No se cierra si alguna venta sigue sin subir.</p>
        </div>
        <div class="controles">
          <input type="date" id="a-dia" value="${st.dia}" style="border:1px solid var(--linea);border-radius:10px;padding:9px 10px;background:var(--papel)">
          <button class="boton claro" id="a-conciliar">Conciliar pagos</button>
        </div>
      </div>

      <div class="kpis">
        <div class="tarjeta kpi"><div class="etq"><i style="background:var(--verde)"></i>Efectivo</div><div class="val">${dinero(c.efectivo)}</div></div>
        <div class="tarjeta kpi"><div class="etq"><i style="background:var(--azul)"></i>Tarjeta</div><div class="val">${dinero(c.tarjeta)}</div></div>
        <div class="tarjeta kpi"><div class="etq"><i style="background:var(--ambar)"></i>En línea</div><div class="val">${dinero(c.enLinea + (c.tiendaEnLinea ?? 0))}</div>${c.tiendaEnLinea ? `<div class="etq" style="font-weight:500">${dinero(c.tiendaEnLinea)} de la tienda</div>` : ""}</div>
        <div class="tarjeta kpi total"><div class="etq">Total del día</div><div class="val">${dinero(c.total)}</div><div class="etq" style="font-weight:500;color:inherit;opacity:.75">Servicios ${dinero(c.servicios ?? 0)} · Productos ${dinero(c.productos ?? 0)}</div></div>
      </div>

      <div class="admin">
        <div class="columna">
          <div class="tarjeta">
            <div class="cab">
              <h2>Cierre del ${new Date(st.dia + "T12:00").toLocaleDateString("es-MX", { day: "numeric", month: "long" })}</h2>
              ${c.cerrado ? `<span class="pildora e-atendida">Cerrado ${hora(c.cerradoEn)}</span>` : `<span class="pildora e-apartada">Abierto</span>`}
            </div>
            <div class="cuerpo">
              ${c.cerrado
                ? `<div class="listo">✓ Este corte ya está cerrado y guardado.${c.efectivoContado !== null && c.efectivoContado !== undefined
                    ? ` Se contaron ${dinero(c.efectivoContado)} en efectivo: ${c.diferencia === 0 ? "cuadra al peso." : `${c.diferencia > 0 ? "sobran" : "faltan"} ${dinero(Math.abs(c.diferencia))}.`}` : ""}</div>`
                : c.citasSinCobrar.length
                  ? `<div class="bloqueo"><span style="font-size:18px">⚠</span><div><b>No se puede cerrar todavía.</b> Estas citas pagadas no tienen cobro registrado: o falta cobrarlas, o su venta sigue en el celular del barbero sin subir.
                      <ul>${c.citasSinCobrar.map((x) => `<li>${hora(x.inicio)} · ${esc(x.cliente)} · ${esc(nombreBarbero(x.barberoId))}</li>`).join("")}</ul></div></div>`
                  : `<div class="listo">✓ Todas las citas tienen su cobro. El corte se puede cerrar.</div>`}
              ${c.cerrado ? "" : `
                <div class="campo contado"><label for="a-contado">Efectivo contado en caja (esperado ${dinero(c.efectivo)})</label>
                  <input id="a-contado" type="number" min="0" step="0.5" inputmode="decimal" placeholder="${c.efectivo}" value="${st.contado ?? ""}"></div>
                <div id="a-diferencia" class="nota">${textoDiferencia(c)}</div>
                <button class="boton ancho ${c.puedeCerrarse ? "rojo" : ""}" id="a-cerrar" ${c.puedeCerrarse ? "" : "disabled"}>Cerrar corte del día</button>`}
            </div>
          </div>

          <div class="tarjeta">
            <div class="cab"><h2>Comisiones</h2></div>
            <table>
              <thead><tr><th>Barbero</th><th class="num">Cobró</th><th class="num">Comisión</th></tr></thead>
              <tbody>
                ${c.comisiones.map((x) => `
                  <tr>
                    <td><b>${esc(x.nombre)}</b><div class="barra-com"><i style="width:${(x.cobrado / maxCobrado) * 100}%"></i></div></td>
                    <td class="num">${dinero(x.cobrado)}</td>
                    <td class="num"><b>${dinero(x.comision)}</b></td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="tarjeta">
          <div class="cab"><h2>Correos enviados</h2><span class="etiqueta-demo">demo</span></div>
          <div class="buzon">
            ${st.correos.length === 0
              ? `<p class="vacio">Aún no se ha mandado ningún correo.</p>`
              : st.correos.map((m) => `
                <div class="correo">
                  <div class="asunto">${esc(m.asunto)}</div>
                  <div class="meta">Para ${esc(m.para)} · ${new Date(m.enviado_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</div>
                  <p>${esc(m.cuerpo)}</p>
                </div>`).join("")}
          </div>
        </div>
      </div>`;
  }

  let barberos = [];
  const nombreBarbero = (id) => barberos.find((b) => b.id === id)?.nombre ?? id;

  raiz.onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    try {
      if (b.id === "a-cerrar") {
        const contado = raiz.querySelector("#a-contado")?.value;
        const body = { dia: st.dia, ...(contado !== "" && contado !== undefined ? { efectivoContado: Number(contado) } : {}) };
        st.corte = await api("/api/corte/cerrar", { method: "POST", body });
        avisar("Corte cerrado", "ok");
        pintar();
      } else if (b.id === "a-conciliar") {
        const r = await api("/api/pagos/conciliar", { method: "POST" });
        avisar(r.confirmadas ? `${r.confirmadas === 1 ? "Se encontró 1 pago" : `Se encontraron ${r.confirmadas} pagos`} sin aviso y ya quedó confirmado` : r.revisadas ? `Revisé ${r.revisadas} ${r.revisadas === 1 ? "cobro abierto" : "cobros abiertos"}: todavía no se pagan` : "No hay cobros pendientes por revisar", r.confirmadas ? "ok" : "");
        cargar();
      }
    } catch (err) {
      avisar(err.message, "error");
    }
  };
  // F5: mientras escribe lo que contó, se ve si cuadra. Se guarda en st para que el refresco no lo borre.
  function textoDiferencia(c) {
    if (st.contado === undefined || st.contado === "") return "";
    const d = Math.round((Number(st.contado) - c.efectivo) * 100) / 100;
    return d === 0 ? "✓ Cuadra al peso." : `⚠ ${d > 0 ? "Sobran" : "Faltan"} ${dinero(Math.abs(d))} contra lo esperado.`;
  }
  raiz.oninput = (e) => {
    if (e.target.id !== "a-contado") return;
    st.contado = e.target.value;
    raiz.querySelector("#a-diferencia").textContent = textoDiferencia(st.corte);
  };
  raiz.onchange = (e) => {
    if (e.target.id === "a-dia" && e.target.value) {
      st.dia = e.target.value;
      cargar();
    }
  };

  api("/api/catalogo")
    .then((c) => (barberos = c.barberos))
    .then(cargar)
    .catch((err) => avisar(err.message, "error"));
  // Se refresca solo, salvo cuando el administrador está escribiendo (no se le borra lo que teclea).
  const refresco = setInterval(() => {
    if (document.activeElement?.tagName === "INPUT" && raiz.contains(document.activeElement)) return;
    cargar().catch(() => {});
  }, 8000);
  return () => {
    clearInterval(refresco);
    raiz.onclick = null;
    raiz.onchange = null;
    raiz.oninput = null;
  };
}
