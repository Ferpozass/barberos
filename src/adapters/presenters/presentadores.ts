// Presentadores: convierten entidades del dominio en el JSON que consumen las pantallas.
// Las pantallas nunca reciben la entidad tal cual; reciben esta vista.
import type { Cita } from "../../domain/entities/cita.ts";
import { horaLocal } from "../../domain/shared/horario-del-local.ts";
import type { CorteDeCaja } from "../../domain/entities/corte-de-caja.ts";
import type { Horario } from "../../application/use-cases/agenda/consultar-disponibilidad.ts";

const ETIQUETA_ESTADO: Record<string, string> = {
  apartada: "Apartada, esperando pago",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  atendida: "Atendida",
  no_llego: "No llegó",
};

export function presentarCita(c: Cita) {
  return {
    id: c.id,
    barberoId: c.barberoId,
    servicioId: c.servicioId,
    cliente: { nombre: c.clienteNombre, correo: c.clienteCorreo },
    dia: c.dia,
    inicio: c.inicio.toISOString(),
    fin: c.fin.toISOString(),
    duracionMin: c.duracionMin,
    precio: c.precio,
    tipoPago: c.tipoPago,
    montoEnLinea: c.montoAPagarEnLinea(),
    pagadoEnLinea: c.pagadoEnLinea,
    saldoPendiente: c.saldoPendiente,
    estado: c.estado,
    estadoTexto: ETIQUETA_ESTADO[c.estado] ?? c.estado,
    apartadoVenceEn: c.apartadoVenceEn ? c.apartadoVenceEn.toISOString() : null,
    motivoCancelacion: c.motivoCancelacion,
  };
}

export function presentarHorarios(hs: Horario[]) {
  return hs.map((h) => ({
    inicio: h.inicio.toISOString(),
    hora: horaLocal(h.inicio),
    libre: h.libre,
  }));
}

export function presentarCorte(c: CorteDeCaja) {
  const d = c.aDatos();
  return { ...d, cerrado: d.cerradoEn !== null, puedeCerrarse: c.puedeCerrarse };
}
