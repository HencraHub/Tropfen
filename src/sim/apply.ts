import { content, toolDef, buildingDef, workerDef, researchNode, landscapeDef, rockDef } from './content';
import { dist, hasResearch, woodPrice, perkValue, eventValue } from './effects';
import { heightAt } from './terrain';
import type { Command } from './commands';
import type { GameState, Player, Building, Route, Vec2, WorkerTask, RouteTarget } from './types';
import { ZONES } from './types';
import { newId, zonePos } from './world';
import { spend } from './water';

function log(state: GameState, kind: string, extra: Partial<{ zone: number; value: number; id: string; player: string; text: string }> = {}): void {
  state.log.push({ tick: state.tick, kind, ...extra });
  if (state.log.length > 60) state.log.splice(0, state.log.length - 60);
}

export function findPlayer(state: GameState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function stoneEdgeDist(state: GameState, pos: Vec2): number {
  return Math.max(0, Math.hypot(pos.x, pos.z) - state.stone.radius);
}

function targetFor(state: GameState, cmd: Command): Vec2 | null {
  const land = landscapeDef(state.landscape);
  switch (cmd.t) {
    case 'scoop': {
      const s = state.sources.find((x) => x.id === cmd.source);
      return s ? s.pos : null;
    }
    case 'pour': case 'tap': case 'drill': case 'wedge': case 'plant': case 'charge': case 'line':
      return zonePos(state, cmd.zone);
    case 'pourTank': case 'fillFromTank': case 'release': case 'setOut': {
      const b = state.buildings.find((x) => x.id === cmd.building);
      return b ? b.pos : null;
    }
    case 'repair': {
      const b = state.buildings.find((x) => x.id === cmd.id);
      if (b) return b.pos;
      const r = state.routes.find((x) => x.id === cmd.id);
      return r ? r.points[Math.floor(r.points.length / 2)] : null;
    }
    case 'chop': return { x: land.forest[0], z: land.forest[1] };
    case 'sell': case 'buyTool': case 'buyWood': case 'buySand': case 'hire':
      return { x: land.village[0], z: land.village[1] };
    default: return null;
  }
}

export function interactDistance(): number {
  return content.economy.interactDistance;
}

/** Commands that require standing next to something. */
const NEAR_CMDS = new Set(['scoop', 'pour', 'tap', 'drill', 'wedge', 'plant', 'charge', 'pourTank', 'fillFromTank', 'release', 'repair', 'chop', 'sell', 'buyTool', 'buyWood', 'buySand', 'hire']);

export function applyCommand(state: GameState, cmd: Command): void {
  if (state.finished && cmd.t !== 'connect' && cmd.t !== 'leave') return;
  if (cmd.t === 'join') {
    if (!findPlayer(state, cmd.p)) {
      state.players.push({
        id: cmd.p, name: cmd.name, pos: { x: 0, z: -(state.stone.radius + 6) }, yaw: 0, tools: ['haende'], carry: 0, carryTemp: 15,
        moveDir: null, moveTarget: null, queue: [], action: null, stun: 0, chain: null, lastTick: state.tick, connected: true,
      });
      log(state, 'joined', { player: cmd.p });
    }
    return;
  }
  const p = findPlayer(state, cmd.p);
  if (!p) return;
  p.lastTick = state.tick;
  if (cmd.t === 'connect') { p.connected = cmd.connected; return; }
  if (cmd.t === 'leave') { p.connected = false; p.moveDir = null; p.moveTarget = null; return; }
  if (p.stun > 0) return;

  if (NEAR_CMDS.has(cmd.t)) {
    const tgt = targetFor(state, cmd);
    if (!tgt) return;
    if (dist(p.pos, tgt) > interactDistance() || p.action || p.queue.length > 0) {
      // queue it: the player walks there and executes on arrival (duplicates dropped)
      const key = JSON.stringify(cmd);
      if (p.queue.length < 8 && !p.queue.some((q) => JSON.stringify(q) === key)) p.queue.push(cmd);
      p.moveDir = null;
      return;
    }
  }
  executeNow(state, p, cmd);
}

export function commandTarget(state: GameState, cmd: Command): Vec2 | null {
  return targetFor(state, cmd);
}

export function executeNow(state: GameState, p: Player, cmd: Command): void {
  const eco = content.economy;
  switch (cmd.t) {
    case 'move': {
      const len = Math.hypot(cmd.dx, cmd.dz);
      p.moveDir = len > 0.01 ? { x: cmd.dx / Math.max(1, len), z: cmd.dz / Math.max(1, len) } : null;
      if (cmd.yaw !== undefined) p.yaw = cmd.yaw;
      if (p.moveDir) { p.moveTarget = null; p.queue = []; if (p.action && p.action.kind !== 'stun') p.action = null; }
      return;
    }
    case 'goto': p.moveTarget = { x: cmd.x, z: cmd.z }; p.moveDir = null; p.queue = []; return;
    case 'stop': p.moveTarget = null; p.moveDir = null; p.queue = []; return;
    case 'scoop': {
      const s = state.sources.find((x) => x.id === cmd.source);
      if (!s || !s.unlocked) return;
      if (s.kind === 'regen' || s.kind === 'tau') return;
      const tool = carryTool(p);
      const cap = tool.carry ?? 2;
      if (p.carry >= cap - 0.01) return;
      const want = Math.min(cap - p.carry, cmd.liters ?? cap);
      p.action = { kind: 'scoop', ticksLeft: tool.scoopTicks ?? 15, total: tool.scoopTicks ?? 15, target: s.id, liters: want };
      return;
    }
    case 'pour': {
      if (p.carry <= 0) return;
      const liters = Math.min(p.carry, cmd.liters ?? p.carry);
      p.action = { kind: 'pour', ticksLeft: eco.actionTicks.pour, total: eco.actionTicks.pour, zone: cmd.zone, liters };
      return;
    }
    case 'pourTank': {
      const b = state.buildings.find((x) => x.id === cmd.building);
      if (!b || p.carry <= 0 || b.cap <= 0) return;
      p.action = { kind: 'pourTank', ticksLeft: eco.actionTicks.pour, total: eco.actionTicks.pour, target: b.id, liters: p.carry };
      return;
    }
    case 'fillFromTank': {
      const b = state.buildings.find((x) => x.id === cmd.building);
      if (!b || b.liters <= 0) return;
      const tool = carryTool(p);
      const cap = tool.carry ?? 2;
      if (p.carry >= cap - 0.01) return;
      p.action = { kind: 'fillFromTank', ticksLeft: Math.ceil((tool.scoopTicks ?? 15) / 2), total: Math.ceil((tool.scoopTicks ?? 15) / 2), target: b.id, liters: cap - p.carry };
      return;
    }
    case 'tap': {
      if (!p.tools.includes('klopfhammer')) return;
      const ticks = Math.round((toolDef('klopfhammer')?.tapTicks ?? 50) * (state.stone.moods.includes('plappermaul') ? 0.6 : 1));
      p.action = { kind: 'tap', ticksLeft: ticks, total: ticks, zone: cmd.zone };
      return;
    }
    case 'drill': {
      const z = state.stone.zones[cmd.zone];
      const deep = !!cmd.deep;
      const tool = deep ? 'tiefbohrer' : p.tools.includes('tiefbohrer') ? 'tiefbohrer' : 'bohrer';
      if (!p.tools.includes(tool)) return;
      const td = toolDef(tool)!;
      if (!deep && z.holes >= content.methods.keile.maxWedges) return;
      if (deep && z.deepHoles >= 3) return;
      const ticks = Math.round((deep ? td.deepTicks! : td.drillTicks!) * rockDef(state.stone.rock).hardness);
      p.action = { kind: 'drill', ticksLeft: ticks, total: ticks, zone: cmd.zone, deep };
      return;
    }
    case 'wedge': {
      const z = state.stone.zones[cmd.zone];
      if (!hasResearch(state, 'quellkeile')) return;
      if (z.wedges >= z.holes || state.eco.wood < 1) return;
      p.action = { kind: 'wedge', ticksLeft: eco.actionTicks.wedge, total: eco.actionTicks.wedge, zone: cmd.zone };
      return;
    }
    case 'plant': {
      const z = state.stone.zones[cmd.zone];
      if (!hasResearch(state, 'setzlinge')) return;
      if (z.growths.length >= content.methods.wurzel.maxTrees) return;
      const p2 = state.stone.progress / state.stone.hp;
      if (p2 < content.methods.wurzel.minProgress && z.holes <= z.wedges) return;
      if (!spend(state, eco.seedlingCost)) return;
      p.action = { kind: 'plant', ticksLeft: eco.actionTicks.plant, total: eco.actionTicks.plant, zone: cmd.zone };
      return;
    }
    case 'charge': {
      const z = state.stone.zones[cmd.zone];
      const m = content.methods.dampf;
      if (!hasResearch(state, 'dampfbohrung')) return;
      if (z.charges.length >= z.deepHoles || p.carry < m.minLiters || z.T < m.minT) return;
      if (!hasResearch(state, 'sicherheitsventil') && state.eco.wood < eco.plugCostWood) return;
      p.action = { kind: 'charge', ticksLeft: eco.actionTicks.charge, total: eco.actionTicks.charge, zone: cmd.zone, liters: Math.min(p.carry, m.maxLiters) };
      return;
    }
    case 'chop': {
      if (!p.tools.includes('axt')) return;
      const t = toolDef('axt')!.chopTicks!;
      p.action = { kind: 'chop', ticksLeft: t, total: t };
      return;
    }
    case 'sell': {
      if (p.carry <= 0) return;
      p.action = { kind: 'sell', ticksLeft: eco.actionTicks.sell, total: eco.actionTicks.sell, liters: p.carry };
      return;
    }
    case 'buyTool': {
      const td = toolDef(cmd.tool);
      if (!td || p.tools.includes(cmd.tool) || !hasResearch(state, td.requires)) return;
      const held = p.tools.filter((t) => t !== 'haende');
      if (held.length >= 2) return; // two tool slots
      if (!spend(state, td.cost)) return;
      p.tools.push(cmd.tool);
      if (td.carry !== undefined) p.carry = Math.min(p.carry, td.carry);
      log(state, 'bought', { player: p.id, id: cmd.tool });
      return;
    }
    case 'dropTool': {
      const i = p.tools.indexOf(cmd.tool);
      if (i > 0) { p.tools.splice(i, 1); p.carry = Math.min(p.carry, carryTool(p).carry ?? 2); }
      return;
    }
    case 'buyWood': {
      const n = Math.max(0, Math.floor(cmd.amount));
      const cost = n * woodPrice(state);
      if (n <= 0 || !spend(state, cost)) return;
      state.eco.wood += n;
      return;
    }
    case 'buySand': {
      const n = Math.max(0, Math.floor(cmd.amount));
      const price = landscapeDef(state.landscape).sandPrice;
      if (n <= 0 || !spend(state, n * price)) return;
      state.eco.sand += n;
      return;
    }
    case 'hire': {
      const wd = workerDef(cmd.kind);
      if (!wd || !hasResearch(state, wd.requires)) return;
      if (state.workers.length >= state.eco.workerSlots) return;
      if (!spend(state, wd.hire)) return;
      const w = { id: newId(state, 'w'), kind: cmd.kind, pos: { ...p.pos }, task: (cmd.task ?? null) as WorkerTask, phase: 'idle', carry: 0, carryTemp: 15, timer: 0, stumble: 0, strike: false, target: null };
      state.workers.push(w);
      log(state, 'hired', { id: w.id, player: p.id });
      return;
    }
    case 'dismiss': {
      const i = state.workers.findIndex((w) => w.id === cmd.worker);
      if (i >= 0) { removeWorkerFromChains(state, cmd.worker); state.workers.splice(i, 1); }
      return;
    }
    case 'assign': {
      const w = state.workers.find((x) => x.id === cmd.worker);
      if (!w) return;
      removeWorkerFromChains(state, w.id);
      w.task = cmd.task; w.phase = 'idle'; w.timer = 0;
      if (cmd.task && cmd.task.type === 'chain') {
        const c = state.chains.find((x) => x.id === (cmd.task as { chain: string }).chain);
        if (c && !c.workers.includes(w.id)) c.workers.push(w.id);
      }
      return;
    }
    case 'build': {
      const bd = buildingDef(cmd.type);
      if (!bd || !hasResearch(state, bd.requires)) return;
      if (bd.needs === 'waterwheel' && !landscapeDef(state.landscape).waterwheel) return;
      if (bd.zone && (cmd.zone === undefined || cmd.zone < 0 || cmd.zone >= ZONES)) return;
      if (bd.zone && state.buildings.some((b) => b.type === cmd.type && b.zone === cmd.zone)) return;
      if (!bd.zone && bd.workers === undefined && bd.tank === undefined && state.buildings.some((b) => b.type === cmd.type && (bd.spectacle || bd.researchSpeed || bd.id === 'marktstand'))) return;
      const wood = bd.wood ?? 0;
      if (state.eco.wood < wood) return;
      if (!spend(state, bd.cost)) return;
      state.eco.wood -= wood;
      const pos = bd.zone ? zonePos(state, cmd.zone!) : { x: cmd.x, z: cmd.z };
      if (bd.zone) { const d = Math.hypot(pos.x, pos.z); pos.x *= (d + 2) / d; pos.z *= (d + 2) / d; }
      const b: Building = {
        id: newId(state, 'b'), type: cmd.type, pos, zone: bd.zone ? cmd.zone! : null, ticksToBuild: bd.buildTicks,
        liters: 0, cap: bd.tank ?? (cmd.type === 'strahlwerk' ? 500 : 0), out: null, workers: [], active: false, condition: 1, timer: 0, temp: 15,
      };
      state.buildings.push(b);
      log(state, 'build', { id: b.id, player: p.id, text: cmd.type });
      return;
    }
    case 'route': {
      buildRoute(state, p, cmd);
      return;
    }
    case 'demolish': {
      const bi = state.buildings.findIndex((b) => b.id === cmd.id);
      if (bi >= 0) { state.buildings.splice(bi, 1); return; }
      const ri = state.routes.findIndex((r) => r.id === cmd.id);
      if (ri >= 0) state.routes.splice(ri, 1);
      return;
    }
    case 'repair': {
      const t = content.routes.repairTicks;
      p.action = { kind: 'repair', ticksLeft: t, total: t, target: cmd.id };
      return;
    }
    case 'setOut': {
      const b = state.buildings.find((x) => x.id === cmd.building);
      if (!b || b.cap <= 0) return;
      b.out = cmd.zone === null ? null : { zone: cmd.zone, rate: Math.max(0, cmd.rate) };
      return;
    }
    case 'release': {
      const b = state.buildings.find((x) => x.id === cmd.building);
      const bd = b && buildingDef(b.type);
      if (!b || !bd || !bd.valve || b.liters <= 0) return;
      p.action = { kind: 'release', ticksLeft: eco.actionTicks.release, total: eco.actionTicks.release, target: b.id, zone: cmd.zone, liters: Math.min(b.liters, cmd.liters) };
      return;
    }
    case 'research': {
      const node = researchNode(cmd.id);
      if (!node || state.research.current || state.research.done.includes(cmd.id)) return;
      for (const req of node.requires) {
        const alts = req.split('|');
        if (!alts.some((a) => state.research.done.includes(a))) return;
      }
      if (!spend(state, node.cost)) return;
      const speed = state.buildings.some((b) => b.type === 'schreibstube' && b.active) ? 2 : 1;
      state.research.current = { id: cmd.id, ticksLeft: Math.ceil(node.ticks / speed) };
      log(state, 'researchStart', { id: cmd.id, player: p.id });
      return;
    }
    case 'perk': {
      if (!state.research.offered || !state.research.offered.includes(cmd.id)) return;
      state.research.perks.push(cmd.id);
      state.research.offered = null;
      if (cmd.id === 'steinfluesterer') for (const z of state.stone.zones) z.tapped = true;
      if (cmd.id === 'doppelschicht') { /* speed handled via perkValue */ }
      log(state, 'perk', { id: cmd.id, player: p.id });
      return;
    }
    case 'line': {
      const line = ((cmd.zone % 4) + 4) % 4;
      if (line === state.stone.line) return;
      const free = state.stone.progress < state.stone.hp * 0.01;
      if (!free && !spend(state, eco.lineChangeCost)) return;
      state.stone.line = line;
      log(state, 'lineSet', { zone: line, player: p.id });
      return;
    }
    case 'loan': {
      const max = hasResearch(state, 'buergschaft') ? eco.loan.maxBuergschaft : eco.loan.max;
      const amt = Math.min(cmd.amount, max - state.eco.loan);
      if (amt <= 0) return;
      state.eco.loan += amt;
      state.eco.money += amt;
      log(state, 'loan', { value: amt, player: p.id });
      return;
    }
    case 'repay': {
      const amt = Math.min(cmd.amount, state.eco.loan, state.eco.money);
      if (amt <= 0) return;
      state.eco.loan -= amt; state.eco.money -= amt;
      return;
    }
    case 'chain': {
      const s = state.sources.find((x) => x.id === cmd.source);
      if (!s) return;
      const tgt = cmd.target.kind === 'zone' ? zonePos(state, cmd.target.zone) : state.buildings.find((b) => b.id === (cmd.target as { id: string }).id)?.pos;
      if (!tgt) return;
      const id = newId(state, 'c');
      const workers = cmd.workers.filter((w) => state.workers.some((x) => x.id === w));
      for (const w of workers) removeWorkerFromChains(state, w);
      state.chains.push({ id, source: cmd.source, target: cmd.target, workers, players: [], length: dist(s.pos, tgt), flow: 0 });
      for (const wid of workers) { const w = state.workers.find((x) => x.id === wid)!; w.task = { type: 'chain', chain: id }; w.phase = 'chain'; }
      log(state, 'chain', { id, player: p.id });
      return;
    }
    case 'unchain': {
      const i = state.chains.findIndex((c) => c.id === cmd.chain);
      if (i < 0) return;
      const c = state.chains[i];
      for (const wid of c.workers) { const w = state.workers.find((x) => x.id === wid); if (w) { w.task = null; w.phase = 'idle'; } }
      for (const pid of c.players) { const pl = findPlayer(state, pid); if (pl) pl.chain = null; }
      state.chains.splice(i, 1);
      return;
    }
    case 'joinChain': {
      const c = state.chains.find((x) => x.id === cmd.chain);
      if (!c) return;
      leaveChain(state, p);
      c.players.push(p.id); p.chain = c.id; p.moveTarget = null; p.moveDir = null; p.action = null;
      const s = state.sources.find((x) => x.id === c.source)!;
      p.pos = { x: (s.pos.x + 0) / 2, z: (s.pos.z + 0) / 2 };
      return;
    }
    case 'leaveChain': leaveChain(state, p); return;
    case 'syncCall': {
      state.syncCall = { tick: state.tick + Math.max(10, cmd.inTicks), by: p.id };
      log(state, 'syncCall', { player: p.id, value: state.syncCall.tick });
      return;
    }
    default: return;
  }
}

function leaveChain(state: GameState, p: Player): void {
  if (!p.chain) return;
  const c = state.chains.find((x) => x.id === p.chain);
  if (c) c.players = c.players.filter((x) => x !== p.id);
  p.chain = null;
}

function removeWorkerFromChains(state: GameState, wid: string): void {
  for (const c of state.chains) c.workers = c.workers.filter((x) => x !== wid);
}

export function carryTool(p: Player) {
  let best = toolDef('haende')!;
  for (const t of p.tools) {
    const d = toolDef(t);
    if (d && d.carry !== undefined && d.carry > (best.carry ?? 0)) best = d;
  }
  return best;
}

export interface RouteEval { ok: boolean; length: number; rise: number; cost: number; wood: number; reason: string }

/** Evaluate a route polyline with the same rules the simulation uses when building it. */
export function evaluateRoute(state: GameState, kind: 'rinne' | 'rohr', points: Vec2[], from: string, to: RouteTarget, pumped: boolean): RouteEval {
  const def = content.routes[kind];
  const bad = (reason: string): RouteEval => ({ ok: false, length: 0, rise: 0, cost: 0, wood: 0, reason });
  if (!hasResearch(state, def.requires)) return bad('research');
  if (pumped && !hasResearch(state, content.routes.pumpe.requires)) return bad('research_pump');
  if (points.length < 2) return bad('points');
  const land = landscapeDef(state.landscape);
  const src = state.sources.find((s) => s.id === from);
  const fromB = state.buildings.find((b) => b.id === from);
  if (!src && !fromB) return bad('from');
  if (src && !src.unlocked) return bad('locked');
  const start = src ? src.pos : fromB!.pos;
  const endPos = to.kind === 'building' ? state.buildings.find((b) => b.id === (to as { id: string }).id)?.pos : zonePos(state, to.zone);
  if (!endPos) return bad('to');
  if (dist(points[0], start) > 6 || dist(points[points.length - 1], endPos) > 6) return bad('ends');
  let length = 0, rise = 0, ok = true;
  let prevH = src ? heightAt(land, start.x, start.z) + src.elev : heightAt(land, start.x, start.z) + 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const l = dist(a, b);
    length += l;
    const h = heightAt(land, b.x, b.z);
    const grade = l > 0 ? (prevH - h) / l : 0; // positive = downhill
    if (kind === 'rinne' && grade < def.minGrade) ok = false;
    if (h > prevH) rise += h - prevH;
    prevH = h;
  }
  if (length < 1) return bad('short');
  if (kind === 'rohr' && rise > 0.5 && !pumped) ok = false;
  const cost = def.costPerM * length + (pumped ? content.routes.pumpe.cost : 0);
  const wood = Math.ceil(def.woodPerM * length);
  return { ok, length, rise, cost, wood, reason: ok ? 'ok' : 'grade' };
}

