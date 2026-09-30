/**
 * „Klammerschrift“ – a stroke font drawn entirely in code (docs/STIL.md §2).
 * Each glyph: polylines in a unit box; x from 0 to the glyph width, y from 0 (cap height) to 1 (baseline),
 * descenders reach 1.3. Rendered with a quantised 8 Hz wobble so text looks hand-drawn.
 */

type Glyph = { w: number; strokes: number[][][] };

function g(w: number, def: string): Glyph {
  const strokes = def.split('|').map((s) => s.trim().split(/\s+/).map((p) => p.split(',').map(Number)));
  return { w, strokes };
}

const O_STROKE = '.25,0 .75,0 1,.25 1,.75 .75,1 .25,1 0,.75 0,.25 .25,0';
const o_STROKE = '.2,.4 .6,.4 .8,.6 .8,.85 .6,1 .2,1 0,.85 0,.6 .2,.4';
const u_STROKE = '0,.4 0,.85 .2,1 .55,1 .8,.85|.8,.4 .8,1';
const a_STROKE = '.8,.4 .8,1|.8,.55 .6,.4 .2,.4 0,.6 0,.85 .2,1 .6,1 .8,.85';
const DOTS = (y: number, x1: number, x2: number) => `|${x1},${y} ${x1 + 0.04},${y + 0.02}|${x2},${y} ${x2 + 0.04},${y + 0.02}`;

