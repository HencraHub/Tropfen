import type { MethodId } from '../sim/index';
import { landscapeDef, content, dist } from '../sim/index';
import { BotCtx, type WaterTarget } from './toolkit';

export interface Strategy {
  id: string;
  main: MethodId | 'none';
  /** strategic decisions in priority order (research, purchases, buildings); called once per second */
  step(c: BotCtx): void;
  /** what the player's body does when idle */
  body(c: BotCtx): void;
}

function keepReserve(c: BotCtx, extra = 0): void {
  c.reserve = c.wages() + extra;
}

function idleCarriersTo(c: BotCtx, target: WaterTarget): void {
  for (const w of c.idleWorkers()) {
    if (w.kind === 'traeger' || w.kind === 'esel') { const src = c.bestSource('near'); if (src) c.assign(w.id, { type: 'carry', source: src, target }); }
  }
}

/** Common opening for every strategy: loan, first village trip, tapping, line. Returns true while in progress. */
function opening(c: BotCtx, loan: number, perks: string[], linePref: 'sun' | 'none' = 'none'): boolean {
  c.mem.perkPrefer = perks;
  c.mem.linePref = linePref;
  c.perk();
  if (loan > 0 && c.state.tick < 20 && c.state.eco.loan === 0) c.loan(loan);
  return c.opening();
}

/** Line zone that faces the noon sun best (closest to zone 4 = south). */
export function sunnyLineZone(c: BotCtx): number {
  const [a, b] = c.lineZones();
  const d = (z: number) => Math.min(Math.abs(z - 4), 8 - Math.abs(z - 4));
  return d(a) <= d(b) ? a : b;
}

/** Line zone on the shady side (closest to zone 0 = north): less evaporation for water methods. */
export function shadyLineZone(c: BotCtx): number {
  const [a, b] = c.lineZones();
  const d = (z: number) => Math.min(z, 8 - z);
  return d(a) <= d(b) ? a : b;
}

export function tankPos(c: BotCtx, zone: number) {
  const a = (zone / 8) * Math.PI * 2;
  const r = c.state.stone.radius + 5;
  return { x: Math.sin(a) * r, z: Math.cos(a) * r };
}

/** Spread carriers over a list of targets (round robin). */
function spreadCarriers(c: BotCtx, targets: WaterTarget[]): void {
  const carriers = c.state.workers.filter((w) => (w.kind === 'traeger' || w.kind === 'esel') && w.task && w.task.type === 'carry');
  const src = c.bestSource('near');
  if (!src || targets.length === 0) return;
  carriers.forEach((w, i) => {
    const tgt = targets[i % targets.length];
    const t = (w.task as { target: WaterTarget }).target;
    const same = t.kind === tgt.kind && (t.kind === 'village' || (t.kind === 'zone' && t.zone === (tgt as { zone: number }).zone) || (t.kind === 'building' && t.id === (tgt as { id: string }).id));
    if (!same) c.assign(w.id, { type: 'carry', source: src, target: tgt });
  });
}

/** Hot landscapes (steppe): sun sails over the working zones keep wedges and cracks wet and roots alive. */
function shadeLine(c: BotCtx, zones: number[]): void {
  const land = landscapeDef(c.state.landscape);
  if (land.climate.day * land.climate.sun < 30) return;
  c.researchPlan(['sonnensegel']);
  if (c.has('sonnensegel')) for (const z of zones) c.build('sonnensegel', z);
}

/** Zones ranked for wedges: weak spots count fully, off-line zones half (Abklopfen: Keile nur in Schwachstellen). */
export function wedgeOrder(c: BotCtx, n: number): number[] {
  const line = c.state.stone.line;
  const score = (z: number) => c.zone(z).weak * (z % 4 === line ? 1 : 0.5);
  return [0, 1, 2, 3, 4, 5, 6, 7].sort((a, b) => score(b) - score(a) || a - b).slice(0, n);
}

/** The route into the stone that every strategy wants first; blocks lower priorities while saving for it. */
function coreRoute(c: BotCtx, target: WaterTarget & { kind: 'zone' | 'building' }): boolean {
  c.ensureEnergy();
  if (c.state.routes.length >= 1 && c.workersDoing('maintain') < 1 && c.has('rinnenbau') && c.state.workers.length < c.state.eco.workerSlots) c.hire('wart', { type: 'maintain' });
  if (c.hasRoute(target)) return true;
  c.researchPlan(c.routeUnlockPlan());
  if (c.state.research.current) return false;
  c.buildRoute(target);
  return false;
}

