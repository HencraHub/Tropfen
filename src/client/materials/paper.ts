import * as THREE from 'three';

/** Small deterministic RNG for textures (independent of the game seed). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const PALETTE = {
  pappe: '#c9a76b', pappeDunkel: '#a37f47', kraft: '#e8d6ad', papier: '#f6f0e1', folie: '#5aa9e6', folieTief: '#2f6fb3',
  perle: '#a9dcff', glut: '#ff7a3d', frost: '#bfe8ff', moos: '#7fa650', tinte: '#2b2320', stempel: '#b5382e', nacht: '#1c2440',
  himmelTag: '#cfe6f5', himmelAbend: '#f0b489', stein: { granit: '#9a8f86', basalt: '#5d5a5f', kalkstein: '#d8cdb0', sandstein: '#d1a06a' } as Record<string, string>,
};

const texCache = new Map<string, THREE.Texture>();

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d')! };
}

/** Paper fibre: fine strokes in two directions on a base colour. */
export function paperTexture(base = '#ffffff', seed = 1, size = 256, fibres = 2600): THREE.Texture {
  const key = `paper:${base}:${seed}:${size}`;
  const cached = texCache.get(key);
  if (cached) return cached;
  const { canvas, ctx } = makeCanvas(size, size);
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.lineWidth = 1;
  for (let i = 0; i < fibres; i++) {
    const x = r() * size, y = r() * size;
    const len = 3 + r() * 9;
    const a = (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.6;
    ctx.strokeStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.09)';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  // faint blotches
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.03})`;
    ctx.beginPath(); ctx.arc(r() * size, r() * size, 6 + r() * 20, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

/** Corrugated cardboard edge: dark/light stripes with a bit of raggedness. */
export function corrugatedTexture(seed = 2, size = 128): THREE.Texture {
  const key = `corr:${seed}`;
  const cached = texCache.get(key);
  if (cached) return cached;
  const { canvas, ctx } = makeCanvas(size, size / 4);
  const r = rng(seed);
  ctx.fillStyle = PALETTE.pappe;
  ctx.fillRect(0, 0, size, size / 4);
  const period = 8;
  for (let x = 0; x < size; x += period) {
    ctx.fillStyle = PALETTE.pappeDunkel;
    ctx.beginPath();
    ctx.ellipse(x + period / 2, size / 8, period * 0.28, size / 8 - 2 + r() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, size, 2); ctx.fillRect(0, size / 4 - 2, size, 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

/** Cotton wool alpha blob for steam and clouds. */
export function cottonTexture(seed = 3, size = 128): THREE.Texture {
  const key = `cotton:${seed}`;
  const cached = texCache.get(key);
  if (cached) return cached;
  const { canvas, ctx } = makeCanvas(size, size);
  const r = rng(seed);
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = r() * size * 0.28;
    const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d;
    const rad = size * (0.12 + r() * 0.16);
    const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,252,245,0.9)');
    grd.addColorStop(0.7, 'rgba(255,252,245,0.45)');
    grd.addColorStop(1, 'rgba(255,252,245,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

/** Googly eye texture: white disc with black pupil drawn at an offset. */
export function eyeTexture(pupilX = 0, pupilY = 0, size = 96): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = PALETTE.papier;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.47, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = PALETTE.tinte; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = PALETTE.tinte;
  ctx.beginPath(); ctx.arc(size / 2 + pupilX * size * 0.22, size / 2 + pupilY * size * 0.22, size * 0.17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.arc(size / 2 + pupilX * size * 0.22 - 4, size / 2 + pupilY * size * 0.22 - 4, size * 0.05, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------ materials
export function paperMaterial(color: string, opts: { seed?: number; roughness?: number; repeat?: number; side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
  const tex = paperTexture('#ffffff', opts.seed ?? 1);
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), map: tex, roughness: opts.roughness ?? 0.95, metalness: 0, side: opts.side ?? THREE.FrontSide });
  if (opts.repeat) { m.map = tex.clone(); m.map.repeat.set(opts.repeat, opts.repeat); m.map.needsUpdate = true; }
  return m;
}

export function corrugatedMaterial(repeatX = 8): THREE.MeshStandardMaterial {
  const tex = corrugatedTexture().clone();
  tex.repeat.set(repeatX, 1);
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
}

export function foilMaterial(color = PALETTE.folie): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
}

export function beadMaterial(color = PALETTE.perle): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.05, metalness: 0.05, transparent: true, opacity: 0.85 });
}

export function cottonMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.papier), roughness: 1, metalness: 0, transparent: true, opacity: 0.9 });
}

/** Ink outline: EdgesGeometry lines in ink colour; wobble is applied by `wobbleEdges` each animation frame. */
export function inkOutline(geometry: THREE.BufferGeometry, threshold = 25, color = PALETTE.tinte): THREE.LineSegments {
  const edges = new THREE.EdgesGeometry(geometry, threshold);
  const base = edges.getAttribute('position').array.slice() as Float32Array;
  const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.85 });
  const lines = new THREE.LineSegments(edges, mat);
  lines.userData.baseEdges = base;
  lines.userData.wobbleAmp = 0.012;
  return lines;
}

/** Apply the 8 Hz stop-motion wobble to an outline (call once per animation frame with the frame index). */
export function wobbleEdges(lines: THREE.LineSegments, frame: number): void {
  const base = lines.userData.baseEdges as Float32Array | undefined;
  if (!base) return;
  if (lines.userData.lastFrame === frame) return;
  lines.userData.lastFrame = frame;
  const attr = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const amp = (lines.userData.wobbleAmp as number) ?? 0.01;
  const r = rng(frame * 7919 + 13);
  for (let i = 0; i < arr.length; i++) arr[i] = base[i] + (r() - 0.5) * amp * 2;
  attr.needsUpdate = true;
}

/** Flat "glued on" contact shadow under an object. */
export function contactShadow(radius: number, opacity = 0.35): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 20);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.renderOrder = 1;
  return m;
}
