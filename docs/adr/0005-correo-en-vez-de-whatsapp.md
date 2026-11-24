# ADR-005. Los avisos al cliente van por correo en esta versión

Estado: aceptada. Escenario E1. Función F2.

## Contexto

De 2 a 3 avisos por cita, es decir de 240 a 1,800 correos al mes. WhatsApp exige una API con costo por mensaje. El aviso cumple una segunda función: su copia a la cuenta del negocio es lo que deja saber quién va a llegar cuando el local se queda sin internet.

## Opciones consideradas

(1) WhatsApp por API oficial, con costo por conversación. (2) Correo transaccional, dentro de una cuota gratuita. (3) SMS, con costo por mensaje.

## Matriz de decisión

| Criterio | Peso | WhatsApp por API | Correo transaccional | SMS |
|---|---|---|---|---|
| Costo mensual con 1,800 avisos | Alto | Fuera de presupuesto | Dentro de la cuota gratuita | Fuera de presupuesto |
| Probabilidad de que se lea | Alto | Muy alta | Media: puede caer en spam | Alta |
| Sirve de respaldo de la agenda sin internet | Alto | Sí | Sí | No deja copia al negocio |
| Consentimiento y baja bajo la LFPDPPP | Medio | Media | Alta | Media |

Decisión: confirmaciones y recordatorios de 24 y 2 horas se mandan por correo, con copia a la cuenta del negocio; WhatsApp queda como evolución posterior.

Alternativa descartada: WhatsApp, que es el canal que el cliente sí lee. La razón es de presupuesto: el costo por conversación crece con cada cita en un negocio de margen corto.

Consecuencia aceptada: menor tasa de lectura, así que parte de los recordatorios no cumple su función. Lo que sostiene la asistencia es el anticipo no reembolsable del ADR-003.

Métrica verificable: 98% o más de avisos entregados. Si la apertura baja del 60% dos meses seguidos o el no-show supera el 15%, la decisión se reabre.
