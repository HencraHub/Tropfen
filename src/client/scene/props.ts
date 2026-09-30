import * as THREE from 'three';
import type { LandscapeDef } from '../../sim/index';
import { PALETTE, paperMaterial, contactShadow } from '../materials/paper';
import { terrainHeight } from './terrain';

/** Scattered diorama props: paper bushes, sponge trees, cardboard rocks, grass tufts, a fence near the village. */
export function buildProps(land: LandscapeDef, landscapeId: string): THREE.Group {
  const g = new THREE.Group();
  let s = 12345;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const bushGeo = new THREE.IcosahedronGeometry(0.7, 1);
  const rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
  const tuftGeo = new THREE.ConeGeometry(0.25, 0.7, 4);
  const bushMat = paperMaterial(landscapeId === 'steppe' ? '#b8a860' : PALETTE.moos, { seed: 81, roughness: 1 });
  const rockMat = paperMaterial('#8a8a90', { seed: 82 });
  const tuftMat = paperMaterial(landscapeId === 'steppe' ? '#c9b46a' : '#8fb75a', { seed: 83, side: THREE.DoubleSide });
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, 90);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 60);
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 260);
  const d = new THREE.Object3D();
  const place = (mesh: THREE.InstancedMesh, i: number, x: number, z: number, sc: number, yOff: number) => { d.position.set(x, terrainHeight(land, x, z) + yOff, z); d.rotation.set(0, rnd() * 6.28, 0); d.scale.setScalar(sc); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); };
  const free = (x: number, z: number) => Math.hypot(x, z) > 14 && Math.hypot(x - land.village[0], z - land.village[1]) > 12 && !land.sources.some((src) => Math.hypot(x - src.pos[0], z - src.pos[1]) < 10);
  let bi = 0, ri = 0, ti = 0;
  while (bi < 90) { const x = (rnd() - 0.5) * 260, z = (rnd() - 0.5) * 260; if (!free(x, z)) continue; place(bushes, bi++, x, z, 0.6 + rnd() * 0.9, 0.5); }
  while (ri < 60) { const x = (rnd() - 0.5) * 280, z = (rnd() - 0.5) * 280; if (!free(x, z)) continue; place(rocks, ri++, x, z, 0.5 + rnd() * 1.2, 0.3); }
  while (ti < 260) { const x = (rnd() - 0.5) * 200, z = (rnd() - 0.5) * 200; if (!free(x, z)) continue; place(tufts, ti++, x, z, 0.7 + rnd() * 0.8, 0.3); }
  bushes.castShadow = true; rocks.castShadow = true;
  g.add(bushes, rocks, tufts);
  // fence near the village: sticks and a paper strip
  const fenceMat = paperMaterial('#8a6a3a', { seed: 84 });
  for (let i = 0; i < 8; i++) { const a = -0.6 + i * 0.16; const x = land.village[0] + Math.cos(a) * 12, z = land.village[1] + Math.sin(a) * 12; const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), fenceMat); post.position.set(x, terrainHeight(land, x, z) + 0.6, z); g.add(post); }
  const shadow = contactShadow(0.5, 0.15); shadow.position.set(land.village[0], terrainHeight(land, land.village[0], land.village[1]) + 0.02, land.village[1]); g.add(shadow);
  return g;
}
