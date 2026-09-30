import type { GameState, Command } from '../sim/index';
import { BotCtx, strategyById, makeCoordinatedPair, type Strategy } from '../bots/index';

/** Drives the local player with a strategy bot (used by the e2e tests and the demo mode). */
export function makeAutopilot(pid: string, strategyId: string): (state: GameState) => Command[] {
  let strategy: Strategy | undefined = strategyById(strategyId);
  let mem: Record<string, unknown> = {};
  let teamRoles: Record<string, string> | null = null;
  if (strategyId === 'team') { const pair = makeCoordinatedPair(); strategy = pair[0].strategy; mem = pair[0].mem; teamRoles = mem.roles as Record<string, string>; }
  if (!strategy) strategy = strategyById('tropfmeister');
  const s = strategy!;
  return (state: GameState) => {
    if (state.tick % 10 !== 0) return [];
    // team roles: the first player in the world plans (A), everyone else runs (B)
    if (teamRoles && !teamRoles[pid]) { for (const p of state.players) teamRoles[p.id] = p.id === state.players[0].id ? 'A' : 'B'; }
    const out: Command[] = [];
    const ctx = new BotCtx(state, pid, out, mem);
    s.step(ctx);
    s.body(ctx);
    return out;
  };
}