// ---------------------------------------------------------------- 1 Hitzkopf – Thermoschock
export const hitzkopf: Strategy = {
  id: 'hitzkopf', main: 'thermoschock',
  step(c) {
    keepReserve(c, 10);
    if (opening(c, 250, ['sonnenbrand', 'quellrecht', 'ratsgunst', 'dichte_rinnen'], 'sun')) return;
    const [la, lb] = c.lineZones();
    const sz = sunnyLineZone(c);
    c.mem.keepTargets = true;
    c.ensureCarriers(3, { kind: 'zone', zone: sz });
    const ht = c.building('hochtank');
    const scarce = Math.max(...c.state.sources.filter((x) => x.kind !== 'regen' && x.kind !== 'tau').map((x) => x.flow)) < 2.5;
    // 1. income route (unless water is scarce), 2. tank + route into it, 3. heat, 4. second tank
    if (!ht && !scarce) coreRoute(c, { kind: 'zone', zone: sz });
    c.researchPlan(['hochtank']);
    if (!ht && c.has('hochtank')) c.build('hochtank', undefined, tankPos(c, sz));
    if (ht && !c.hasRoute({ kind: 'building', id: ht.id })) {
      if (!c.planRoute({ kind: 'building', id: ht.id })) { const r = c.state.routes.find((x) => x.to.kind === 'zone'); if (r && scarce) c.out.push({ t: 'demolish', p: c.pid, id: r.id }); }
      coreRoute(c, { kind: 'building', id: ht.id });
    }
    c.researchPlan(['brennspiegel', 'feuerstelle', 'schreibstube']);
    if (c.has('brennspiegel')) { c.build('brennspiegel', sz); if (ht) c.build('brennspiegel', (sz + 4) % 8); }
    if (c.has('feuerstelle') && ht) { c.build('feuerstelle', sz); if (c.wood < 4) c.buyWood(6); }
    if (ht && ht.active && c.has('hochtank') && c.state.buildings.filter((b) => b.type === 'hochtank').length < 2 && c.money > 700 && c.planRoute({ kind: 'zone', zone: (sz + 4) % 8 })) c.build('hochtank', undefined, tankPos(c, (sz + 4) % 8));
    for (const t2 of c.state.buildings.filter((b) => b.type === 'hochtank' && b.id !== ht?.id)) if (!c.hasRoute({ kind: 'building', id: t2.id })) c.buildRoute({ kind: 'building', id: t2.id });
    c.carryTools(c.has('eimerbau') ? 'karren' : undefined);
    // carriers fill the tank when no route feeds it, otherwise water the line for income
    if (ht && ht.active && (!c.hasRoute({ kind: 'building', id: ht.id }) || scarce)) spreadCarriers(c, [{ kind: 'building', id: ht.id }, { kind: 'zone', zone: la }, { kind: 'building', id: ht.id }]);
    else spreadCarriers(c, [{ kind: 'zone', zone: la }, { kind: 'zone', zone: lb }]);
    idleCarriersTo(c, { kind: 'zone', zone: sz });
    // release: stay near the tank in the hot hours and open the valve at the peak
    c.mem.waitTank = null;
    for (const tank of c.state.buildings.filter((b) => b.type === 'hochtank' && b.active && b.liters >= 250)) {
      const rz = c.hottest([la, lb]);
      const dT = c.zone(rz).T - tank.temp;
      const evening = c.hour >= 15.5 && c.hour < 19.5;
      const full = tank.liters >= tank.cap * 0.9;
      const hotHours = c.hour >= 10.5 && c.hour < 19.5;
      if (hotHours && dT > 25) c.mem.waitTank = tank.id;
      if ((dT > 80 && tank.liters >= 400) || (evening && dT > 40) || (full && dT > 45) || (dT > 65 && tank.liters >= 400 && c.hour >= 12) || (c.hour >= 18.5 && dT > 35 && tank.liters >= 600)) {
        if (!c.mem.releasing) { c.out.push({ t: 'stop', p: c.pid }); c.release(tank.id, rz, tank.liters); c.mem.releasing = true; }
      }
    }
    if (c.mem.releasing && c.idle()) c.mem.releasing = false;
  },
  body(c) {
    if (!c.idle()) return;
    if (c.repairWorst(0.45)) return;
    const [la, lb] = c.lineZones();
    const hz = c.hottest([la, lb]);
    const ht = c.building('hochtank');
    if (c.hasTool('karren') && c.p.carry > 30 && c.zone(hz).T - c.p.carryTemp > 55) { c.deliver({ kind: 'zone', zone: hz }); return; }
    if (c.mem.waitTank) {
      // wait next to the tank so the valve can be opened at the peak; use the time to pour what we carry
      const tank = c.state.buildings.find((b) => b.id === c.mem.waitTank)!;
      if (c.p.carry > 0) { c.deliver({ kind: 'building', id: tank.id }); return; }
      if (Math.hypot(c.p.pos.x - tank.pos.x, c.p.pos.z - tank.pos.z) > 3) c.goto(tank.pos.x, tank.pos.z);
      return;
    }
    if (ht && ht.active && ht.liters < ht.cap * 0.9 && c.p.carry > 0) { c.carryLoop({ kind: 'building', id: ht.id }, 'cold'); return; }
    if (ht && ht.active && ht.liters < ht.cap * 0.5) { c.carryLoop({ kind: 'building', id: ht.id }, 'cold'); return; }
    c.carryLoop({ kind: 'zone', zone: hz }, 'cold');
  },
};

