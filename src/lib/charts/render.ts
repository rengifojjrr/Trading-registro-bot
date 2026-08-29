import type { Shape } from "./geometry";
import { dashPattern, fillColor, type DrawingStyle } from "./style";

/**
 * Pinta una figura ya calculada.
 *
 * Aquí no hay decisiones: dónde va cada línea lo decidió `geometry.ts`, que se
 * puede probar sin navegador. Esto sólo mueve el lápiz. La separación es la
 * que permite que la parte que puede estar mal -- la mediana de una horquilla,
 * la proporción de un XABCD -- tenga pruebas de verdad.
 */
export interface RenderOptions {
  ghost?: boolean;
  /** Se pintan los tiradores de los extremos cuando está seleccionada. */
  handles?: { x: number; y: number }[];
  /** Color del texto de las etiquetas; suele ser el del tema, no el del dibujo. */
  labelColor?: string;
  /**
   * El fondo del gráfico, para separar del lienzo lo que se pinta encima.
   *
   * Se usa de contorno detrás del texto y de anillo alrededor de los
   * tiradores. Va como parámetro y no como literal porque el fondo cambia con
   * el tema: un contorno negro fijo, que en el tema oscuro separa, en el claro
   * ensucia el texto. Si no llega, no se pinta contorno -- mejor sin él que de
   * un color que no pega con el fondo real.
   */
  haloColor?: string;
}

export function renderShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  style: DrawingStyle,
  options: RenderOptions = {},
): void {
  const { ghost = false, handles, labelColor, haloColor } = options;

  ctx.save();
  // La vista previa a media tinta: se distingue de lo ya guardado sin cambiar
  // de color, que confundiría con otro dibujo.
  ctx.globalAlpha = ghost ? 0.5 : 1;
  ctx.strokeStyle = style.color;
  ctx.fillStyle = fillColor(style);
  ctx.lineWidth = style.lineWidth;
  ctx.setLineDash(dashPattern(style));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Los rellenos primero: si fueran después taparían sus propios bordes.
  for (const poly of shape.polygons) {
    if (poly.points.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(poly.points[0].x, poly.points[0].y);
    for (const p of poly.points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    if (poly.filled) ctx.fill();
    ctx.stroke();
  }

  for (const el of shape.ellipses) {
    ctx.beginPath();
    ctx.ellipse(el.center.x, el.center.y, Math.abs(el.rx), Math.abs(el.ry), 0, 0, Math.PI * 2);
    if (el.filled) ctx.fill();
    ctx.stroke();
  }

  for (const curve of shape.curves) {
    ctx.beginPath();
    ctx.moveTo(curve.from.x, curve.from.y);
    ctx.quadraticCurveTo(curve.control.x, curve.control.y, curve.to.x, curve.to.y);
    ctx.stroke();
  }

  for (const seg of shape.segments) {
    // Los tramos secundarios más finos: en un Fibonacci de siete niveles,
    // todos del mismo grosor, no se distingue el 0% del 38,2%.
    ctx.lineWidth = seg.emphasis === "SECONDARY" ? Math.max(1, style.lineWidth - 1) : style.lineWidth;
    ctx.beginPath();
    ctx.moveTo(seg.from.x, seg.from.y);
    ctx.lineTo(seg.to.x, seg.to.y);
    ctx.stroke();
  }

  if (shape.labels.length > 0) {
    ctx.setLineDash([]);
    ctx.font = `${style.fontSize}px ui-monospace, monospace`;
    ctx.fillStyle = labelColor ?? style.color;
    for (const label of shape.labels) {
      ctx.textAlign = label.align ?? "left";
      ctx.textBaseline = label.baseline ?? "bottom";
      // Un contorno del color del fondo detrás del texto: sobre una vela verde
      // clara, el texto del mismo color del dibujo se pierde entero.
      if (haloColor) {
        ctx.save();
        ctx.lineWidth = 3;
        ctx.strokeStyle = haloColor;
        ctx.strokeText(label.text, label.at.x, label.at.y);
        ctx.restore();
      }
      ctx.fillText(label.text, label.at.x, label.at.y);
    }
  }

  if (handles && handles.length > 0) {
    ctx.setLineDash([]);
    ctx.fillStyle = style.color;
    ctx.lineWidth = 1.5;
    for (const h of handles) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      // El anillo separa el tirador de la vela que tenga debajo; sin fondo
      // conocido se queda sólo el punto, que se ve igual, sólo que peor.
      if (haloColor) {
        ctx.strokeStyle = haloColor;
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

/**
 * A qué distancia está un punto de la figura, en píxeles.
 *
 * Es lo que decide si un clic seleccionó un dibujo. Se mide contra los
 * segmentos y los bordes, no contra el relleno: pinchar dentro de un
 * rectángulo grande para moverlo sin querer es más molesto que tener que
 * pinchar su borde.
 */
export function distanceToShape(shape: Shape, x: number, y: number): number {
  let minima = Number.POSITIVE_INFINITY;

  for (const seg of shape.segments) {
    minima = Math.min(minima, distanceToSegment(x, y, seg.from.x, seg.from.y, seg.to.x, seg.to.y));
  }

  for (const poly of shape.polygons) {
    for (let i = 0; i < poly.points.length; i += 1) {
      const a = poly.points[i];
      const b = poly.points[(i + 1) % poly.points.length];
      minima = Math.min(minima, distanceToSegment(x, y, a.x, a.y, b.x, b.y));
    }
  }

  for (const el of shape.ellipses) {
    // Distancia aproximada al borde de la elipse: exacta requiere resolver una
    // cuártica, y para decidir un clic sobra con esto.
    const dx = (x - el.center.x) / (el.rx || 1);
    const dy = (y - el.center.y) / (el.ry || 1);
    const r = Math.hypot(dx, dy);
    minima = Math.min(minima, Math.abs(r - 1) * Math.min(Math.abs(el.rx), Math.abs(el.ry)));
  }

  for (const curve of shape.curves) {
    // La curva se aproxima por tramos rectos: veinte bastan para que el clic
    // caiga donde se ve la línea.
    let previo = curve.from;
    for (let i = 1; i <= 20; i += 1) {
      const t = i / 20;
      const punto = {
        x: (1 - t) ** 2 * curve.from.x + 2 * (1 - t) * t * curve.control.x + t ** 2 * curve.to.x,
        y: (1 - t) ** 2 * curve.from.y + 2 * (1 - t) * t * curve.control.y + t ** 2 * curve.to.y,
      };
      minima = Math.min(minima, distanceToSegment(x, y, previo.x, previo.y, punto.x, punto.y));
      previo = punto;
    }
  }

  return minima;
}

/** Distancia de un punto a un segmento, no a la recta que lo contiene. */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const largo2 = dx * dx + dy * dy;

  if (largo2 === 0) return Math.hypot(px - x1, py - y1);

  // Se recorta a [0,1] para quedarse dentro del segmento: sin eso, un clic
  // muy lejos pero alineado con la recta contaría como encima.
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / largo2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
