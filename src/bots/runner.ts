import { createGame, step, type Command, type GameState, type GameConfig, type MethodId, METHODS } from '../sim/index';
import { BotCtx } from './toolkit';
import type { Strategy } from './strategies';

export interface BotSeat { pid: string; strategy: Strategy; mem?: Record<string, unknown> }

export interface RunResult {
  ticks: number;
  minutes: number;
  finished: boolean;
  mainMethod: MethodId | null;
  shares: Record<MethodId, number>;
  money: number;
  stats: GameState['stats'];
  research: string[];
  timeline: number[]; // progress ratio every 5 minutes
  routeMin: number | null;
  onlineMin: number | null;
  rate: number; // % per minute after the method came online
}

export const THINK_EVERY = 10;
export const MAX_TICKS = 3600 * 15; // 90 minutes

/** Drive the bots in an existing state. Returns the commands for this tick. */
export function botCommands(state: GameState, seats: BotSeat[]): Command[] {
  const out: Command[] = [];
  if (state.tick % THINK_EVERY !== 0) return out;
  for (const seat of seats) {
    if (!seat.mem) seat.mem = {};
    const ctx = new BotCtx(state, seat.pid, out, seat.mem);
    seat.strategy.step(ctx);
    seat.strategy.body(ctx);
  }
  return out;
}

export function summarize(state: GameState): RunResult {
  const total = METHODS.reduce((a, m) => a + state.stone.dmg[m], 0) || 1;
  const shares = {} as Record<MethodId, number>;
  let main: MethodId | null = null; let best = 0;
  for (const m of METHODS) { shares[m] = state.stone.dmg[m] / total; if (state.stone.dmg[m] > best) { best = state.stone.dmg[m]; main = m; } }
  const ticks = state.finished ? state.finished.tick : state.tick;
  const timeline = state.stats.timeline.filter((t) => t.tick % 3000 === 0).map((t) => t.progress);
  return { ticks, minutes: ticks / 600, finished: !!state.finished, mainMethod: main, shares, money: state.eco.money, stats: state.stats, research: state.research.done, timeline, routeMin: null, onlineMin: null, rate: 0 };
}

export function runGame(cfg: Partial<GameConfig> & { seed: string }, seats: BotSeat[], maxTicks = MAX_TICKS): RunResult {
  const state = createGame({ ...cfg, players: seats.map((s) => ({ id: s.pid, name: s.strategy.id })) });
  let routeMin: number | null = null, onlineMin: number | null = null;
  while (!state.finished && state.tick < maxTicks) {
    step(state, botCommands(state, seats));
    if (state.tick % 100 === 0) {
      if (routeMin === null && state.routes.length > 0) routeMin = state.tick / 600;
      if (onlineMin === null && state.stone.progress >= state.stone.hp * 0.03) onlineMin = state.tick / 600;
    }
  }
  const r = summarize(state);
  r.routeMin = routeMin; r.onlineMin = onlineMin;
  r.rate = onlineMin !== null && r.minutes > onlineMin ? ((state.stone.progress / state.stone.hp) * 100 - 3) / (r.minutes - onlineMin) : 0;
  return r;
}