// ---------------------------------------------------------------- 2 Frostwart – Frost
export const frostwart: Strategy = {
  id: 'frostwart', main: 'frost',
  step(c) {
    keepReserve(c, 5);
    if (opening(c, (c.mem.loan as number | undefined) ?? 250, ['frostnacht', 'dichte_rinnen', 'quellrecht', 'zaeher_traeger'])) return;
    const land = landscapeDef(c.state.landscape);
    const [la, lb] = c.lineZones();
    c.ensureEnergy(); // pumped pipes stand still without a treadmill or wheel
    const coldNights = land.climate.night <= -2;
    // water in the cracks drains while the stone is above 15 °C and is spent once the zone froze:
    // with a cistern the line is flooded only in the cool window before the freeze, without one from the afternoon on
    const cool = (z: number) => c.zone(z).T < 15 && !c.zone(z).frozen;
    const fillTime = c.building('zisterne') ? (c.hour >= 12 || c.hour < 5) && cool(la) : c.hour >= 13.5 || c.hour < 5;
    c.mem.keepTargets = true;
    c.carryTools(c.has('eimerbau') ? 'tragjoch' : undefined);
    c.ensureCarriers(3, { kind: 'zone', zone: la });
    // timing: by day the carriers earn money in the village, from the afternoon on they fill the cracks
    const ziDay = c.building('zisterne');
    const dayTargets: WaterTarget[] = ziDay && ziDay.active && ziDay.liters < ziDay.cap * 0.95 ? [{ kind: 'building', id: ziDay.id }]
      : c.hasRoute({ kind: 'zone', zone: la }) || ziDay ? [{ kind: 'village' }] : [{ kind: 'zone', zone: la }, { kind: 'zone', zone: lb }];
    const frostZones: WaterTarget[] = [la, lb, (la + 1) % 8, (lb + 1) % 8, (la + 7) % 8, (lb + 7) % 8].map((z) => ({ kind: 'zone', zone: z }) as WaterTarget);
    spreadCarriers(c, fillTime ? frostZones : dayTargets);
    // water buffer: channel into a cistern by day, flood the line at dusk
    const zi = c.building('zisterne');
    if (!zi) { coreRoute(c, { kind: 'zone', zone: la }); c.researchPlan(['rinnenbau']); if (c.has('rinnenbau')) c.build('zisterne', undefined, tankPos(c, la)); }
    else {
      if (!c.hasRoute({ kind: 'building', id: zi.id })) coreRoute(c, { kind: 'building', id: zi.id });
      else if (c.money > 600 && c.state.sources.some((q) => q.unlocked && q.storeCap >= 100000) && c.routes({ kind: 'building', id: zi.id }).every((r) => (c.state.sources.find((q) => q.id === r.from)?.storeCap ?? 0) < 100000)) {
        // frost eats water: once rich, a pumped pipe from the big source (sea, river) fills the cistern instead of the little well
        if (!c.buildRoute({ kind: 'building', id: zi.id }) && !c.planRoute({ kind: 'building', id: zi.id })) c.researchPlan(['rohrguss', 'pumpwerk']);
      }
      const capNow = content.methods.frost.capBase + content.methods.frost.capPerProgress * c.progress;
      const outZone = c.zone(la).fill >= capNow - 5 || c.zone(la).fill > c.zone(lb).fill + 40 ? lb : la;
      const rate = fillTime && zi.active && cool(outZone) ? 8 : 0;
      if (!zi.out || zi.out.zone !== outZone || Math.abs(zi.out.rate - rate) > 0.01) c.setOut(zi.id, outZone, rate);
      if (c.money > 500 && c.state.buildings.filter((b) => b.type === 'zisterne').length < 2) c.build('zisterne', undefined, tankPos(c, lb));
      for (const z2 of c.state.buildings.filter((b) => b.type === 'zisterne' && b.id !== zi.id)) { if (!c.hasRoute({ kind: 'building', id: z2.id })) c.buildRoute({ kind: 'building', id: z2.id }); const r2 = fillTime && z2.active && cool(lb) ? 8 : 0; if (!z2.out || z2.out.zone !== lb || Math.abs(z2.out.rate - r2) > 0.01) c.setOut(z2.id, lb, r2); }
    }
    c.researchPlan(['sonnensegel']);
    if (c.has('sonnensegel')) { c.build('sonnensegel', la); c.build('sonnensegel', lb); }
    if (!coldNights) { c.researchPlan(['nachtwache', 'eiskeller']); if (c.has('eiskeller')) { c.build('eiskeller', la); c.build('eiskeller', lb); } }
    if (c.progress > 0.2 && c.has('sonnensegel')) for (const z of [la + 1, la + 7, lb + 1, lb + 7]) c.build('sonnensegel', z % 8);
    c.researchPlan(['schreibstube', 'nachtwache']);
    idleCarriersTo(c, { kind: 'zone', zone: la });
  },
  body(c) {
    if (!c.idle()) return;
    if (c.repairWorst(0.45)) return;
    const [la, lb] = c.lineZones();
    const p = c.progress;
    const cap = content.methods.frost.capBase + content.methods.frost.capPerProgress * p;
    const zi0 = c.building('zisterne');
    const fillTime = zi0 ? (c.hour >= 12 || c.hour < 5) && c.zone(la).T < 15 && !c.zone(la).frozen : c.hour >= 13.5 || c.hour < 5;
    if (!fillTime) { const zi = c.building('zisterne'); if (zi && zi.active && zi.liters < zi.cap * 0.95) c.carryLoop({ kind: 'building', id: zi.id }, 'near'); else c.carryLoop({ kind: 'village' }, 'near'); return; }
    const candidates = [la, lb, (la + 1) % 8, (la + 7) % 8, (lb + 1) % 8, (lb + 7) % 8];
    let best = la, bf = Infinity;
    for (const z of candidates) { const f = c.zone(z).fill / cap + (z % 4 === c.state.stone.line ? 0 : 0.5); if (f < bf) { bf = f; best = z; } }
    if (zi0 && c.hubLoop(zi0, best)) return; // the cistern at the stone is the nearest water in the cool window
    c.carryLoop({ kind: 'zone', zone: best }, 'near');
  },
};

