import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { aRespuestaDeError, type Respuesta } from "../../adapters/controllers/peticion.ts";
import type { Aplicacion } from "../config/contenedor.ts";
import { aJson, atender } from "./rutas.ts";

// Servidor web con node:http (sin Express) para correr en la laptop. Es "Frameworks & Drivers":
// traduce HTTP a Peticion/Respuesta y sirve las pantallas de web/. En la nube lo reemplaza worker.ts.

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

export function crearServidor(app: Aplicacion, carpetaWeb: string): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      const respuesta = await atender(app, req.method ?? "GET", url, () => leerTexto(req).then(aJson), req.headers.authorization ?? null);
      if (respuesta) return enviarJson(res, respuesta);
      if (req.method === "GET") return await servirArchivo(res, carpetaWeb, url.pathname === "/" ? "index.html" : url.pathname);
      enviarJson(res, { estado: 404, cuerpo: { error: "No existe" } });
    } catch (err) {
      enviarJson(res, aRespuestaDeError(err));
    }
  });
}

async function leerTexto(req: IncomingMessage): Promise<string> {
  if (req.method === "GET") return "";
  const partes: Buffer[] = [];
  for await (const p of req) partes.push(p as Buffer);
  return Buffer.concat(partes).toString("utf8");
}

function enviarJson(res: ServerResponse, r: Respuesta): void {
  res.writeHead(r.estado, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(r.cuerpo));
}

async function servirArchivo(res: ServerResponse, carpeta: string, ruta: string): Promise<void> {
  const base = resolve(carpeta);
  const conExtension = extname(ruta) ? ruta : `${ruta}.html`; // "/pasarela/pagar" -> pagar.html, como en Cloudflare
  const archivo = resolve(join(base, normalize(decodeURIComponent(conExtension))));
  if (!archivo.startsWith(base)) return enviarJson(res, { estado: 403, cuerpo: { error: "Prohibido" } });
  try {
    const contenido = await readFile(archivo);
    res.writeHead(200, { "content-type": TIPOS[extname(archivo)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(contenido);
  } catch {
    enviarJson(res, { estado: 404, cuerpo: { error: "No existe" } });
  }
}
