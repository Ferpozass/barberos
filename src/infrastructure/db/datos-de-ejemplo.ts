import type { Barbero, Producto, Servicio } from "../../domain/entities/catalogo.ts";

// Catálogo de arranque para la demo. Nombres, precios y comisiones son de ejemplo.
export const DATOS_DE_EJEMPLO: { barberos: Barbero[]; servicios: Servicio[]; productos: Producto[] } = {
  barberos: [
    { id: "barbero-1", nombre: "Toño", porcentajeComision: 0.4, activo: true },
    { id: "barbero-2", nombre: "Memo", porcentajeComision: 0.4, activo: true },
    { id: "barbero-3", nombre: "Rafa", porcentajeComision: 0.35, activo: true },
  ],
  servicios: [
    { id: "corte", nombre: "Corte de cabello", duracionMin: 45, precio: 180 },
    { id: "corte-barba", nombre: "Corte y barba", duracionMin: 60, precio: 260 },
    { id: "barba", nombre: "Arreglo de barba", duracionMin: 30, precio: 120 },
    { id: "infantil", nombre: "Corte infantil", duracionMin: 30, precio: 140 },
  ],
  productos: [
    { id: "cera-mate", nombre: "Cera mate", precio: 190, existencia: 12 },
    { id: "aceite-barba", nombre: "Aceite para barba", precio: 220, existencia: 8 },
    { id: "shampoo", nombre: "Shampoo anticaspa", precio: 160, existencia: 10 },
    { id: "peine", nombre: "Peine de madera", precio: 90, existencia: 2 },
    { id: "pomada-brillo", nombre: "Pomada de brillo", precio: 180, existencia: 10 },
    { id: "balsamo-barba", nombre: "Bálsamo para barba", precio: 210, existencia: 6 },
    { id: "after-shave", nombre: "Loción after shave", precio: 170, existencia: 7 },
    { id: "tonico", nombre: "Tónico capilar de romero", precio: 200, existencia: 5 },
    { id: "cepillo-barba", nombre: "Cepillo para barba", precio: 150, existencia: 6 },
    { id: "kit-barba", nombre: "Kit de barba", precio: 520, existencia: 3 },
  ],
};
