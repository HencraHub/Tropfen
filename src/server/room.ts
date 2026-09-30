import { createGame, step, hashState, type Command, type GameState } from '../sim/index';
import type { ServerMsg } from '../net/protocol';

export interface Client { pid: string; name: string; token: string; send(m: ServerMsg): void; connected: boolean }

/** A room: lobby, then one simulation (coop) or one per player (race), advanced by the server clock. */
export class Room {
  players: Client[] = [];
  host = '';
  started = false;
  sims = new Map<string, { state: GameState; pending: Command[]; members: string[] }>();
  private acc = 0;
  private tickCounter = 0;
  onEmpty: (() => void) | null = null;

  constructor(public code: string, public mode: 'coop' | 'race', public speed: number, public seed: string, public landscape?: string, public rock?: string) {}

  lobbyMsg(): ServerMsg { return { t: 'lobby', code: this.code, mode: this.mode, host: this.host, players: this.players.map((p) => ({ id: p.pid, name: p.name, connected: p.connected })), speed: this.speed }; }
  broadcastLobby(): void { const m = this.lobbyMsg(); for (const p of this.players) p.send(m); }

  add(c: Client): void {
    this.players.push(c);
    if (!this.host) this.host = c.pid;
    if (this.started) this.attachToGame(c);
    this.broadcastLobby();
  }

  private attachToGame(c: Client): void {
    // late joiner in coop joins the running sim; in race gets a fresh own sim
    if (this.mode === 'coop') { const sim = this.sims.get('coop')!; sim.members.push(c.pid); sim.pending.push({ t: 'join', p: c.pid, name: c.name }); this.sendSnapshot(c); }
    else { this.sims.set(c.pid, { state: createGame({ seed: this.seed, landscape: this.landscape, rock: this.rock, mode: 'race', players: [{ id: c.pid, name: c.name }] }), pending: [], members: [c.pid] }); this.sendSnapshot(c); }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.mode === 'coop') this.sims.set('coop', { state: createGame({ seed: this.seed, landscape: this.landscape, rock: this.rock, mode: 'coop', players: this.players.map((p) => ({ id: p.pid, name: p.name })) }), pending: [], members: this.players.map((p) => p.pid) });
    else for (const p of this.players) this.sims.set(p.pid, { state: createGame({ seed: this.seed, landscape: this.landscape, rock: this.rock, mode: 'race', players: [{ id: p.pid, name: p.name }] }), pending: [], members: [p.pid] });
    for (const p of this.players) this.sendSnapshot(p);
  }

  simOf(pid: string) { for (const s of this.sims.values()) if (s.members.includes(pid)) return s; return undefined; }

  sendSnapshot(c: Client): void {
    const sim = this.simOf(c.pid);
    if (!sim) return;
    // flush pending commands into the snapshot first so the client never misses them
    c.send({ t: 'snapshot', state: sim.state, pid: c.pid, mode: this.mode, speed: this.speed });
  }

  /** Debug: compare a client's state with the server's state at the same tick (kept for the last batches). */
  history = new Map<string, { tick: number; json: string }[]>();
  debugDiff(pid: string, tick: number, clientState: GameState): string {
    const sim = this.simOf(pid);
    if (!sim) return 'no sim';
    const h = (this.history.get(pid) ?? []).find((x) => x.tick === tick);
    if (!h) return `no server history for tick ${tick} (have ${(this.history.get(pid) ?? []).map((x) => x.tick).join(',')})`;
    const server = JSON.parse(h.json) as Record<string, unknown>;
    const client = clientState as unknown as Record<string, unknown>;
    const findDiff = (a: unknown, b: unknown, path: string): string | null => {
      if (typeof a !== typeof b) return `${path}: type ${typeof a} vs ${typeof b}`;
      if (a && typeof a === 'object') {
        const ka = Object.keys(a as object), kb = Object.keys(b as object);
        if (ka.join(',') !== kb.join(',')) return `${path}: keys ${ka.join(',')} vs ${kb.join(',')}`;
        for (const k of ka) { const d = findDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path + '.' + k); if (d) return d; }
        return null;
      }
      return a === b || (Number.isNaN(a as number) && Number.isNaN(b as number)) ? null : `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
    };
    return findDiff(server, client, 'state') ?? 'identical';
  }

  command(pid: string, cmd: Command): void {
    if (!this.started) return;
    if ((cmd as { p?: string }).p !== pid) return; // players only control themselves
    const sim = this.simOf(pid);
    if (sim) sim.pending.push(cmd);
  }

  setConnected(pid: string, connected: boolean): void {
    const p = this.players.find((x) => x.pid === pid);
    if (!p) return;
    p.connected = connected;
    const sim = this.simOf(pid);
    if (sim && this.started) sim.pending.push({ t: 'connect', p: pid, connected });
    this.broadcastLobby();
    if (this.players.every((x) => !x.connected) && this.onEmpty) setTimeout(() => { if (this.players.every((x) => !x.connected)) this.onEmpty?.(); }, 60000);
  }

  /** Advance by real seconds. */
  update(dt: number): void {
    if (!this.started) return;
    this.acc += dt * this.speed;
    let n = 0;
    const maxTicks = Math.max(1, Math.ceil(this.speed * 0.5));
    const batches = new Map<string, { start: number; cmds: Command[][] }>();
    while (this.acc >= 0.1 && n < maxTicks) {
      this.acc -= 0.1;
      for (const [key, sim] of this.sims) {
        if (sim.state.finished && sim.state.tick - sim.state.finished.tick > 50) continue;
        const cmds = sim.pending; sim.pending = [];
        let b = batches.get(key);
        if (!b) { b = { start: sim.state.tick, cmds: [] }; batches.set(key, b); }
        step(sim.state, cmds);
        b.cmds.push(cmds);
      }
      n++;
    }
    if (n >= maxTicks) this.acc = 0;
    this.tickCounter += n;
    for (const [key, b] of batches) {
      if (b.cmds.length === 0) continue;
      const sim = this.sims.get(key)!;
      const withHash = this.tickCounter % 50 < n;
      if (withHash) { const { log: _l, ...rest } = sim.state; for (const pid of sim.members) { const arr = this.history.get(pid) ?? []; arr.push({ tick: sim.state.tick, json: JSON.stringify(rest) }); if (arr.length > 200) arr.shift(); this.history.set(pid, arr); } }
      const msg: ServerMsg = { t: 'ticks', start: b.start, cmds: b.cmds, hash: withHash ? hashState(sim.state) : undefined };
      for (const pid of sim.members) { const c = this.players.find((p) => p.pid === pid); if (c && c.connected) c.send(msg); }
    }
    if (this.mode === 'race' && this.tickCounter % 10 < n) {
      const list = this.players.map((p) => { const s = this.sims.get(p.pid)?.state; return { pid: p.pid, name: p.name, progress: s ? s.stone.progress / s.stone.hp : 0, finished: s?.finished ? s.finished.tick : null }; });
      const msg: ServerMsg = { t: 'standings', list };
      for (const p of this.players) if (p.connected) p.send(msg);
    }
  }
}
