import * as THREE from 'three';
import { heightAt, landscapeDef, type LandscapeDef } from '../../sim/index';
import { PALETTE, paperMaterial, corrugatedMaterial } from '../materials/paper';

export const TERRACE = 0.8; // metres per cardboard layer

/**
 * Stacked cardboard terrain: a heightfield quantised into terraces. Tops are paper, vertical faces are
 * corrugated cardboard, terrace edges get an ink outline. Cell size 1.5 m over a 300 m square.
 */
export function buildTerrain(landscapeId: string, half = 150, cell = 1.5): THREE.Group {
  const land: LandscapeDef = landscapeDef(landscapeId);
  const n = Math.round((half * 2) / cell);
  const h: number[][] = [];
  for (let i = 0; i <= n; i++) {
    h.push([]);
    for (let j = 0; j <= n; j++) {
      const x = -half + i * cell, z = -half + j * cell;
      h[i].push(Math.round(heightAt(land, x, z) / TERRACE) * TERRACE);
    }
  }
  const tops: number[] = [], topUv: number[] = [];
  const sides: number[] = [], sideUv: number[] = [];
  const edges: number[] = [];
  const cellH = (i: number, j: number) => {
    // cell height = min of its corner samples (cut layers never float)
    return Math.min(h[i][j], h[i + 1][j], h[i][j + 1], h[i + 1][j + 1]);
  };
  const hc: number[][] = [];
  for (let i = 0; i < n; i++) { hc.push([]); for (let j = 0; j < n; j++) hc[i].push(cellH(i, j)); }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x0 = -half + i * cell, z0 = -half + j * cell, x1 = x0 + cell, z1 = z0 + cell;
    const y = hc[i][j];
    tops.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1);
    const u0 = i / 8, v0 = j / 8, u1 = (i + 1) / 8, v1 = (j + 1) / 8;
    topUv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    // side faces toward lower neighbours
    const nb: [number, number, number, number, number, number][] = [
      [i + 1, j, x1, z0, x1, z1], [i - 1, j, x0, z1, x0, z0], [i, j + 1, x1, z1, x0, z1], [i, j - 1, x0, z0, x1, z0],
    ];
    for (const [ni, nj, ax, az, bx, bz] of nb) {
      const ny = ni < 0 || nj < 0 || ni >= n || nj >= n ? y - TERRACE : hc[ni][nj];
      if (ny < y - 0.01) {
        sides.push(ax, y, az, bx, y, bz, bx, ny, bz, ax, y, az, bx, ny, bz, ax, ny, az);
        const layers = (y - ny) / TERRACE;
        sideUv.push(0, 0, 1, 0, 1, layers, 0, 0, 1, layers, 0, layers);
        edges.push(ax, y + 0.01, az, bx, y + 0.01, bz);
      }
    }
  }
  const group = new THREE.Group();
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(tops, 3));
  topGeo.setAttribute('uv', new THREE.Float32BufferAttribute(topUv, 2));
  topGeo.computeVertexNormals();
  const topMat = paperMaterial(PALETTE.pappe, { seed: 11, repeat: 1 });
  const topMesh = new THREE.Mesh(topGeo, topMat);
  topMesh.receiveShadow = true;
  group.add(topMesh);
  const sideGeo = new THREE.BufferGeometry();
  sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sides, 3));
  sideGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sideUv, 2));
  sideGeo.computeVertexNormals();
  const sideMesh = new THREE.Mesh(sideGeo, corrugatedMaterial(1));
  sideMesh.receiveShadow = true;
  group.add(sideMesh);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
  const edgeLines = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: PALETTE.tinte, transparent: true, opacity: 0.55 }));
  group.add(edgeLines);
  group.userData.height = (x: number, z: number) => terrainHeight(land, x, z);
  return group;
}

/** Visual (terraced) height used to place objects on the cardboard. */
export function terrainHeight(land: LandscapeDef, x: number, z: number): number {
  return Math.round(heightAt(land, x, z) / TERRACE) * TERRACE;
}

/** A kraft paper path strip glued on the terrain between two points. */
export function buildPath(land: LandscapeDef, a: { x: number; z: number }, b: { x: number; z: number }, width = 1.6): THREE.Mesh {
  const pts: number[] = [];
  const uv: number[] = [];
  const segs = Math.max(4, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 4));
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len * width / 2, nz = dx / len * width / 2;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const p0 = { x: a.x + dx * t0, z: a.z + dz * t0 }, p1 = { x: a.x + dx * t1, z: a.z + dz * t1 };
    const y0 = terrainHeight(land, p0.x, p0.z) + 0.03, y1 = terrainHeight(land, p1.x, p1.z) + 0.03;
    pts.push(p0.x - nx, y0, p0.z - nz, p1.x - nx, y1, p1.z - nz, p1.x + nx, y1, p1.z + nz, p0.x - nx, y0, p0.z - nz, p1.x + nx, y1, p1.z + nz, p0.x + nx, y0, p0.z + nz);
    uv.push(0, t0, 0, t1, 1, t1, 0, t0, 1, t1, 1, t0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, paperMaterial(PALETTE.kraft, { seed: 5, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  return m;
}
