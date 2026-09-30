import { content, landscapeDef, rockDef, buildingDef, workerDef, toolDef, perkDef } from './content';
import { Rng } from './rng';
import { ambient, sunBase, sunFacing, sunRaw, weatherNow, perkValue, moodValue, eventValue, eventFlag, hasResearch, dist, isNight, hourOf, timeMultiplier } from './effects';
import { heightAt } from './terrain';
import type { Command } from './commands';
import type { GameState, Player, Worker, Building, Route, Vec2, MethodId } from './types';
import { TICKS_PER_DAY, TICKS_PER_HOUR, ZONES } from './types';
import { applyCommand, executeNow, carryTool, commandTarget, interactDistance } from './apply';
import { waterOnZone, earn, sourceRate, spend } from './water';
import { zonePos, rollWeather } from './world';

const DT = 0.1;          // seconds per tick
const DT_H = 1 / TICKS_PER_HOUR; // hours per tick

function log(state: GameState, kind: string, extra: Partial<{ zone: number; value: number; id: string; player: string; text: string }> = {}): void {
  state.log.push({ tick: state.tick, kind, ...extra });
  if (state.log.length > 60) state.log.splice(0, state.log.length - 60);
}

/** Advance the simulation by one tick. Commands are applied first, in order. */
export function step(state: GameState, commands: readonly Command[] = []): void {
  for (const c of commands) applyCommand(state, c);
  if (state.finished) { state.tick++; return; }
  const rng = new Rng(state.rng);
  updateCalendar(state, rng);
  updateEnergyAndBuildings(state, rng);
  updateSourcesAndRoutes(state);
  updateChains(state);
  updatePlayers(state, rng);
  updateWorkers(state, rng);
  updateStone(state, rng);
  updateEconomy(state, rng);
  updateResearch(state, rng);
  updateEvents(state, rng);
  if (state.stone.progress >= state.stone.hp && !state.finished) {
    state.stone.progress = state.stone.hp;
    state.finished = { tick: state.tick };
    log(state, 'finished', { value: state.tick });
  }
  if (state.tick % 600 === 0) state.stats.timeline.push({ tick: state.tick, progress: state.stone.progress / state.stone.hp, money: Math.round(state.eco.money) });
  state.tick++;
}

// ---------------------------------------------------------------- calendar
function updateCalendar(state: GameState, rng: Rng): void {
  const t = state.tick;
  if (t > 0 && t % TICKS_PER_DAY === 0) {
    state.weather.today = state.weather.forecast.shift() ?? rollWeather(rng, state.landscape);
    state.weather.forecast.push(rollWeather(rng, state.landscape));
    state.weather.dewToday = rng.chance(landscapeDef(state.landscape).climate.humidity + 0.2);
    state.eco.soldToday = 0;
    log(state, 'weather', { text: state.weather.today });
  }
  if (t % TICKS_PER_DAY === 6 * TICKS_PER_HOUR && t > 0) {
    // wages and interest at 6 h
    let wages = 0;
    for (const w of state.workers) wages += workerDef(w.kind)?.wage ?? 0;
    if (wages > 0) {
      if (state.eco.money >= wages) { spend(state, wages); }
      else { state.eco.strike = true; state.eco.wagesOwed = wages; log(state, 'strike'); }
    }
    if (state.eco.loan > 0) {
      const rate = hasResearch(state, 'buergschaft') ? content.economy.loan.interestBuergschaft : content.economy.loan.interestPerDay;
      state.eco.loan *= 1 + rate;
    }
  }
  if (state.eco.strike && state.eco.money >= state.eco.wagesOwed) {
    spend(state, state.eco.wagesOwed);
    state.eco.wagesOwed = 0;
    state.eco.strike = false;
    log(state, 'strikeEnd');
  }
}

// ---------------------------------------------------------------- buildings & energy
function updateEnergyAndBuildings(state: GameState, rng: Rng): void {
  const land = landscapeDef(state.landscape);
  const w = weatherNow(state);
  let prod = 0;
  let slots = content.economy.baseWorkerSlots;
  const A = ambient(state);
  for (const b of state.buildings) {
    const bd = buildingDef(b.type)!;
    if (b.ticksToBuild > 0) { b.ticksToBuild--; if (b.ticksToBuild === 0) { b.active = true; log(state, 'built', { id: b.id, text: b.type }); } continue; }
    b.active = b.condition > 0.05;
    if (!b.active) continue;
    if (bd.energy && b.type === 'wasserrad') prod += bd.energy;
    if (bd.energyWind) prod += bd.energyWind * land.climate.wind * w.wind;
    if (bd.energyWorker) prod += bd.energyWorker * b.workers.filter((id) => state.workers.some((x) => x.id === id && !x.strike)).length;
    if (b.type === 'dampfmaschine' || b.type === 'feuerstelle') {
      // consumes wood per minute
      b.timer--;
      if (b.timer <= 0) {
        if (state.eco.wood >= 1) { state.eco.wood -= 1; b.timer = Math.round(600 / (bd.woodPerMinute ?? 1)); }
        else { b.timer = 0; }
      }
      if (b.timer > 0 && b.type === 'dampfmaschine') prod += bd.energy ?? 0;
    }
    if (bd.workers) slots += bd.workers;
    if (bd.sandPerMinute) state.eco.sand += bd.sandPerMinute / 600;
    if (bd.tank && bd.collects) {
      const rate = sourceRate(state, bd.collects);
      if (rate > 0) { b.liters = Math.min(b.cap, b.liters + rate * DT); b.temp = state.sources.find((s) => s.kind === bd.collects)?.temp ?? 12; }
    }
    if (b.cap > 0 && b.liters > 0) {
      // tank water relaxes to ambient
      b.temp += (A - b.temp) * 0.08 * DT_H;
    }
  }
  state.eco.workerSlots = slots;
  state.eco.energyProd = prod;
  // consumers: pumps (pipes with rise) and strahlwerk
  let use = 0;
  for (const r of state.routes) if (r.kind === 'rohr' && r.pumped && r.rise > 0 && r.condition > 0.05) use += content.routes.rohr.capacity * r.condition * r.rise * content.routes.pumpe.energyPerMLs;
  for (const b of state.buildings) if (b.type === 'strahlwerk' && b.active) use += content.methods.strahl.energy;
  use *= perkValue(state, 'energyUse', 1);
  state.eco.energyUse = use;
  state.eco.energyRatio = use <= 0 ? 1 : Math.min(1, prod / use);
  void rng;
}

