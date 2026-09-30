import * as THREE from 'three';
import { landscapeDef, zonePos, zoneDir, weatherNow, hourOf, ZONES, type GameState, type LogEntry, type Route, type LandscapeDef, content } from '../../sim/index';
import { buildTerrain, buildPath, terrainHeight } from '../scene/terrain';
import { Sky } from '../scene/sky';
import { StoneView } from '../scene/stone';
import { Figure, Hands } from '../scene/figures';
import { buildSource, Beads, wobbleGroup } from '../scene/water';
import { buildBuilding, type BuildingView } from '../scene/buildings';
import { PALETTE, paperMaterial, cottonTexture, inkOutline, wobbleEdges, contactShadow } from '../materials/paper';

export interface Pick {
  kind: 'zone' | 'source' | 'village' | 'forest' | 'building' | 'route' | 'chain' | 'none';
  id?: string;
  zone?: number;
  dist: number;
  pos: THREE.Vector3;
}

export interface ViewSettings { shadows: boolean; particles: number; scale: number; fov: number }

interface Puff { sprite: THREE.Sprite; life: number; vy: number }

export class WorldView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sky: Sky;
  stone: StoneView;
  land: LandscapeDef;
  terrain: THREE.Group;
  beads = new Beads(900);
  hands = new Hands();
  players = new Map<string, Figure>();
  workers = new Map<string, Figure>();
  buildings = new Map<string, BuildingView>();
  routes = new Map<string, THREE.Group>();
  sources: THREE.Group[] = [];
  puffs: Puff[] = [];
  confetti: THREE.Mesh[] = [];
  private prevPos = new Map<string, THREE.Vector3>();
  private cotton = cottonTexture(5);
  private hitScale = 0;
  private outlines: THREE.LineSegments[] = [];
  private villagePos: THREE.Vector3;
  private forestPos: THREE.Vector3;
  private stoneHalves: THREE.Mesh[] = [];
  private splitT = -1;
  private zoneMarker: THREE.Mesh;
  private previewGroup = new THREE.Group();
  particlesLevel = 1;

  constructor(gl: HTMLCanvasElement, state: GameState, settings: ViewSettings) {
    this.renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5) * settings.scale);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    this.camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.05, 420);
    this.particlesLevel = settings.particles;
    this.land = landscapeDef(state.landscape);
    this.terrain = buildTerrain(state.landscape);
    this.scene.add(this.terrain);
    this.villagePos = new THREE.Vector3(this.land.village[0], terrainHeight(this.land, this.land.village[0], this.land.village[1]), this.land.village[1]);
    this.forestPos = new THREE.Vector3(this.land.forest[0], terrainHeight(this.land, this.land.forest[0], this.land.forest[1]), this.land.forest[1]);
    this.scene.add(buildPath(this.land, { x: 0, z: -(state.stone.radius + 2) }, { x: this.land.village[0], z: this.land.village[1] }));
    for (const s of state.sources) if (s.kind !== 'regen' && s.kind !== 'tau') { this.scene.add(buildPath(this.land, { x: 0, z: 0 }, s.pos)); const g = buildSource(s, this.land); this.sources.push(g); this.scene.add(g); }
    this.sky = new Sky(this.scene, settings.shadows, 7);
    this.stone = new StoneView(state.stone.radius, state.stone.rock, 7);
    this.scene.add(this.stone.group);
    this.scene.add(this.beads.mesh);
    this.camera.add(this.hands.group);
    this.scene.add(this.camera);
    this.scene.add(this.previewGroup);
    // village: houses and a well-trodden square
    const houses = ['baracke', 'marktstand', 'schreibstube', 'baracke'];
    houses.forEach((h, i) => { const b = buildBuilding(h, 100 + i); const a = (i / houses.length) * Math.PI * 2; const x = this.land.village[0] + Math.cos(a) * 7, z = this.land.village[1] + Math.sin(a) * 7; b.group.position.set(x, terrainHeight(this.land, x, z), z); b.group.rotation.y = -a + Math.PI / 2; b.update(0, 0, 1, {}); this.scene.add(b.group); this.buildings.set('village' + i, b); });
    const sign = buildBuilding('marktstand', 200); sign.group.position.copy(this.villagePos); sign.group.scale.setScalar(0.6); sign.update(0, 0, 1, {}); this.scene.add(sign.group); this.buildings.set('villageSign', sign);
    for (let i = 0; i < 16; i++) { const x = this.land.forest[0] + ((i * 37) % 30) - 15, z = this.land.forest[1] + ((i * 53) % 26) - 13; const t = buildBuilding('baum', i); t.group.position.set(x, terrainHeight(this.land, x, z), z); t.update(0, 0, 1, {}); this.scene.add(t.group); this.buildings.set('tree' + i, t); }
    // zone marker ring on the stone
    this.zoneMarker = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 24), new THREE.MeshBasicMaterial({ color: PALETTE.stempel, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false }));
    this.zoneMarker.rotation.x = -Math.PI / 2; this.zoneMarker.visible = false; this.zoneMarker.renderOrder = 5;
    this.scene.add(this.zoneMarker);
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  groundY(x: number, z: number): number { return terrainHeight(this.land, x, z); }

  /** Sync everything with the state and render. */
  update(state: GameState, dt: number, frame: number, localPid: string, yaw: number, pitch: number, timeSec: number, tickAlpha: number, predicted: { x: number; z: number } | null): void {
    const hour = hourOf(state.tick);
    const w = weatherNow(state);
    this.sky.update(hour, w.cloud, w.sun, frame, this.renderer, this.scene, timeSec);
    // stone
    const hot = state.stone.zones.reduce((a, z) => a + z.T, 0) / ZONES;
    const me = state.players.find((p) => p.id === localPid);
    const lookFrom = me ? new THREE.Vector3(me.pos.x, this.groundY(me.pos.x, me.pos.z) + 1.6, me.pos.z) : null;
    this.stone.update(dt, frame, state.stone.expression, state.stone.progress / state.stone.hp, state.stone.line, hot, lookFrom, this.hitScale);
    this.hitScale = Math.max(0, this.hitScale - dt);
    // players
    for (const p of state.players) {
      if (p.id === localPid) continue;
      let f = this.players.get(p.id);
      if (!f) { f = new Figure('player', ['#d8563c', '#4f6fa8', '#e8b04a', '#7fa650'][this.players.size % 4]); this.scene.add(f.group); this.players.set(p.id, f); }
      const pos = this.smooth('p' + p.id, p.pos.x, p.pos.z, tickAlpha);
      const moving = pos.moved;
      f.group.position.set(pos.x, this.groundY(pos.x, pos.z), pos.z);
      if (moving) f.face(pos.dx, pos.dz); else f.group.rotation.y = p.yaw;
      f.update(frame, moving, p.carry, p.stun > 0, !!p.action);
      f.group.visible = p.connected;
    }
    for (const [id, f] of this.players) if (!state.players.some((p) => p.id === id)) { this.scene.remove(f.group); this.players.delete(id); }
    // workers (chain members are lined up between source and target)
    const chainSlots = new Map<string, THREE.Vector3>();
    for (const c of state.chains) {
      const src = state.sources.find((s) => s.id === c.source);
      if (!src) continue;
      const tgt = c.target.kind === 'zone' ? zonePos(state, c.target.zone) : state.buildings.find((b) => b.id === (c.target as { id: string }).id)?.pos;
      if (!tgt) continue;
      const members = [...c.workers, ...c.players];
      members.forEach((id, i) => { const t = (i + 1) / (members.length + 1); chainSlots.set(id, new THREE.Vector3(src.pos.x + (tgt.x - src.pos.x) * t, 0, src.pos.z + (tgt.z - src.pos.z) * t)); });
    }
    for (const wk of state.workers) {
      let f = this.workers.get(wk.id);
      if (!f) { f = new Figure(wk.kind === 'esel' ? 'esel' : wk.kind === 'bohrtrupp' ? 'bohrtrupp' : wk.kind === 'wart' ? 'wart' : 'traeger'); this.scene.add(f.group); this.workers.set(wk.id, f); }
      const slot = chainSlots.get(wk.id);
      const pos = slot ? { x: slot.x, z: slot.z, dx: 0, dz: 0, moved: false } : this.smooth('w' + wk.id, wk.pos.x, wk.pos.z, tickAlpha);
      f.group.position.set(pos.x, this.groundY(pos.x, pos.z), pos.z);
      if (pos.moved) f.face(pos.dx, pos.dz);
      const busy = wk.phase === 'loading' || wk.phase === 'drill' || wk.phase === 'wedge' || wk.phase === 'repair' || wk.phase === 'chop' || wk.phase === 'tread' || !!slot;
      f.update(frame, pos.moved, wk.carry, wk.stumble > 0, busy);
      if (slot) f.group.rotation.y = Math.atan2(-slot.x, -slot.z) + ((frame % 8) < 4 ? 0.5 : -0.5);
    }
    for (const [id, f] of this.workers) if (!state.workers.some((w) => w.id === id)) { this.scene.remove(f.group); this.workers.delete(id); }
    // buildings
    for (const b of state.buildings) {
      let v = this.buildings.get(b.id);
      if (!v) { v = buildBuilding(b.type, b.id.length * 31 + state.buildings.indexOf(b)); v.group.position.set(b.pos.x, this.groundY(b.pos.x, b.pos.z), b.pos.z); if (b.zone !== null) v.group.rotation.y = Math.atan2(-b.pos.x, -b.pos.z); this.scene.add(v.group); this.buildings.set(b.id, v); }
      const def = content.buildings.find((d) => d.id === b.type);
      const built = def ? 1 - b.ticksToBuild / def.buildTicks : 1;
      v.update(frame, dt, built, { fill: b.cap > 0 ? b.liters / b.cap : 0, burning: b.timer > 0, wind: this.land.climate.wind * w.wind, active: b.active && (b.type !== 'brennspiegel' || w.sun > 0.3) && (b.type !== 'strahlwerk' || state.eco.energyRatio > 0.05) && (b.type !== 'tretmuehle' || b.workers.length > 0) });
    }
    for (const [id, v] of this.buildings) if (!id.startsWith('village') && !id.startsWith('tree') && !state.buildings.some((b) => b.id === id)) { this.scene.remove(v.group); this.buildings.delete(id); }
    // routes
    for (const r of state.routes) {
      let g = this.routes.get(r.id);
      if (!g) { g = this.buildRoute(r); this.scene.add(g); this.routes.set(r.id, g); }
      wobbleGroup(g, frame);
      const broken = r.condition < 0.3;
      g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && m.color && o.userData.baseColor) m.color.set(broken ? '#7a6a5a' : o.userData.baseColor); });
      if (r.flow > 0.05 && this.particlesLevel > 0 && frame % 2 === 0) { const t = (timeSec * 0.5 + r.id.length) % 1; const p = this.pointOnRoute(r, t); this.beads.spawn(new THREE.Vector3(p.x, this.groundY(p.x, p.z) + 0.5, p.z), new THREE.Vector3(0, 0.5, 0), 0.4, 0.7); }
    }
    for (const [id, g] of this.routes) if (!state.routes.some((r) => r.id === id)) { this.scene.remove(g); this.routes.delete(id); }
    // local player camera
    if (me) {
      const px = predicted ? predicted.x : me.pos.x, pz = predicted ? predicted.z : me.pos.z;
      const y = this.groundY(px, pz) + 1.65 + (me.stun > 0 ? -0.9 : 0);
      this.camera.position.set(px, y, pz);
      this.camera.rotation.set(0, 0, 0, 'YXZ');
      this.camera.rotation.y = yaw;
      this.camera.rotation.x = pitch;
      this.hands.update(frame, !!(me.moveDir || me.moveTarget), me.action?.kind ?? null, me.carry);
    }
    // rain
    if (w.rain > 0 && this.particlesLevel > 0 && me && frame % 1 === 0) {
      for (let i = 0; i < 6 * w.rain * this.particlesLevel; i++) { const x = me.pos.x + (Math.random() - 0.5) * 40, z = me.pos.z + (Math.random() - 0.5) * 40; this.beads.spawn(new THREE.Vector3(x, this.groundY(x, z) + 12, z), new THREE.Vector3(0, -6, 0), 1.6, 0.5); }
    }
    this.beads.update(dt, (x, z) => this.groundY(x, z));
    // steam puffs
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const pf = this.puffs[i];
      pf.life -= dt;
      pf.sprite.position.y += pf.vy * dt;
      pf.sprite.scale.multiplyScalar(1 + dt * 0.6);
      (pf.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(0.9, pf.life));
      if (pf.life <= 0) { this.scene.remove(pf.sprite); this.puffs.splice(i, 1); }
    }
    // ambient steam on very hot wet zones
    if (this.particlesLevel > 0 && frame % 4 === 0) for (let z = 0; z < ZONES; z++) { const zz = state.stone.zones[z]; if (zz.T > 80 && zz.wet > 0.1) this.puff(zonePos(state, z), 0.6); }
    // confetti and the split
    if (state.finished) this.updateSplit(state, dt, frame);
    for (const c of this.confetti) { c.position.y -= dt * 1.5; c.rotation.x += dt * 3; c.rotation.z += dt * 2; }
    for (const s of this.sources) wobbleGroup(s, frame);
    for (const o of this.outlines) wobbleEdges(o, frame);
    this.renderer.render(this.scene, this.camera);
  }

  private smooth(key: string, x: number, z: number, alpha: number): { x: number; z: number; dx: number; dz: number; moved: boolean } {
    let prev = this.prevPos.get(key);
    if (!prev) { prev = new THREE.Vector3(x, 0, z); this.prevPos.set(key, prev); }
    const dx = x - prev.x, dz = z - prev.z;
    const moved = Math.hypot(dx, dz) > 0.02;
    // exponential smoothing towards the new position
    prev.x += dx * Math.min(1, alpha * 0.9 + 0.3); prev.z += dz * Math.min(1, alpha * 0.9 + 0.3);
    return { x: prev.x, z: prev.z, dx, dz, moved };
  }

  private pointOnRoute(r: Route, t: number): { x: number; z: number } {
    const total = r.length; let d = t * total;
    for (let i = 1; i < r.points.length; i++) { const a = r.points[i - 1], b = r.points[i]; const l = Math.hypot(b.x - a.x, b.z - a.z); if (d <= l) { const u = l > 0 ? d / l : 0; return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u }; } d -= l; }
    return r.points[r.points.length - 1];
  }

  private buildRoute(r: Route): THREE.Group {
    const g = new THREE.Group();
    const outlines: THREE.LineSegments[] = [];
    const color = r.kind === 'rinne' ? '#a8875a' : '#7a7a86';
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1], b = r.points[i];
      const ya = this.groundY(a.x, a.z) + 0.35, yb = this.groundY(b.x, b.z) + 0.35;
      const len = Math.hypot(b.x - a.x, b.z - a.z, yb - ya);
      const geo = r.kind === 'rinne' ? new THREE.BoxGeometry(0.7, 0.35, len) : new THREE.CylinderGeometry(0.22, 0.22, len, 8);
      const m = new THREE.Mesh(geo, paperMaterial(color, { seed: 70 + i }));
      m.userData.baseColor = color;
      m.castShadow = true;
      if (r.kind === 'rohr') m.rotation.x = Math.PI / 2;
      const seg = new THREE.Group();
      seg.position.set((a.x + b.x) / 2, (ya + yb) / 2, (a.z + b.z) / 2);
      seg.lookAt(b.x, yb, b.z);
      seg.add(m);
      if (r.kind === 'rinne') { const water = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, len), new THREE.MeshStandardMaterial({ color: PALETTE.folie, roughness: 0.15, metalness: 0.1 })); water.position.y = 0.16; seg.add(water); for (const sx of [-0.3, 0.3]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, len), paperMaterial('#8a6a3a', { seed: 71 })); rail.position.set(sx, 0.25, 0); seg.add(rail); } }
      const o = inkOutline(geo, 30); o.userData.wobbleAmp = 0.01; if (r.kind === 'rohr') o.rotation.x = Math.PI / 2; seg.add(o); outlines.push(o);
      // support sticks every segment
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), paperMaterial('#8a6a3a', { seed: 72 })); post.position.set(0, -0.3, 0); seg.add(post);
      g.add(seg);
    }
    if (r.pumped) { const pump = buildBuilding('tretmuehle', 9); pump.group.scale.setScalar(0.5); const p0 = r.points[0]; pump.group.position.set(p0.x, this.groundY(p0.x, p0.z), p0.z); pump.update(0, 0, 1, { active: true }); g.add(pump.group); }
    g.userData.outlines = outlines;
    return g;
  }

  puff(at: { x: number; z: number }, size = 1): void {
    if (this.particlesLevel <= 0 || this.puffs.length > 60 * this.particlesLevel) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.cotton, transparent: true, opacity: 0.85, depthWrite: false }));
    s.position.set(at.x + (Math.random() - 0.5), this.groundY(at.x, at.z) + 1.5, at.z + (Math.random() - 0.5));
    s.scale.set(1.5 * size, 1.5 * size, 1);
    this.scene.add(s);
    this.puffs.push({ sprite: s, life: 1.2 + Math.random() * 0.8, vy: 1.2 });
  }

  /** Visual reactions to simulation events. */
  handleLog(state: GameState, entries: LogEntry[]): void {
    for (const e of entries) {
      const zp = e.zone !== undefined ? zonePos(state, e.zone) : null;
      switch (e.kind) {
        case 'pour': case 'release': {
          if (!zp) break;
          const n = Math.min(60, Math.round((e.value ?? 10) * 0.6 * this.particlesLevel));
          const dir = zoneDir(e.zone!);
          for (let i = 0; i < n; i++) this.beads.spawn(new THREE.Vector3(zp.x, this.groundY(zp.x, zp.z) + 1.4, zp.z), new THREE.Vector3(-dir.x * 2 + (Math.random() - 0.5), 1 + Math.random() * 2, -dir.z * 2 + (Math.random() - 0.5)), 1.2, 1);
          const T = state.stone.zones[e.zone!].T;
          if (T > 50) for (let i = 0; i < 3; i++) this.puff(zp, 0.6 + (T - 50) / 60);
          break;
        }
        case 'thermoschock': this.hitScale = Math.max(this.hitScale, 0.12); if (zp) for (let i = 0; i < 6; i++) this.puff(zp, 1.4); break;
        case 'steamOk': case 'steamFail': this.hitScale = Math.max(this.hitScale, e.kind === 'steamFail' ? 0.15 : 0.1); if (zp) for (let i = 0; i < 10; i++) this.puff(zp, 2); break;
        case 'freeze': this.hitScale = Math.max(this.hitScale, 0.05); break;
        case 'stumble': { const wk = state.workers.find((w) => w.id === e.id); if (wk) for (let i = 0; i < 20; i++) this.beads.spawn(new THREE.Vector3(wk.pos.x, this.groundY(wk.pos.x, wk.pos.z) + 1, wk.pos.z), new THREE.Vector3((Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3), 1, 1); break; }
        case 'drilled': case 'wedge': case 'plant': this.hitScale = Math.max(this.hitScale, 0.04); break;
        case 'finished': this.startSplit(state); break;
      }
    }
  }

  private startSplit(state: GameState): void {
    if (this.splitT >= 0) return;
    this.splitT = 0;
    const a = (state.stone.line / ZONES) * Math.PI * 2;
    const n = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)); // perpendicular to the line direction
    const geo = this.stone.body.geometry;
    for (const sign of [1, -1]) {
      const mat = (this.stone.body.material as THREE.MeshStandardMaterial).clone();
      mat.clippingPlanes = [new THREE.Plane(n.clone().multiplyScalar(sign), 0)];
      mat.side = THREE.DoubleSide;
      const half = new THREE.Mesh(geo, mat);
      half.castShadow = true;
      half.position.copy(this.stone.group.position);
      half.userData.dir = n.clone().multiplyScalar(sign);
      this.scene.add(half);
      this.stoneHalves.push(half);
    }
    this.stone.body.visible = false; this.stone.outline.visible = false;
    for (let i = 0; i < 120 * this.particlesLevel; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.4), new THREE.MeshBasicMaterial({ color: ['#d8563c', '#4f6fa8', '#e8b04a', '#7fa650', '#f6f0e1'][i % 5], side: THREE.DoubleSide }));
      c.position.set((Math.random() - 0.5) * 24, 12 + Math.random() * 12, (Math.random() - 0.5) * 24);
      c.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.scene.add(c); this.confetti.push(c);
    }
  }

  private updateSplit(_state: GameState, dt: number, frame: number): void {
    if (this.splitT < 0) return;
    this.splitT += dt;
    const t = Math.min(1, this.splitT / 3);
    const q = Math.floor(t * 12) / 12;
    for (const h of this.stoneHalves) {
      const d = h.userData.dir as THREE.Vector3;
      h.position.copy(this.stone.group.position).addScaledVector(d, q * 3.5);
      h.rotation.z = -d.x * q * 0.45; h.rotation.x = d.z * q * 0.45;
    }
    void frame;
  }

  /** What the crosshair points at, for the interaction prompt. */
  pick(state: GameState, localPid: string, maxDist = 7): Pick {
    const me = state.players.find((p) => p.id === localPid);
    const none: Pick = { kind: 'none', dist: Infinity, pos: new THREE.Vector3() };
    if (!me) return none;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const eye = this.camera.position.clone();
    // stone zone via ray
    const ray = new THREE.Raycaster(eye, fwd, 0.1, 40);
    const hits = ray.intersectObject(this.stone.body, false);
    const candidates: Pick[] = [];
    if (hits.length > 0) {
      const h = hits[0].point;
      const zone = ((Math.round((Math.atan2(h.x, h.z) / (Math.PI * 2)) * ZONES) % ZONES) + ZONES) % ZONES;
      const zp = zonePos(state, zone);
      candidates.push({ kind: 'zone', zone, dist: Math.hypot(me.pos.x - zp.x, me.pos.z - zp.z), pos: new THREE.Vector3(zp.x, this.groundY(zp.x, zp.z), zp.z) });
    }
    const consider = (kind: Pick['kind'], pos: THREE.Vector3, id?: string, radius = 4) => {
      const to = pos.clone().sub(eye); const d = to.length(); to.normalize();
      const ang = Math.acos(THREE.MathUtils.clamp(to.dot(fwd), -1, 1));
      const ground = Math.hypot(me.pos.x - pos.x, me.pos.z - pos.z);
      if (ang < Math.atan2(radius, Math.max(1, d)) + 0.25 && ground < maxDist + radius) candidates.push({ kind, id, dist: Math.max(0, ground - radius + 1), pos });
    };
    for (const s of state.sources) if (s.kind !== 'regen' && s.kind !== 'tau') consider('source', new THREE.Vector3(s.pos.x, this.groundY(s.pos.x, s.pos.z), s.pos.z), s.id, s.kind === 'meer' ? 14 : s.kind === 'fluss' ? 8 : 3);
    consider('village', this.villagePos, undefined, 8);
    consider('forest', this.forestPos, undefined, 12);
    for (const b of state.buildings) consider('building', new THREE.Vector3(b.pos.x, this.groundY(b.pos.x, b.pos.z), b.pos.z), b.id, 2.5);
    for (const r of state.routes) { const p = this.nearestOnRoute(r, me.pos); consider('route', new THREE.Vector3(p.x, this.groundY(p.x, p.z), p.z), r.id, 2); }
    for (const c of state.chains) { const s = state.sources.find((x) => x.id === c.source); if (s) { const mid = { x: s.pos.x * 0.5, z: s.pos.z * 0.5 }; consider('chain', new THREE.Vector3(mid.x, this.groundY(mid.x, mid.z), mid.z), c.id, 6); } }
    candidates.sort((a, b) => a.dist - b.dist);
    const best = candidates[0];
    this.zoneMarker.visible = !!best && best.kind === 'zone';
    if (best && best.kind === 'zone') this.zoneMarker.position.set(best.pos.x, best.pos.y + 0.05, best.pos.z);
    return best ?? none;
  }

  private nearestOnRoute(r: Route, p: { x: number; z: number }): { x: number; z: number } {
    let best = r.points[0], bd = Infinity;
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1], b = r.points[i];
      const abx = b.x - a.x, abz = b.z - a.z; const l2 = abx * abx + abz * abz || 1;
      const t = THREE.MathUtils.clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / l2, 0, 1);
      const q = { x: a.x + abx * t, z: a.z + abz * t };
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  /** Build preview: show a ghost of a building or a route polyline. */
  setPreview(obj: THREE.Object3D | null): void {
    this.previewGroup.clear();
    if (obj) this.previewGroup.add(obj);
  }

  /** World position under the crosshair on the terrain (for placing things). */
  groundPoint(): THREE.Vector3 | null {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const eye = this.camera.position.clone();
    // march along the ray until below terrain
    let p = eye.clone();
    for (let i = 0; i < 80; i++) {
      p.addScaledVector(fwd, 0.5);
      if (p.y <= this.groundY(p.x, p.z)) { p.y = this.groundY(p.x, p.z); return p; }
      if (p.distanceTo(eye) > 40) break;
    }
    return null;
  }

  dispose(): void { this.renderer.dispose(); }
}
void contactShadow;