// ---------------------------------------------------------------- 3 Tropfmeister – Steter Tropfen
export const tropfmeister: Strategy = {
  id: 'tropfmeister', main: 'tropfen',
  step(c) {
    keepReserve(c, 5);
    if (opening(c, c.mem.noLoan ? 0 : ((c.mem.loan as number | undefined) ?? 200), ['dichte_rinnen', 'quellrecht', 'ratsgunst', 'zaeher_traeger'])) return;
    const l0 = shadyLineZone(c), l1 = (l0 + 4) % 8;
    const la = c.mem.dripZone === 1 ? l1 : l0, lb = c.mem.dripZone === 1 ? l0 : l1;
    const r1: WaterTarget & { kind: 'zone' } = { kind: 'zone', zone: la };
    const r2: WaterTarget & { kind: 'zone' } = { kind: 'zone', zone: lb };
    const scarce = c.scarceWater();
    c.carryTools(scarce && c.has('eimerbau') ? 'karren' : undefined); // shuttling between barrels wants a cart
    if (!c.mem.noCarriers) c.ensureCarriers(c.hasRoute(r1) ? 1 : Math.min(3, (c.mem.maxCarriers as number | undefined) ?? 3), r1);
    const cap = c.has('feinjustierung') ? content.methods.tropfen.capFine : content.methods.tropfen.cap;
    if (scarce) {
      // scarce source: the channel fills a barrel at the drip zone that drips at the cap; the surplus is shuttled by hand
      const hub = c.waterHub(la, 'fass');
      if (!hub) return;
      if (hub.active && (!hub.out || hub.out.zone !== la || Math.abs(hub.out.rate - cap) > 0.01)) c.setOut(hub.id, la, cap);
      if (!coreRoute(c, { kind: 'building', id: hub.id }) && !c.mem.noSecondRoute) return; // a team mate without a route slot still drips from a chain-fed barrel
    } else if (!coreRoute(c, r1)) return;
    c.researchPlan(['tropfstelle']);
    shadeLine(c, [la]);
    // buffer: cistern with outlet keeps the streak alive when the channel freezes or runs dry
    const zi = c.building('zisterne');
    if (!scarce && !zi && c.has('rinnenbau')) c.build('zisterne', undefined, tankPos(c, la));
    if (!scarce && zi && zi.active) {
      // the cistern is a buffer, not a third feed: only a cheap channel, never a pumped pipe
      if (!c.hasRoute({ kind: 'building', id: zi.id }) && c.planRoute({ kind: 'building', id: zi.id }, ['rinne'])) c.buildRoute({ kind: 'building', id: zi.id });
      const routeFlow = c.routes(r1).reduce((a, r) => a + r.flow, 0);
      const wantOut = routeFlow < cap * 0.9 ? cap : 0.05;
      if (!zi.out || zi.out.zone !== la || Math.abs(zi.out.rate - wantOut) > 0.01) c.setOut(zi.id, la, wantOut);
    }
    c.researchPlan(['feinjustierung', 'doppeltropf']);
    if (!scarce && c.has('doppeltropf') && !c.hasRoute(r2) && !c.mem.noSecondRoute && !c.buildRoute(r2) && !c.planRoute(r2)) c.researchPlan(['rohrguss', 'pumpwerk']); // second drip needs the big source: pumped pipe
    if (scarce && c.has('doppeltropf')) {
      // second drip point: a barrel at the other line zone, filled by hand from the hub, dripping at the cap
      const f2 = c.tankAt(lb);
      if (!f2) c.build('fass', undefined, tankPos(c, lb));
      else if (f2.active && (!f2.out || f2.out.zone !== lb || Math.abs(f2.out.rate - cap) > 0.01)) c.setOut(f2.id, lb, cap);
    }
    if (c.state.routes.length > 0 && c.workersDoing('maintain') < 1) c.hire('wart', { type: 'maintain' });
    c.researchPlan(['schreibstube', 'rohrguss']);
    if (!c.mem.noCarriers) idleCarriersTo(c, r1);
  },
  body(c) {
    if (!c.idle()) return;
    if (c.repairWorst(0.4)) return;
    const l0 = shadyLineZone(c), l1 = (l0 + 4) % 8;
    const la = c.mem.dripZone === 1 ? l1 : l0, lb = c.mem.dripZone === 1 ? l0 : l1;
    if (c.scarceWater()) {
      // the channel-fed barrel drips at the cap; everyone shuttles its surplus to the barrels without a channel (second drip point)
      const cap = c.has('feinjustierung') ? content.methods.tropfen.capFine : content.methods.tropfen.cap;
      const tanks = c.state.buildings.filter((b) => (b.type === 'fass' || b.type === 'zisterne') && b.active);
      const fed = tanks.filter((t) => c.hasRoute({ kind: 'building', id: t.id }));
      const unfed = tanks.filter((t) => t.out && !fed.includes(t) && t.liters < t.cap * 0.8);
      const src = fed.find((t) => t.liters - cap * 60 > 0);
      const carry = c.carryCap();
      if (unfed.length > 0) {
        if (c.p.carry >= carry * 0.9 || (c.p.carry > 0 && !src)) {
          let best = unfed[0]; for (const t of unfed) if (dist(t.pos, c.p.pos) < dist(best.pos, c.p.pos)) best = t;
          c.deliver({ kind: 'building', id: best.id }); return;
        }
        if (src && src.liters - cap * 60 >= Math.min(carry, 10)) { c.fillFromTank(src.id); return; }
      } else if (src && c.hubLoop({ id: src.id, liters: src.liters - cap * 60, active: true }, lb)) return;
    }
    c.carryLoop({ kind: 'zone', zone: la });
  },
};