// ---------------------------------------------------------------- sources & routes
function updateSourcesAndRoutes(state: GameState): void {
  const land = landscapeDef(state.landscape);
  const A = ambient(state);
  const w = weatherNow(state);
  const lossPerk = perkValue(state, 'routeLoss', 1);
  for (const s of state.sources) {
    if (!s.unlocked && s.requires && hasResearch(state, s.requires)) s.unlocked = true;
    s.store = Math.min(s.storeCap, s.store + sourceRate(state, s.id) * DT);
  }
  const decayStorm = w.wind > 2 ? 1 : 0;
  for (const r of state.routes) {
    const def = content.routes[r.kind];
    // decay
    r.condition = Math.max(0, r.condition - def.decayPerDay / TICKS_PER_DAY - (decayStorm ? def.stormDamage / TICKS_PER_DAY : 0));
    r.flow = 0;
    if (!r.ok || r.condition <= 0.05) continue;
    if (def.freezes && A < 0) continue; // frozen channel
    let avail = 0;
    const src = state.sources.find((s) => s.id === r.from);
    const fromB = src ? undefined : state.buildings.find((b) => b.id === r.from);
    let temp = 15;
    if (src) { avail = src.store; temp = src.temp; }
    else if (fromB && fromB.active) { avail = fromB.liters; temp = fromB.temp; }
    else continue;
    let take = Math.min(avail, def.capacity * r.condition * DT);
    if (r.kind === 'rohr' && r.rise > 0) take *= state.eco.energyRatio;
    if (take <= 0) continue;
    if (src) src.store -= take; else fromB!.liters -= take;
    // losses
    let loss = def.lossPer10m * lossPerk * (r.length / 10);
    if (r.kind === 'rinne') loss += 0.02 * Math.max(0, A - 20) / 20;
    const delivered = take * Math.max(0, 1 - loss);
    r.flow = delivered / DT;
    if (delivered <= 0) continue;
    if (r.to.kind === 'zone' || r.to.kind === 'trees') {
      const drip = hasResearch(state, 'tropfstelle') && r.to.kind === 'zone';
      waterOnZone(state, r.to.zone, delivered, temp, false, drip);
    } else {
      const b = state.buildings.find((x) => x.id === (r.to as { id: string }).id);
      if (b && b.cap > 0) {
        const room = Math.max(0, b.cap - b.liters);
        const add = Math.min(room, delivered);
        b.temp = b.liters + add > 0 ? (b.temp * b.liters + temp * add) / (b.liters + add) : temp;
        b.liters += add;
      }
    }
  }
  // tank outlets (drip)
  for (const b of state.buildings) {
    if (!b.active || !b.out || b.liters <= 0) continue;
    const take = Math.min(b.liters, b.out.rate * DT);
    if (take <= 0) continue;
    b.liters -= take;
    waterOnZone(state, b.out.zone, take, b.temp, false, hasResearch(state, 'tropfstelle'));
  }
  // rain on the stone
  if (w.rain > 0) {
    for (let z = 0; z < ZONES; z++) waterOnZone(state, z, w.rain * 0.012, A - 2, false, false, false);
  }
  void land;
}

