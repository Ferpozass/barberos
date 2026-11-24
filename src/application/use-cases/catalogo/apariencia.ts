import { ErrorDeDominio } from "../../../domain/errors/errores.ts";
import type { RepositorioConfiguracion } from "../../ports/repositorios.ts";

// Cada barbería elige la paleta de colores de su página (UC-29, Administrador).
// Los colores de cada paleta viven en el navegador (web/js/apariencia.js); aquí solo se guarda cuál eligió.
export const PALETAS = ["ladrillo", "marino", "bosque", "carbon", "vino", "arena"] as const;
export type Paleta = (typeof PALETAS)[number];

export class VerApariencia {
  private readonly config: RepositorioConfiguracion;
  constructor(d: { config: RepositorioConfiguracion }) {
    this.config = d.config;
  }
  async ejecutar(): Promise<{ paleta: Paleta }> {
    const v = await this.config.leer("paleta");
    return { paleta: (PALETAS as readonly string[]).includes(v ?? "") ? (v as Paleta) : "ladrillo" };
  }
}

export class CambiarApariencia {
  private readonly config: RepositorioConfiguracion;
  constructor(d: { config: RepositorioConfiguracion }) {
    this.config = d.config;
  }
  async ejecutar(e: { paleta: string }): Promise<{ paleta: Paleta }> {
    if (!(PALETAS as readonly string[]).includes(e.paleta)) throw new ErrorDeDominio("Esa paleta no existe");
    await this.config.guardar("paleta", e.paleta);
    return { paleta: e.paleta as Paleta };
  }
}
