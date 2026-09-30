import * as THREE from 'three';
import { PALETTE, foilMaterial, paperMaterial, inkOutline, beadMaterial, wobbleEdges } from '../materials/paper';
import type { SourceState, LandscapeDef } from '../../sim/index';
import { terrainHeight } from './terrain';

/** Foil strips and pools for the water sources. */
export function buildSource(src: SourceState, land: LandscapeDef): THREE.Group {
  const g = new THREE.Group();
  const y = terrainHeight(land, src.pos.x, src.pos.z);
  const outlines: THREE.LineSegments[] = [];
  if (src.kind === 'fluss') {
    // a long foil strip roughly perpendicular to the stone direction, with a few kinks
    const dirToStone = new THREE.Vector2(-src.pos.x, -src.pos.z).normalize();
    const along = new THREE.Vector2(-dirToStone.y, dirToStone.x);
    const pts: THREE.Vector2[] = [];
    for (let i = -8; i <= 8; i++) pts.push(new THREE.Vector2(src.pos.x + along.x * i * 14 + ((i * 7919) % 5) - 2, src.pos.z + along.y * i * 14 + ((i * 104729) % 7) - 3));
    const shape = new THREE.Shape();
    const w = 5;
    for (let i = 0; i < pts.length; i++) { const p = pts[i]; const q = new THREE.Vector2(p.x + dirToStone.x * w, p.y + dirToStone.y * w); if (i === 0) shape.moveTo(q.x, -q.y); else shape.lineTo(q.x, -q.y); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; const q = new THREE.Vector2(p.x - dirToStone.x * w, p.y - dirToStone.y * w); shape.lineTo(q.x, -q.y); }
    const geo = new THREE.ShapeGeometry(shape);
    const m = new THREE.Mesh(geo, foilMaterial(PALETTE.folie));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y + 0.06;
    g.add(m);
    const o = inkOutline(geo, 1); o.rotation.x = -Math.PI / 2; o.position.y = y + 0.08; o.userData.wobbleAmp = 0.05; g.add(o); outlines.push(o);
  } else if (src.kind === 'meer') {
    const geo = new THREE.PlaneGeometry(400, 160, 1, 1);
    const m = new THREE.Mesh(geo, foilMaterial(PALETTE.folieTief));
    m.rotation.x = -Math.PI / 2;
    const dir = new THREE.Vector2(src.pos.x, src.pos.z).normalize();
    m.position.set(src.pos.x + dir.x * 78, y + 0.05, src.pos.z + dir.y * 78);
    m.rotation.z = Math.atan2(dir.x, dir.y);
    g.add(m);
    // foam edge: paper strip
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(400, 3), paperMaterial(PALETTE.papier, { seed: 61, side: THREE.DoubleSide }));
    foam.rotation.x = -Math.PI / 2; foam.rotation.z = m.rotation.z;
    foam.position.set(src.pos.x - dir.x * 1, y + 0.09, src.pos.z - dir.y * 1);
    g.add(foam);
  } else if (src.kind === 'quelle') {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.5, 12), foilMaterial(PALETTE.perle));
    pool.rotation.x = -Math.PI / 2; pool.position.set(src.pos.x, y + 0.06, src.pos.z); g.add(pool);
    for (let i = 0; i < 5; i++) {
      const rockGeo = new THREE.DodecahedronGeometry(0.6 + (i % 3) * 0.25, 0);
      const r = new THREE.Mesh(rockGeo, paperMaterial('#8a8a90', { seed: 62 + i }));
      const a = (i / 5) * Math.PI * 2;
      r.position.set(src.pos.x + Math.cos(a) * 3.6, y + 0.4, src.pos.z + Math.sin(a) * 3.6);
      r.castShadow = true;
      g.add(r);
      const o = inkOutline(rockGeo, 10); o.position.copy(r.position); g.add(o); outlines.push(o);
    }
  } else if (src.kind === 'brunnen') {
    const ringGeo = new THREE.CylinderGeometry(1.6, 1.7, 1.1, 10, 1, true);
    const ring = new THREE.Mesh(ringGeo, paperMaterial('#a8a098', { seed: 63, side: THREE.DoubleSide }));
    ring.position.set(src.pos.x, y + 0.55, src.pos.z); ring.castShadow = true; g.add(ring);
    const o = inkOutline(ringGeo, 20); o.position.copy(ring.position); g.add(o); outlines.push(o);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.5, 10), foilMaterial(PALETTE.folieTief));
    water.rotation.x = -Math.PI / 2; water.position.set(src.pos.x, y + 0.8, src.pos.z); g.add(water);
    // winch: two sticks and a bar
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), paperMaterial('#8a6a3a', { seed: 64 })); post.position.set(src.pos.x + sx * 1.5, y + 1.6, src.pos.z); g.add(post); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6), paperMaterial('#8a6a3a', { seed: 64 })); bar.rotation.z = Math.PI / 2; bar.position.set(src.pos.x, y + 2.6, src.pos.z); g.add(bar);
  }
  g.userData.outlines = outlines;
  return g;
}

/** Instanced glass beads for moving water (pours, channel flow, spills). */
export class Beads {
  mesh: THREE.InstancedMesh;
  items: { pos: THREE.Vector3; vel: THREE.Vector3; life: number; size: number }[] = [];
  private dummy = new THREE.Object3D();
  constructor(max = 600) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 7, 6), beadMaterial(), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }
  spawn(pos: THREE.Vector3, vel: THREE.Vector3, life = 1, size = 1): void {
    if (this.items.length >= this.mesh.instanceMatrix.count) this.items.shift();
    this.items.push({ pos: pos.clone(), vel: vel.clone(), life, size });
  }
  update(dt: number, groundY: (x: number, z: number) => number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.vel.y -= 9.8 * dt;
      it.pos.addScaledVector(it.vel, dt);
      it.life -= dt;
      const gy = groundY(it.pos.x, it.pos.z);
      if (it.pos.y < gy) { it.pos.y = gy; it.vel.set(it.vel.x * 0.4, Math.abs(it.vel.y) * 0.2, it.vel.z * 0.4); it.life -= dt * 3; }
      if (it.life <= 0) { this.items.splice(i, 1); continue; }
    }
    this.mesh.count = this.items.length;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      this.dummy.position.copy(it.pos);
      this.dummy.scale.setScalar(it.size * (0.7 + Math.min(1, it.life)));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export function wobbleGroup(g: THREE.Group, frame: number): void {
  const list = g.userData.outlines as THREE.LineSegments[] | undefined;
  if (list) for (const o of list) wobbleEdges(o, frame);
}
