import {
  content, buildingDef, researchNode, toolDef, workerDef, hourOf, hasResearch, zonePos, dist, evaluateRoute, straightRoute, sourceRate, carryTool, landscapeDef,
} from '../sim/index';
import type { Command, GameState, Player, MethodId, RouteTarget, WorkerTask, Vec2 } from '../sim/index';

export type WaterTarget = { kind: 'zone'; zone: number } | { kind: 'building'; id: string } | { kind: 'village' };

/** Per-bot helper bound to one state, one player and one output command list. */
export class BotCtx {
  spent = 0;
  reserve = 0;
  /** set when a higher-priority purchase is waiting for money: lower priorities must not spend */
  blocked = false;
  constructor(public state: GameState, public pid: string, public out: Command[], public mem: Record<string, unknown>) {}

  get p(): Player { return this.state.players.find((x) => x.id === this.pid)!; }
  get money(): number { return this.state.eco.money - this.spent; }
  get wood(): number { return this.state.eco.wood; }
  get hour(): number { return hourOf(this.state.tick); }
  get progress(): number { return this.state.stone.progress / this.state.stone.hp; }
  get minutes(): number { return this.state.tick / 600; }
  afford(cost: number): boolean { return !this.blocked && this.money - this.reserve >= cost; }
  /** Mark that `cost` is needed for the current priority; blocks lower priorities until affordable. */
  saveFor(cost: number): boolean { if (this.afford(cost)) return true; this.blocked = true; return false; }
  idle(): boolean { const p = this.p; return !p.action && !p.moveTarget && p.queue.length === 0 && p.stun <= 0 && !p.chain && !this.busy; }
  busy = false;
  has(research: string): boolean { return hasResearch(this.state, research); }
  hasTool(t: string): boolean { return this.p.tools.includes(t); }
  zone(i: number) { return this.state.stone.zones[i]; }
  lineZones(): [number, number] { const l = this.state.stone.line; return [l, l + 4]; }
  wages(): number { return this.state.workers.reduce((a, w) => a + (workerDef(w.kind)?.wage ?? 0), 0) * 1.5 + 20; }

