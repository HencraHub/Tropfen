import { drawText, measureText } from './font';
import { drawPaperPanel, drawButton, drawBar } from './paper';
import { PALETTE } from '../materials/paper';
import type { InputSnapshot } from '../game/input';

/**
 * Immediate-mode paper UI. Screens call `begin` each frame, draw widgets in order, then `end`.
 * Focus moves with arrows / d-pad / stick; confirm with Enter/E/A; mouse hover focuses, click activates.
 */
export class UI {
  ctx: CanvasRenderingContext2D;
  frame = 0;
  input!: InputSnapshot;
  private items: { x: number; y: number; w: number; h: number; id: string }[] = [];
  focus = 0;
  private screenKey = '';
  private focusById = new Map<string, number>();
  hoverId: string | null = null;
  activated: string | null = null;
  private textFocusId: string | null = null;
  constructor(public canvas: HTMLCanvasElement) { this.ctx = canvas.getContext('2d')!; }

  begin(frame: number, input: InputSnapshot, screenKey: string): void {
    this.frame = frame; this.input = input;
    if (screenKey !== this.screenKey) { this.screenKey = screenKey; this.focus = this.focusById.get(screenKey) ?? 0; }
    this.items = [];
    // `activated` is NOT cleared here: end() of the previous frame set it, the widgets of this frame consume it
    this.hoverId = null;
    this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  end(): void {
    const n = this.items.length;
    if (n === 0) return;
    const inp = this.input;
    if (inp.down || inp.right) this.focus = (this.focus + 1) % n;
    if (inp.up || inp.left) this.focus = (this.focus - 1 + n) % n;
    // mouse hover moves focus
    for (let i = 0; i < n; i++) { const it = this.items[i]; if (inp.mouseX >= it.x && inp.mouseX <= it.x + it.w && inp.mouseY >= it.y && inp.mouseY <= it.y + it.h) { this.focus = i; this.hoverId = it.id; } }
    if (this.focus >= n) this.focus = n - 1;
    this.focusById.set(this.screenKey, this.focus);
    // a click activates what lies under the pointer, confirm activates the focused item; the widgets see it in the next frame
    this.activated = (inp.confirm && !this.textFocusId) || (inp.click && this.hoverId) ? (this.items[this.focus]?.id ?? null) : null;
  }

  private register(id: string, x: number, y: number, w: number, h: number): boolean {
    this.items.push({ x, y, w, h, id });
    return this.items.length - 1 === this.focus;
  }

  /** Returns true when activated this frame. */
  button(id: string, x: number, y: number, w: number, h: number, label: string, disabled = false): boolean {
    const focused = this.register(id, x, y, w, h);
    drawButton(this.ctx, x, y, w, h, label, this.frame, focused, disabled);
    return this.activated === id && !disabled;
  }

  /** Cycle through options; returns the possibly changed index. */
  select(id: string, x: number, y: number, w: number, h: number, label: string, options: string[], index: number): number {
    const focused = this.register(id, x, y, w, h);
    drawPaperPanel(this.ctx, x, y, w, h, this.frame, false, focused ? '#fff2c8' : PALETTE.kraft);
    if (focused) { this.ctx.save(); this.ctx.strokeStyle = PALETTE.stempel; this.ctx.lineWidth = 2.5; this.ctx.strokeRect(x - 3, y - 3, w + 6, h + 6); this.ctx.restore(); }
    drawText(this.ctx, label, x + 14, y + h / 2 + 6, { size: 15, frame: this.frame, color: '#5a4a3a' });
    drawText(this.ctx, `‹ ${options[index] ?? ''} ›`, x + w - 14, y + h / 2 + 6, { size: 16, frame: this.frame, align: 'right' });
    let next = index;
    if (focused && (this.input.right || this.input.next)) next = (index + 1) % options.length;
    if (focused && (this.input.left || this.input.prev)) next = (index - 1 + options.length) % options.length;
    if (this.activated === id) next = (index + 1) % options.length;
    return next;
  }

  slider(id: string, x: number, y: number, w: number, h: number, label: string, value: number, min: number, max: number, stepSize: number): number {
    const focused = this.register(id, x, y, w, h);
    drawPaperPanel(this.ctx, x, y, w, h, this.frame, false, focused ? '#fff2c8' : PALETTE.kraft);
    if (focused) { this.ctx.save(); this.ctx.strokeStyle = PALETTE.stempel; this.ctx.lineWidth = 2.5; this.ctx.strokeRect(x - 3, y - 3, w + 6, h + 6); this.ctx.restore(); }
    drawText(this.ctx, label, x + 14, y + h / 2 + 6, { size: 15, frame: this.frame, color: '#5a4a3a' });
    const bx = x + w * 0.5, bw = w * 0.42;
    drawBar(this.ctx, bx, y + h / 2 - 7, bw, 14, (value - min) / (max - min), PALETTE.folie, this.frame);
    let v = value;
    if (focused && (this.input.right || this.input.next)) v = Math.min(max, value + stepSize);
    if (focused && (this.input.left || this.input.prev)) v = Math.max(min, value - stepSize);
    if (this.input.click && this.input.mouseX >= bx && this.input.mouseX <= bx + bw && this.input.mouseY >= y && this.input.mouseY <= y + h) v = min + ((this.input.mouseX - bx) / bw) * (max - min);
    return Math.round(v / stepSize) * stepSize;
  }

  toggle(id: string, x: number, y: number, w: number, h: number, label: string, value: boolean, on: string, off: string): boolean {
    const i = this.select(id, x, y, w, h, label, [off, on], value ? 1 : 0);
    return i === 1;
  }

  /** Text field; typing goes to the focused field. */
  textInput(id: string, x: number, y: number, w: number, h: number, label: string, value: string, maxLen = 24): string {
    const focused = this.register(id, x, y, w, h);
    drawPaperPanel(this.ctx, x, y, w, h, this.frame, false, focused ? '#fff2c8' : PALETTE.kraft);
    if (focused) { this.ctx.save(); this.ctx.strokeStyle = PALETTE.stempel; this.ctx.lineWidth = 2.5; this.ctx.strokeRect(x - 3, y - 3, w + 6, h + 6); this.ctx.restore(); }
    drawText(this.ctx, label, x + 14, y + h / 2 + 6, { size: 15, frame: this.frame, color: '#5a4a3a' });
    const shown = value + (focused && this.frame % 2 === 0 ? '_' : '');
    drawText(this.ctx, shown, x + w - 14, y + h / 2 + 6, { size: 16, frame: this.frame, align: 'right' });
    this.textFocusId = focused ? id : this.textFocusId === id ? null : this.textFocusId;
    let v = value;
    if (focused) {
      if (this.input.typed) v = (v + this.input.typed).slice(0, maxLen);
      if (this.input.backspace) v = v.slice(0, -1);
    }
    return v;
  }

  get textFocused(): boolean { return this.textFocusId !== null && this.items[this.focus]?.id === this.textFocusId; }

  label(text: string, x: number, y: number, size = 16, color = PALETTE.tinte, align: 'left' | 'center' | 'right' = 'left'): void {
    drawText(this.ctx, text, x, y, { size, frame: this.frame, color, align });
  }
  panel(x: number, y: number, w: number, h: number, bubble = false, color?: string): void { drawPaperPanel(this.ctx, x, y, w, h, this.frame, bubble, color); }
  bar(x: number, y: number, w: number, h: number, ratio: number, color: string): void { drawBar(this.ctx, x, y, w, h, ratio, color, this.frame); }
  measure(text: string, size: number): number { return measureText(text, size); }
}