// ---------------------------------------------------------------- 4 Keilschläger – Quellkeile
export const keilschlaeger: Strategy = {
  id: 'keilschlaeger', main: 'keile',
  step(c) {
    keepReserve(c, 5);
    if (opening(c, 150, ['holzsegen', 'zaeher_traeger', 'quellrecht', 'ratsgunst'])) return;
    const la = shadyLineZone(c), lb = (la + 4) % 8;
    const land = landscapeDef(c.state.landscape);
    const maxW = content.methods.keile.maxWedges;
    // scarce water: three soaked zones beat six half-wet ones; the best zones are weak spots on the line
    const need = wedgeOrder(c, c.scarceWater() ? 3 : 8);
    c.mem.keepTargets = true;
    c.ensureCarriers(3, { kind: 'zone', zone: la });
    const withWedges = need.filter((z) => c.zone(z).wedges > 0);
    spreadCarriers(c, (withWedges.length > 0 ? withWedges : [la, lb]).map((z) => ({ kind: 'zone', zone: z }) as WaterTarget));
    c.researchPlan(['bohrer', 'quellkeile']);
    if (c.has('bohrer') && !c.hasTool('bohrer')) { if (c.p.tools.filter((t) => t !== 'haende').length >= 2) c.dropTool('eimer'); c.buyTool('bohrer'); }
    const holesFree = need.reduce((a, z) => a + Math.max(0, c.zone(z).holes - c.zone(z).wedges), 0);
    if (c.has('quellkeile') && holesFree > c.wood) c.buyWood(Math.min(6, holesFree - c.wood));
    const scarce = c.scarceWater();
    const hub = scarce ? c.waterHub(la) : undefined;
    if (hub) { coreRoute(c, { kind: 'building', id: hub.id }); if (!hub.out || hub.out.zone !== la || Math.abs(hub.out.rate - 0.3) > 0.01) c.setOut(hub.id, la, 0.3); }
    else if (!scarce) coreRoute(c, { kind: 'zone', zone: la });
    shadeLine(c, c.money > 400 ? need.filter((z) => c.zone(z).wedges > 0 || z === la || z === lb) : [la, lb]);
    c.dewNets(hub ? 4 : 0, la); // steppe: every drop counts, dew nets at the stone add to the well
    if (!hub && c.money > 350 && !c.hasRoute({ kind: 'zone', zone: lb })) c.buildRoute({ kind: 'zone', zone: lb });
    if (!hub && c.money > 600 && c.state.routes.length < 4) {
      // rich and the water is free: a channel to the wedge zone whose wedges stay driest
      const dry = need.filter((z) => c.zone(z).wedges > 0 && !c.hasRoute({ kind: 'zone', zone: z })).sort((a, b) => c.zone(a).wedgeWet - c.zone(b).wedgeWet)[0];
      if (dry !== undefined && !c.buildRoute({ kind: 'zone', zone: dry }) && !c.planRoute({ kind: 'zone', zone: dry })) c.researchPlan(['rohrguss', 'pumpwerk']);
    }
    c.researchPlan(['bohrtrupp']);
    if (c.has('bohrtrupp') && c.workersDoing('drill') + c.workersDoing('wedges') < 2) {
      const z = need.find((zz) => c.zone(zz).holes < maxW);
      if (z !== undefined) c.hire('bohrtrupp', { type: 'drill', zone: z, deep: false });
    }
    c.researchPlan(['schreibstube', 'baracke']);
    if (c.has('baracke')) c.build('baracke');
    c.carryTools();
    for (const w of c.idleWorkers()) {
      if (w.kind === 'bohrtrupp') { const z = need.find((zz) => c.zone(zz).holes < maxW); if (z !== undefined) c.assign(w.id, { type: 'drill', zone: z, deep: false }); else { const wz = need.find((zz) => c.zone(zz).wedges < c.zone(zz).holes); if (wz !== undefined) c.assign(w.id, { type: 'wedges', zone: wz }); } }
      else idleCarriersTo(c, { kind: 'zone', zone: la });
    }
    void land;
  },
  body(c) {
    if (!c.idle()) return;
    if (c.repairWorst(0.45)) return;
    const la = shadyLineZone(c), lb = (la + 4) % 8;
    const maxW = content.methods.keile.maxWedges;
    const order = wedgeOrder(c, c.scarceWater() ? 3 : 8);
    if (c.hasTool('bohrer')) {
      if (c.has('quellkeile') && c.wood >= 1) { const wz = order.find((z) => c.zone(z).wedges < c.zone(z).holes); if (wz !== undefined) { c.wedge(wz); return; } }
      const dz = order.find((z) => c.zone(z).holes < maxW && (z % 4 === c.state.stone.line || c.progress > 0.08));
      if (dz !== undefined) { c.drill(dz); return; }
    }
    let best = la, bw = 2;
    for (const z of order) { const zz = c.zone(z); if (zz.wedges > 0 && zz.wedgeWet < bw) { bw = zz.wedgeWet; best = z; } }
    // a cart load wets several zones: each wedge zone only takes what its wedges still soak up
    const lpw = content.methods.keile.litersPerWedge;
    const wedgeZones = order.filter((z) => c.zone(z).wedges > 0);
    if (wedgeZones.length > 0 && c.p.carry > 0 && c.pourWhereNeeded(wedgeZones, (z) => (1 - c.zone(z).wedgeWet) * lpw * c.zone(z).wedges + 1)) return;
    const hub = c.scarceWater() ? c.fullestTank(la) : undefined;
    if (hub && c.hubLoop(hub, best)) return;
    c.carryLoop({ kind: 'zone', zone: best });
  },
};

