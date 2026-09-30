import { step, hashState, type Command, type GameState } from '../../sim/index';
import type { ClientMsg, ServerMsg, LobbyPlayer } from '../../net/protocol';
import type { Session } from '../game/session';

export interface LobbyInfo { code: string; mode: 'coop' | 'race'; host: string; players: LobbyPlayer[] }

export interface NetHandlers {
  onLobby(info: LobbyInfo): void;
  onStart(session: NetSession): void;
  onError(msg: string): void;
  onNotice(key: string): void;
}

/**
 * Online session: the server runs the simulation and broadcasts each tick's command list;
 * the client replays them on its own copy (deterministic lockstep) and resyncs from a snapshot after a reconnect.
 */
export class NetSession implements Session {
  state!: GameState;
  playerId = '';
  mode: 'coop' | 'race' = 'coop';
  speed = 1;
  paused = false;
  token = '';
  private ws: WebSocket | null = null;
  private queue: { start: number; cmds: Command[][]; hash?: string }[] = [];
  private logMark = 0;
  private started = false;
  private standingsList: { pid: string; name: string; progress: number; finished: number | null }[] = [];
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  providers: ((state: GameState) => Command[])[] = [];
  desyncs = 0;
  reconnects = 0;

  constructor(public url: string, public name: string, private handlers: NetHandlers) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      let opened = false;
      ws.onopen = () => { opened = true; this.sendMsg({ t: 'hello', name: this.name, token: this.token || undefined }); resolve(); };
      ws.onerror = () => { if (!opened) reject(new Error('connect')); };
      ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data as string) as ServerMsg);
      ws.onclose = () => { this.ws = null; if (!this.closedByUser && this.started) { this.handlers.onNotice('net.disconnected'); this.scheduleReconnect(); } };
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.reconnects++; this.connect().catch(() => this.scheduleReconnect()); }, 800);
  }

  private sendMsg(m: ClientMsg): void { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }

  create(mode: 'coop' | 'race', speed: number): void { this.sendMsg({ t: 'create', mode, speed }); }
  join(code: string): void { this.sendMsg({ t: 'join', code }); }
  start(): void { this.sendMsg({ t: 'start' }); }
  send(cmd: Command): void { this.sendMsg({ t: 'cmd', cmd }); }
  close(): void { this.closedByUser = true; this.ws?.close(); }
  /** Test hook: drop the socket without telling the server, then reconnect with the token. */
  simulateDrop(): void { this.ws?.close(); }

  private onMessage(m: ServerMsg): void {
    switch (m.t) {
      case 'welcome': this.playerId = m.pid; this.token = m.token; if (this.started) this.handlers.onNotice('net.reconnected'); break;
      case 'lobby': this.handlers.onLobby({ code: m.code, mode: m.mode, host: m.host, players: m.players }); break;
      case 'snapshot': {
        this.state = m.state; this.playerId = m.pid; this.mode = m.mode; this.speed = m.speed;
        this.queue = this.queue.filter((q) => q.start + q.cmds.length > this.state.tick);
        this.logMark = this.state.log.length;
        if (!this.started) { this.started = true; this.handlers.onStart(this); }
        break;
      }
      case 'ticks': this.queue.push({ start: m.start, cmds: m.cmds, hash: m.hash }); break;
      case 'standings': this.standingsList = m.list; break;
      case 'notice': this.handlers.onNotice(m.key); break;
      case 'debugDiff': (window as unknown as { __desync: unknown }).__desync = m; console.warn('DESYNC', m.tick, m.diff); break;
      case 'error': this.handlers.onError(m.msg); break;
      case 'pong': break;
    }
  }

  advance(): number {
    if (!this.state) return 0;
    let n = 0;
    this.queue.sort((a, b) => a.start - b.start);
    while (this.queue.length > 0) {
      const batch = this.queue[0];
      if (batch.start > this.state.tick) break; // gap: wait for resync
      if (batch.start + batch.cmds.length <= this.state.tick) { this.queue.shift(); continue; }
      const offset = this.state.tick - batch.start;
      for (let i = offset; i < batch.cmds.length; i++) {
        for (const p of this.providers) for (const c of p(this.state)) this.send(c);
        step(this.state, batch.cmds[i]);
        n++;
      }
      if (batch.hash && batch.hash !== hashState(this.state)) { this.desyncs++; if (this.desyncs === 1) { const { log: _l, ...rest } = this.state; this.sendMsg({ t: 'debugState', tick: this.state.tick, state: rest as GameState }); } this.sendMsg({ t: 'resync' }); }
      this.queue.shift();
    }
    if (this.queue.length > 0 && this.queue[0].start > this.state.tick + 1) this.sendMsg({ t: 'resync' });
    return n;
  }
  drainLog(): GameState['log'] {
    const out = this.state.log.filter((l) => l.tick >= this.logMark);
    this.logMark = this.state.tick;
    return out;
  }
  standings() { return this.standingsList; }
  hash(): string { return hashState(this.state); }
  dispose(): void { this.close(); }
}
