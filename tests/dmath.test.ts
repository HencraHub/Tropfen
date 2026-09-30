import { describe, it, expect } from 'vitest';
import { dsin, dcos, dexp, dlog, dpow, datan2, dhypot } from '../src/sim/dmath';

describe('deterministische Mathematik', () => {
  it('stimmt mit Math auf 1e-9 überein (im Wertebereich der Simulation)', () => {
    for (let x = -50; x <= 50; x += 0.0137) {
      expect(Math.abs(dsin(x) - Math.sin(x))).toBeLessThan(1e-9);
      expect(Math.abs(dcos(x) - Math.cos(x))).toBeLessThan(1e-9);
    }
    for (let x = -30; x <= 30; x += 0.0173) expect(Math.abs(dexp(x) - Math.exp(x)) / Math.exp(x)).toBeLessThan(1e-10);
    for (let x = 0.001; x <= 5000; x *= 1.37) expect(Math.abs(dlog(x) - Math.log(x))).toBeLessThan(1e-10);
    for (const [a, b] of [[2, 0.5], [770, 0.8], [30, 1.15], [0.99, 0.0016], [150, 1.3], [1.7, 7]]) expect(Math.abs(dpow(a, b) - Math.pow(a, b)) / Math.pow(a, b)).toBeLessThan(1e-9);
    for (let a = -3.1; a <= 3.1; a += 0.05) expect(Math.abs(datan2(Math.sin(a), Math.cos(a)) - a)).toBeLessThan(1e-6);
    expect(dhypot(3, 4)).toBe(5);
  });
});
