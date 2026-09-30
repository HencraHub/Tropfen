import type { GameState } from '../sim/index';

const KEY = 'tropfen.save';
const BEST = 'tropfen.best';

export interface SaveGame { state: GameState; playerId: string; savedAt: number; yaw: number }

export function saveGame(s: SaveGame): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
}
export function loadGame(): SaveGame | null {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as SaveGame) : null; } catch { return null; }
}
export function clearSave(): void { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

export interface BestEntry { seed: string; landscape: string; rock: string; minutes: number; water: number; money: number; pipes: number; main: string; date: string }

export function loadBest(): BestEntry[] {
  try { const raw = localStorage.getItem(BEST); return raw ? (JSON.parse(raw) as BestEntry[]) : []; } catch { return []; }
}
export function addBest(e: BestEntry): void {
  const list = loadBest();
  list.push(e);
  list.sort((a, b) => a.minutes - b.minutes);
  try { localStorage.setItem(BEST, JSON.stringify(list.slice(0, 50))); } catch { /* ignore */ }
}