// ---------------------------------------------------------------- chains
function updateChains(state: GameState): void {
  const c = content.routes.carry;
  const strike = state.eco.strike || eventFlag(state, 'strike');
  for (const ch of state.chains) {
    const src = state.sources.find((s) => s.id === ch.source);
    ch.flow = 0;
    if (!src) continue;
    const workers = strike ? 0 : ch.workers.length * perkValue(state, 'workerSpeed', 1);
    const players = ch.players.filter((pid) => state.players.some((p) => p.id === pid && p.connected)).length;
    const n = workers + players * 1.5;
    if (n < 2) continue;
    const coverage = Math.min(1, (n * c.chainSpacing) / ch.length);
    const cap = n * c.chainPerWorker * coverage * coverage;
    const take = Math.min(src.store, cap * DT);
    if (take <= 0) continue;
    src.store -= take;
    const delivered = take * (1 - c.chainSpill);
    ch.flow = delivered / DT;
    if (ch.target.kind === 'zone') waterOnZone(state, ch.target.zone, delivered, src.temp, false);
    else {
      const b = state.buildings.find((x) => x.id === (ch.target as { id: string }).id);
      if (b && b.cap > 0) { const add = Math.min(b.cap - b.liters, delivered); b.temp = b.liters + add > 0 ? (b.temp * b.liters + src.temp * add) / (b.liters + add) : src.temp; b.liters += add; }
    }
  }
}

// ---------------------------------------------------------------- movement helper
function moveToward(state: GameState, pos: Vec2, target: Vec2, speed: number): boolean {
  const land = landscapeDef(state.landscape);
  const dx = target.x - pos.x, dz = target.z - pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return true;
  const ux = dx / d, uz = dz / d;
  const h0 = heightAt(land, pos.x, pos.z);
  const h1 = heightAt(land, pos.x + ux, pos.z + uz);
  const grade = h1 - h0;
  const sp = speed * Math.min(1.3, Math.max(0.45, 1 - grade * content.economy.slopeFactor * 4));
  const stepLen = Math.min(d, sp * DT);
  let nx = pos.x + ux * stepLen, nz = pos.z + uz * stepLen;
  const r = state.stone.radius + 0.6;
  if (Math.hypot(nx, nz) < r && Math.hypot(target.x, target.z) > r - 0.01) {
    // slide around the stone along the tangent that leads toward the target
    const pr = Math.hypot(pos.x, pos.z) || 1;
    const rx = pos.x / pr, rz = pos.z / pr;
    const t1 = { x: -rz, z: rx }, t2 = { x: rz, z: -rx };
    const dot1 = t1.x * ux + t1.z * uz, dot2 = t2.x * ux + t2.z * uz;
    const t = dot1 >= dot2 ? t1 : t2;
    nx = pos.x + t.x * stepLen; nz = pos.z + t.z * stepLen;
    const nr = Math.hypot(nx, nz) || 1;
    nx *= Math.max(r, nr) / nr; nz *= Math.max(r, nr) / nr;
    pos.x = nx; pos.z = nz;
    return false;
  }
  pos.x = nx; pos.z = nz;
  keepOutOfStone(state, pos);
  return stepLen >= d - 1e-6;
}

function keepOutOfStone(state: GameState, pos: Vec2): void {
  const r = state.stone.radius + 0.6;
  const d = Math.hypot(pos.x, pos.z);
  if (d < r) {
    if (d < 1e-6) { pos.x = r; return; }
    pos.x *= r / d; pos.z *= r / d;
  }
}

// ---------------------------------------------------------------- players
function playerSpeed(state: GameState, p: Player): number {
  let sp = content.economy.walkSpeed * perkValue(state, 'walkSpeed', 1);
  if (p.carry > 0) sp *= content.economy.carryFactor;
  const tool = carryTool(p);
  if (tool.speed) sp *= tool.speed;
  return sp;
}

function updatePlayers(state: GameState, rng: Rng): void {
  for (const p of state.players) {
    if (p.stun > 0) { p.stun--; continue; }
    if (p.chain) continue;
    if (p.action) {
      p.action.ticksLeft--;
      if (p.action.ticksLeft <= 0) { finishAction(state, p, rng); p.action = null; }
      continue;
    }
    if (p.moveDir) {
      const sp = playerSpeed(state, p);
      const tgt = { x: p.pos.x + p.moveDir.x * sp * DT * 2, z: p.pos.z + p.moveDir.z * sp * DT * 2 };
      moveToward(state, p.pos, tgt, sp);
    } else if (p.queue.length > 0) {
      const cmd = p.queue[0] as Command;
      const tgt = commandTarget(state, cmd);
      if (!tgt) { p.queue.shift(); continue; }
      if (dist(p.pos, tgt) <= interactDistance() - 0.3) { p.queue.shift(); p.moveTarget = null; executeNow(state, p, cmd); }
      else { p.moveTarget = tgt; moveToward(state, p.pos, tgt, playerSpeed(state, p)); }
    } else if (p.moveTarget) {
      if (moveToward(state, p.pos, p.moveTarget, playerSpeed(state, p))) p.moveTarget = null;
    }
  }
}

