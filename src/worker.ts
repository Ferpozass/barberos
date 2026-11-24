// Punto de entrada en la nube: Cloudflare Workers + PostgreSQL de Supabase (ADR-009).
// Usa la MISMA aplicación que main.ts; solo cambia cómo llegan las peticiones y qué base de datos se abre.
import { aRespuestaDeError, type Respuesta } from "./adapters/controllers/peticion.ts";
import { armarAplicacion } from "./infrastructure/config/contenedor.ts";
import { ConexionPostgres } from "./infrastructure/db/postgres.ts";
import { aJson, atender } from "./infrastructure/http/rutas.ts";

interface Entorno {
  DATABASE_URL: string; // secreto: npx wrangler secret put DATABASE_URL
  URL_BASE?: string; // dirección pública (para los enlaces de los correos que salen desde el cron)
  GOOGLE_CLIENT_ID?: string; // público (wrangler.jsonc → vars); sin él no hay botón de Google
  MP_ACCESS_TOKEN?: string; // secreto: npx wrangler secret put MP_ACCESS_TOKEN (sin él, pagos simulados)
  ASSETS: { fetch(peticion: Request): Promise<Response> }; // los archivos de web/
}
interface Contexto {
  waitUntil(promesa: Promise<unknown>): void;
}

const aHttp = (r: Respuesta) =>
  Response.json(r.cuerpo, { status: r.estado, headers: { "cache-control": "no-store" } });

export default {
  // Cada petición abre su conexión a Supabase y la cierra al terminar.
  async fetch(peticion: Request, env: Entorno, ctx: Contexto): Promise<Response> {
    const db = new ConexionPostgres(env.DATABASE_URL);
    try {
      const url = new URL(peticion.url);
      const app = armarAplicacion(db, { urlBase: url.origin, mpAccessToken: env.MP_ACCESS_TOKEN, googleClientId: env.GOOGLE_CLIENT_ID });
      const r = await atender(app, peticion.method, url, async () => aJson(await peticion.text()), peticion.headers.get("authorization"));
      return r ? aHttp(r) : env.ASSETS.fetch(peticion);
    } catch (err) {
      return aHttp(aRespuestaDeError(err));
    } finally {
      ctx.waitUntil(db.cerrar());
    }
  },

  // Cron de Cloudflare (cada minuto, ver wrangler.jsonc): la conciliación de pagos (ADR-004).
  async scheduled(_evento: unknown, env: Entorno, ctx: Contexto): Promise<void> {
    const db = new ConexionPostgres(env.DATABASE_URL);
    try {
      // La conciliación solo CONSULTA cobros: no necesita la URL pública.
      const app = armarAplicacion(db, { urlBase: env.URL_BASE ?? "", mpAccessToken: env.MP_ACCESS_TOKEN });
      const r = await app.conciliar.ejecutar();
      if (r.confirmadas > 0) console.log(`[conciliación] ${r.confirmadas} pago(s) encontrados sin webhook`);
      // Recordatorios 24 h y 2 h antes (regla 11). Cada uno se manda una sola vez.
      const rec = await app.recordatorios.ejecutar();
      if (rec.enviados > 0) console.log(`[recordatorios] ${rec.enviados} enviado(s)`);
    } finally {
      ctx.waitUntil(db.cerrar());
    }
  },
};
