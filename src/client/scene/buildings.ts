import * as THREE from 'three';
import { PALETTE, paperMaterial, corrugatedMaterial, foilMaterial, inkOutline, wobbleEdges, contactShadow, cottonTexture } from '../materials/paper';

export interface BuildingView {
  group: THREE.Group;
  /** frame = 8 Hz frame, built 0..1 = pop-up progress, extra = type specific (fill ratio, burning, wind) */
  update(frame: number, dt: number, built: number, extra?: { fill?: number; burning?: boolean; wind?: number; active?: boolean }): void;
}

function part(geo: THREE.BufferGeometry, mat: THREE.Material, outlines: THREE.LineSegments[], threshold = 25): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  const o = inkOutline(geo, threshold); o.userData.wobbleAmp = 0.015; g.add(o); outlines.push(o);
  return g;
}

/** A pop-up house: base plate, four walls that fold up from the plate, roof that folds last. */
function popupHouse(w: number, d: number, h: number, wallColor: string, roofColor: string, outlines: THREE.LineSegments[], seed: number): { group: THREE.Group; walls: THREE.Group[]; roof: THREE.Group } {
  const group = new THREE.Group();
  const base = part(new THREE.BoxGeometry(w + 0.4, 0.08, d + 0.4), corrugatedMaterial(2), outlines);
  base.position.y = 0.04;
  group.add(base);
  const walls: THREE.Group[] = [];
  const specs: [number, number, number, number, number][] = [[0, d / 2, w, 0, 1], [0, -d / 2, w, Math.PI, -1], [w / 2, 0, d, Math.PI / 2, 1], [-w / 2, 0, d, -Math.PI / 2, -1]];
  for (const [x, z, len, ry] of specs) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.08, z);
    pivot.rotation.y = ry;
    const wall = part(new THREE.BoxGeometry(len, h, 0.08), paperMaterial(wallColor, { seed }), outlines);
    wall.position.set(0, h / 2, 0);
    pivot.add(wall);
    // window/door strip
    const win = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.25, h * 0.35), new THREE.MeshBasicMaterial({ color: PALETTE.tinte }));
    win.position.set(len * 0.2, h * 0.55, 0.05);
    wall.add(win);
    group.add(pivot);
    walls.push(pivot);
  }
  const roof = new THREE.Group();
  roof.position.set(0, h + 0.08, 0);
  const rg = new THREE.ConeGeometry(Math.max(w, d) * 0.75, h * 0.6, 4);
  const rm = part(rg, paperMaterial(roofColor, { seed: seed + 1 }), outlines, 10);
  rm.rotation.y = Math.PI / 4;
  rm.position.y = h * 0.3;
  roof.add(rm);
  group.add(roof);
  return { group, walls, roof };
}

function applyPopup(walls: THREE.Group[], roof: THREE.Group, built: number): void {
  const q = Math.floor(built * 6) / 6; // 5 steps + done
  const wallT = Math.min(1, q / 0.7);
  for (const wl of walls) wl.rotation.x = -Math.PI / 2 * (1 - wallT);
  const roofT = Math.max(0, (q - 0.7) / 0.3);
  roof.scale.setScalar(Math.max(0.01, roofT));
  roof.rotation.x = -Math.PI / 2 * (1 - roofT);
}