const GLYPHS: Record<string, Glyph> = {
  ' ': g(0.45, ''),
  A: g(1, '0,1 .5,0 1,1|.2,.65 .8,.65'),
  B: g(0.95, '0,1 0,0 .7,0 .9,.15 .9,.35 .7,.5 0,.5|.7,.5 .95,.65 .95,.85 .75,1 0,1'),
  C: g(0.95, '1,.15 .75,0 .25,0 0,.2 0,.8 .25,1 .75,1 1,.85'),
  D: g(0.95, '0,1 0,0 .65,0 1,.3 1,.7 .65,1 0,1'),
  E: g(0.85, '1,0 0,0 0,1 1,1|0,.5 .7,.5'),
  F: g(0.8, '1,0 0,0 0,1|0,.5 .7,.5'),
  G: g(1, '1,.15 .75,0 .25,0 0,.2 0,.8 .25,1 .75,1 1,.8 1,.55 .6,.55'),
  H: g(0.95, '0,0 0,1|1,0 1,1|0,.5 1,.5'),
  I: g(0.4, '.2,0 .2,1|0,0 .4,0|0,1 .4,1'),
  J: g(0.7, '.7,0 .7,.8 .5,1 .2,1 0,.8'),
  K: g(0.9, '0,0 0,1|1,0 0,.55|.3,.4 1,1'),
  L: g(0.8, '0,0 0,1 1,1'),
  M: g(1.1, '0,1 0,0 .5,.6 1,0 1,1'),
  N: g(1, '0,1 0,0 1,1 1,0'),
  O: g(1, O_STROKE),
  P: g(0.9, '0,1 0,0 .75,0 1,.2 1,.4 .75,.55 0,.55'),
  Q: g(1, O_STROKE + '|.6,.7 1,1.1'),
  R: g(0.95, '0,1 0,0 .75,0 1,.2 1,.4 .75,.55 0,.55|.5,.55 1,1'),
  S: g(0.9, '1,.15 .75,0 .25,0 0,.2 .15,.45 .85,.55 1,.8 .75,1 .25,1 0,.85'),
  T: g(0.9, '0,0 1,0|.5,0 .5,1'),
  U: g(0.95, '0,0 0,.8 .25,1 .75,1 1,.8 1,0'),
  V: g(1, '0,0 .5,1 1,0'),
  W: g(1.3, '0,0 .25,1 .5,.3 .75,1 1,0'),
  X: g(0.95, '0,0 1,1|1,0 0,1'),
  Y: g(0.95, '0,0 .5,.5 1,0|.5,.5 .5,1'),
  Z: g(0.9, '0,0 1,0 0,1 1,1'),
  Ä: g(1, '0,1 .5,0 1,1|.2,.65 .8,.65' + DOTS(-0.3, 0.3, 0.66)),
  Ö: g(1, O_STROKE + DOTS(-0.3, 0.3, 0.66)),
  Ü: g(0.95, '0,0 0,.8 .25,1 .75,1 1,.8 1,0' + DOTS(-0.3, 0.3, 0.66)),
  ß: g(0.85, '0,1 0,.2 .2,0 .55,0 .7,.15 .7,.35 .5,.5 .75,.6 .8,.85 .6,1 .4,1'),
  a: g(0.8, a_STROKE),
  b: g(0.8, '0,0 0,1|0,.55 .25,.4 .6,.4 .8,.6 .8,.85 .6,1 .25,1 0,.85'),
  c: g(0.7, '.7,.5 .5,.4 .2,.4 0,.6 0,.85 .2,1 .5,1 .7,.9'),
  d: g(0.8, '.8,0 .8,1|.8,.55 .55,.4 .2,.4 0,.6 0,.85 .2,1 .55,1 .8,.85'),
  e: g(0.75, '0,.7 .75,.7 .75,.5 .55,.4 .2,.4 0,.6 0,.85 .2,1 .6,1 .75,.9'),
  f: g(0.6, '.6,.05 .45,0 .25,.1 .2,.3 .2,1|0,.45 .5,.45'),
  g: g(0.8, '.8,.4 .8,1.1 .6,1.3 .2,1.3 0,1.15|.8,.55 .55,.4 .2,.4 0,.6 0,.85 .2,1 .55,1 .8,.85'),
  h: g(0.8, '0,0 0,1|0,.55 .25,.4 .6,.4 .8,.6 .8,1'),
  i: g(0.3, '.15,.4 .15,1|.15,.1 .18,.13'),
  j: g(0.4, '.3,.4 .3,1.1 .15,1.3 0,1.2|.3,.1 .33,.13'),
  k: g(0.75, '0,0 0,1|.7,.4 0,.8|.25,.65 .75,1'),
  l: g(0.3, '.15,0 .15,1'),
  m: g(1.15, '0,1 0,.4|0,.55 .2,.4 .45,.4 .55,.55 .55,1|.55,.55 .75,.4 .95,.4 1.1,.55 1.1,1'),
  n: g(0.8, '0,1 0,.4|0,.55 .25,.4 .6,.4 .8,.6 .8,1'),
  o: g(0.8, o_STROKE),
  p: g(0.8, '0,.4 0,1.3|0,.55 .25,.4 .6,.4 .8,.6 .8,.85 .6,1 .25,1 0,.85'),
  q: g(0.8, '.8,.4 .8,1.3|.8,.55 .55,.4 .2,.4 0,.6 0,.85 .2,1 .55,1 .8,.85'),
  r: g(0.6, '0,1 0,.4|0,.6 .25,.4 .6,.4'),
  s: g(0.65, '.65,.5 .45,.4 .15,.4 0,.55 .15,.7 .5,.75 .65,.9 .5,1 .15,1 0,.9'),
  t: g(0.55, '.2,.1 .2,.85 .35,1 .55,.95|0,.45 .5,.45'),
  u: g(0.8, u_STROKE),
  v: g(0.8, '0,.4 .4,1 .8,.4'),
  w: g(1.1, '0,.4 .25,1 .55,.55 .85,1 1.1,.4'),
  x: g(0.75, '0,.4 .75,1|.75,.4 0,1'),
  y: g(0.8, '0,.4 .4,1|.8,.4 .35,1.3 .15,1.3'),
  z: g(0.7, '0,.4 .7,.4 0,1 .7,1'),
  ä: g(0.8, a_STROKE + DOTS(0.12, 0.22, 0.56)),
  ö: g(0.8, o_STROKE + DOTS(0.12, 0.22, 0.56)),
  ü: g(0.8, u_STROKE + DOTS(0.12, 0.22, 0.56)),
  '0': g(0.7, '.15,0 .55,0 .7,.2 .7,.8 .55,1 .15,1 0,.8 0,.2 .15,0|.15,.85 .55,.15'),
  '1': g(0.7, '.1,.2 .4,0 .4,1|.1,1 .7,1'),
  '2': g(0.7, '0,.2 .2,0 .55,0 .7,.2 .7,.35 0,1 .7,1'),
  '3': g(0.7, '0,.1 .2,0 .55,0 .7,.15 .7,.35 .5,.5 .7,.65 .7,.85 .55,1 .2,1 0,.9|.3,.5 .5,.5'),
  '4': g(0.7, '.55,1 .55,0 0,.7 .7,.7'),
  '5': g(0.7, '.7,0 .1,0 0,.5 .45,.4 .7,.6 .7,.85 .5,1 .15,1 0,.9'),
  '6': g(0.7, '.65,.05 .35,0 .1,.2 0,.6 0,.85 .2,1 .55,1 .7,.85 .7,.6 .5,.45 .15,.45 0,.6'),
  '7': g(0.7, '0,0 .7,0 .25,1'),
  '8': g(0.7, '.35,.45 .15,.35 .15,.1 .35,0 .55,.1 .55,.35 .35,.45 .1,.6 .1,.85 .35,1 .6,.85 .6,.6 .35,.45'),
  '9': g(0.7, '.7,.4 .55,.55 .2,.55 0,.4 0,.15 .2,0 .55,0 .7,.15 .7,.7 .55,1 .1,1'),
  '.': g(0.25, '.1,.9 .15,.95 .1,1'),
  ',': g(0.3, '.15,.9 .18,1 .05,1.2'),
  ':': g(0.25, '.1,.5 .14,.53|.1,.95 .14,.98'),
  ';': g(0.3, '.15,.5 .19,.53|.15,.9 .18,1 .05,1.2'),
  '!': g(0.3, '.15,0 .15,.7|.15,.9 .15,1'),
  '?': g(0.7, '0,.2 .2,0 .5,0 .7,.2 .7,.4 .35,.55 .35,.7|.35,.9 .35,1'),
  '-': g(0.6, '0,.6 .6,.6'),
  '–': g(0.9, '0,.6 .9,.6'),
  '(': g(0.4, '.4,0 .1,.2 0,.5 .1,.8 .4,1'),
  ')': g(0.4, '0,0 .3,.2 .4,.5 .3,.8 0,1'),
  '/': g(0.6, '0,1 .6,0'),
  "'": g(0.2, '.1,0 .1,.25'),
  '"': g(0.4, '.1,0 .1,.25|.3,0 .3,.25'),
  '%': g(0.9, '0,1 .9,0|.1,0 .3,0 .3,.25 .1,.25 .1,0|.6,.75 .8,.75 .8,1 .6,1 .6,.75'),
  '&': g(0.95, '.9,1 .3,.4 .3,.15 .45,0 .6,.15 .55,.35 0,.75 .1,.95 .35,1 .6,.8 .8,.55'),
  '+': g(0.7, '0,.6 .7,.6|.35,.25 .35,.95'),
  '=': g(0.7, '0,.45 .7,.45|0,.75 .7,.75'),
  '°': g(0.4, '.1,0 .3,0 .4,.1 .4,.25 .3,.35 .1,.35 0,.25 0,.1 .1,0'),
  '€': g(0.85, '.85,.15 .65,0 .35,0 .15,.2 .1,.5 .15,.8 .35,1 .65,1 .85,.85|0,.4 .6,.4|0,.6 .55,.6'),
  '*': g(0.6, '.3,0 .3,.5|.05,.12 .55,.38|.55,.12 .05,.38'),
  '×': g(0.6, '.05,.3 .55,.8|.55,.3 .05,.8'),
  '→': g(1, '0,.55 1,.55|.7,.3 1,.55 .7,.8'),
  '·': g(0.3, '.12,.55 .16,.58'),
  '[': g(0.4, '.4,0 .1,0 .1,1 .4,1'),
  ']': g(0.4, '0,0 .3,0 .3,1 0,1'),
  '_': g(0.8, '0,1.1 .8,1.1'),
  '#': g(0.8, '.25,0 .15,1|.65,0 .55,1|0,.35 .8,.35|0,.7 .8,.7'),
  '@': g(1, '.7,.35 .5,.3 .35,.45 .35,.65 .5,.75 .7,.65 .7,.35 .75,.75 .95,.6 .95,.3 .75,.05 .4,0 .1,.2 0,.55 .15,.9 .5,1 .8,.95'),
};

