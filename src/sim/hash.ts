import type { GameState } from './types';

/** FNV-1a 32-bit over the JSON encoding; identical on every client when the state is identical. */
export function hashString(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function hashState(state: GameState): string {
  const { log: _log, ...rest } = state;
  return hashString(JSON.stringify(rest));
}
