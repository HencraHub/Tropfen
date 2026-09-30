/**
 * Style probe (docs/STIL.md): a static diorama with terrain, stone, river, sun on a stick, clouds on threads,
 * a jumping-jack carrier, a bucket, paper UI text. Used for screenshots and style checks.
 */
import * as THREE from 'three';
import { createGame, step, hourOf } from '../sim/index';
import { buildTerrain, buildPath } from './scene/terrain';
import { Sky } from './scene/sky';
import { StoneView } from './scene/stone';
import { Figure } from './scene/figures';
import { buildSource, Beads, wobbleGroup } from './scene/water';
import { landscapeDef } from '../sim/index';
import { drawText, wrapText } from './ui/font';
import { drawPaperPanel, drawStamp } from './ui/paper';
import { PALETTE } from './materials/paper';
import { terrainHeight } from './scene/terrain';
import { buildBuilding } from './scene/buildings';

export function runProbe(gl: HTMLCanvasElement, ui: HTMLCanvasElement, params: URLSearchParams): void {
  const land = params.get('land') ?? 'flusstal';
  const rock = params.get('rock') ?? 'granit';
  const hour = Number(params.get('hour') ?? 15);
  const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
  const state = createGame({ seed: 'probe', landscape: land, rock });
  state.tick = Math.round(hour * 150);
  step(state, []);
  const ld = landscapeDef(land);
  const terrain = buildTerrain(land);
  scene.add(terrain);
  scene.add(buildPath(ld, { x: 0, z: -(state.stone.radius + 2) }, { x: ld.village[0], z: ld.village[1] }));
  const src0 = state.sources[0];
  scene.add(buildPath(ld, { x: 0, z: state.stone.radius + 2 }, src0.pos));
  const sky = new Sky(scene, true);
  const stone = new StoneView(state.stone.radius, rock, 7);
  scene.add(stone.group);
  const sources = state.sources.filter((s) => s.kind !== 'regen' && s.kind !== 'tau').map((s) => buildSource(s, ld));
  for (const s of sources) scene.add(s);
  const fig = new Figure('traeger');
  fig.group.position.set(4, terrainHeight(ld, 4, -12), -12);
  fig.face(-0.4, 1);
  scene.add(fig.group);
  const fig2 = new Figure('traeger', '#7a9a5a');
  fig2.group.position.set(-6, terrainHeight(ld, -6, -14), -14);
  fig2.face(0.6, 1);
  scene.add(fig2.group);
  const beads = new Beads();
  scene.add(beads.mesh);
  // a few buildings for the probe
  const fass = buildBuilding('fass', 1);
  fass.group.position.set(9, terrainHeight(ld, 9, -4), -4);
  scene.add(fass.group);
  const brenn = buildBuilding('brennspiegel', 1);
  brenn.group.position.set(-9, terrainHeight(ld, -9, 3), 3);
  scene.add(brenn.group);
  // trees: sponge balls on toothpicks near the forest
  for (let i = 0; i < 12; i++) {
    const x = ld.forest[0] + ((i * 37) % 30) - 15, z = ld.forest[1] + ((i * 53) % 24) - 12;
    const tree = buildBuilding('baum', i);
    tree.group.position.set(x, terrainHeight(ld, x, z), z);
    scene.add(tree.group);
  }
  camera.position.set(-7, terrainHeight(ld, -7, -20) + 1.7, -20);
  camera.lookAt(0, 4, 0);
  const ctx = ui.getContext('2d')!;
  let t0 = performance.now();
  let pourTimer = 0;
  function frameLoop(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - t0) / 1000);
    t0 = now;
    const timeSec = now / 1000;
    const frame = Math.floor(timeSec * 8);
    const w = state.weather.today;
    sky.update(hourOf(state.tick), 0.3, 1, frame, renderer, scene, timeSec);
    stone.update(dt, frame, 'neutral', 0.35, 1, 70, camera.position, 0);
    fig.update(frame, true, 10, false, false);
    fig2.update(frame, false, 0, false, true);
    for (const s of sources) wobbleGroup(s, frame);
    fass.update(frame, dt, 1);
    brenn.update(frame, dt, 1);
    pourTimer += dt;
    if (pourTimer > 0.05) { pourTimer = 0; beads.spawn(new THREE.Vector3(4.5, 2.3, -9), new THREE.Vector3(-1 + Math.random(), 1, 2 + Math.random()), 1.2, 1); }
    beads.update(dt, (x, z) => terrainHeight(ld, x, z));
    renderer.render(scene, camera);
    // paper UI overlay
    ui.width = window.innerWidth; ui.height = window.innerHeight;
    ctx.clearRect(0, 0, ui.width, ui.height);
    drawPaperPanel(ctx, 24, 24, 420, 150, frame);
    drawText(ctx, 'Ein Tropfen auf den heißen Stein', 44, 60, { size: 18, frame });
    drawText(ctx, `Stilprobe · ${land} · ${rock} · ${hour} Uhr · ${w}`, 44, 86, { size: 12, frame, color: '#5a4a3a' });
    const lines = wrapText('Der Rat bittet um Kenntnisnahme: Wasser verdampft. Bitte mehr davon.', 12, 260);
    lines.forEach((l, i) => drawText(ctx, l, 44, 110 + i * 17, { size: 12, frame, color: '#5a4a3a' }));
    drawStamp(ctx, 370, 130, 'GEPRÜFT', frame);
    // speech bubble of the stone
    const bx = ui.width * 0.55, by = ui.height * 0.28;
    drawPaperPanel(ctx, bx, by, 300, 60, frame, true);
    drawText(ctx, 'Na, wieder da? Ich hab Zeit.', bx + 16, by + 38, { size: 14, frame });
    (window as unknown as { __probeReady: boolean }).__probeReady = true;
    requestAnimationFrame(frameLoop);
  }
  frameLoop();
}