  // -------------------------------------------------- strategic actions
  research(id: string): boolean {
    const r = this.state.research;
    if (r.done.includes(id) || r.current) return false;
    const n = researchNode(id);
    if (!n) return false;
    for (const req of n.requires) if (!req.split('|').some((a) => r.done.includes(a))) return false;
    if (!this.saveFor(n.cost)) return false;
    this.out.push({ t: 'research', p: this.pid, id });
    this.spent += n.cost;
    return true;
  }
  /** Research the first node in the list that is not done (respecting order), returns true if a command was issued or something is still pending. */
  researchPlan(ids: string[]): boolean {
    for (const id of ids) {
      if (this.state.research.done.includes(id)) continue;
      if (this.state.research.current) return true;
      return this.researchWithPrereqs(id);
    }
    return false;
  }
  /** Research `id`, or the first missing prerequisite on the way to it. */
  researchWithPrereqs(id: string, depth = 0): boolean {
    const n = researchNode(id);
    if (!n || depth > 6 || this.state.research.done.includes(id)) return false;
    for (const req of n.requires) {
      const alts = req.split('|');
      if (alts.some((a) => this.state.research.done.includes(a))) continue;
      return this.researchWithPrereqs(alts[0], depth + 1);
    }
    return this.research(id);
  }
  canResearch(id: string): boolean {
    const n = researchNode(id);
    if (!n) return false;
    for (const req of n.requires) if (!req.split('|').some((a) => this.state.research.done.includes(a))) return false;
    return !this.state.research.done.includes(id);
  }
  buyTool(id: string): boolean {
    const td = toolDef(id);
    if (!td || this.hasTool(id) || !this.has(td.requires ?? '')) return false;
    if (this.p.tools.filter((t) => t !== 'haende').length >= 2) return false;
    if (!this.afford(td.cost)) return false;
    this.out.push({ t: 'buyTool', p: this.pid, tool: id });
    this.spent += td.cost;
    this.busy = true;
    return true;
  }
  dropTool(id: string): void { if (this.hasTool(id)) this.out.push({ t: 'dropTool', p: this.pid, tool: id }); }
  /** Replace `oldTool` by `newTool` when affordable and researched. */
  swapTool(oldTool: string, newTool: string): boolean {
    const td = toolDef(newTool);
    if (!td || this.hasTool(newTool) || !this.has(td.requires ?? '') || !this.afford(td.cost)) return false;
    this.dropTool(oldTool);
    return this.buyTool(newTool);
  }
  /** Buy the first carry tool if none is held; upgrade when the strategy wants it. */
  carryTools(upgrade?: 'tragjoch' | 'karren'): void {
    if (upgrade && !this.hasTool(upgrade)) {
      const held = this.p.tools.find((t) => t === 'eimer' || t === 'tragjoch' || t === 'karren');
      if (held) { this.swapTool(held, upgrade); return; }
      if (this.buyTool(upgrade)) return;
    }
    if (!this.p.tools.some((t) => t === 'eimer' || t === 'tragjoch' || t === 'karren')) this.buyTool('eimer');
  }
  hire(kind: string, task: WorkerTask): boolean {
    const wd = workerDef(kind);
    if (!wd || !this.has(wd.requires ?? '')) return false;
    if (this.state.workers.length >= this.state.eco.workerSlots) return false;
    if (!this.afford(wd.hire + wd.wage)) return false;
    this.out.push({ t: 'hire', p: this.pid, kind, task });
    this.spent += wd.hire;
    this.busy = true;
    return true;
  }
  workersDoing(type: string): number { return this.state.workers.filter((w) => w.task && w.task.type === type).length; }
  assign(workerId: string, task: WorkerTask): void { this.out.push({ t: 'assign', p: this.pid, worker: workerId, task }); }
  building(type: string, zone?: number) { return this.state.buildings.find((b) => b.type === type && (zone === undefined || b.zone === zone)); }
  buildingActive(type: string, zone?: number): boolean { const b = this.building(type, zone); return !!b && b.active; }
  build(type: string, zone?: number, pos?: Vec2): boolean {
    const bd = buildingDef(type);
    if (!bd || !this.has(bd.requires ?? '')) return false;
    if (bd.needs === 'waterwheel' && !landscapeDef(this.state.landscape).waterwheel) return false;
    if (bd.zone && zone !== undefined && this.building(type, zone)) return false;
    if (!bd.zone && bd.tank === undefined && bd.energy === undefined && bd.energyWind === undefined && bd.energyWorker === undefined && this.building(type)) return false;
    if (this.wood < (bd.wood ?? 0)) { this.buyWood((bd.wood ?? 0) - this.wood); return false; }
    if (!this.saveFor(bd.cost)) return false;
    let at = pos;
    if (!at) {
      if (bd.near === 'village') { const v = landscapeDef(this.state.landscape).village; at = { x: v[0] + 3, z: v[1] + 3 }; }
      else if (zone !== undefined) { const zp = zonePos(this.state, zone); const d = Math.hypot(zp.x, zp.z); at = { x: (zp.x / d) * (d + 3), z: (zp.z / d) * (d + 3) }; }
      else { const n = this.state.buildings.length; at = { x: 14 + (n % 4) * 4, z: -12 - Math.floor(n / 4) * 4 }; }
    }
    this.out.push({ t: 'build', p: this.pid, type, x: at.x, z: at.z, zone });
    this.spent += bd.cost;
    return true;
  }
  buyWood(n: number): boolean {
    const price = content.landscapes.find((l) => l.id === this.state.landscape)!.woodPrice;
    if (n <= 0 || !this.afford(n * price)) return false;
    this.out.push({ t: 'buyWood', p: this.pid, amount: n });
    this.spent += n * price;
    this.busy = true;
    return true;
  }
  buySand(n: number): boolean {
    const price = landscapeDef(this.state.landscape).sandPrice;
    if (n <= 0 || !this.afford(n * price)) return false;
    this.out.push({ t: 'buySand', p: this.pid, amount: n });
    this.spent += n * price;
    this.busy = true;
    return true;
  }
  loan(amount: number): void { this.out.push({ t: 'loan', p: this.pid, amount }); }
  setLine(zone: number): void { this.out.push({ t: 'line', p: this.pid, zone }); }
  setOut(building: string, zone: number | null, rate: number): void { this.out.push({ t: 'setOut', p: this.pid, building, zone, rate }); }
  perk(): void {
    const off = this.state.research.offered;
    if (!off) return;
    const prefer = (this.mem.perkPrefer as string[] | undefined) ?? [];
    const pick = prefer.find((x) => off.includes(x)) ?? off[0];
    this.out.push({ t: 'perk', p: this.pid, id: pick });
  }

