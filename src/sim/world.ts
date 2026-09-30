import { Rng, makeRngState } from './rng';
import { content, landscapeDef, rockDef, moodDef } from './content';
import type { GameConfig, GameState, ZoneState, Player, StoneState, SourceState, MethodId, Vec2 } from './types';
import { ZONES } from './types';

export const STONE_RADIUS = 6;

export function zoneDir(zone: number): Vec2 {
  const a = (zone / ZONES) * Math.PI * 2; // 0 = north (+z), clockwise
  return { x: Math.sin(a), z: Math.cos(a) };
}

/** Position where a player stands to work on a zone. */
export function zonePos(state: GameState, zone: number): Vec2 {
  const d = zoneDir(zone);
  const r = state.stone.radius + 1.6;
  return { x: d.x * r, z: d.z * r };
}

function emptyZone(): ZoneState {
  return {
    T: 20, wet: 0, fill: 0, frozen: false, holes: 0, deepHoles: 0, wedges: 0, wedgeWet: 0, growths: [], woodTimer: 0,
    charges: [], weak: 1, tapped: false, burst: 0, burstTemp: 0, burstTicks: 0, burstT0: 0, drip: 0, streak: 0, lastDmg: 0,
  };
}

export function rollWeather(rng: Rng, landscape: string): string {
  return rng.weighted(landscapeDef(landscape).weather);
}

export function defaultConfig(partial: Partial<GameConfig> & { seed: string }): GameConfig {
  const rng = Rng.from(partial.seed + ':cfg');
  return {
    seed: partial.seed,
    mode: partial.mode ?? 'solo',
    landscape: partial.landscape ?? rng.pick(content.landscapes).id,
    rock: partial.rock ?? rng.pick(content.rocks).id,
    stoneScale: partial.stoneScale ?? (partial.mode === 'race' ? content.economy.raceScale : 1),
    players: partial.players ?? [{ id: 'p1', name: 'Spieler' }],
    scenario: partial.scenario,
    moods: partial.moods,
  };
}

export function createGame(cfgIn: Partial<GameConfig> & { seed: string }): GameState {
  const cfg = defaultConfig(cfgIn);
  const land = landscapeDef(cfg.landscape);
  const rock = rockDef(cfg.rock);
  const rng = new Rng(makeRngState(cfg.seed + ':' + cfg.landscape + ':' + cfg.rock));

  // moods: 1-2 from list
  let moods: string[];
  if (cfg.moods) moods = cfg.moods.slice();
  else {
    const pool = rng.shuffle(content.moods.map((m) => m.id));
    moods = pool.slice(0, rng.chance(0.5) ? 1 : 2);
  }
  const hpMood = moods.reduce((m, id) => m * (Number(moodDef(id)?.hp ?? 1)), 1);
  const weakMult = moods.reduce((m, id) => m * (Number(moodDef(id)?.weak ?? 1)), 1);

  const zones: ZoneState[] = [];
  const startT = land.climate.night + 4;
  for (let i = 0; i < ZONES; i++) {
    const z = emptyZone();
    z.T = startT;
    zones.push(z);
  }
  const weakCount = 2 + rng.int(2);
  const order = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
  for (let i = 0; i < weakCount; i++) {
    zones[order[i]].weak = 1 + (0.6 + rng.float() * 0.6) * (weakMult === 1 ? 1 : 1.6);
    if (weakMult !== 1) zones[order[i]].weak = 2.5;
  }

  const dmg = {} as Record<MethodId, number>;
  for (const m of ['thermoschock', 'frost', 'tropfen', 'keile', 'dampf', 'strahl', 'wurzel'] as MethodId[]) dmg[m] = 0;

  const stone: StoneState = {
    rock: cfg.rock,
    moods,
    hp: Math.round(content.economy.stoneHp * rock.hp * hpMood * cfg.stoneScale),
    progress: 0,
    zones,
    line: 0,
    dmg,
    expression: 'neutral',
    radius: STONE_RADIUS * (cfg.stoneScale < 1 ? 0.75 : 1),
  };

  const sources: SourceState[] = land.sources.map((s) => ({
    id: s.id, kind: s.kind, pos: { x: s.pos[0], z: s.pos[1] }, elev: s.elev, flow: s.flow, temp: s.temp,
    reliability: s.reliability, salt: !!s.salt, store: s.store ?? (s.flow >= 5 ? 100000 : 300), storeCap: s.store ?? (s.flow >= 5 ? 100000 : 300), requires: s.requires, unlocked: !s.requires,
  }));

  const players: Player[] = cfg.players.map((p, i) => ({
    id: p.id, name: p.name,
    pos: { x: (i - (cfg.players.length - 1) / 2) * 2.5, z: -(stone.radius + 6) },
    yaw: 0, tools: ['haende'], carry: 0, carryTemp: 15, moveDir: null, moveTarget: null, queue: [], action: null,
    stun: 0, chain: null, lastTick: 0, connected: true,
  }));

  const forecast = [rollWeather(rng, cfg.landscape), rollWeather(rng, cfg.landscape), rollWeather(rng, cfg.landscape)];
  const state: GameState = {
    cfg,
    tick: 0,
    rng: rng.s,
    landscape: cfg.landscape,
    weather: { today: forecast[0], forecast: forecast.slice(1), dewToday: rng.chance(land.climate.humidity + 0.2) },
    stone,
    players,
    workers: [],
    routes: [],
    buildings: [],
    chains: [],
    sources,
    eco: {
      money: content.economy.startMoney, wood: content.economy.startWood, sand: 0, loan: 0, spectacle: 0,
      energyProd: 0, energyUse: 0, energyRatio: 1, soldToday: 0, workerSlots: content.economy.baseWorkerSlots,
      earned: 0, spent: 0, wagesOwed: 0, strike: false, paidPercent: 0, paidMilestones: 0, income: { council: 0, premium: 0, sale: 0, spectators: 0 },
    },
    research: { done: [], current: null, offered: null, perks: [], milestonesDone: 0 },
    events: { active: [], nextAt: 1800 + rng.int(1800) },
    log: [],
    stats: {
      waterScooped: 0, waterDelivered: 0, waterEffective: 0, waterSold: 0, moneyEarned: 0, moneySpent: 0, pipeMeters: 0,
      channelMeters: 0, steamOk: 0, steamFail: 0, freezes: 0, bursts: 0, stumbles: 0, timeline: [],
    },
    finished: null,
    nextId: 1,
    syncCall: null,
  };
  return state;
}

export function newId(state: GameState, prefix: string): string {
  return prefix + (state.nextId++).toString(36);
}
