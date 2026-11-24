// Utilidades compartidas por las vistas.

// Sesión: el token que dio el servidor al entrar. Se manda en cada petición (Authorization: Bearer).
const LLAVE_SESION = "barberos.sesion";
export const sesion = {
  actual() {
    try {
      return JSON.parse(localStorage.getItem(LLAVE_SESION) ?? "null");
    } catch {
      return null;
    }
  },
  guardar(s) {
    try {
      s ? localStorage.setItem(LLAVE_SESION, JSON.stringify(s)) : localStorage.removeItem(LLAVE_SESION);
    } catch {}
    window.dispatchEvent(new Event("sesion"));
  },
  usuario() {
    return this.actual()?.usuario ?? null;
  },
};

export async function api(ruta, opciones = {}) {
  const token = sesion.actual()?.token;
  const r = await fetch(ruta, {
    ...opciones,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(opciones.headers ?? {}),
    },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  // La sesión venció o la borraron: se olvida y se pide entrar otra vez.
  if (r.status === 401 && token) sesion.guardar(null);
  if (!r.ok) throw Object.assign(new Error(datos.error ?? `Error ${r.status}`), { estado: r.status });
  return datos;
}

const fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
export const dinero = (n) => fmt.format(n ?? 0).replace(".00", "");

export const hora = (iso) =>
  new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });

export const fechaLarga = (iso) => {
  const t = new Date(iso).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function diaLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export const iniciales = (nombre) => nombre.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

export function avisar(texto, tipo = "") {
  const caja = document.getElementById("avisos");
  const el = document.createElement("div");
  el.className = `aviso ${tipo}`;
  el.textContent = texto;
  caja.append(el);
  // Sale con animación (ver .aviso.sale en estilos.css) y luego se quita.
  setTimeout(() => {
    el.classList.add("sale");
    setTimeout(() => el.remove(), 220);
  }, 4000);
}

// Los elementos con data-revelar aparecen suave cuando entran a la pantalla (una sola vez).
// Sin IntersectionObserver o con "reducir movimiento" se muestran de inmediato.
export function revelar(raiz) {
  const els = raiz.querySelectorAll("[data-revelar]:not(.revelado)");
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    els.forEach((el) => el.classList.add("revelado"));
    return;
  }
  const io = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("revelado");
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -60px 0px" },
  );
  els.forEach((el) => io.observe(el));
}

// Tarjetas grises que "laten" mientras llegan los datos (en vez de una pantalla en blanco).
export const esqueleto = (n, clase = "") =>
  Array.from({ length: n }, () => `<div class="esqueleto ${clase}"></div>`).join("");

export function pildora(estado, texto) {
  return `<span class="pildora e-${esc(estado)}">${esc(texto)}</span>`;
}

// Guarda/lee en localStorage sin romper si el navegador lo bloquea.
export const almacen = {
  leer(llave, porDefecto) {
    try {
      const v = localStorage.getItem(llave);
      return v ? JSON.parse(v) : porDefecto;
    } catch {
      return porDefecto;
    }
  },
  guardar(llave, valor) {
    try {
      localStorage.setItem(llave, JSON.stringify(valor));
    } catch {}
  },
};

let catalogoCache = null;
// El catálogo se guarda en el navegador para que el barbero pueda vender aunque no haya internet.
export async function catalogo({ forzar = false } = {}) {
  if (catalogoCache && !forzar) return catalogoCache;
  try {
    catalogoCache = await api("/api/catalogo");
    almacen.guardar("barberos.catalogo", catalogoCache);
  } catch (err) {
    catalogoCache = almacen.leer("barberos.catalogo", null);
    if (!catalogoCache) throw err;
  }
  return catalogoCache;
}
