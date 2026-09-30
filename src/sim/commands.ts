import type { Vec2, WorkerTask, RouteTarget } from './types';

export type Command =
  | { t: 'move'; p: string; dx: number; dz: number; yaw?: number }
  | { t: 'goto'; p: string; x: number; z: number }
  | { t: 'stop'; p: string }
  | { t: 'scoop'; p: string; source: string; liters?: number }
  | { t: 'pour'; p: string; zone: number; liters?: number }
  | { t: 'pourTank'; p: string; building: string }
  | { t: 'fillFromTank'; p: string; building: string }
  | { t: 'tap'; p: string; zone: number }
  | { t: 'drill'; p: string; zone: number; deep?: boolean }
  | { t: 'wedge'; p: string; zone: number }
  | { t: 'plant'; p: string; zone: number }
  | { t: 'charge'; p: string; zone: number }
  | { t: 'chop'; p: string }
  | { t: 'sell'; p: string }
  | { t: 'buyTool'; p: string; tool: string }
  | { t: 'dropTool'; p: string; tool: string }
  | { t: 'buyWood'; p: string; amount: number }
  | { t: 'buySand'; p: string; amount: number }
  | { t: 'hire'; p: string; kind: string; task?: WorkerTask }
  | { t: 'dismiss'; p: string; worker: string }
  | { t: 'assign'; p: string; worker: string; task: WorkerTask }
  | { t: 'build'; p: string; type: string; x: number; z: number; zone?: number }
  | { t: 'route'; p: string; kind: 'rinne' | 'rohr'; points: Vec2[]; from: string; to: RouteTarget; pumped?: boolean }
  | { t: 'demolish'; p: string; id: string }
  | { t: 'repair'; p: string; id: string }
  | { t: 'setOut'; p: string; building: string; zone: number | null; rate: number }
  | { t: 'release'; p: string; building: string; zone: number; liters: number }
  | { t: 'research'; p: string; id: string }
  | { t: 'perk'; p: string; id: string }
  | { t: 'line'; p: string; zone: number }
  | { t: 'loan'; p: string; amount: number }
  | { t: 'repay'; p: string; amount: number }
  | { t: 'chain'; p: string; source: string; target: { kind: 'zone'; zone: number } | { kind: 'building'; id: string }; workers: string[] }
  | { t: 'unchain'; p: string; chain: string }
  | { t: 'joinChain'; p: string; chain: string }
  | { t: 'leaveChain'; p: string }
  | { t: 'syncCall'; p: string; inTicks: number }
  | { t: 'join'; p: string; name: string }
  | { t: 'leave'; p: string }
  | { t: 'connect'; p: string; connected: boolean };

export type CommandType = Command['t'];
