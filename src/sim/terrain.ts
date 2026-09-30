import type { LandscapeDef } from './content';
import { dexp, dhypot } from './dmath';

/** Deterministic terrain height (meters) from landscape definition. Stone sits at origin. */
export function heightAt(l: LandscapeDef, x: number, z: number): number {
  let h = l.terrain.slope[0] * x + l.terrain.slope[1] * z;
  for (const [cx, cz, r, a] of l.terrain.hills) {
    const dx = x - cx;
    const dz = z - cz;
    h += a * dexp(-(dx * dx + dz * dz) / (2 * r * r));
  }
  // flatten around the stone so that the stone plateau is level
  const d = Math.sqrt(x * x + z * z);
  const flat = Math.max(0, 1 - d / 14);
  return h * (1 - flat);
}

export function gradeAlong(l: LandscapeDef, ax: number, az: number, bx: number, bz: number): number {
  const len = dhypot(bx - ax, bz - az);
  if (len < 1e-6) return 0;
  return (heightAt(l, bx, bz) - heightAt(l, ax, az)) / len;
}