function finishAction(state: GameState, p: Player, rng: Rng): void {
  const a = p.action!;
  const zone = a.zone ?? 0;
  const z = state.stone.zones[zone];
  switch (a.kind) {
    case 'scoop': {
      const s = state.sources.find((x) => x.id === a.target);
      if (!s) return;
      const tool = carryTool(p);
      const cap = tool.carry ?? 2;
      const got = Math.min(cap - p.carry, a.liters ?? cap, s.store);
      if (got <= 0) return;
      s.store -= got;
      p.carryTemp = p.carry + got > 0 ? (p.carryTemp * p.carry + s.temp * got) / (p.carry + got) : s.temp;
      p.carry += got;
      state.stats.waterScooped += got;
      log(state, 'scoop', { player: p.id, value: got });
      return;
    }
    case 'pour': {
      const liters = Math.min(p.carry, a.liters ?? p.carry);
      const spill = carryTool(p).spill ?? 0.1;
      p.carry -= liters;
      waterOnZone(state, zone, liters * (1 - spill), p.carryTemp, true);
      log(state, 'pour', { player: p.id, zone, value: liters });
      return;
    }
    case 'pourTank': {
      const b = state.buildings.find((x) => x.id === a.target);
      if (!b) return;
      const add = Math.min(p.carry, Math.max(0, b.cap - b.liters));
      b.temp = b.liters + add > 0 ? (b.temp * b.liters + p.carryTemp * add) / (b.liters + add) : p.carryTemp;
      b.liters += add;
      p.carry -= add;
      return;
    }
    case 'fillFromTank': {
      const b = state.buildings.find((x) => x.id === a.target);
      if (!b) return;
      const cap = carryTool(p).carry ?? 2;
      const got = Math.min(cap - p.carry, b.liters);
      if (got <= 0) return;
      b.liters -= got;
      p.carryTemp = p.carry + got > 0 ? (p.carryTemp * p.carry + b.temp * got) / (p.carry + got) : b.temp;
      p.carry += got;
      return;
    }
    case 'tap': {
      z.tapped = true;
      log(state, 'tapResult', { player: p.id, zone, value: z.weak });
      return;
    }
    case 'drill': {
      if (a.deep) z.deepHoles++; else z.holes++;
      log(state, 'drilled', { player: p.id, zone, value: a.deep ? 2 : 1 });
      return;
    }
    case 'wedge': {
      if (state.eco.wood < 1 || z.wedges >= z.holes) return;
      state.eco.wood -= 1;
      z.wedges++;
      log(state, 'wedge', { player: p.id, zone });
      return;
    }
    case 'plant': {
      if (z.growths.length >= content.methods.wurzel.maxTrees) return;
      z.growths.push(0.05);
      log(state, 'plant', { player: p.id, zone });
      return;
    }
    case 'charge': {
      const m = content.methods.dampf;
      if (z.charges.length >= z.deepHoles || p.carry < m.minLiters || z.T < m.minT) return;
      const ventil = hasResearch(state, 'sicherheitsventil');
      if (!ventil) { if (state.eco.wood < content.economy.plugCostWood) return; state.eco.wood -= content.economy.plugCostWood; }
      const liters = Math.min(p.carry, a.liters ?? m.maxLiters);
      p.carry -= liters;
      z.charges.push({ liters, ticksLeft: m.cookTicks, T0: z.T });
      z.T -= 4;
      log(state, 'charge', { player: p.id, zone, value: liters });
      return;
    }
    case 'chop': {
      state.eco.wood += 1;
      log(state, 'chop', { player: p.id });
      return;
    }
    case 'sell': {
      sellWater(state, p.carry);
      p.carry = 0;
      log(state, 'sell', { player: p.id });
      return;
    }
    case 'repair': {
      const r = state.routes.find((x) => x.id === a.target);
      if (r) { r.condition = 1; return; }
      const b = state.buildings.find((x) => x.id === a.target);
      if (b) b.condition = 1;
      return;
    }
    case 'release': {
      const b = state.buildings.find((x) => x.id === a.target);
      if (!b) return;
      const liters = Math.min(b.liters, a.liters ?? b.liters);
      b.liters -= liters;
      waterOnZone(state, zone, liters, b.temp, true);
      state.stats.bursts++;
      log(state, 'release', { player: p.id, zone, value: liters });
      return;
    }
  }
  void rng;
}

function sellWater(state: GameState, liters: number): void {
  const s = content.economy.waterSale;
  const markt = state.buildings.some((b) => b.type === 'marktstand' && b.active);
  const quota = (markt ? s.marktLiters : s.dailyLiters) * eventValue(state, 'waterDemand', 1);
  const price = markt ? s.marktPrice : s.price;
  const inQuota = Math.max(0, Math.min(liters, quota - state.eco.soldToday));
  const over = liters - inQuota;
  state.eco.soldToday += liters;
  state.stats.waterSold += liters;
  earn(state, inQuota * price + over * s.overflowPrice, 'sale');
}