export function buildBuilding(type: string, seed: number): BuildingView {
  const outlines: THREE.LineSegments[] = [];
  const group = new THREE.Group();
  let update: BuildingView['update'] = (frame) => { for (const o of outlines) wobbleEdges(o, frame); };
  const wob = (frame: number) => { for (const o of outlines) wobbleEdges(o, frame); };
  switch (type) {
    case 'fass': case 'zisterne': case 'hochtank': case 'regenfang': case 'taunetz': {
      const r = type === 'fass' ? 0.6 : type === 'zisterne' ? 1.4 : type === 'hochtank' ? 1.6 : 1.0;
      const h = type === 'hochtank' ? 2.4 : type === 'fass' ? 0.9 : 1.3;
      const legs = type === 'hochtank' ? 2.2 : 0;
      const body = part(new THREE.CylinderGeometry(r, r * 0.95, h, 12, 1, false), paperMaterial(type === 'regenfang' ? '#7a9ab0' : '#8a7a6a', { seed }), outlines, 40);
      body.position.y = legs + h / 2;
      group.add(body);
      // glue tab + bands
      for (const y of [0.2, 0.8]) { const band = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.04, 6, 16), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.8 })); band.rotation.x = Math.PI / 2; band.position.y = legs + h * y; group.add(band); }
      const water = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 16), foilMaterial(PALETTE.folie));
      water.rotation.x = -Math.PI / 2; water.position.y = legs + 0.1; group.add(water);
      if (legs > 0) for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; const leg = part(new THREE.BoxGeometry(0.16, legs, 0.16), paperMaterial('#8a6a3a', { seed: seed + 3 }), outlines); leg.position.set(Math.cos(a) * r * 0.8, legs / 2, Math.sin(a) * r * 0.8); group.add(leg); }
      if (type === 'hochtank') { const valve = part(new THREE.BoxGeometry(0.3, 0.3, 0.6), paperMaterial(PALETTE.stempel, { seed: seed + 4 }), outlines); valve.position.set(0, legs - 0.15, -r); group.add(valve); }
      if (type === 'taunetz') { const net = part(new THREE.PlaneGeometry(3, 2.2), paperMaterial(PALETTE.papier, { seed: seed + 5, side: THREE.DoubleSide }), outlines, 1); net.position.set(0, h + 1.2, 0); net.rotation.x = -0.6; group.add(net); }
      if (type === 'regenfang') { const funnel = part(new THREE.ConeGeometry(r * 1.8, 0.8, 12, 1, true), paperMaterial('#7a9ab0', { seed: seed + 5, side: THREE.DoubleSide }), outlines, 40); funnel.rotation.x = Math.PI; funnel.position.y = h + 0.5; group.add(funnel); }
      group.add(contactShadow(r + 0.3));
      update = (frame, _dt, built, extra) => {
        const s = Math.max(0.02, Math.floor(built * 5) / 5);
        group.scale.set(s > 0.9 ? 1 : 1.15 * s, s, s > 0.9 ? 1 : 1.15 * s);
        water.position.y = legs + 0.1 + (extra?.fill ?? 0) * (h - 0.2);
        wob(frame);
      };
      break;
    }
    case 'brennspiegel': {
      const stick = part(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6), paperMaterial('#8a6a3a', { seed }), outlines);
      stick.position.y = 1.2; group.add(stick);
      const disc = part(new THREE.CylinderGeometry(1.5, 1.5, 0.08, 24), new THREE.MeshStandardMaterial({ color: 0xf2e6c4, roughness: 0.1, metalness: 0.9 }), outlines, 60);
      disc.position.y = 2.6; disc.rotation.x = -0.9; group.add(disc);
      group.add(contactShadow(0.6));
      update = (frame, _dt, built, extra) => { const s = Math.max(0.02, Math.floor(built * 5) / 5); group.scale.setScalar(s); disc.rotation.z = (extra?.active ? Math.sin(frame / 20) * 0.2 : 0); wob(frame); };
      break;
    }
    case 'feuerstelle': {
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const st = part(new THREE.DodecahedronGeometry(0.35, 0), paperMaterial('#8a8a90', { seed: seed + i }), outlines, 10); st.position.set(Math.cos(a) * 1.1, 0.3, Math.sin(a) * 1.1); group.add(st); }
      const logs = part(new THREE.BoxGeometry(1.2, 0.3, 0.3), paperMaterial('#6a4a2a', { seed: seed + 7 }), outlines); logs.position.y = 0.2; logs.rotation.y = 0.5; group.add(logs);
      const flames: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.35 - i * 0.08, 1.1 - i * 0.2, 5), new THREE.MeshBasicMaterial({ color: i === 0 ? PALETTE.glut : i === 1 ? '#ffb347' : '#fff1a8' })); f.position.set((i - 1) * 0.25, 0.6, 0); group.add(f); flames.push(f); }
      const light = new THREE.PointLight(0xff8a3d, 0, 14); light.position.y = 1.2; group.add(light);
      const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: cottonTexture(9), transparent: true, opacity: 0.7, depthWrite: false })); smoke.scale.set(2, 2, 1); smoke.position.y = 2.2; group.add(smoke);
      group.add(contactShadow(1.3));
      update = (frame, _dt, built, extra) => {
        const s = Math.max(0.02, Math.floor(built * 5) / 5); group.scale.setScalar(s);
        const burning = !!extra?.burning;
        flames.forEach((f, i) => { f.visible = burning; f.scale.y = burning ? 0.8 + ((frame + i) % 3) * 0.15 : 0; f.rotation.y = frame * 0.5; });
        light.intensity = burning ? 6 + (frame % 2) * 1.5 : 0;
        smoke.visible = burning; smoke.position.y = 2.2 + ((frame % 16) / 16) * 1.5; smoke.material.opacity = burning ? 0.7 - ((frame % 16) / 16) * 0.5 : 0;
        wob(frame);
      };
      break;
    }
    case 'sonnensegel': {
      for (const [x, z] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) { const p = part(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6), paperMaterial('#8a6a3a', { seed }), outlines); p.position.set(x, 1.6, z); group.add(p); }
      const sail = part(new THREE.PlaneGeometry(4.4, 4.4), paperMaterial(PALETTE.papier, { seed: seed + 1, side: THREE.DoubleSide }), outlines, 1);
      sail.rotation.x = -Math.PI / 2 + 0.15; sail.position.y = 3.2; group.add(sail);
      update = (frame, _dt, built) => { const s = Math.max(0.02, Math.floor(built * 5) / 5); group.scale.setScalar(s); sail.rotation.z = Math.sin(frame / 6) * 0.03; wob(frame); };
      break;
    }
    case 'eiskeller': {
      const h = popupHouse(2.6, 2.2, 1.6, '#cfe3ec', PALETTE.papier, outlines, seed);
      group.add(h.group);
      const icicles = part(new THREE.ConeGeometry(0.15, 0.6, 5), new THREE.MeshStandardMaterial({ color: PALETTE.frost, roughness: 0.1 }), outlines); icicles.rotation.x = Math.PI; icicles.position.set(0.8, 1.5, 1.2); group.add(icicles);
      update = (frame, _dt, built) => { applyPopup(h.walls, h.roof, built); wob(frame); };
      break;
    }
    case 'wasserrad': case 'windrad': {
      const isWind = type === 'windrad';
      const mast = part(new THREE.BoxGeometry(0.4, isWind ? 5 : 1.5, 0.4), paperMaterial('#8a6a3a', { seed }), outlines);
      mast.position.y = isWind ? 2.5 : 0.75; group.add(mast);
      const wheel = new THREE.Group();
      const spokes = isWind ? 4 : 8;
      for (let i = 0; i < spokes; i++) {
        const blade = part(new THREE.BoxGeometry(isWind ? 0.5 : 0.35, isWind ? 2.6 : 2.2, 0.06), paperMaterial(isWind ? PALETTE.papier : '#a8875a', { seed: seed + i }), outlines);
        blade.position.y = isWind ? 1.3 : 1.1;
        const piv = new THREE.Group(); piv.rotation.z = (i / spokes) * Math.PI * 2; piv.add(blade); wheel.add(piv);
      }
      if (!isWind) { const rim = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 6, 24), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8 })); wheel.add(rim); }
      wheel.position.set(0, isWind ? 5.2 : 2.2, isWind ? 0.5 : 0);
      group.add(wheel);
      // googly eye on the hub
      const eye = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: PALETTE.papier })); const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.09, 8), new THREE.MeshBasicMaterial({ color: PALETTE.tinte })); pupil.position.z = 0.01; eye.add(pupil); eye.position.set(0, 0, 0.1); wheel.add(eye);
      group.add(contactShadow(1.2));
      update = (frame, _dt, built, extra) => { const s = Math.max(0.02, Math.floor(built * 5) / 5); group.scale.setScalar(s); const spin = (extra?.wind ?? 1) * (extra?.active === false ? 0 : 1); wheel.rotation.z = Math.floor(frame * spin) * 0.18; pupil.position.x = Math.sin(frame / 3) * 0.08; wob(frame); };
      break;
    }
    case 'tretmuehle': {
      const drum = part(new THREE.CylinderGeometry(1.2, 1.2, 1.4, 12), paperMaterial('#a8875a', { seed }), outlines, 40);
      drum.rotation.z = Math.PI / 2; drum.position.y = 1.3; group.add(drum);
      for (const sx of [-0.9, 0.9]) { const post = part(new THREE.BoxGeometry(0.2, 1.4, 0.2), paperMaterial('#8a6a3a', { seed: seed + 2 }), outlines); post.position.set(sx, 0.7, 0); group.add(post); }
      group.add(contactShadow(1.4));
      update = (frame, _dt, built, extra) => { const s = Math.max(0.02, Math.floor(built * 5) / 5); group.scale.setScalar(s); if (extra?.active) drum.rotation.x = frame * 0.2; wob(frame); };
      break;
    }
    case 'dampfmaschine': case 'strahlwerk': case 'sandgrube': case 'baracke': case 'schreibstube': case 'marktstand': case 'tribuene': default: {
      const cfg: Record<string, [number, number, number, string, string]> = {
        dampfmaschine: [3, 2.2, 2, '#7a6a5a', '#4a4a4a'], strahlwerk: [2.6, 2.4, 2.2, '#7a8a9a', PALETTE.stempel], sandgrube: [2.6, 2.6, 0.6, '#d9c08a', '#d9c08a'],
        baracke: [4, 2.2, 1.6, PALETTE.pappe, '#8a6a3a'], schreibstube: [2.2, 2, 1.8, PALETTE.papier, PALETTE.stempel], marktstand: [2.4, 1.6, 1.6, PALETTE.kraft, '#d8563c'], tribuene: [5, 2, 1.4, PALETTE.pappe, PALETTE.papier],
        baum: [0, 0, 0, '', ''],
      };
      if (type === 'baum') {
        const trunk = part(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 5), paperMaterial('#8a6a3a', { seed }), outlines);
        trunk.position.y = 0.7; group.add(trunk);
        const crown = part(new THREE.IcosahedronGeometry(0.9 + (seed % 3) * 0.15, 1), paperMaterial(PALETTE.moos, { seed: seed + 1, roughness: 1 }), outlines, 30);
        crown.position.y = 1.9; group.add(crown);
        group.add(contactShadow(0.7, 0.25));
        update = (frame, _dt, built) => { const s = Math.max(0.05, built); group.scale.setScalar(s); crown.rotation.y = Math.sin(frame / 9) * 0.05; wob(frame); };
        break;
      }
      const [w, d, h, wc, rc] = cfg[type] ?? [2.4, 2, 1.6, PALETTE.pappe, '#8a6a3a'];
      const house = popupHouse(w, d, h, wc, rc, outlines, seed);
      group.add(house.group);
      let chimneySmoke: THREE.Sprite | null = null;
      if (type === 'dampfmaschine' || type === 'strahlwerk') {
        const chimney = part(new THREE.CylinderGeometry(0.25, 0.3, 1.6, 8), paperMaterial('#4a4a4a', { seed: seed + 9 }), outlines, 40); chimney.position.set(w * 0.3, h + 1, 0); house.roof.add(chimney);
        chimneySmoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: cottonTexture(12), transparent: true, opacity: 0.8, depthWrite: false })); chimneySmoke.scale.set(2.2, 2.2, 1); chimneySmoke.position.set(w * 0.3, h + 2.4, 0); group.add(chimneySmoke);
      }
      if (type === 'strahlwerk') { const nozzle = part(new THREE.CylinderGeometry(0.12, 0.2, 1.6, 8), paperMaterial(PALETTE.stempel, { seed: seed + 10 }), outlines, 40); nozzle.rotation.x = Math.PI / 2 + 0.3; nozzle.position.set(0, h * 0.7, -d * 0.7); group.add(nozzle); }
      if (type === 'tribuene') { for (let i = 0; i < 6; i++) { const fig = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.06), paperMaterial(['#d8563c', '#4f6fa8', '#7fa650', '#e8b04a'][i % 4], { seed: seed + i })); fig.position.set(-2 + i * 0.8, h + 0.3 + (i % 2) * 0.2, 0); group.add(fig); } }
      if (type === 'sandgrube') { const pile = part(new THREE.ConeGeometry(1.2, 1.2, 8), paperMaterial('#e0c890', { seed: seed + 3 }), outlines, 30); pile.position.set(0, 0.6 + h, 0); group.add(pile); }
      group.add(contactShadow(Math.max(w, d) * 0.7));
      update = (frame, _dt, built, extra) => {
        applyPopup(house.walls, house.roof, built);
        if (chimneySmoke) { chimneySmoke.visible = !!extra?.active; chimneySmoke.position.y = h + 2.4 + ((frame % 16) / 16) * 2; chimneySmoke.material.opacity = 0.8 - ((frame % 16) / 16) * 0.6; }
        wob(frame);
      };
    }
  }
  return { group, update };
}
