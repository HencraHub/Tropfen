import type { Command, GameState } from '../sim/index';

/** Messages between client and server (JSON over WebSocket). */
export type ClientMsg =
  | { t: 'hello'; name: string; token?: string }
  | { t: 'create'; mode: 'coop' | 'race'; speed?: number; seed?: string; landscape?: string; rock?: string }
  | { t: 'join'; code: string }
  | { t: 'start' }
  | { t: 'cmd'; cmd: Command }
  | { t: 'resync' }
  | { t: 'debugState'; tick: number; state: GameState }
  | { t: 'ping' };

export interface LobbyPlayer { id: string; name: string; connected: boolean }

export type ServerMsg =
  | { t: 'welcome'; pid: string; token: string }
  | { t: 'lobby'; code: string; mode: 'coop' | 'race'; host: string; players: LobbyPlayer[]; speed: number }
  | { t: 'snapshot'; state: GameState; pid: string; mode: 'coop' | 'race'; speed: number }
  | { t: 'ticks'; start: number; cmds: Command[][]; hash?: string }
  | { t: 'standings'; list: { pid: string; name: string; progress: number; finished: number | null }[] }
  | { t: 'notice'; key: string }
  | { t: 'debugDiff'; tick: number; diff: string }
  | { t: 'error'; msg: string }
  | { t: 'pong' };