  // -------------------------------------------------- routes
  routes(to: RouteTarget) { return this.state.routes.filter((r) => sameTarget(r.to, to)); }
  hasRoute(to: RouteTarget): boolean { return this.routes(to).some((r) => r.ok); }
  /** Plan the cheapest working route to `to`. Returns null if none possible with current research. */
  planRoute(to: RouteTarget, kinds: ('rinne' | 'rohr')[] = ['rinne', 'rohr']): { kind: 'rinne' | 'rohr'; from: string; points: Vec2[]; pumped: boolean; cost: number; wood: number; length: number } | null {
    let best: ReturnType<BotCtx['planRoute']> = null;
    const froms: string[] = [];
    for (const s of this.state.sources) if (s.unlocked && s.kind !== 'regen' && s.kind !== 'tau') froms.push(s.id);
    for (const b of this.state.buildings) if (b.cap > 0 && b.active && (b.type === 'regenfang' || b.type === 'taunetz') && (to.kind !== 'building' || to.id !== b.id)) froms.push(b.id);
    for (const from of froms) for (const bend of [0, 18, -18, 32, -32]) {
      const points = straightRoute(this.state, from, to, 8, bend);
      for (const kind of kinds) {
        for (const pumped of kind === 'rohr' ? [false, true] : [false]) {
          const ev = evaluateRoute(this.state, kind, points, from, to, pumped);
          if (!ev.ok) continue;
          const src = this.state.sources.find((s) => s.id === from);
          const taken = this.state.routes.filter((r) => r.from === from).reduce((a, r) => a + content.routes[r.kind].capacity, 0);
          const rate = src ? src.flow * (src.kind === 'quelle' ? 1.1 : 1) - taken : 1;
          if (rate < 0.3) continue;
          const score = ev.cost + ev.wood * 8 + (pumped ? 100 : 0);
          if (!best || score < best.cost + best.wood * 8 + (best.pumped ? 100 : 0)) best = { kind, from, points, pumped, cost: ev.cost, wood: ev.wood, length: ev.length };
        }
      }
    }
    return best;
  }
  /** Which research would open a route to the stone from the best source? */
  routeUnlockPlan(): string[] {
    const land = landscapeDef(this.state.landscape);
    const plan: string[] = ['eimerbau', 'rinnenbau'];
    // check if a channel is possible from any unlocked/lockable source
    const to: RouteTarget = { kind: 'zone', zone: this.state.stone.line };
    const fake = { ...this.state, research: { ...this.state.research, done: [...this.state.research.done, 'rinnenbau'] }, sources: this.state.sources.map((x) => ({ ...x, unlocked: true })) };
    for (const s of land.sources) {
      if (s.kind === 'regen' || s.kind === 'tau') continue;
      for (const bend of [0, 18, -18, 32, -32]) {
        const pts = straightRoute(this.state, s.id, to, 8, bend);
        const ev = evaluateRoute(fake, 'rinne', pts, s.id, to, false);
        if (ev.ok) { if (s.requires) plan.push(s.requires); return plan; }
      }
    }
    plan.push('pumpwerk', 'rohrguss');
    return plan;
  }
  buildRoute(to: RouteTarget): boolean {
    const plan = this.planRoute(to);
    if (!plan) return false;
    const price = landscapeDef(this.state.landscape).woodPrice;
    if (!this.saveFor(plan.cost + Math.max(0, plan.wood - this.wood) * price)) return false;
    if (this.wood < plan.wood) { this.buyWood(plan.wood - this.wood); return false; }
    this.out.push({ t: 'route', p: this.pid, kind: plan.kind, points: plan.points, from: plan.from, to, pumped: plan.pumped });
    this.spent += plan.cost;
    return true;
  }
  /** Pumps and the waterjet need energy: build a treadmill (with a worker), water wheel or windmill as researched. */
  ensureEnergy(): void {
    const need = this.state.eco.energyUse;
    if (need <= 0 || this.state.eco.energyProd >= need) return;
    const land = landscapeDef(this.state.landscape);
    if (land.waterwheel && this.has('wasserrad')) { if (!this.building('wasserrad')) { this.build('wasserrad'); return; } }
    if (this.has('windrad') && land.climate.wind >= 0.8) { this.build('windrad'); return; }
    if (this.has('pumpwerk')) {
      const tm = this.building('tretmuehle');
      if (!tm) { this.build('tretmuehle'); return; }
      if (tm.active && this.workersDoing('tread') < 1) {
        const idle = this.idleWorkers()[0];
        if (idle) this.assign(idle.id, { type: 'tread', building: tm.id });
        else if (!this.hire('traeger', { type: 'tread', building: tm.id })) {
          const carrier = this.state.workers.find((w) => w.kind === 'traeger' && w.task && w.task.type === 'carry');
          if (carrier) this.assign(carrier.id, { type: 'tread', building: tm.id });
        }
      }
      return;
    }
    this.researchPlan([land.waterwheel ? 'wasserrad' : 'windrad']);
  }
  repairWorst(threshold = 0.5): boolean {
    let worst: string | null = null; let wc = threshold;
    for (const r of this.state.routes) if (r.condition < wc) { wc = r.condition; worst = r.id; }
    for (const b of this.state.buildings) if (b.active && b.condition < wc) { wc = b.condition; worst = b.id; }
    if (!worst) return false;
    this.out.push({ t: 'repair', p: this.pid, id: worst });
    return true;
  }

