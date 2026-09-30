import * as THREE from 'three';
import { PALETTE, paperMaterial, inkOutline, wobbleEdges, contactShadow } from '../materials/paper';

const brass = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7 });

function paperPart(w: number, h: number, color: string, seed: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, 0.06);
  const m = new THREE.Mesh(geo, paperMaterial(color, { seed }));
  m.castShadow = true;
  g.add(m);
  const o = inkOutline(geo, 30);
  o.userData.wobbleAmp = 0.01;
  g.add(o);
  g.userData.outline = o;
  return g;
}

function joint(): THREE.Mesh {
  const j = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10), brass);
  j.rotation.x = Math.PI / 2;
  return j;
}

/** Jumping-jack figure: flat paper parts joined with brass paper fasteners, animated in 8 fps steps. */
export class Figure {
  group = new THREE.Group();
  torso: THREE.Group;
  head: THREE.Group;
  arms: THREE.Group[] = [];
  legs: THREE.Group[] = [];
  bucket: THREE.Mesh;
  hat: THREE.Mesh;
  private outlines: THREE.LineSegments[] = [];
  private lastFrame = -1;
  private lastPos = new THREE.Vector3();
  private phase = 0;
  eyes: THREE.Mesh[] = [];

  constructor(kind: 'player' | 'traeger' | 'esel' | 'bohrtrupp' | 'wart' = 'traeger', tint?: string) {
    const shirt = tint ?? (kind === 'player' ? '#d8563c' : kind === 'bohrtrupp' ? '#4f6fa8' : kind === 'wart' ? '#6b8a3a' : '#c9a76b');
    this.torso = paperPart(0.6, 0.8, shirt, 41);
    this.torso.position.y = 1.15;
    this.group.add(this.torso);
    this.head = paperPart(0.42, 0.46, '#f0c9a0', 42);
    this.head.position.set(0, 0.62, 0);
    const jn = joint(); jn.position.set(0, 0.4, 0.05); this.torso.add(jn);
    this.torso.add(this.head);
    // googly eyes on the head
    for (let i = 0; i < 2; i++) {
      const e = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), new THREE.MeshBasicMaterial({ color: PALETTE.papier }));
      e.position.set((i === 0 ? -0.1 : 0.1), 0.05, 0.04);
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.03, 8), new THREE.MeshBasicMaterial({ color: PALETTE.tinte }));
      p.position.z = 0.005; e.add(p);
      this.head.add(e);
      this.eyes.push(e);
    }
    this.hat = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.3, 6), paperMaterial(kind === 'player' ? '#3b6e8f' : kind === 'wart' ? '#8f3b3b' : '#8a6a3a', { seed: 43 }));
    this.hat.position.set(0, 0.34, 0);
    this.head.add(this.hat);
    for (let i = 0; i < 2; i++) {
      const arm = paperPart(0.16, 0.7, shirt, 44 + i);
      arm.position.set(i === 0 ? -0.36 : 0.36, 0.32, 0.03);
      const pivot = new THREE.Group();
      pivot.position.copy(arm.position);
      arm.position.set(0, -0.32, 0);
      pivot.add(arm);
      const j = joint(); j.position.set(0, 0, 0.05); pivot.add(j);
      this.torso.add(pivot);
      this.arms.push(pivot);
      const leg = paperPart(0.2, 0.75, '#5b4a3a', 46 + i);
      const lp = new THREE.Group();
      lp.position.set(i === 0 ? -0.16 : 0.16, -0.38, 0);
      leg.position.set(0, -0.36, 0);
      lp.add(leg);
      const j2 = joint(); j2.position.set(0, 0, 0.05); lp.add(j2);
      this.torso.add(lp);
      this.legs.push(lp);
    }
    this.bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.28, 10), paperMaterial('#8a7a6a', { seed: 48 }));
    this.bucket.position.set(0, -0.72, 0.05);
    this.arms[1].add(this.bucket);
    this.bucket.visible = false;
    this.group.add(contactShadow(0.45, 0.3));
    this.group.traverse((o) => { if ((o as THREE.LineSegments).isLineSegments) this.outlines.push(o as THREE.LineSegments); });
  }

  /** Animate: `moving` swings the limbs, `carrying` shows the bucket, `flat` lays the figure down (stumble). */
  update(frame: number, moving: boolean, carrying: number, flat: boolean, working: boolean): void {
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    if (moving) this.phase = (this.phase + 1) % 8;
    const swing = moving ? Math.sin((this.phase / 8) * Math.PI * 2) * 0.6 : 0;
    this.legs[0].rotation.x = swing; this.legs[1].rotation.x = -swing;
    if (carrying > 0) { this.arms[0].rotation.x = 0.1; this.arms[1].rotation.x = -0.1; this.bucket.visible = true; }
    else if (working) { const w = Math.sin((frame % 8) / 8 * Math.PI * 2); this.arms[0].rotation.x = -1.2 + w * 0.6; this.arms[1].rotation.x = -1.2 - w * 0.6; this.bucket.visible = false; }
    else { this.arms[0].rotation.x = -swing * 0.8; this.arms[1].rotation.x = swing * 0.8; this.bucket.visible = false; }
    // squash on steps
    const bob = moving ? (this.phase % 4 < 2 ? 0.04 : -0.04) : 0;
    this.torso.scale.set(1 - bob, 1 + bob, 1);
    this.group.rotation.x = flat ? -Math.PI / 2 + 0.2 : 0;
    this.group.position.y = flat ? 0.4 : 0;
    for (const o of this.outlines) wobbleEdges(o, frame);
  }

  /** Face the movement direction (quantised to 8 fps by callers). */
  face(dx: number, dz: number): void {
    if (Math.hypot(dx, dz) > 1e-4) this.group.rotation.y = Math.atan2(dx, dz);
  }
  get lastPosition(): THREE.Vector3 { return this.lastPos; }
}

