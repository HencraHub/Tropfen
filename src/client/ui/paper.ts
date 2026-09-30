import { PALETTE } from '../materials/paper';
import { drawText } from './font';

/** Deterministic wobble for panel corners (frame-quantised). */
function wob(seed: number, frame: number, amp: number): number {
  let h = (seed * 2654435761 + frame * 40503) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return (((h & 0xffff) / 0xffff) * 2 - 1) * amp;
}

/** A torn-paper panel with an ink border and a drop shadow. `bubble` adds a speech tail bottom-left. */
export function drawPaperPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frame: number, bubble = false, color = PALETTE.kraft): void {
  ctx.save();
  const pts: [number, number][] = [];
  const n = 5;
  const edge = (ax: number, ay: number, bx: number, by: number, s: number) => { for (let i = 0; i < n; i++) { const t = i / n; pts.push([ax + (bx - ax) * t + wob(s + i, frame, 2.5), ay + (by - ay) * t + wob(s + i + 50, frame, 2.5)]); } };
  edge(x, y, x + w, y, 1); edge(x + w, y, x + w, y + h, 100); edge(x + w, y + h, x, y + h, 200); edge(x, y + h, x, y, 300);
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 6; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 4;
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  if (bubble) { ctx.lineTo(x + 30, y + h); ctx.lineTo(x + 14, y + h + 22); ctx.lineTo(x + 46, y + h); }
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = PALETTE.tinte; ctx.lineWidth = 1.6; ctx.stroke();
  // paper fibre hint
  ctx.globalAlpha = 0.08; ctx.strokeStyle = '#000';
  for (let i = 0; i < 12; i++) { const fx = x + ((i * 7919) % w), fy = y + ((i * 104729) % h); ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 8, fy + 2); ctx.stroke(); }
  ctx.restore();
}

/** Red council stamp, slightly rotated. */
export function drawStamp(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, frame: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.18 + wob(9, frame, 0.02));
  ctx.strokeStyle = PALETTE.stempel; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.85;
  const w = text.length * 11 + 24, h = 30;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
  drawText(ctx, text, 0, 8, { size: 15, color: PALETTE.stempel, align: 'center', frame, weight: 1.3, letterSpacing: 0.25 });
  ctx.restore();
}

/** Paper button; returns the rectangle for hit testing. */
export function drawButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, frame: number, focused: boolean, disabled = false): { x: number; y: number; w: number; h: number } {
  drawPaperPanel(ctx, x, y, w, h, frame, false, focused ? '#fff2c8' : PALETTE.kraft);
  if (focused) { ctx.save(); ctx.strokeStyle = PALETTE.stempel; ctx.lineWidth = 2.5; ctx.strokeRect(x - 3, y - 3, w + 6, h + 6); ctx.restore(); }
  drawText(ctx, label, x + w / 2, y + h / 2 + 7, { size: Math.min(20, h * 0.5), align: 'center', frame, color: disabled ? '#9a8f86' : PALETTE.tinte });
  return { x, y, w, h };
}

export function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number, color: string, frame: number): void {
  ctx.save();
  ctx.fillStyle = PALETTE.papier; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, Math.max(0, Math.min(1, ratio)) * w, h);
  ctx.strokeStyle = PALETTE.tinte; ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x + wob(1, frame, 1), y + wob(2, frame, 1)); ctx.lineTo(x + w + wob(3, frame, 1), y + wob(4, frame, 1)); ctx.lineTo(x + w + wob(5, frame, 1), y + h + wob(6, frame, 1)); ctx.lineTo(x + wob(7, frame, 1), y + h + wob(8, frame, 1)); ctx.closePath(); ctx.stroke();
  ctx.restore();
}
