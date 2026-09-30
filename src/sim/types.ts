import type { RngState } from './rng';

export const TICK_MS = 100;
export const TICKS_PER_SEC = 10;
export const TICKS_PER_DAY = 3600;
export const TICKS_PER_HOUR = 150;
export const ZONES = 8;

export type MethodId = 'thermoschock' | 'frost' | 'tropfen' | 'keile' | 'dampf' | 'strahl' | 'wurzel';
export const METHODS: MethodId[] = ['thermoschock', 'frost', 'tropfen', 'keile', 'dampf', 'strahl', 'wurzel'];

export interface Vec2 { x: number; z: number }

export interface GameConfig {
  seed: string;
  mode: 'solo' | 'coop' | 'race';
  landscape: string;
  rock: string;
  stoneScale: number; // 1 solo, 0.45 race
  players: { id: string; name: string }[];
  scenario?: string;
  moods?: string[]; // override
}

export interface ZoneState {
  T: number;
  wet: number;
  fill: number;
  frozen: boolean;
  holes: number;
  deepHoles: number;
  wedges: number;
  wedgeWet: number;
  growths: number[];
  woodTimer: number;
  charges: { liters: number; ticksLeft: number; T0: number }[];
  weak: number;
  tapped: boolean;
  burst: number;       // liters accumulated in the burst window
  burstTemp: number;   // liter-weighted water temperature
  burstTicks: number;  // ticks left in window
  burstT0: number;     // zone temperature before the burst
  drip: number;        // L/s arriving via drip-capable inlets this tick
  streak: number;      // ticks of uninterrupted drip
  lastDmg: number;
}

export interface StoneState {
  rock: string;
  moods: string[];
  hp: number;
  progress: number;
  zones: ZoneState[];
  line: number; // 0..3 (zone pair line, line+4)
  dmg: Record<MethodId, number>;
  expression: string;
  radius: number;
}

export interface ActionState {
  kind: string;
  ticksLeft: number;
  total: number;
  zone?: number;
  target?: string;
  liters?: number;
  deep?: boolean;
}

export interface Player {
  id: string;
  name: string;
  pos: Vec2;
  yaw: number;
  tools: string[];
  carry: number;
  carryTemp: number;
  moveDir: Vec2 | null;
  moveTarget: Vec2 | null;
  queue: unknown[];
  action: ActionState | null;
  stun: number;
  chain: string | null;
  lastTick: number;
  connected: boolean;
}

export type WorkerTask =
  | { type: 'carry'; source: string; target: { kind: 'zone'; zone: number } | { kind: 'building'; id: string } | { kind: 'village' } }
  | { type: 'chain'; chain: string }
  | { type: 'drill'; zone: number; deep: boolean }
  | { type: 'tread'; building: string }
  | { type: 'maintain' }
  | { type: 'wedges'; zone: number }
  | { type: 'chop' }
  | null;

export interface Worker {
  id: string;
  kind: string;
  pos: Vec2;
  task: WorkerTask;
  phase: string;
  carry: number;
  carryTemp: number;
  timer: number;
  stumble: number;
  strike: boolean;
  target: Vec2 | null;
}

export type RouteTarget =
  | { kind: 'zone'; zone: number }
  | { kind: 'building'; id: string }
  | { kind: 'trees'; zone: number };

export interface Route {
  id: string;
  kind: 'rinne' | 'rohr';
  points: Vec2[];
  length: number;
  from: string; // source id or building id (tank)
  to: RouteTarget;
  condition: number;
  pumped: boolean;
  ok: boolean;  // gradient valid (rinne)
  rise: number; // total uphill meters (rohr)
  flow: number; // L/s delivered last tick
  builtTicks: number;
}

export interface Building {
  id: string;
  type: string;
  pos: Vec2;
  zone: number | null;
  ticksToBuild: number;
  liters: number;
  cap: number;
  out: { zone: number; rate: number } | null;
  workers: string[];
  active: boolean;
  condition: number;
  timer: number;
  temp: number;
}

export interface Chain {
  id: string;
  source: string;
  target: { kind: 'zone'; zone: number } | { kind: 'building'; id: string };
  workers: string[];
  players: string[];
  length: number;
  flow: number;
}

export interface SourceState {
  id: string;
  kind: string;
  pos: Vec2;
  elev: number;
  flow: number;
  temp: number;
  reliability: number;
  salt: boolean;
  store: number;     // liters currently available (refills at `flow`)
  storeCap: number;
  requires?: string;
  unlocked: boolean;
}

export interface EcoState {
  money: number;
  wood: number;
  sand: number;
  loan: number;
  spectacle: number;
  energyProd: number;
  energyUse: number;
  energyRatio: number;
  soldToday: number;
  workerSlots: number;
  earned: number;
  spent: number;
  wagesOwed: number;
  strike: boolean;
  paidPercent: number;
  paidMilestones: number;
  income: { council: number; premium: number; sale: number; spectators: number };
}

export interface ResearchState {
  done: string[];
  current: { id: string; ticksLeft: number } | null;
  offered: string[] | null;
  perks: string[];
  milestonesDone: number;
}

export interface LogEntry {
  tick: number;
  kind: string;
  zone?: number;
  value?: number;
  id?: string;
  player?: string;
  text?: string;
}

export interface Stats {
  waterScooped: number;
  waterDelivered: number;
  waterEffective: number;
  waterSold: number;
  moneyEarned: number;
  moneySpent: number;
  pipeMeters: number;
  channelMeters: number;
  steamOk: number;
  steamFail: number;
  freezes: number;
  bursts: number;
  stumbles: number;
  timeline: { tick: number; progress: number; money: number }[];
}

export interface GameState {
  cfg: GameConfig;
  tick: number;
  rng: RngState;
  landscape: string;
  weather: { today: string; forecast: string[]; dewToday: boolean };
  stone: StoneState;
  players: Player[];
  workers: Worker[];
  routes: Route[];
  buildings: Building[];
  chains: Chain[];
  sources: SourceState[];
  eco: EcoState;
  research: ResearchState;
  events: { active: { id: string; ticksLeft: number; progressAtStart: number }[]; nextAt: number };
  log: LogEntry[];
  stats: Stats;
  finished: { tick: number } | null;
  nextId: number;
  syncCall: { tick: number; by: string } | null;
}