/** The local player's cardboard hands at the bottom of the view. */
export class Hands {
  group = new THREE.Group();
  left: THREE.Group; right: THREE.Group;
  tool: THREE.Object3D | null = null;
  private outlines: THREE.LineSegments[] = [];
  private lastFrame = -1;
  constructor() {
    this.left = paperPart(0.22, 0.3, '#f0c9a0', 51);
    this.right = paperPart(0.22, 0.3, '#f0c9a0', 52);
    this.left.position.set(-0.36, -0.5, -0.8);
    this.right.position.set(0.36, -0.5, -0.8);
    this.left.scale.setScalar(0.55); this.right.scale.setScalar(0.55);
    this.left.rotation.set(-0.5, 0.3, 0.2);
    this.right.rotation.set(-0.5, -0.3, -0.2);
    // thumbs
    for (const [h, sx] of [[this.left, -1], [this.right, 1]] as [THREE.Group, number][]) {
      const t = paperPart(0.08, 0.16, '#f0c9a0', 53);
      t.position.set(sx * -0.14, 0.05, 0.02);
      t.rotation.z = sx * 0.6;
      h.add(t);
    }
    this.group.add(this.left, this.right);
    this.group.traverse((o) => { if ((o as THREE.LineSegments).isLineSegments) this.outlines.push(o as THREE.LineSegments); });
  }
  update(frame: number, moving: boolean, action: string | null, carry: number): void {
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    const bob = moving ? ((frame % 4) < 2 ? 0.03 : -0.03) : 0;
    this.left.position.y = -0.5 + bob;
    this.right.position.y = -0.5 - bob;
    if (action === 'pour') { this.right.rotation.x = -1.2; this.left.rotation.x = -1.2; }
    else if (action === 'scoop') { this.right.rotation.x = 0.2; this.left.rotation.x = 0.2; }
    else if (action) { const w = (frame % 4) < 2 ? 0.3 : -0.3; this.right.rotation.x = -0.5 + w; this.left.rotation.x = -0.5 - w; }
    else { this.right.rotation.x = -0.5; this.left.rotation.x = -0.5; }
    if (this.tool) this.tool.visible = true;
    this.group.position.y = carry > 0 ? -0.05 : 0;
    for (const o of this.outlines) wobbleEdges(o, frame);
  }
  setTool(obj: THREE.Object3D | null): void {
    if (this.tool) this.right.remove(this.tool);
    this.tool = obj;
    if (obj) { obj.position.set(0.05, -0.1, -0.15); this.right.add(obj); }
  }
}