// ---------------------------------------------------------------- workers
function updateWorkers(state: GameState, rng: Rng): void {
  const c = content.routes.carry;
  const land = landscapeDef(state.landscape);
  const w = weatherNow(state);
  const strike = state.eco.strike || eventFlag(state, 'strike');
  const speedPerk = perkValue(state, 'workerSpeed', 1);
  const spillPerk = perkValue(state, 'spill', 1);
  for (const wk of state.workers) {
    wk.strike = strike;
    if (strike) { wk.phase = 'strike'; continue; }
    if (wk.stumble > 0) { wk.stumble--; continue; }
    const task = wk.task;
    if (!task) { wk.phase = 'idle'; continue; }
    const speed = (wk.kind === 'esel' ? c.eselSpeed : c.traegerSpeed) * speedPerk;
    switch (task.type) {
      case 'carry': {
        const src = state.sources.find((s) => s.id === task.source);
        if (!src || !src.unlocked) { wk.phase = 'idle'; break; }
        const cap = wk.kind === 'esel' ? c.eselCarry : c.traegerCarry;
        if (wk.phase === 'idle' || wk.phase === 'strike') { wk.phase = 'toSource'; wk.target = src.pos; }
        if (wk.phase === 'toSource') {
          if (moveToward(state, wk.pos, src.pos, speed)) {
            wk.timer = wk.kind === 'esel' ? 120 : 30;
            wk.phase = 'loading';
          }
        } else if (wk.phase === 'loading') {
          wk.timer--;
          if (wk.timer <= 0) {
            if (src.store < cap * 0.5) { wk.timer = 20; break; } // wait for the source to refill
            const got = Math.min(cap, src.store);
            src.store -= got;
            wk.carry = got; wk.carryTemp = src.temp; state.stats.waterScooped += got;
            wk.phase = 'toTarget';
            const tgt = carryTargetPos(state, task.target);
            wk.target = tgt;
            const stumbleP = c.stumble * (w.wind > 2 ? 3 : 1);
            wk.timer = rng.chance(stumbleP) ? Math.round(rng.range(0.2, 0.9) * (dist(wk.pos, tgt) / speed) * 10) : -1;
          }
        } else if (wk.phase === 'toTarget') {
          const tgt = carryTargetPos(state, task.target);
          if (wk.timer > 0) { wk.timer--; if (wk.timer === 0) { wk.carry = 0; wk.stumble = c.stumbleTicks; state.stats.stumbles++; log(state, 'stumble', { id: wk.id }); wk.phase = 'toSource'; break; } }
          if (moveToward(state, wk.pos, tgt, speed)) {
            const spill = (w.wind > 2 ? c.stormSpill : c.spill) * spillPerk;
            const liters = wk.carry * (1 - spill);
            wk.carry = 0;
            if (task.target.kind === 'zone') waterOnZone(state, task.target.zone, liters, wk.carryTemp, true);
            else if (task.target.kind === 'village') sellWater(state, liters);
            else {
              const b = state.buildings.find((x) => x.id === (task.target as { id: string }).id);
              if (b && b.cap > 0) { const add = Math.min(b.cap - b.liters, liters); b.temp = b.liters + add > 0 ? (b.temp * b.liters + wk.carryTemp * add) / (b.liters + add) : wk.carryTemp; b.liters += add; }
            }
            wk.phase = 'toSource';
          }
        }
        break;
      }
      case 'chain': wk.phase = 'chain'; break;
      case 'tread': {
        const b = state.buildings.find((x) => x.id === task.building);
        if (!b) { wk.task = null; break; }
        if (moveToward(state, wk.pos, b.pos, speed)) { wk.phase = 'tread'; if (!b.workers.includes(wk.id)) b.workers.push(wk.id); }
        else wk.phase = 'walk';
        break;
      }
      case 'drill': {
        const z = state.stone.zones[task.zone];
        const tgt = zonePos(state, task.zone);
        const deep = task.deep && hasResearch(state, 'tiefbohrer');
        if ((!deep && z.holes >= content.methods.keile.maxWedges) || (deep && z.deepHoles >= 3)) { wk.phase = 'idle'; break; }
        if (wk.phase !== 'drill') { if (moveToward(state, wk.pos, tgt, speed)) { wk.phase = 'drill'; wk.timer = Math.round((deep ? 360 : 120) * rockDef(state.stone.rock).hardness); } else wk.phase = 'walk'; break; }
        wk.timer--;
        if (wk.timer <= 0) { if (deep) z.deepHoles++; else z.holes++; wk.phase = 'idle'; log(state, 'drilled', { id: wk.id, zone: task.zone, value: deep ? 2 : 1 }); }
        break;
      }
      case 'wedges': {
        const z = state.stone.zones[task.zone];
        const tgt = zonePos(state, task.zone);
        if (!hasResearch(state, 'quellkeile') || z.wedges >= z.holes || state.eco.wood < 1) { wk.phase = 'idle'; break; }
        if (wk.phase !== 'wedge') { if (moveToward(state, wk.pos, tgt, speed)) { wk.phase = 'wedge'; wk.timer = 30; } else wk.phase = 'walk'; break; }
        wk.timer--;
        if (wk.timer <= 0) { state.eco.wood -= 1; z.wedges++; wk.phase = 'idle'; log(state, 'wedge', { id: wk.id, zone: task.zone }); }
        break;
      }
      case 'chop': {
        const tgt = { x: land.forest[0], z: land.forest[1] };
        if (wk.phase !== 'chop') { if (moveToward(state, wk.pos, tgt, speed)) { wk.phase = 'chop'; wk.timer = 90; } else wk.phase = 'walk'; break; }
        wk.timer--;
        if (wk.timer <= 0) { state.eco.wood += 1; wk.timer = 90; }
        break;
      }
      case 'maintain': {
        // find worst route/building
        let worst: Route | Building | null = null; let wc = 0.85;
        for (const r of state.routes) if (r.condition < wc) { wc = r.condition; worst = r; }
        for (const b of state.buildings) if (b.active && b.condition < wc) { wc = b.condition; worst = b; }
        if (!worst) { wk.phase = 'idle'; break; }
        const tgt = 'points' in worst ? worst.points[Math.floor(worst.points.length / 2)] : worst.pos;
        if (wk.phase !== 'repair') { if (moveToward(state, wk.pos, tgt, speed)) { wk.phase = 'repair'; wk.timer = content.routes.repairTicks; } else wk.phase = 'walk'; break; }
        wk.timer--;
        if (wk.timer <= 0) { worst.condition = 1; wk.phase = 'idle'; }
        break;
      }
    }
  }
}