// ---------------------------------------------------------------- 5 Dampfkessel – Dampfdruck
export const dampfkessel: Strategy = {
  id: 'dampfkessel', main: 'dampf',
  step(c) {
    keepReserve(c, 5);
    if (opening(c, 250, ['sonnenbrand', 'holzsegen', 'gute_presse', 'ratsgunst'], 'sun')) return;
    const sz = sunnyLineZone(c);
    const oz = (sz + 4) % 8;
    const land = landscapeDef(c.state.landscape);
    c.mem.keepTargets = true;
    const fass = c.building('fass') ?? c.building('zisterne');
    const income: WaterTarget = { kind: 'zone', zone: (sz + 2) % 8 };
    c.ensureCarriers(3, income);
    if (fass && fass.active && !c.hasRoute({ kind: 'building', id: fass.id })) spreadCarriers(c, [{ kind: 'building', id: fass.id }, { kind: 'zone', zone: (sz + 2) % 8 }]);
    else spreadCarriers(c, [{ kind: 'zone', zone: (sz + 2) % 8 }, { kind: 'zone', zone: (oz + 2) % 8 }]);
    c.researchPlan(['bohrer', 'tiefbohrer', 'feuerstelle']);
    if (c.has('tiefbohrer') && !c.hasTool('tiefbohrer')) { if (c.hasTool('bohrer')) c.swapTool('bohrer', 'tiefbohrer'); else if (c.saveFor(160)) { if (c.p.tools.filter((t) => t !== 'haende').length >= 2) c.dropTool('eimer'); c.buyTool('tiefbohrer'); } }
    if (c.has('feuerstelle')) c.build('feuerstelle', sz);
    c.researchPlan(['dampfbohrung', 'brennspiegel']);
    if (c.has('brennspiegel')) c.build('brennspiegel', sz);
    if (c.has('dampfbohrung') && !fass) c.build('fass', undefined, tankPos(c, sz));
    const fires = c.state.buildings.filter((b) => b.type === 'feuerstelle').length;
    const holes = c.zone(sz).deepHoles + c.zone(oz).deepHoles;
    const wantWood = 2 + fires * 3 + (c.has('sicherheitsventil') ? 0 : holes);
    if (c.wood < wantWood) c.buyWood(Math.max(6, Math.min(10, wantWood - c.wood + 4))); // in batches: every village trip is a missed hot hour
    coreRoute(c, fass ? { kind: 'building', id: fass.id } : { kind: 'zone', zone: (sz + 2) % 8 });
    c.carryTools(c.has('eimerbau') ? 'karren' : undefined);
    if (c.has('feuerstelle') && c.zone(oz).deepHoles > 0) c.build('feuerstelle', oz);
    c.researchPlan(['sicherheitsventil', 'tribuene', 'marktstand', 'schreibstube']);
    if (c.has('tribuene') && c.progress > 0.1) c.build('tribuene');
    if (c.has('marktstand')) c.build('marktstand');
    idleCarriersTo(c, income);
    void land;
  },
  body(c) {
    const m = content.methods.dampf;
    const sz = sunnyLineZone(c);
    const oz = (sz + 4) % 8;
    // a glowing zone with a free hole preempts everything: drop the errand and charge now
    if (c.has('dampfbohrung') && c.p.carry >= m.minLiters && (c.has('sicherheitsventil') || c.wood >= 1) && c.p.stun <= 0) {
      const hot = [sz, oz].filter((z) => c.zone(z).charges.length < c.zone(z).deepHoles && c.zone(z).T >= m.minT);
      const head = c.p.queue[0] as { t: string } | undefined;
      if (hot.length > 0 && head && head.t !== 'charge' && !c.p.action) { c.out.push({ t: 'stop', p: c.pid }); c.charge(c.hottest(hot)); return; }
    }
    if (!c.idle()) return;
    if (c.repairWorst(0.45)) return;
    const deepOk = c.hasTool('tiefbohrer');
    const tank = [c.building('zisterne'), c.building('fass')].find((b) => b && b.active && b.liters >= m.minLiters);
    if (c.has('dampfbohrung')) {
      const ready = [sz, oz].filter((z) => c.zone(z).charges.length < c.zone(z).deepHoles && c.zone(z).T >= m.minT);
      if (ready.length > 0) {
        if (c.p.carry >= m.minLiters && (c.has('sicherheitsventil') || c.wood >= 1)) { c.charge(c.hottest(ready)); return; }
        if (c.p.carry < m.minLiters) { if (tank) { c.fillFromTank(tank.id); return; } const s = c.bestSource('cold'); if (s) { c.scoop(s); return; } }
      }
    }
    if (deepOk) { for (const z of [sz, oz]) if (c.zone(z).deepHoles < 3 && (c.zone(z).T < m.minT || c.p.carry < m.minLiters)) { c.drill(z, true); return; } }
    if (c.has('dampfbohrung')) {
      const warming = [sz, oz].some((z) => c.zone(z).deepHoles > c.zone(z).charges.length && c.zone(z).T > m.minT - 12 && c.hour < 17);
      if (warming) { if (c.p.carry < m.minLiters) { if (tank) { c.fillFromTank(tank.id); return; } const s = c.bestSource('cold'); if (s) { c.scoop(s); return; } } c.goto(0, -(c.state.stone.radius + 3)); return; }
    }
    c.carryLoop({ kind: 'zone', zone: (sz + 2) % 8 }, 'near');
  },
};