const wobbleCache = new Map<number, number>();
function wobble(seed: number): number {
  let v = wobbleCache.get(seed);
  if (v === undefined) {
    let h = (seed * 2654435761) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
    v = ((h & 0xffff) / 0xffff) * 2 - 1;
    wobbleCache.set(seed, v);
  }
  return v;
}

export interface TextStyle {
  size: number;
  color?: string;
  weight?: number;      // stroke width factor (1 = normal)
  wobble?: number;      // 0..1, default 1
  align?: 'left' | 'center' | 'right';
  frame?: number;       // 8 Hz frame index for the stop-motion wobble
  letterSpacing?: number;
}

export function glyphOf(ch: string): Glyph {
  return GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()] ?? GLYPHS['?'];
}

export function measureText(text: string, size: number, letterSpacing = 0.12): number {
  let w = 0;
  for (const ch of text) w += (glyphOf(ch).w + letterSpacing) * size;
  return w;
}

/** Draw text with the stroke font. y is the baseline. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, style: TextStyle): number {
  const size = style.size;
  const ls = style.letterSpacing ?? 0.12;
  const total = measureText(text, size, ls);
  let cx = x;
  if (style.align === 'center') cx = x - total / 2;
  else if (style.align === 'right') cx = x - total;
  const frame = style.frame ?? 0;
  const wob = (style.wobble ?? 1) * size * 0.035;
  ctx.save();
  ctx.strokeStyle = style.color ?? '#2b2320';
  ctx.lineWidth = Math.max(1, size * 0.085 * (style.weight ?? 1));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let idx = 0;
  for (const ch of text) {
    const gl = glyphOf(ch);
    for (let si = 0; si < gl.strokes.length; si++) {
      const st = gl.strokes[si];
      if (st.length < 2 || st[0].length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < st.length; i++) {
        const seedBase = (idx * 131 + si * 17 + i * 7 + frame * 3) | 0;
        const px = cx + st[i][0] * size + wobble(seedBase) * wob;
        const py = y - size + st[i][1] * size + wobble(seedBase + 1) * wob;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    cx += (gl.w + ls) * size;
    idx++;
  }
  ctx.restore();
  return total;
}

/** Word-wrap into lines that fit `maxWidth`. */
export function wrapText(text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const candidate = line ? line + ' ' + w : w;
      if (measureText(candidate, size) > maxWidth && line) { lines.push(line); line = w; }
      else line = candidate;
    }
    lines.push(line);
  }
  return lines;
}