function carryTargetPos(state: GameState, target: { kind: 'zone'; zone: number } | { kind: 'building'; id: string } | { kind: 'village' }): Vec2 {
  if (target.kind === 'zone') return zonePos(state, target.zone);
  if (target.kind === 'village') { const v = landscapeDef(state.landscape).village; return { x: v[0], z: v[1] }; }
  const b = state.buildings.find((x) => x.id === target.id);
  return b ? b.pos : { x: 0, z: -(state.stone.radius + 3) };
}

// ---------------------------------------------------------------- stone
function updateStone(state: GameState, rng: Rng): void {
  const st = state.stone;
  const rock = rockDef(st.rock);
  const m = content.methods;
  const A = ambient(state);
  const night = isNight(state.tick);
  const cooling = moodValue(state, 'cooling', 1);
  const wetDecayMood = moodValue(state, 'wetDecay', 1);
  const tmult = timeMultiplier(state);
  const land = landscapeDef(state.landscape);
  const sunB = sunBase(state);
  const sunW = sunRaw(state.tick) * weatherNow(state).sun;
  const frostMood = moodValue(state, 'frost', 1);
  const dripCap = hasResearch(state, 'feinjustierung') ? m.tropfen.capFine : m.tropfen.cap;
  const dripZones = hasResearch(state, 'doppeltropf') ? 2 : 1;
  // buildings per zone
  const shade = new Array<number>(ZONES).fill(0);
  const heat = new Array<number>(ZONES).fill(0);
  const cool = new Array<number>(ZONES).fill(0);
  for (const b of state.buildings) {
    if (!b.active || b.zone === null) continue;
    const bd = buildingDef(b.type)!;
    if (bd.shade) shade[b.zone] = Math.max(shade[b.zone], bd.shade);
    if (bd.heatPerHour && bd.needsSun && sunW > 0.3) heat[b.zone] += bd.heatPerHour * sunW;
    if (bd.heatPerHour && !bd.needsSun && b.timer > 0) heat[b.zone] += bd.heatPerHour;
    if (bd.coolPerHour && night) { cool[b.zone] += bd.coolPerHour; cool[(b.zone + 1) % ZONES] += bd.coolPerHour * 0.5; cool[(b.zone + 7) % ZONES] += bd.coolPerHour * 0.5; }
  }
  // drip ranking
  const dripRank: number[] = [];
  for (let i = 0; i < ZONES; i++) if (st.zones[i].drip > 0) dripRank.push(i);
  dripRank.sort((a, b) => st.zones[b].drip - st.zones[a].drip || a - b);
  const dripAllowed = new Set(dripRank.slice(0, dripZones));

  let total = 0;
  const add = (method: MethodId, zone: number, v: number) => {
    if (v <= 0) return;
    const z = st.zones[zone];
    const onLine = zone % 4 === st.line;
    const dmg = v * (onLine ? 1 : 0.5) * z.weak * tmult;
    st.dmg[method] += dmg;
    st.progress += dmg;
    z.lastDmg += dmg;
    total += dmg;
  };

  for (let i = 0; i < ZONES; i++) {
    const z = st.zones[i];
    z.lastDmg = 0;
    const treeShade = Math.min(0.6, z.growths.reduce((a, g) => a + g, 0) * m.wurzel.shadePerGrowth);
    const sun = sunB * sunFacing(state.tick, i) * (1 - shade[i]) * (1 - treeShade);
    // temperature
    const towardAmbient = (A - z.T) * rock.conductivity * DT_H * (z.T > A ? cooling : 1);
    z.T += towardAmbient + sun * 40 * DT_H + heat[i] * DT_H - cool[i] * DT_H;
    // wetness decay
    const wetDecay = (0.15 + 0.01 * Math.max(0, z.T - 20)) * wetDecayMood * DT_H;
    z.wet = Math.max(0, z.wet - wetDecay);
    z.wedgeWet = Math.max(0, z.wedgeWet - (0.06 + 0.004 * Math.max(0, z.T - 20)) * m.keile.wetDecay * DT_H);
    if (z.fill > 0 && !z.frozen) z.fill = Math.max(0, z.fill - z.fill * 0.02 * DT_H * Math.max(0, z.T - 20) / 20);
    // frost
    if (z.T < m.frost.freezeBelow && z.fill > 0 && !z.frozen) {
      add('frost', i, m.frost.k * rock.sus.frost * z.fill * frostMood);
      z.fill *= m.frost.keep;
      z.frozen = true;
      state.stats.freezes++;
      log(state, 'freeze', { zone: i, value: z.fill });
    } else if (z.frozen && z.T > 2) z.frozen = false;
    // thermal shock bursts
    if (z.burstTicks > 0) {
      z.burstTicks--;
      if (z.burstTicks === 0) {
        if (z.burst >= m.thermoschock.burstMin) {
          const dT = z.burstT0 - z.burstTemp - m.thermoschock.deltaMin;
          if (dT > 0) {
            const ts = m.thermoschock;
            // superlinear up to the knee (synchronised gushes pay off), sublinear beyond (a tank is not a miracle)
            const effL = z.burst <= ts.knee ? ts.knee * Math.pow(z.burst / ts.knee, ts.expBelow) : ts.knee + Math.pow(z.burst - ts.knee, ts.expAbove);
            const v = ts.k * rock.sus.thermoschock * effL * Math.pow(dT, ts.exp);
            add('thermoschock', i, v);
            log(state, 'thermoschock', { zone: i, value: v });
            if (z.burst >= m.thermoschock.spectacleAt) state.eco.spectacle += m.thermoschock.spectacle;
          }
        }
        z.burst = 0; z.burstTemp = 0; z.burstT0 = 0;
      }
    }
    // drip
    if (z.drip >= m.tropfen.minRate && dripAllowed.has(i)) {
      z.streak++;
      const mult = 1 + m.tropfen.streakMult * Math.min(1, z.streak / (m.tropfen.streakFull * 10));
      const rate = Math.min(z.drip, dripCap);
      const salt = land.salt && (st.rock === 'kalkstein' || st.rock === 'sandstein') ? 1.2 : 1;
      add('tropfen', i, m.tropfen.k * rock.sus.tropfen * rate * mult * (m.tropfen.wetBase + z.wet) * salt * DT);
    } else z.streak = 0;
    z.drip = 0;
    // wedges
    if (z.wedges > 0 && z.wedgeWet > 0) {
      add('keile', i, m.keile.k * rock.sus.keile * z.wedges * z.wedgeWet * (i % 4 === st.line ? m.keile.lineBonus : 1) * DT / z.weak * z.weak);
    }
    // steam
    for (let ci = z.charges.length - 1; ci >= 0; ci--) {
      const ch = z.charges[ci];
      ch.ticksLeft--;
      if (ch.ticksLeft > 0) continue;
      const T = Math.max(z.T, ch.T0 - 10);
      const base = m.dampf.k * rock.sus.dampf * ch.liters * Math.max(5, T - m.dampf.riskT0);
      const ventil = hasResearch(state, 'sicherheitsventil') ? 0.6 : 0;
      const leak = (m.dampf.leakRisk as Record<string, number>)[st.rock] ?? 0;
      const risk = Math.min(0.9, (m.dampf.riskBase * Math.max(0, T - m.dampf.riskT0) / m.dampf.riskSpan + leak) * (1 - ventil));
      if (rng.chance(risk)) {
        add('dampf', i, base * m.dampf.failFactor);
        state.stats.steamFail++;
        state.eco.spectacle += m.dampf.failSpectacle;
        for (const p of state.players) if (dist(p.pos, zonePos(state, i)) < 6) { p.stun = m.dampf.stunTicks; p.action = null; }
        log(state, 'steamFail', { zone: i, value: base * m.dampf.failFactor });
      } else {
        add('dampf', i, base);
        state.stats.steamOk++;
        state.eco.spectacle += m.dampf.spectacle;
        log(state, 'steamOk', { zone: i, value: base });
      }
      z.charges.splice(ci, 1);
      z.T -= 6;
    }
    // roots
    if (z.growths.length > 0) {
      const salt = land.salt ? m.wurzel.saltFactor : 1;
      const heatKill = z.T > 65 ? -0.05 : 0;
      let sum2 = 0;
      for (let k = 0; k < z.growths.length; k++) {
        let g = z.growths[k];
        const rate = m.wurzel.growPerHour * (0.3 + z.wet) * (1 + g) * salt * (hasResearch(state, 'wurzelwerk') ? 1.5 : 1) + heatKill;
        g = Math.min(1, Math.max(0.02, g + rate * DT_H));
        z.growths[k] = g;
        sum2 += g * g;
      }
      add('wurzel', i, m.wurzel.k * rock.sus.wurzel * sum2 * DT);
      const mature = z.growths.filter((g) => g >= m.wurzel.woodAt).length;
      if (mature > 0) { z.woodTimer += mature; if (z.woodTimer >= m.wurzel.woodEveryTicks) { z.woodTimer -= m.wurzel.woodEveryTicks; state.eco.wood += 1; } }
    }
  }
  // waterjet
  for (const b of state.buildings) {
    if (b.type !== 'strahlwerk' || !b.active || b.zone === null) continue;
    const s = m.strahl;
    const power = state.eco.energyRatio * Math.min(1, b.liters / (s.water * DT)) * Math.min(1, state.eco.sand / (s.sand * DT));
    if (power <= 0.01) continue;
    b.liters = Math.max(0, b.liters - s.water * DT * power);
    state.eco.sand = Math.max(0, state.eco.sand - s.sand * DT * power);
    waterOnZone(state, b.zone, s.water * DT * power * 0.5, b.temp, false);
    add('strahl', b.zone, s.k * rock.sus.strahl * power * DT);
  }
  // expression for the client
  const hot = st.zones.reduce((a, z) => a + z.T, 0) / ZONES;
  st.expression = st.zones.some((z) => z.charges.length > 0) ? 'luftanhalten' : total > 3 ? 'grimasse' : hot > 70 ? 'schwitzen' : hot < 3 ? 'zittern' : st.zones.some((z) => z.streak > 300) ? 'genervt' : 'neutral';
}