  // -------------------------------------------------- body
  carryCap(): number { return carryTool(this.p).carry ?? 2; }
  bestSource(pref: 'near' | 'cold' = 'near', near?: Vec2): string | null {
    let best: string | null = null; let bs = Infinity;
    const ref = near ?? this.p.pos;
    for (const s of this.state.sources) {
      if (!s.unlocked || s.kind === 'regen' || s.kind === 'tau') continue;
      const rate = sourceRate(this.state, s.id);
      if (rate <= 0.05) continue;
      let score = dist(ref, s.pos) + Math.hypot(s.pos.x, s.pos.z);
      if (pref === 'cold') score += s.temp * 4;
      if (rate < 1) score += 30 / rate;
      if (score < bs) { bs = score; best = s.id; }
    }
    return best;
  }
  scoop(source: string): void { this.out.push({ t: 'scoop', p: this.pid, source }); }
  deliver(t: WaterTarget): void {
    if (t.kind === 'zone') this.out.push({ t: 'pour', p: this.pid, zone: t.zone });
    else if (t.kind === 'village') this.out.push({ t: 'sell', p: this.pid });
    else this.out.push({ t: 'pourTank', p: this.pid, building: t.id });
  }
  /** Default body loop: scoop and deliver. */
  carryLoop(target: WaterTarget, pref: 'near' | 'cold' = 'near'): void {
    if (!this.idle()) return;
    const p = this.p;
    const cap = this.carryCap();
    if (p.carry >= cap * 0.95 || (p.carry > 0 && Math.hypot(p.pos.x, p.pos.z) < this.state.stone.radius + 6)) { this.deliver(target); return; }
    const tgtPos = target.kind === 'zone' ? zonePos(this.state, target.zone) : target.kind === 'village' ? villagePos(this.state) : this.state.buildings.find((b) => b.id === target.id)?.pos;
    const src = this.bestSource(pref, tgtPos);
    if (src) this.scoop(src);
  }
  tap(zone: number): void { this.out.push({ t: 'tap', p: this.pid, zone }); }
  drill(zone: number, deep = false): void { this.out.push({ t: 'drill', p: this.pid, zone, deep }); }
  wedge(zone: number): void { this.out.push({ t: 'wedge', p: this.pid, zone }); }
  plant(zone: number): void { this.out.push({ t: 'plant', p: this.pid, zone }); }
  charge(zone: number): void { this.out.push({ t: 'charge', p: this.pid, zone }); }
  chop(): void { this.out.push({ t: 'chop', p: this.pid }); }
  release(building: string, zone: number, liters: number): void { this.out.push({ t: 'release', p: this.pid, building, zone, liters }); }
  fillFromTank(building: string): void { this.out.push({ t: 'fillFromTank', p: this.pid, building }); }
  goto(x: number, z: number): void { this.out.push({ t: 'goto', p: this.pid, x, z }); }