// ---------------------------------------------------------------- 6 Ingenieur – Wasserstrahl
export const ingenieur: Strategy = {
  id: 'ingenieur', main: 'strahl',
  step(c) {
    keepReserve(c, 5);
    if (opening(c, 300, ['sparflamme', 'ratsgunst', 'quellrecht', 'dichte_rinnen'])) return;
    const [la, lb] = c.lineZones();
    const land = landscapeDef(c.state.landscape);
    c.mem.keepTargets = true;
    c.ensureCarriers(c.hasRoute({ kind: 'zone', zone: la }) ? 2 : ((c.mem.carriers as number | undefined) ?? 4), { kind: 'zone', zone: la }); // the jet is expensive: four carriers pay it off sooner
    // once the jet stands, its feed comes before everything else (a pipe on the steppe costs more than the research left)
    const sw0 = c.building('strahlwerk');
    if (sw0 && !c.hasRoute({ kind: 'building', id: sw0.id })) {
      const cheap = c.planRoute({ kind: 'building', id: sw0.id }, ['rinne']);
      if (!c.buildRoute({ kind: 'building', id: sw0.id }) && !cheap) {
        // the zone channel from a small source (well, spring) blocks the cheap feed of the jet: tear it down, the jet needs it more
        const r = c.state.routes.find((x) => x.to.kind === 'zone' && (c.state.sources.find((q) => q.id === x.from)?.storeCap ?? 0) < 100000);
        if (r) c.out.push({ t: 'demolish', p: c.pid, id: r.id });
      }
      if (c.blocked) { c.carryTools(c.has('eimerbau') ? 'karren' : undefined); spreadCarriers(c, [{ kind: 'building', id: sw0.id }]); return; }
    }
    if (!sw0 && !coreRoute(c, { kind: 'zone', zone: la })) return;
    const energyResearch = land.waterwheel ? 'wasserrad' : 'windrad';
    c.researchPlan(['bohrer', 'sandgrube', energyResearch, 'pumpwerk', 'strahlwerk']);
    const need = content.methods.strahl.energy + (c.state.routes.some((r) => r.pumped) ? 0.5 : 0);
    if (c.state.eco.energyProd < need * 1.05) {
      if (land.waterwheel && c.has('wasserrad') && !c.building('wasserrad')) c.build('wasserrad');
      else if (c.has('windrad')) c.build('windrad');
      else if (c.has('dampfmaschine')) c.build('dampfmaschine');
    }
    if (c.has('sandgrube') && c.state.buildings.filter((b) => b.type === 'sandgrube').length < (land.sandPrice === 0 ? 2 : 1)) c.build('sandgrube');
    if (c.has('strahlwerk') && !c.building('strahlwerk')) c.build('strahlwerk', la);
    const sw = c.building('strahlwerk');
    if (c.state.eco.sand < 15 && land.sandPrice > 0 && sw) c.buySand(20);
    if (sw && c.hasRoute({ kind: 'building', id: sw.id }) && c.money > 900 && !c.building('strahlwerk', lb) && c.state.eco.energyProd >= need * 1.9) c.build('strahlwerk', lb);
    const sw2 = c.building('strahlwerk', lb);
    if (sw2 && !c.hasRoute({ kind: 'building', id: sw2.id })) c.buildRoute({ kind: 'building', id: sw2.id });
    const dm = c.building('dampfmaschine');
    if (dm && c.wood < 4) c.buyWood(4);
    c.researchPlan(['rohrguss', 'feuerstelle', 'dampfmaschine', 'schreibstube']);
    c.carryTools(c.has('eimerbau') ? 'karren' : undefined);
    const target: WaterTarget = sw && sw.active && !c.hasRoute({ kind: 'building', id: sw.id }) ? { kind: 'building', id: sw.id } : { kind: 'zone', zone: la };
    spreadCarriers(c, [target]);
    idleCarriersTo(c, target);
  },
  body(c) {
    if (!c.idle()) return;
    if (c.repairWorst(0.35)) return;
    const [la] = c.lineZones();
    const sw = c.building('strahlwerk');
    if (sw && sw.active && sw.liters < sw.cap * 0.8) { c.carryLoop({ kind: 'building', id: sw.id }); return; }
    c.carryLoop({ kind: 'zone', zone: la });
  },
};

// ---------------------------------------------------------------- 7 Gärtner – Wurzelkraft
export const gaertner: Strategy = {
  id: 'gaertner', main: 'wurzel',
  step(c) {
    keepReserve(c, 5);
    if (opening(c, 150, ['quellrecht', 'dichte_rinnen', 'zaeher_traeger', 'holzsegen'])) return;
    const la = shadyLineZone(c), lb = (la + 4) % 8;
    c.mem.keepTargets = true;
    c.ensureCarriers(3, { kind: 'zone', zone: la });
    const zonesWithTrees = [0, 1, 2, 3, 4, 5, 6, 7].filter((z) => c.zone(z).growths.length > 0);
    spreadCarriers(c, (zonesWithTrees.length > 0 ? zonesWithTrees : [la, lb]).map((z) => ({ kind: 'zone', zone: z }) as WaterTarget));
    c.researchPlan(['setzlinge', 'bohrer']);
    if (c.has('bohrer') && !c.hasTool('bohrer')) { if (c.p.tools.filter((t) => t !== 'haende').length >= 2) c.dropTool('eimer'); c.buyTool('bohrer'); }
    const scarce = c.scarceWater();
    const hub = scarce ? c.waterHub(la) : undefined;
    if (hub) { coreRoute(c, { kind: 'building', id: hub.id }); if (!hub.out || hub.out.zone !== la || Math.abs(hub.out.rate - 0.3) > 0.01) c.setOut(hub.id, la, 0.3); }
    else if (!scarce) coreRoute(c, { kind: 'zone', zone: la });
    shadeLine(c, c.money > 400 ? [0, 1, 2, 3, 4, 5, 6, 7].filter((z) => c.zone(z).growths.length > 0 || z === la || z === lb) : [la, lb]);
    c.researchPlan(['wurzelwerk']);
    if (!hub && c.money > 350 && !c.hasRoute({ kind: 'zone', zone: lb })) c.buildRoute({ kind: 'zone', zone: lb });
    if (!hub && c.money > 600 && c.state.routes.length < 4) {
      // rich and the water is free: a channel to the tree zone that stays driest (growth follows wetness)
      const dry = [0, 1, 2, 3, 4, 5, 6, 7].filter((z) => c.zone(z).growths.length > 0 && !c.hasRoute({ kind: 'zone', zone: z })).sort((a, b) => c.zone(a).wet - c.zone(b).wet)[0];
      if (dry !== undefined && !c.buildRoute({ kind: 'zone', zone: dry }) && !c.planRoute({ kind: 'zone', zone: dry })) c.researchPlan(['rohrguss', 'pumpwerk']); // the river lies below the stone: pumped pipes
    }
    c.researchPlan(['bewaesserungsring', 'schreibstube']);
    c.carryTools();
    idleCarriersTo(c, { kind: 'zone', zone: la });
  },
  body(c) {
    if (!c.idle()) return;
    if (c.repairWorst(0.45)) return;
    const la = shadyLineZone(c), lb = (la + 4) % 8;
    const m = content.methods.wurzel;
    const order = [la, lb, (la + 1) % 8, (la + 7) % 8, (lb + 1) % 8, (lb + 7) % 8, (la + 2) % 8, (lb + 2) % 8];
    if (c.has('setzlinge') && c.money > 20) {
      for (const z of order) {
        const zz = c.zone(z);
        if (zz.growths.length >= m.maxTrees) continue;
        const canPlant = c.progress >= m.minProgress || zz.holes > zz.wedges + zz.growths.length;
        if (canPlant) { c.plant(z); return; }
        if (c.hasTool('bohrer') && zz.holes < 3) { c.drill(z); return; }
      }
    }
    let best = la, bw = 2;
    for (const z of order) { const zz = c.zone(z); if (zz.growths.length > 0 && zz.wet < bw) { bw = zz.wet; best = z; } }
    const treeZones = order.filter((z) => c.zone(z).growths.length > 0);
    if (treeZones.length > 0 && c.p.carry > 0 && c.pourWhereNeeded(treeZones, (z) => (1 - c.zone(z).wet) * 40 + 1)) return;
    const hub = c.scarceWater() ? c.waterHub(la) : undefined;
    if (hub && c.hubLoop(hub, best)) return;
    c.carryLoop({ kind: 'zone', zone: best });
  },
};

