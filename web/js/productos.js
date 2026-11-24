import { almacen } from "./comun.js";

// Lo que la tienda muestra de cada producto además de lo que viene del servidor (nombre, precio, existencia).
// "top" = los recomendados que salen en "¿Algo más?" al agendar.
export const INFO_PRODUCTO = {
  "cera-mate": { foto: "cera-mate", top: 1, desc: "Fijación media, acabado sin brillo. La que usamos en la silla." },
  "aceite-barba": { foto: "aceite-barba", top: 2, desc: "Suaviza la barba y quita la comezón. Unas gotas al día." },
  "kit-barba": { foto: "kit-barba", top: 3, desc: "Aceite, bálsamo, peine y tijeras. Para regalar o regalarte." },
  "pomada-brillo": { foto: "pomada-brillo", desc: "Peinados clásicos con brillo de efecto mojado." },
  "balsamo-barba": { foto: "balsamo-barba", desc: "Peina y da forma a la barba sin dejarla tiesa." },
  "after-shave": { foto: "after-shave", desc: "Calma la piel después de rasurar. Aroma fresco." },
  tonico: { foto: "tonico", desc: "Tónico de romero para el cuero cabelludo." },
  shampoo: { foto: "shampoo", desc: "Control de caspa para uso diario." },
  "cepillo-barba": { foto: "cepillo-barba", desc: "Cerdas naturales para peinar y repartir el aceite." },
  peine: { foto: "peine", desc: "Peine de madera de dientes finos y gruesos." },
};

export const info = (id) => INFO_PRODUCTO[id] ?? { foto: null, desc: "" };
export const foto = (id) => (info(id).foto ? `/img/productos/${info(id).foto}.webp` : null);

// Los recomendados que tienen piezas, en su orden.
export const recomendados = (productos, cuantos = 3) =>
  productos
    .filter((p) => info(p.id).top && p.existencia > 0)
    .sort((a, b) => info(a.id).top - info(b.id).top)
    .slice(0, cuantos);

// Carrito de la tienda: vive en el navegador hasta que se hace el pedido.
const LLAVE = "barberos.carrito";
export const carrito = {
  leer: () => almacen.leer(LLAVE, {}),
  guardar: (c) => almacen.guardar(LLAVE, c),
  poner(id, cantidad) {
    const c = this.leer();
    if (cantidad > 0) c[id] = Math.min(5, cantidad);
    else delete c[id];
    this.guardar(c);
    window.dispatchEvent(new Event("carrito"));
  },
  vaciar() {
    this.guardar({});
    window.dispatchEvent(new Event("carrito"));
  },
  piezas() {
    return Object.values(this.leer()).reduce((a, b) => a + b, 0);
  },
};