// ---------------------------------------------------------------- economy
function updateEconomy(state: GameState, rng: Rng): void {
  const eco = content.economy;
  const land = landscapeDef(state.landscape);
  const councilMult = land.councilFactor * perkValue(state, 'council', 1);
  const pct = Math.floor((state.stone.progress / state.stone.hp) * 100);
  if (pct > state.eco.paidPercent) {
    const n = pct - state.eco.paidPercent;
    earn(state, n * eco.payPerPercent * councilMult, 'premium');
    state.eco.paidPercent = pct;
    if (n > 0 && pct % 10 === 0) { state.eco.spectacle += 10; log(state, 'progress', { value: pct }); }
  }
  const ratio = state.stone.progress / state.stone.hp;
  while (state.eco.paidMilestones < eco.milestones.length && ratio >= eco.milestones[state.eco.paidMilestones][0]) {
    earn(state, eco.milestones[state.eco.paidMilestones][1] * councilMult, 'premium');
    log(state, 'milestone', { value: eco.milestones[state.eco.paidMilestones][0] });
    state.eco.paidMilestones++;
  }
  // spectators
  const tribuene = state.buildings.some((b) => b.type === 'tribuene' && b.active) ? (buildingDef('tribuene')?.spectacle ?? 1) : 1;
  const spMult = tribuene * eventValue(state, 'spectacle', 1) * moodValue(state, 'spectacle', 1) * perkValue(state, 'spectacle', 1);
  if (state.eco.spectacle > 0) {
    earn(state, (eco.spectacle.incomePerMinute / 600) * state.eco.spectacle * spMult, 'spectators');
    state.eco.spectacle *= Math.pow(1 - eco.spectacle.decayPerMinute, 1 / 600);
    if (state.eco.spectacle < 0.05) state.eco.spectacle = 0;
  }
  void rng;
}

