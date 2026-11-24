import { almacen } from "./comun.js";

// Paletas de colores (UC-29). Toda la página usa variables de CSS (--ladrillo, --crema, --tinta…),
// así que cambiar de paleta es cambiar seis variables: ninguna pantalla se toca.
export const PALETAS = {
  ladrillo: { nombre: "Ladrillo", acento: "#b3412e", suave: "#f3ded8", crema: "#f4f1ea", papel: "#fbf9f4", tinta: "#1c1b19", linea: "#e2ddd1" },
  marino: { nombre: "Azul marino", acento: "#1f4e8c", suave: "#dbe6f5", crema: "#eef1f5", papel: "#f8fafc", tinta: "#121a26", linea: "#d9e0ea" },
  bosque: { nombre: "Bosque", acento: "#2f6b4f", suave: "#dcebe2", crema: "#eef1ea", papel: "#f8faf6", tinta: "#17211b", linea: "#d8e0d6" },
  carbon: { nombre: "Negro y oro", acento: "#b8862b", suave: "#f3e7cc", crema: "#f2efe8", papel: "#faf8f3", tinta: "#111111", linea: "#e1dccf" },
  vino: { nombre: "Vino", acento: "#7a1f3d", suave: "#f1dbe2", crema: "#f5efef", papel: "#fbf8f8", tinta: "#1d1416", linea: "#e6d9dc" },
  arena: { nombre: "Arena", acento: "#c0703a", suave: "#f6e3d4", crema: "#f6f0e6", papel: "#fcf9f3", tinta: "#2a2118", linea: "#e8dece" },
};

const LLAVE = "barberos.paleta";

export function aplicarPaleta(id, { guardar = true } = {}) {
  const p = PALETAS[id] ?? PALETAS.ladrillo;
  const r = document.documentElement.style;
  r.setProperty("--ladrillo", p.acento);
  r.setProperty("--ladrillo-suave", p.suave);
  r.setProperty("--crema", p.crema);
  r.setProperty("--papel", p.papel);
  r.setProperty("--tinta", p.tinta);
  r.setProperty("--linea", p.linea);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", p.crema);
  if (guardar) almacen.guardar(LLAVE, id);
}

// Al abrir: primero la que ya conocía este navegador (sin parpadeo) y luego la que dice el servidor.
export async function cargarPaleta(api) {
  aplicarPaleta(almacen.leer(LLAVE, "ladrillo"), { guardar: false });
  try {
    const { paleta } = await api("/api/apariencia");
    aplicarPaleta(paleta);
  } catch {}
}