// ---------------------------------------------------------------- 8 Händler – Wirtschaft zuerst, dann beste Methode
export const haendler: Strategy = {
  id: 'haendler', main: 'none',
  step(c) {
    keepReserve(c, 5);
    if (opening(c, 300, ['ratsgunst', 'gute_presse', 'quellrecht', 'eilbote'])) return;
    const rock = content.rocks.find((r) => r.id === c.state.stone.rock)!;
    const land = landscapeDef(c.state.landscape);
    if (!c.mem.chosen) {
      const scores: Record<string, number> = {
        tropfen: rock.sus.tropfen * (land.salt ? 1.1 : 1),
        keile: rock.sus.keile * (land.woodPrice > 10 ? 0.7 : 1),
        wurzel: rock.sus.wurzel * (land.salt ? 0.4 : 1) * (land.climate.day > 35 ? 0.8 : 1),
        thermoschock: rock.sus.thermoschock * (land.climate.day - land.sources[0].temp > 20 ? 1.1 : 0.9),
        frost: rock.sus.frost * (land.climate.night <= -2 ? 1.2 : 0.7),
        dampf: rock.sus.dampf * (land.climate.day > 35 ? 1.2 : 0.9),
      };
      let best = 'tropfen', bs = 0;
      for (const k of Object.keys(scores)) if (scores[k] > bs) { bs = scores[k]; best = k; }
      c.mem.chosen = best;
    }
    if (c.minutes < 6) {
      c.mem.keepTargets = true;
      c.ensureCarriers(3, { kind: 'village' });
      c.researchPlan(['marktstand']);
      if (c.has('marktstand')) c.build('marktstand');
      c.carryTools(c.has('eimerbau') ? 'karren' : undefined);
      idleCarriersTo(c, { kind: 'village' });
      return;
    }
    const sub = byMain[c.mem.chosen as MethodId];
    sub.step(c);
    c.researchPlan(['tribuene']);
    if (c.has('tribuene') && c.progress > 0.15) c.build('tribuene');
  },
  body(c) {
    if (!c.idle()) return;
    if (c.minutes < 6 || !c.mem.chosen) { c.carryLoop({ kind: 'village' }); return; }
    byMain[c.mem.chosen as MethodId].body(c);
  },
};

// ---------------------------------------------------------------- Planlos – kauft stets das Billigste
export const planlos: Strategy = {
  id: 'planlos', main: 'none',
  step(c) {
    c.reserve = 0;
    c.perk();
    type Opt = { cost: number; run: () => boolean };
    const opts: Opt[] = [];
    for (const t of content.tools) if (!c.hasTool(t.id) && c.has(t.requires ?? '') && c.p.tools.filter((x) => x !== 'haende').length < 2) opts.push({ cost: t.cost, run: () => c.buyTool(t.id) });
    for (const n of content.research.nodes) if (c.canResearch(n.id) && !c.state.research.current) opts.push({ cost: n.cost, run: () => c.research(n.id) });
    for (const b of content.buildings) if (c.has(b.requires ?? '') && c.wood >= (b.wood ?? 0)) opts.push({ cost: b.cost, run: () => c.build(b.id, b.zone ? (c.state.tick % 8) : undefined) });
    for (const w of content.workers) if (c.has(w.requires ?? '')) opts.push({ cost: w.hire, run: () => c.hire(w.id, { type: 'carry', source: c.bestSource('near') ?? 'fluss', target: { kind: 'zone', zone: c.state.tick % 8 } }) });
    opts.push({ cost: 5, run: () => c.buyWood(1) });
    opts.sort((a, b) => a.cost - b.cost);
    for (const o of opts) { if (c.afford(o.cost)) { if (o.run()) break; } else break; }
    idleCarriersTo(c, { kind: 'zone', zone: c.state.tick % 8 });
  },
  body(c) {
    if (!c.idle()) return;
    if (c.hasTool('bohrer') && c.zone(c.state.tick % 8).holes < 6 && c.state.tick % 3 === 0) { c.drill(c.state.tick % 8); return; }
    if (c.hasTool('bohrer') && c.has('quellkeile') && c.wood > 0) { const z = [0, 1, 2, 3, 4, 5, 6, 7].find((zz) => c.zone(zz).wedges < c.zone(zz).holes); if (z !== undefined) { c.wedge(z); return; } }
    c.carryLoop({ kind: 'zone', zone: (Math.floor(c.state.tick / 600)) % 8 });
  },
};

export const byMain: Record<MethodId, Strategy> = {
  thermoschock: hitzkopf, frost: frostwart, tropfen: tropfmeister, keile: keilschlaeger, dampf: dampfkessel, strahl: ingenieur, wurzel: gaertner,
};

export const STRATEGIES: Strategy[] = [hitzkopf, frostwart, tropfmeister, keilschlaeger, dampfkessel, ingenieur, gaertner, haendler];
export const GREEDY: Strategy = planlos;

export function strategyById(id: string): Strategy | undefined {
  return [...STRATEGIES, planlos].find((s) => s.id === id);
}