// ---------------------------------------------------------------- research
function updateResearch(state: GameState, rng: Rng): void {
  const r = state.research;
  if (r.current) {
    r.current.ticksLeft--;
    if (r.current.ticksLeft <= 0) {
      r.done.push(r.current.id);
      log(state, 'researchDone', { id: r.current.id });
      r.current = null;
    }
  }
  const ms = content.research.milestones;
  const ratio = state.stone.progress / state.stone.hp;
  if (r.milestonesDone < ms.length && ratio >= ms[r.milestonesDone] && !r.offered) {
    const pool = content.perks.map((p) => p.id).filter((id) => !r.perks.includes(id));
    rng.shuffle(pool);
    r.offered = pool.slice(0, 3);
    r.milestonesDone++;
    log(state, 'perkOffer', { value: ms[r.milestonesDone - 1] });
  }
}

// ---------------------------------------------------------------- events
function updateEvents(state: GameState, rng: Rng): void {
  const ev = state.events;
  for (let i = ev.active.length - 1; i >= 0; i--) {
    const a = ev.active[i];
    a.ticksLeft--;
    if (a.ticksLeft <= 0) {
      if (a.id === 'inspektion') {
        const gain = (state.stone.progress - a.progressAtStart) / state.stone.hp;
        if (gain >= 0.03) { earn(state, 80, 'premium'); log(state, 'inspectionGood'); }
        else { state.eco.money = Math.max(0, state.eco.money - 30); log(state, 'inspectionBad'); }
      }
      ev.active.splice(i, 1);
    }
  }
  if (state.tick >= ev.nextAt) {
    const day = Math.floor(state.tick / TICKS_PER_DAY);
    const candidates = content.events.filter((e) => (e.minDay ?? 0) <= day && !ev.active.some((a) => a.id === e.id));
    if (candidates.length > 0) {
      const weights: Record<string, number> = {};
      for (const c of candidates) weights[c.id] = c.weight;
      const id = rng.weighted(weights);
      const def = candidates.find((c) => c.id === id)!;
      if (def.effect.moodSwap) {
        const others = content.moods.map((m) => m.id).filter((m) => !state.stone.moods.includes(m));
        if (others.length > 0 && state.stone.moods.length > 0) { state.stone.moods[0] = rng.pick(others); }
      }
      if (typeof def.effect.spectacleAdd === 'number') state.eco.spectacle += def.effect.spectacleAdd;
      ev.active.push({ id, ticksLeft: def.durationTicks, progressAtStart: state.stone.progress });
      log(state, 'event', { id });
    }
    ev.nextAt = state.tick + 1800 + rng.int(3600);
  }
}

export { hourOf, toolDef, perkDef };
