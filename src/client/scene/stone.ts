import * as THREE from 'three';
import { PALETTE, paperMaterial, inkOutline, wobbleEdges, eyeTexture, beadMaterial, contactShadow, makeCanvas } from '../materials/paper';
import { ZONES } from '../../sim/index';

/** The stone: a jittered polyhedron with googly eyes, paper mouth, cardboard eyebrows, an ink crack and sweat beads. */
export class StoneView {
  group = new THREE.Group();
  body: THREE.Mesh;
  outline: THREE.LineSegments;
  eyes: THREE.Mesh[] = [];
  eyeTex: THREE.CanvasTexture[] = [];
  brows: THREE.Mesh[] = [];
  mouth: THREE.Mesh;
  mouthCanvas: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
  mouthTex: THREE.CanvasTexture;
  crack: THREE.Line;
  crackPts: THREE.Vector3[] = [];
  sweat: THREE.Mesh[] = [];
  radius: number;
  private lastExpr = '';
  private lastPupil = [0, 0];
  private squash = 0;
  private lastProgressDrawn = -1;
  private lastLine = -1;
  private pupilSpring = { x: 0, y: 0, vx: 0, vy: 0 };
  baseColor = new THREE.Color();
  private lastTintFrame = -1;

  constructor(radius: number, rock: string, seed: number) {
    this.radius = radius;
    const geo = new THREE.IcosahedronGeometry(radius, 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    let s = seed;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      const f = 0.9 + rnd() * 0.14;
      v.multiplyScalar(f);
      v.y *= 0.82;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const color = PALETTE.stein[rock] ?? PALETTE.stein.granit;
    this.baseColor = new THREE.Color(color).multiplyScalar(1.25);
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { colors[i * 3] = this.baseColor.r; colors[i * 3 + 1] = this.baseColor.g; colors[i * 3 + 2] = this.baseColor.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = paperMaterial('#ffffff', { seed: 31, roughness: 0.9 });
    mat.vertexColors = true;
    this.body = new THREE.Mesh(geo, mat);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.group.add(this.body);
    this.outline = inkOutline(geo, 40);
    this.outline.userData.wobbleAmp = 0.02;
    (this.outline.material as THREE.LineBasicMaterial).opacity = 0.35;
    this.group.add(this.outline);
    // eyes: on the -z side (towards the players' start)
    for (let i = 0; i < 2; i++) {
      const tex = eyeTexture(0, 0);
      this.eyeTex.push(tex);
      const eye = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.17, 20), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      eye.position.set((i === 0 ? -1 : 1) * radius * 0.3, radius * 0.45, -radius * 0.86);
      eye.lookAt(eye.position.clone().add(new THREE.Vector3(0, 0.15, -1)));
      this.eyes.push(eye);
      this.group.add(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.36, radius * 0.06, 0.08), paperMaterial(PALETTE.pappeDunkel, { seed: 33 }));
      brow.position.set(eye.position.x, eye.position.y + radius * 0.24, eye.position.z - 0.05);
      brow.rotation.z = i === 0 ? 0.15 : -0.15;
      this.brows.push(brow);
      this.group.add(brow);
    }
    this.mouthCanvas = makeCanvas(256, 96);
    this.mouthTex = new THREE.CanvasTexture(this.mouthCanvas.canvas);
    this.mouthTex.colorSpace = THREE.SRGBColorSpace;
    this.mouth = new THREE.Mesh(new THREE.PlaneGeometry(radius * 0.7, radius * 0.26), new THREE.MeshBasicMaterial({ map: this.mouthTex, transparent: true }));
    this.mouth.position.set(0, radius * 0.08, -radius * 0.9);
    this.mouth.lookAt(this.mouth.position.clone().add(new THREE.Vector3(0, 0.1, -1)));
    this.group.add(this.mouth);
    this.drawMouth('neutral');
    this.crack = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: PALETTE.tinte, linewidth: 2 }));
    this.group.add(this.crack);
    const bead = beadMaterial(PALETTE.perle);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), bead);
      b.visible = false;
      this.sweat.push(b);
      this.group.add(b);
    }
    this.group.add(contactShadow(radius * 1.05, 0.4));
    this.group.position.y = radius * 0.82 - 1.2;
  }

  private drawMouth(expr: string): void {
    const { ctx, canvas } = this.mouthCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = PALETTE.tinte;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.fillStyle = PALETTE.kraft;
    const w = canvas.width, h = canvas.height;
    ctx.beginPath();
    switch (expr) {
      case 'grimasse': ctx.moveTo(30, 60); ctx.quadraticCurveTo(w / 2, 20, w - 30, 60); ctx.moveTo(60, 45); ctx.lineTo(60, 70); ctx.moveTo(w - 60, 45); ctx.lineTo(w - 60, 70); break;
      case 'schwitzen': ctx.moveTo(40, 50); ctx.lineTo(w - 40, 55); break;
      case 'zittern': ctx.moveTo(30, 50); for (let x = 30; x <= w - 30; x += 12) ctx.lineTo(x, 50 + ((x / 12) % 2 ? 8 : -8)); break;
      case 'genervt': ctx.moveTo(40, 60); ctx.lineTo(w - 40, 45); break;
      case 'luftanhalten': ctx.ellipse(w / 2, 50, 18, 24, 0, 0, Math.PI * 2); ctx.fill(); break;
      case 'grinsen': ctx.moveTo(30, 35); ctx.quadraticCurveTo(w / 2, 90, w - 30, 35); break;
      case 'schmerz': ctx.ellipse(w / 2, 50, 40, 30, 0, 0, Math.PI * 2); ctx.fill(); break;
      default: ctx.moveTo(40, 52); ctx.quadraticCurveTo(w / 2, 62, w - 40, 50);
    }
    ctx.stroke();
    this.mouthTex.needsUpdate = true;
  }

  /** Tint the stone by zone: glowing orange when hot, frosty blue when freezing, darker when wet (8 Hz). */
  tintZones(zones: { T: number; wet: number }[], frame: number): void {
    if (frame === this.lastTintFrame) return;
    this.lastTintFrame = frame;
    const geo = this.body.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const hot = new THREE.Color(PALETTE.glut), cold = new THREE.Color(PALETTE.frost), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const zone = ((Math.round((Math.atan2(x, z) / (Math.PI * 2)) * zones.length) % zones.length) + zones.length) % zones.length;
      const zz = zones[zone];
      c.copy(this.baseColor);
      if (zz.T > 45) c.lerp(hot, Math.min(0.55, (zz.T - 45) / 110));
      else if (zz.T < 3) c.lerp(cold, Math.min(0.5, (3 - zz.T) / 16));
      c.multiplyScalar(1 - zz.wet * 0.25);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  /** Update face, crack and sweat. `lookAt` is the world position of the local player. */
  update(dt: number, frame: number, expression: string, progress: number, line: number, hotness: number, lookAt: THREE.Vector3 | null, hitScale: number): void {
    // googly pupils: a spring that lags behind the head/look direction
    const target = lookAt ? new THREE.Vector3().subVectors(lookAt, this.group.position) : new THREE.Vector3(0, 0, -1);
    const tx = THREE.MathUtils.clamp(target.x / 40, -1, 1);
    const ty = THREE.MathUtils.clamp(-target.y / 30 + 0.2, -1, 1);
    const sp = this.pupilSpring;
    const k = 14, d = 3.5;
    sp.vx += (tx - sp.x) * k * dt - sp.vx * d * dt; sp.vy += (ty - sp.y) * k * dt - sp.vy * d * dt;
    sp.x += sp.vx * dt; sp.y += sp.vy * dt;
    if (frame % 1 === 0) {
      const px = Math.round(sp.x * 4) / 4, py = Math.round(sp.y * 4) / 4;
      if (px !== this.lastPupil[0] || py !== this.lastPupil[1]) {
        this.lastPupil = [px, py];
        for (let i = 0; i < 2; i++) {
          const tex = eyeTexture(expression === 'grimasse' ? (i === 0 ? -0.6 : 0.6) : px, py);
          (this.eyes[i].material as THREE.MeshBasicMaterial).map = tex;
          (this.eyes[i].material as THREE.MeshBasicMaterial).needsUpdate = true;
        }
      }
    }
    if (expression !== this.lastExpr) {
      this.lastExpr = expression;
      this.drawMouth(expression);
      const angry = expression === 'grimasse' || expression === 'genervt';
      this.brows[0].rotation.z = angry ? -0.35 : expression === 'luftanhalten' ? 0.4 : 0.15;
      this.brows[1].rotation.z = angry ? 0.35 : expression === 'luftanhalten' ? -0.4 : -0.15;
    }
    // squash & stretch on hits, stop-motion
    this.squash = Math.max(0, this.squash - dt * 2.5);
    if (hitScale > this.squash) this.squash = Math.min(0.15, hitScale);
    const q = Math.round(this.squash * 16) / 16;
    this.group.scale.set(1 + q, 1 - q, 1 + q);
    // shiver when frozen
    if (expression === 'zittern') this.group.position.x = ((frame % 2) - 0.5) * 0.08; else this.group.position.x = 0;
    // sweat beads when hot
    const drops = Math.round(THREE.MathUtils.clamp((hotness - 50) / 12, 0, 6));
    for (let i = 0; i < this.sweat.length; i++) {
      const b = this.sweat[i];
      b.visible = i < drops;
      if (b.visible) {
        const t = ((frame * 0.125 * (0.5 + i * 0.1)) % 3) / 3;
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const r = this.radius * (0.95 - t * 0.1);
        b.position.set(Math.cos(a) * r, this.radius * 0.6 - t * this.radius * 1.1, Math.sin(a) * r);
        b.scale.setScalar(1 + t * 0.6);
      }
    }
    // crack: grows along the split line over the top of the stone
    const pDrawn = Math.round(progress * 40) / 40;
    if (pDrawn !== this.lastProgressDrawn || line !== this.lastLine) {
      this.lastProgressDrawn = pDrawn; this.lastLine = line;
      this.rebuildCrack(pDrawn, line);
    }
    wobbleEdges(this.outline, frame);
  }

  private rebuildCrack(progress: number, line: number): void {
    const pts: THREE.Vector3[] = [];
    if (progress > 0.005) {
      const a = (line / ZONES) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const n = 40;
      const half = Math.min(1, progress * 1.15);
      let s2 = line * 977 + 13;
      const rnd = () => { s2 = (s2 * 1664525 + 1013904223) >>> 0; return s2 / 4294967296 - 0.5; };
      for (let i = -n; i <= n; i++) {
        const t = i / n; // -1..1 across the stone
        if (Math.abs(t) > half) continue;
        const along = dir.clone().multiplyScalar(t * this.radius * 1.02);
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(rnd() * 0.9 * this.radius * 0.18);
        const p = along.add(side);
        const y = Math.sqrt(Math.max(0, this.radius * this.radius - p.x * p.x - p.z * p.z)) * 0.82 + 0.06;
        pts.push(new THREE.Vector3(p.x, y, p.z));
      }
    }
    this.crackPts = pts;
    this.crack.geometry.dispose();
    this.crack.geometry = new THREE.BufferGeometry().setFromPoints(pts.length > 1 ? pts : [new THREE.Vector3(), new THREE.Vector3()]);
    this.crack.visible = pts.length > 1;
  }
}
