import { catalogo, dinero, esc, esqueleto, revelar } from "./comun.js";
import { foto, info, recomendados } from "./productos.js";

// Página de inicio de la barbería (ficticia). Los servicios y precios salen del mismo
// catálogo que usa la agenda, así que si cambia un precio aquí también cambia.
const BORRADOR = "barberos.borrador"; // lo lee la vista del cliente para llegar con algo ya elegido

const BARBEROS = {
  "barbero-1": { foto: "tono", puesto: "Fundador · 20 años con la navaja", frase: "Afeitado clásico y cortes de toda la vida." },
  "barbero-2": { foto: "memo", puesto: "Fades y diseños", frase: "Degradados limpios y barba bien perfilada." },
  "barbero-3": { foto: "rafa", puesto: "Cortes modernos", frase: "Rizos, texturas y lo que viste en Instagram." },
};
const DESCRIPCIONES = {
  corte: "Lavado, corte a tijera o máquina y peinado con producto.",
  "corte-barba": "El combo completo: corte, perfilado de barba y toalla caliente.",
  barba: "Perfilado con navaja, toalla caliente y aceite para barba.",
  infantil: "Para los de menos de 12 años, con paciencia incluida.",
};

export function montarInicio(raiz) {
  raiz.innerHTML = `
    <div class="landing">
      <section class="portada">
        <img src="/img/local.webp" alt="Interior de la barbería con sillones vintage y pared de ladrillo" fetchpriority="high">
        <div class="portada-texto">
          <div class="eyebrow">Barbería de barrio · Querétaro</div>
          <h1>La Esquina<span>.</span></h1>
          <p>Cortes, barba y afeitado clásico con navaja. Aparta tu hora en línea, paga el anticipo con Mercado Pago y llega directo a la silla.</p>
          <div class="acciones">
            <a class="boton rojo" href="#cliente">Agendar mi cita</a>
            <a class="boton fantasma" href="#servicios-inicio">Ver servicios</a>
          </div>
          <ul class="datos-rapidos">
            <li><b>3</b> barberos</li>
            <li><b>10 min</b> para pagar tu apartado</li>
            <li><b>Lun–Sáb</b> 10:00 a 20:00</li>
          </ul>
        </div>
      </section>

      <section class="bloque" id="servicios-inicio" data-revelar>
        <div class="bloque-cab">
          <div class="eyebrow">Servicios</div>
          <h2>Lo que hacemos, sin rodeos</h2>
          <p>Precios finales. Al agendar pagas el 40% de anticipo y el resto en la barbería, o todo de una vez.</p>
        </div>
        <div class="servicios-inicio" id="lista-servicios">${esqueleto(4, "renglon-esq")}</div>
      </section>

      <section class="bloque historia" data-revelar>
        <figure class="historia-foto"><img src="/img/navaja.webp" alt="Barbero afeitando con navaja a un cliente" loading="lazy"></figure>
        <div class="historia-texto">
          <div class="eyebrow">La casa</div>
          <h2>Navaja, toalla caliente y plática de barrio</h2>
          <p>La Esquina abrió hace años en una cochera con una sola silla. Hoy son tres, pero la idea es la misma: que salgas bien arreglado y sin esperar parado en la banqueta.</p>
          <p>Por eso todo se agenda en línea. Eliges barbero y hora, se te aparta el lugar 10 minutos mientras pagas, y te llega la confirmación al correo.</p>
        </div>
      </section>

      <section class="bloque" data-revelar>
        <div class="bloque-cab">
          <div class="eyebrow">El equipo</div>
          <h2>Elige quién te atiende</h2>
        </div>
        <div class="equipo" id="lista-barberos">${esqueleto(3, "tarjeta-esq alta")}</div>
      </section>

      <section class="bloque" data-revelar>
        <div class="bloque-cab fila-cab">
          <div>
            <div class="eyebrow">Tienda</div>
            <h2>Llévate lo que usamos en la silla</h2>
            <p>Recoges en la barbería o te lo llevamos a tu casa en Querétaro.</p>
          </div>
          <a class="boton claro" href="#tienda">Ver toda la tienda</a>
        </div>
        <div class="top-inicio" id="top-productos">${esqueleto(3, "tarjeta-esq")}</div>
      </section>

      <section class="bloque pasos-inicio" data-revelar>
        <div class="bloque-cab">
          <div class="eyebrow">Cómo funciona</div>
          <h2>Tu cita en tres pasos</h2>
        </div>
        <ol>
          <li style="--i:0"><span>1</span><h3>Elige</h3><p>Servicio, barbero, día y hora. Solo ves los horarios libres de verdad.</p></li>
          <li style="--i:1"><span>2</span><h3>Aparta</h3><p>El horario queda guardado para ti 10 minutos. Nadie más lo puede tomar.</p></li>
          <li style="--i:2"><span>3</span><h3>Paga y listo</h3><p>Pagas con tarjeta o saldo de Mercado Pago y la cita se confirma sola.</p></li>
        </ol>
      </section>

      <section class="bloque pagos-inicio" data-revelar>
        <div class="pagos-caja">
          <div class="pagos-texto">
            <div class="eyebrow">Pagos seguros</div>
            <h2>Aceptamos tarjetas de crédito y débito</h2>
            <p>Pagas tu anticipo o tu pedido en línea con Mercado Pago: tarjeta o saldo, al momento. En la barbería también aceptamos tarjeta y efectivo. Nunca guardamos los datos de tu tarjeta.</p>
          </div>
          <div class="pagos-logos">
            <img src="/img/pagos/tarjetas.webp" alt="Mastercard, Visa y American Express" class="logo-tarjetas" loading="lazy">
            <img src="/img/pagos/mercadopago.webp" alt="Mercado Pago" class="logo-mp" loading="lazy">
          </div>
          <div class="pagos-bancos">
            <span>Tarjetas de los principales bancos</span>
            <img src="/img/pagos/bancos.webp" alt="BBVA, Citibanamex, Santander, Banorte, HSBC, Scotiabank, Inbursa, Afirme, Banco Azteca, Banjercito e Invex" loading="lazy">
          </div>
        </div>
      </section>

      <section class="bloque visita" data-revelar>
        <div class="visita-texto">
          <div class="eyebrow">Visítanos</div>
          <h2>Te esperamos en la esquina</h2>
          <dl>
            <div><dt>Dirección</dt><dd>Av. Ejemplo 123, Col. Centro, Querétaro</dd></div>
            <div><dt>Horario</dt><dd>Lunes a sábado, 10:00 a 20:00<br>Domingo cerrado</dd></div>
            <div><dt>Productos</dt><dd>Cera mate, aceite para barba, shampoo y peines de madera en mostrador.</dd></div>
          </dl>
          <a class="boton rojo" href="#cliente">Apartar mi hora</a>
        </div>
        <figure><img src="/img/herramientas.webp" alt="Navaja, tijeras, peine y brocha sobre una mesa de madera" loading="lazy"></figure>
      </section>

      <p class="aviso-ficticio">La Esquina es una barbería ficticia creada para demostrar BarberOS. Las fotos fueron generadas con IA.</p>
    </div>`;

  // Agendar desde una tarjeta: se deja elegido el servicio o el barbero y se va a la agenda.
  function irAgendar(datos) {
    sessionStorage.setItem(BORRADOR, JSON.stringify({ tipoPago: "anticipo", ...datos }));
    location.hash = "cliente";
  }
  raiz.onclick = (e) => {
    const s = e.target.closest("[data-servicio]");
    const b = e.target.closest("[data-barbero]");
    if (s) irAgendar({ servicioId: s.dataset.servicio });
    else if (b) irAgendar({ barberoId: b.dataset.barbero });
    else if (e.target.closest('a[href="#servicios-inicio"]')) {
      e.preventDefault(); // no cambiar el hash: eso cambiaría de vista
      raiz.querySelector("#servicios-inicio").scrollIntoView({ behavior: "smooth" });
    }
  };

  catalogo()
    .then(({ servicios, barberos, productos }) => {
      raiz.querySelector("#top-productos").innerHTML = recomendados(productos ?? [], 3)
        .map((p, i) => `
          <a class="producto-mini" href="#tienda" style="--i:${i}">
            ${foto(p.id) ? `<img src="${foto(p.id)}" alt="${esc(p.nombre)}" loading="lazy">` : ""}
            <div><h3>${esc(p.nombre)}</h3><p>${esc(info(p.id).desc)}</p><b>${dinero(p.precio)}</b></div>
          </a>`)
        .join("");
      raiz.querySelector("#lista-servicios").innerHTML = servicios
        .map(
          (s) => `
          <article class="servicio-inicio">
            <div>
              <h3>${esc(s.nombre)}</h3>
              <p>${esc(DESCRIPCIONES[s.id] ?? "")}</p>
            </div>
            <div class="precio-linea">
              <span class="precio">${dinero(s.precio)}</span>
              <span class="duracion">${s.duracionMin} min</span>
              <button class="boton chico" data-servicio="${esc(s.id)}">Agendar</button>
            </div>
          </article>`,
        )
        .join("");
      raiz.querySelector("#lista-barberos").innerHTML = barberos
        .map((b, i) => {
          const d = BARBEROS[b.id] ?? { foto: null, puesto: "Barbero", frase: "" };
          return `
          <article class="barbero-inicio" style="--i:${i}">
            ${d.foto ? `<img src="/img/${d.foto}.webp" alt="Retrato de ${esc(b.nombre)}" loading="lazy">` : ""}
            <div class="barbero-pie">
              <div><h3>${esc(b.nombre)}</h3><span>${esc(d.puesto)}</span></div>
              <button class="boton chico claro" data-barbero="${esc(b.id)}">Con ${esc(b.nombre)}</button>
            </div>
            <p>${esc(d.frase)}</p>
          </article>`;
        })
        .join("");
    })
    .catch(() => {
      raiz.querySelector("#lista-servicios").innerHTML = `<p class="nota">No se pudieron cargar los servicios. <a href="#cliente">Ir a agendar</a></p>`;
    });

  revelar(raiz);
  return () => {
    raiz.onclick = null;
  };
}
