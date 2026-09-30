import { createGame, step, hashState, type Command, type GameConfig, type GameState } from '../../sim/index';

/** A running game the client can render and send commands to. Local: the sim runs here. Online: lockstep replay. */
export interface Session {
  readonly state: GameState;
  readonly playerId: string;
  readonly mode: 'solo' | 'coop' | 'race';
  /** ticks per real tick (time-lapse) */
  speed: number;
  /** Queue a command for the next tick. */
  send(cmd: Command): void;
  /** Advance by real time; returns the number of ticks applied. */
  advance(dtSec: number): number;
  /** events since the last call (log entries) */
  drainLog(): GameState['log'];
  /** race standings for the HUD (empty for solo/coop) */
  standings(): { pid: string; name: string; progress: number; finished: number | null }[];
  paused: boolean;
  dispose(): void;
}

export class LocalSession implements Session {
  state: GameState;
  playerId: string;
  mode: 'solo' | 'coop' | 'race';
  speed = 1;
  paused = false;
  private acc = 0;
  private pending: Command[] = [];
  private logMark = 0;
  /** external command providers (autopilot bots) called every tick */
  providers: ((state: GameState) => Command[])[] = [];

  constructor(cfg: Partial<GameConfig> & { seed: string }, playerId = 'p1', state?: GameState) {
    this.state = state ?? createGame(cfg);
    this.playerId = playerId;
    this.mode = this.state.cfg.mode;
    this.logMark = this.state.log.length;
  }
  send(cmd: Command): void { this.pending.push(cmd); }
  advance(dt: number): number {
    if (this.paused) return 0;
    this.acc += dt * this.speed;
    let n = 0;
    const maxTicks = Math.max(1, Math.round(this.speed * 0.6));
    while (this.acc >= 0.1 && n < maxTicks) {
      this.acc -= 0.1;
      const cmds = this.pending; this.pending = [];
      for (const p of this.providers) cmds.push(...p(this.state));
      step(this.state, cmds);
      n++;
    }
    if (n >= maxTicks) this.acc = 0;
    return n;
  }
  drainLog(): GameState['log'] {
    const out = this.state.log.filter((l) => l.tick >= this.logMark);
    this.logMark = this.state.tick;
    return out;
  }
  standings(): { pid: string; name: string; progress: number; finished: number | null }[] { return []; }
  hash(): string { return hashState(this.state); }
  dispose(): void { this.providers = []; }
}
