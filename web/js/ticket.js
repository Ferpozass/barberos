// Ticket para impresora térmica de 55-58 mm: una imagen PNG de 384 px de ancho, en blanco y negro,
// con letra monoespaciada de 32 columnas. "Imprimir" abre el menú de compartir del celular para mandarla
// a la app de la impresora (Bluetooth); si el equipo no puede compartir archivos, se descarga.

const W = 384;
const PAD = 8;
const COLS = 32;
const FUENTE = "20px 'Courier New', monospace";
const FUENTE_GRANDE = "bold 28px 'Courier New', monospace";
const ALTO = { logo: 118, center: 26, centerBig: 36, text: 26, row: 26, rowBig: 36, sep: 18, blank: 12 };

// Arma las líneas del ticket a partir de la venta.
export function lineasDelTicket({ venta, barbero, dinero }) {
  const total = venta.renglones.reduce((s, r) => s + r.cantidad * r.precioUnitario, 0);
  const lineas = [
    { t: "logo" },
    { t: "center", text: "Barbería · Querétaro" },
    { t: "center", text: new Date(venta.creadaEn).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) },
    { t: "sep" },
  ];
  if (venta.renglones.length === 0) lineas.push({ t: "text", text: "Servicio pagado en línea" });
  for (const r of venta.renglones) {
    const izq = `${r.cantidad} x ${r.concepto}`;
    const der = dinero(r.cantidad * r.precioUnitario);
    if (izq.length + der.length + 1 > COLS) {
      lineas.push({ t: "text", text: izq.slice(0, COLS) });
      lineas.push({ t: "row", left: "", right: der });
    } else lineas.push({ t: "row", left: izq, right: der });
  }
  lineas.push(
    { t: "sep" },
    { t: "row", left: "TOTAL", right: dinero(total), big: true },
    { t: "row", left: "Pago", right: venta.metodo },
    { t: "row", left: "Atendió", right: barbero ?? "" },
    { t: "sep" },
    { t: "center", text: `Folio ${venta.id.slice(0, 8).toUpperCase()}` },
    { t: "center", text: "Gracias por tu visita" },
    { t: "blank" },
  );
  return lineas;
}

const alto = (l) => (l.t === "center" && l.big ? ALTO.centerBig : l.t === "row" && l.big ? ALTO.rowBig : ALTO[l.t]);

// Poste de barbería + nombre del negocio (todo en negro: la térmica no imprime colores).
function dibujarLogo(ctx, y) {
  const x = W / 2 - 9;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.roundRect(x, y + 4, 18, 50, 9);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#000";
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y + 4, 18, 50, 9);
  ctx.clip();
  for (let k = -1; k < 5; k++) {
    ctx.beginPath();
    ctx.moveTo(x, y + 18 + k * 12);
    ctx.lineTo(x + 18, y + 8 + k * 12);
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.restore();
  ctx.font = "bold 40px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("LA ESQUINA", W / 2, y + 66);
  ctx.textAlign = "left";
}

export async function ticketPng(lineas) {
  const height = PAD * 2 + lineas.reduce((s, l) => s + alto(l), 0);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, height);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";
  let y = PAD;
  for (const l of lineas) {
    if (l.t === "logo") dibujarLogo(ctx, y);
    if (l.t === "center") {
      ctx.font = l.big ? FUENTE_GRANDE : FUENTE;
      ctx.textAlign = "center";
      ctx.fillText(l.text, W / 2, y + 2);
      ctx.textAlign = "left";
    }
    if (l.t === "text") {
      ctx.font = FUENTE;
      ctx.fillText(l.text, PAD, y + 2);
    }
    if (l.t === "row") {
      ctx.font = l.big ? FUENTE_GRANDE : FUENTE;
      ctx.fillText(l.left, PAD, y + 2);
      ctx.textAlign = "right";
      ctx.fillText(l.right, W - PAD, y + 2);
      ctx.textAlign = "left";
    }
    if (l.t === "sep") {
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PAD, y + 9);
      ctx.lineTo(W - PAD, y + 9);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    y += alto(l);
  }
  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo crear el ticket"))), "image/png"));
}

// Abre "compartir" del celular (2 toques para llegar a la app de la impresora). Si no se puede, descarga el PNG.
export async function compartirTicket(blob, nombre) {
  const archivo = new File([blob], nombre, { type: "image/png" });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo] });
      return "compartido";
    } catch (e) {
      if (e?.name === "AbortError") return "cancelado";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "descargado";
}