/** Polyline from a source/building to a target, in `segments` pieces; `bend` offsets the middle sideways (meters) to get around hills. */
export function straightRoute(state: GameState, from: string, to: RouteTarget, segments = 5, bend = 0): Vec2[] {
  const src = state.sources.find((s) => s.id === from);
  const fromB = state.buildings.find((b) => b.id === from);
  const start = src ? src.pos : fromB ? fromB.pos : { x: 0, z: 0 };
  const end = to.kind === 'building' ? (state.buildings.find((b) => b.id === (to as { id: string }).id)?.pos ?? { x: 0, z: 0 }) : zonePos(state, to.zone);
  const dx = end.x - start.x, dz = end.z - start.z;
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len;
  const pts: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const off = bend * Math.sin(Math.PI * t);
    pts.push({ x: start.x + dx * t + nx * off, z: start.z + dz * t + nz * off });
  }
  return pts;
}

function buildRoute(state: GameState, p: Player, cmd: Extract<Command, { t: 'route' }>): void {
  const ev = evaluateRoute(state, cmd.kind, cmd.points, cmd.from, cmd.to, !!cmd.pumped);
  if (ev.reason !== 'ok' && ev.reason !== 'grade') return;
  if (state.eco.wood < ev.wood) return;
  if (!spend(state, ev.cost)) return;
  state.eco.wood -= ev.wood;
  const r: Route = { id: newId(state, 'r'), kind: cmd.kind, points: cmd.points.map((q) => ({ x: q.x, z: q.z })), length: ev.length, from: cmd.from, to: cmd.to, condition: 1, pumped: !!cmd.pumped, ok: ev.ok, rise: ev.rise, flow: 0, builtTicks: state.tick };
  state.routes.push(r);
  if (cmd.kind === 'rohr') state.stats.pipeMeters += ev.length; else state.stats.channelMeters += ev.length;
  log(state, 'route', { id: r.id, player: p.id, text: cmd.kind, value: ev.ok ? 1 : 0 });
}
