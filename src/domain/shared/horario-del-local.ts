// Horario del local y utilidades de fecha. Código puro: sin base de datos ni framework.

export const MINUTO = 60 * 1000;
export const HORA = 60 * MINUTO;
export const HORA_APERTURA = 10; // RN-05
export const HORA_CIERRE = 20; // RN-05

// La barbería está en Querétaro: UTC-6 todo el año (México quitó el horario de verano en 2022).
// Se fija aquí porque el servidor en la nube corre en UTC; así la laptop y Cloudflare dan la misma hora.
const DESFASE_MEXICO = -6 * HORA;

// Corre el reloj a la hora de México; después se lee con getUTC*.
const enMexico = (fecha: Date) => new Date(fecha.getTime() + DESFASE_MEXICO);

// "2026-11-17" en hora de México. Es la llave con la que se agrupan citas, ventas y cortes por día.
export function diaLocal(fecha: Date): string {
  return enMexico(fecha).toISOString().slice(0, 10);
}

// "10:30" en hora de México.
export function horaLocal(fecha: Date): string {
  return enMexico(fecha).toISOString().slice(11, 16);
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// "sábado 21 de noviembre a las 19:30" (para los correos).
export function fechaLegible(fecha: Date): string {
  const m = enMexico(fecha);
  return `${DIAS[m.getUTCDay()]} ${m.getUTCDate()} de ${MESES[m.getUTCMonth()]} a las ${horaLocal(fecha)}`;
}

// "2026-11-17" + 10, 30 -> el instante de ese día a las 10:30 hora de México.
export function fechaDelDia(dia: string, hora: number, minuto = 0): Date {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, hora, minuto) - DESFASE_MEXICO);
}

export function esDiaValido(dia: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const f = fechaDelDia(dia, 12);
  return !Number.isNaN(f.getTime()) && diaLocal(f) === dia;
}

// RN-05: lunes a sábado, de 10:00 a 20:00, y el servicio termina el mismo día antes del cierre.
export function dentroDelHorario(inicio: Date, duracionMin: number): boolean {
  const fin = new Date(inicio.getTime() + duracionMin * MINUTO);
  if (enMexico(inicio).getUTCDay() === 0) return false; // domingo
  if (horaLocal(inicio) < `${HORA_APERTURA}:00`) return false;
  if (diaLocal(fin) !== diaLocal(inicio)) return false;
  return horaLocal(fin) <= `${HORA_CIERRE}:00`;
}
