// Deterministic RNG (xoshiro128**), state lives inside GameState as 4 uint32s.
export type RngState = [number, number, number, number];

function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeRngState(seed: number | string): RngState {
  const n = typeof seed === 'string' ? seedFromString(seed) : seed >>> 0;
  const sm = splitmix32(n);
  return [sm(), sm(), sm(), sm()];
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export class Rng {
  constructor(public s: RngState) {}
  static from(seed: number | string): Rng {
    return new Rng(makeRngState(seed));
  }
  nextU32(): number {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl(s[3], 11);
    return result;
  }
  /** float in [0,1) */
  float(): number {
    return this.nextU32() / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.float() * n);
  }
  range(a: number, b: number): number {
    return a + this.float() * (b - a);
  }
  chance(p: number): boolean {
    return this.float() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
  weighted<T extends string>(weights: Record<T, number>): T {
    const keys = Object.keys(weights) as T[];
    let total = 0;
    for (const k of keys) total += weights[k];
    let r = this.float() * total;
    for (const k of keys) {
      r -= weights[k];
      if (r < 0) return k;
    }
    return keys[keys.length - 1];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
}
