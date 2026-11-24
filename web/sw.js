// Service worker: guarda una copia de las pantallas para que la app abra aunque no haya internet (E1, ADR-001).
// - Pantallas, estilos, scripts e imágenes: primero la red (para tener siempre la versión nueva) y, si no hay
//   red, la copia guardada.
// - La API (/api/...) y la pasarela NUNCA salen de la copia: sin red fallan y la app usa su propia cola local.
const CACHE = "barberos-v1";
const BASE = ["/", "/index.html", "/estilos.css", "/js/app.js", "/js/comun.js", "/js/inicio.js", "/js/cliente.js",
  "/js/tienda.js", "/js/barbero.js", "/js/admin.js", "/js/local.js", "/js/entrar.js", "/js/cuenta.js",
  "/js/productos.js", "/js/apariencia.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/pasarela")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r ?? caches.match("/"))),
  );
});