  /** Standard opening: hammer, tap all zones, set line, drop hammer. Returns true while busy with it. */
  opening(): boolean {
    const m = this.mem;
    if (m.openingDone) return false;
    if (!m.openingTrip) {
      // one trip to the village: hammer, bucket and the first two carriers
      m.openingTrip = true;
      this.buyTool('klopfhammer');
      this.buyTool('eimer');
      const [la, lb] = this.lineZones();
      const src = this.bestSource('near');
      if (src) { this.hire('traeger', { type: 'carry', source: src, target: { kind: 'zone', zone: la } }); this.hire('traeger', { type: 'carry', source: src, target: { kind: 'zone', zone: lb } }); }
      return true;
    }
    if (!this.idle()) return true;
    const zones = this.state.stone.zones;
    if (zones.every((z) => z.tapped)) {
      let bestLine = 0, bestScore = -1;
      const sunPref = this.mem.linePref === 'sun';
      for (let l = 0; l < 4; l++) {
        const sunny = Math.max(4 - Math.min(Math.abs(l - 4), 8 - Math.abs(l - 4)), 4 - Math.min(Math.abs(l + 4 - 4), 8 - Math.abs(l + 4 - 4))) / 4; // 1 = south on the line
        const sc = zones[l].weak + zones[l + 4].weak + (sunPref ? sunny * 0.9 : 0);
        if (sc > bestScore) { bestScore = sc; bestLine = l; }
      }
      if (this.state.stone.line !== bestLine) { this.setLine(bestLine); return true; }
      this.dropTool('klopfhammer');
      m.openingDone = true;
      return false;
    }
    if (!this.hasTool('klopfhammer')) { if (!this.buyTool('klopfhammer')) { m.openingDone = true; return false; } return true; }
    // carriers start earning before we tap; tapping happens on the way
    const next = zones.findIndex((z) => !z.tapped);
    this.tap(next);
    return true;
  }
  /** Hottest of the given zones. */
  hottest(zones: number[]): number { let b = zones[0]; for (const z of zones) if (this.zone(z).T > this.zone(b).T) b = z; return b; }
  coldest(zones: number[]): number { let b = zones[0]; for (const z of zones) if (this.zone(z).T < this.zone(b).T) b = z; return b; }
  ensureCarriers(n: number, target: WaterTarget, source?: string): void {
    const src = source ?? this.bestSource('near', target.kind === 'zone' ? zonePos(this.state, target.zone) : undefined);
    if (!src) return;
    const carriers = this.state.workers.filter((w) => w.kind === 'traeger' && w.task && w.task.type === 'carry');
    if (carriers.length < n) { for (let i = carriers.length; i < n; i++) if (!this.hire('traeger', { type: 'carry', source: src, target })) break; return; }
    // retarget carriers that deliver elsewhere
    for (const w of carriers) {
      const t = (w.task as { target: WaterTarget }).target;
      if (!sameWaterTarget(t, target) && !(this.mem.keepTargets as boolean)) { this.assign(w.id, { type: 'carry', source: src, target }); return; }
    }
  }
  idleWorkers() { return this.state.workers.filter((w) => !w.task); }
  mainMethod(): MethodId | null {
    let best: MethodId | null = null; let bv = 0;
    for (const k of Object.keys(this.state.stone.dmg) as MethodId[]) if (this.state.stone.dmg[k] > bv) { bv = this.state.stone.dmg[k]; best = k; }
    return best;
  }
}

export function villagePos(state: GameState): Vec2 { const v = landscapeDef(state.landscape).village; return { x: v[0], z: v[1] }; }
export function sameTarget(a: RouteTarget, b: RouteTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'building') return a.id === (b as { id: string }).id;
  return (a as { zone: number }).zone === (b as { zone: number }).zone;
}
export function sameWaterTarget(a: WaterTarget, b: WaterTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'village') return true;
  if (a.kind === 'building') return a.id === (b as { id: string }).id;
  return a.zone === (b as { zone: number }).zone;
}
