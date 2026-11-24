import type { Cifrador } from "../../application/ports/servicios-externos.ts";

// Cifra contraseñas con PBKDF2-SHA256 (Web Crypto). Funciona igual en Node y en Cloudflare Workers,
// sin instalar nada. 100,000 vueltas es el máximo que permite Cloudflare.
// Formato guardado: pbkdf2$<vueltas>$<sal en base64>$<hash en base64>
const VUELTAS = 100_000;

const aBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const deBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derivar(contrasena: string, sal: Uint8Array, vueltas: number): Promise<Uint8Array> {
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(contrasena), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: vueltas }, clave, 256);
  return new Uint8Array(bits);
}

export class CifradorPbkdf2 implements Cifrador {
  async cifrar(contrasena: string): Promise<string> {
    const sal = crypto.getRandomValues(new Uint8Array(16));
    return `pbkdf2$${VUELTAS}$${aBase64(sal)}$${aBase64(await derivar(contrasena, sal, VUELTAS))}`;
  }

  async verificar(contrasena: string, guardado: string): Promise<boolean> {
    const [tipo, vueltas, sal, hash] = guardado.split("$");
    if (tipo !== "pbkdf2" || !sal || !hash) return false;
    const calculado = await derivar(contrasena, deBase64(sal), Number(vueltas));
    const esperado = deBase64(hash);
    // Se comparan todos los bytes aunque uno ya no coincida (no da pistas por el tiempo que tarda).
    let diferencia = calculado.length ^ esperado.length;
    for (let i = 0; i < esperado.length; i++) diferencia |= calculado[i] ^ esperado[i];
    return diferencia === 0;
  }
}
