import * as THREE from 'three';
import { content, hourOf, zonePos, evaluateRoute, dist, buildingDef, toolDef, workerDef, researchNode, hasResearch, woodPrice, landscapeDef, carryTool, type GameState, type Command, type RouteTarget, type WorkerTask } from '../../sim/index';
import type { Session } from './session';
import { WorldView, type Pick } from './view';
import { Input, type InputSnapshot } from './input';
import { UI } from '../ui/widgets';
import { drawHUD, METHOD_COLORS, type Toast } from './hud';
import { t } from '../i18n';
import { Synth } from '../audio/synth';
import { PALETTE, paperMaterial } from '../materials/paper';
import { METHODS, type MethodId } from '../../sim/index';

type Panel = 'none' | 'build' | 'research' | 'plan' | 'village' | 'building' | 'worker';

type RouteMode = { kind: 'route'; routeKind: 'rinne' | 'rohr'; pumped: boolean; points: { x: number; z: number }[]; from: string | null };
type PlaceMode = { kind: 'building'; type: string } | RouteMode | null;

/** One running game on screen: input → commands, HUD, panels, build mode. */
export class Play {
  yaw = 0; pitch = 0;
  panel: Panel = 'none';
  place: PlaceMode = null;
  toasts: Toast[] = [];
  private lastMove = { dx: 0, dz: 0, yaw: 0 };
  private moveTimer = 0;
  private selectedBuilding: string | null = null;
  private selectedWorker: string | null = null;
  private stepTimer = 0;
  private lastStoneToast = -100;
  private predicted: { x: number; z: number } | null = null;
  private lastSimPos = { x: 0, z: 0 };
  private tickClock = 0;
  private previewObj: THREE.Object3D | null = null;
  scenarioStep = 0;
  scenarioSteps: string[] = [];
  private grumbleTimer = 20;

  constructor(public session: Session, public view: WorldView, public ui: UI, public input: Input, public synth: Synth, public now: () => number) {
    this.view.hands.setTool(this.toolMesh('haende'));
  }

  get state(): GameState { return this.session.state; }
  get me() { return this.state.players.find((p) => p.id === this.session.playerId); }

  toast(text: string, kind: Toast['kind'], seconds = 6): void {
    if (kind === 'stone' && this.now() - this.lastStoneToast < 3) return;
    if (kind === 'stone') this.lastStoneToast = this.now();
    this.toasts.push({ text, until: this.now() + seconds, kind });
    if (this.toasts.length > 12) this.toasts.shift();
  }

  private toolMesh(tool: string): THREE.Object3D | null {
    if (tool === 'haende') return null;
    const g = new THREE.Group();
    if (tool === 'eimer' || tool === 'tragjoch') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.2, 10), paperMaterial('#8a7a6a', { seed: 90 })); g.add(m); }
    else if (tool === 'klopfhammer') { const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), paperMaterial('#8a6a3a', { seed: 91 })); const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.08), paperMaterial('#6a6a70', { seed: 92 })); head.position.y = 0.15; g.add(h, head); }
    else if (tool === 'axt') { const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.05), paperMaterial('#8a6a3a', { seed: 91 })); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.03), paperMaterial('#9a9aa0', { seed: 93 })); blade.position.set(0.06, 0.15, 0); g.add(h, blade); }
    else if (tool === 'bohrer' || tool === 'tiefbohrer') { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), paperMaterial('#6a6a70', { seed: 94 })); h.rotation.x = Math.PI / 2; const grip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), paperMaterial('#8a6a3a', { seed: 91 })); g.add(h, grip); }
    else if (tool === 'karren') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.2), paperMaterial('#8a6a3a', { seed: 95 })); g.add(m); }
    return g;
  }

  private lastTools = '';

  /** Called every frame. Returns 'pause' if the pause menu should open, 'result' when the game ended. */
  update(dt: number, frame: number, snap: InputSnapshot): 'continue' | 'pause' | 'result' {
    const state = this.state;
    const me = this.me;
    // sim advance with tick clock for interpolation
    const ticks = this.session.advance(dt);
    this.tickClock = ticks > 0 ? 0 : this.tickClock + dt;
    // log → visuals, sound, toasts
    const entries = this.session.drainLog();
    if (entries.length) { this.view.handleLog(state, entries); this.react(entries); }
    // tools in hand
    if (me) { const key = me.tools.join(','); if (key !== this.lastTools) { this.lastTools = key; const best = carryTool(me).id; this.view.hands.setTool(this.toolMesh(me.tools.includes('bohrer') || me.tools.includes('tiefbohrer') ? (me.tools.includes('tiefbohrer') ? 'tiefbohrer' : 'bohrer') : best)); } }
    // panels toggle
    if (this.panel === 'none' && !this.place) {
      if (snap.pause) return 'pause';
      if (snap.build) { this.panel = 'build'; this.input.unlock(); }
      else if (snap.research) { this.panel = 'research'; this.input.unlock(); }
      else if (snap.plan) { this.panel = 'plan'; this.input.unlock(); }
    } else if (this.panel !== 'none') {
      if (snap.cancel || (snap.build && this.panel === 'build') || (snap.research && this.panel === 'research') || (snap.plan && this.panel === 'plan')) { this.panel = 'none'; this.synth.cancel(); }
    } else if (this.place) {
      if (snap.cancel) { this.place = null; this.view.setPreview(null); this.synth.cancel(); }
    }
    const inPanel = this.panel !== 'none';
    this.input.wantLock = !inPanel;
    this.input.textMode = false;
    // look
    if (!inPanel && (this.input.locked || snap.gamepad)) {
      this.yaw -= snap.lookDX; this.pitch = THREE.MathUtils.clamp(this.pitch - snap.lookDY, -1.3, 1.3);
    }
    // movement → command (world dir from yaw)
    if (me) {
      const mx = inPanel ? 0 : snap.moveX, my = inPanel ? 0 : snap.moveY;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const dx = -sin * my + cos * mx, dz = -cos * my - sin * mx;
      const changed = Math.abs(dx - this.lastMove.dx) > 0.01 || Math.abs(dz - this.lastMove.dz) > 0.01;
      this.moveTimer += dt;
      if (changed || (this.moveTimer > 0.5 && (dx || dz))) { this.session.send({ t: 'move', p: me.id, dx, dz, yaw: this.yaw }); this.lastMove = { dx, dz, yaw: this.yaw }; this.moveTimer = 0; }
      // prediction: extrapolate from the last sim position along the input direction
      const speed = content.economy.walkSpeed * (me.carry > 0 ? content.economy.carryFactor : 1);
      if (me.pos.x !== this.lastSimPos.x || me.pos.z !== this.lastSimPos.z || !this.predicted) { this.lastSimPos = { x: me.pos.x, z: me.pos.z }; this.predicted = { x: me.pos.x, z: me.pos.z }; }
      if (me.moveDir && (dx || dz)) { this.predicted = { x: me.pos.x + dx * speed * Math.min(this.tickClock, 0.12), z: me.pos.z + dz * speed * Math.min(this.tickClock, 0.12) }; }
      if (dx || dz) { this.stepTimer += dt; if (this.stepTimer > 0.42) { this.stepTimer = 0; this.synth.step(); } }
    }
    // world
    const alpha = Math.min(1, this.tickClock / 0.1);
    this.view.update(state, dt, frame, this.session.playerId, this.yaw, this.pitch, this.now(), alpha, this.predicted);
    // interaction
    const pick = this.view.pick(state, this.session.playerId);
    let prompt: string | null = null;
    if (!inPanel && me) prompt = this.interact(snap, pick, me);
    // UI
    this.ui.begin(frame, snap, 'play:' + this.panel);
    this.toasts = this.toasts.filter((x) => x.until > this.now());
    drawHUD(this.ui, state, this.session.playerId, pick, prompt, this.toasts, this.session.speed, this.session.standings(), this.now());
    if (this.scenarioSteps.length > 0) this.drawScenario();
    if (this.place) this.drawPlaceHelp();
    if (this.panel === 'build') this.drawBuildPanel();
    else if (this.panel === 'research') this.drawResearchPanel();
    else if (this.panel === 'plan') this.drawPlanTable();
    else if (this.panel === 'village') this.drawVillagePanel();
    else if (this.panel === 'building') this.drawBuildingPanel();
    this.ui.end();
    this.handleUIActivation();
    // ambient stone grumbles
    this.grumbleTimer -= dt;
    if (this.grumbleTimer <= 0) { this.grumbleTimer = 25 + Math.random() * 30; this.toast(t('stone.' + (state.stone.expression === 'neutral' ? 'neutral' : state.stone.expression)), 'stone', 5); this.synth.grumble(); }
    this.synth.updateMusic(dt, hourOf(state.tick), true);
    if (state.finished && this.now() - (this.finishedAt ?? (this.finishedAt = this.now())) > 4.5) return 'result';
    return 'continue';
  }
  private finishedAt: number | null = null;

  private react(entries: GameState['log']): void {
    const st = this.state;
    for (const e of entries) {
      switch (e.kind) {
        case 'pour': if (e.player === this.session.playerId || Math.random() < 0.3) { this.synth.pour(e.value ?? 10); const T = e.zone !== undefined ? st.stone.zones[e.zone].T : 20; if (T > 55) this.synth.sizzle((T - 55) / 60); } break;
        case 'release': this.synth.pour(e.value ?? 100); this.synth.sizzle(1); break;
        case 'scoop': if (e.player === this.session.playerId) this.synth.scoop(); break;
        case 'thermoschock': this.synth.crack(Math.min(1, (e.value ?? 0) / 8000)); this.toast(t('stone.thermoschock'), 'stone'); this.toast(t('council.thermoschock', { n: Math.round(e.value ?? 0) }), 'council', 4); break;
        case 'freeze': if (Math.random() < 0.3) { this.synth.freeze(); this.toast(t('stone.freeze'), 'stone'); } break;
        case 'steamOk': this.synth.steam(); this.synth.crack(1); this.toast(t('council.steamOk'), 'council'); break;
        case 'steamFail': this.synth.steam(); this.synth.stumble(); this.toast(t('council.steamFail'), 'council'); break;
        case 'charge': this.toast(t('stone.steam'), 'stone'); break;
        case 'stumble': this.synth.stumble(); this.toast(t('council.stumble'), 'council', 3); break;
        case 'drilled': this.synth.drill(); break;
        case 'wedge': this.synth.chop(); this.toast(t('stone.wedge'), 'stone'); break;
        case 'plant': this.toast(t('stone.plant'), 'stone'); break;
        case 'chop': this.synth.chop(); break;
        case 'built': this.synth.popup(); this.toast(t('council.built', { b: t('bld.' + (e.text ?? '')) }), 'council', 4); break;
        case 'build': this.synth.stamp(); break;
        case 'route': this.synth.popup(); break;
        case 'researchDone': this.synth.bell(); this.toast(t('council.researchDone', { r: t('res.' + (e.id ?? '')) }), 'council'); break;
        case 'researchStart': this.synth.stamp(); break;
        case 'milestone': this.synth.coin(); this.toast(t('council.milestone', { pct: Math.round((e.value ?? 0) * 100) }), 'council'); break;
        case 'perkOffer': this.synth.bell(); this.toast(t('council.perkOffer'), 'council', 10); break;
        case 'progress': this.synth.coin(); break;
        case 'event': this.synth.stamp(); this.toast(t('council.event', { e: t('event.' + (e.id ?? '')) }), 'council', 8); break;
        case 'weather': this.toast(t('council.weather', { w: t('weather.' + (e.text ?? '')) }), 'council', 5); break;
        case 'strike': this.toast(t('council.strike'), 'council'); break;
        case 'strikeEnd': this.toast(t('council.strikeEnd'), 'council'); break;
        case 'loan': this.synth.coin(); this.toast(t('council.loan', { n: Math.round(e.value ?? 0) }), 'council'); break;
        case 'lineSet': this.synth.stamp(); this.toast(t('council.lineSet'), 'council', 4); break;
        case 'tapResult': if (e.player === this.session.playerId) { this.synth.crack(0.2); this.toast(t((e.value ?? 1) > 1.05 ? 'stone.tapHollow' : 'stone.tapSolid'), 'stone'); } break;
        case 'inspectionGood': this.synth.coin(); this.toast(t('council.inspectionGood'), 'council'); break;
        case 'inspectionBad': this.synth.cancel(); this.toast(t('council.inspectionBad'), 'council'); break;
        case 'syncCall': this.synth.bell(); this.toast(t('council.syncCall', { p: e.player ?? '', s: Math.round(((e.value ?? 0) - st.tick) / 10) }), 'council', 5); break;
        case 'joined': this.toast(t('council.joined', { p: e.player ?? '' }), 'council', 4); break;
        case 'finished': this.synth.crack(1); this.synth.fanfare(); this.toast(t('stone.finished'), 'stone', 10); this.toast(t('council.finished', { t: `${Math.floor((e.value ?? 0) / 600)} min` }), 'council', 20); break;
      }
    }
  }

  private send(cmd: Command): void { this.session.send(cmd); }

  /** Context interaction; returns the prompt text. */
  private interact(snap: InputSnapshot, pick: Pick, me: GameState['players'][0]): string | null {
    const st = this.state;
    const pid = me.id;
    if (this.place) { this.updatePlacement(snap, pick); return null; }
    const near = pick.dist <= content.economy.interactDistance;
    const digit = this.digitPressed();
    switch (pick.kind) {
      case 'zone': {
        const z = pick.zone!;
        const zone = st.stone.zones[z];
        const actions: { key: string; label: string; cmd: Command | null }[] = [];
        if (me.carry > 0) actions.push({ key: 'E', label: t('action.pour'), cmd: { t: 'pour', p: pid, zone: z } });
        if (me.tools.includes('klopfhammer') && !zone.tapped) actions.push({ key: '1', label: t('action.tap'), cmd: { t: 'tap', p: pid, zone: z } });
        if (me.tools.includes('bohrer') || me.tools.includes('tiefbohrer')) actions.push({ key: '2', label: t('action.drill'), cmd: { t: 'drill', p: pid, zone: z } });
        if (me.tools.includes('tiefbohrer')) actions.push({ key: '3', label: t('action.drillDeep'), cmd: { t: 'drill', p: pid, zone: z, deep: true } });
        if (hasResearch(st, 'quellkeile') && zone.wedges < zone.holes && st.eco.wood >= 1) actions.push({ key: '4', label: t('action.wedge'), cmd: { t: 'wedge', p: pid, zone: z } });
        if (hasResearch(st, 'setzlinge')) actions.push({ key: '5', label: t('action.plant'), cmd: { t: 'plant', p: pid, zone: z } });
        if (hasResearch(st, 'dampfbohrung') && zone.deepHoles > zone.charges.length) actions.push({ key: '6', label: t('action.charge'), cmd: { t: 'charge', p: pid, zone: z } });
        if (z % 4 !== st.stone.line) actions.push({ key: '7', label: t('action.line'), cmd: { t: 'line', p: pid, zone: z } });
        if (st.chains.length > 0 && me.chain) actions.push({ key: '8', label: t('action.leaveChain'), cmd: { t: 'leaveChain', p: pid } });
        if (actions.length === 0) return `${t('hud.zone', { n: z + 1 })}`;
        if (!near) return `${actions.map((a) => `${a.key} ${a.label}`).join(' · ')} (${t('action.tooFar')})`;
        for (const a of actions) if ((a.key === 'E' && snap.use) || (digit === a.key)) { if (a.cmd) { this.send(a.cmd); this.synth.click(); } }
        return actions.map((a) => `[${a.key}] ${a.label}`).join(' · ');
      }
      case 'source': {
        const cap = carryTool(me).carry ?? 2;
        const label = me.carry >= cap - 0.01 ? t('action.pour') : t('action.scoop');
        if (!near) return `${label} (${t('action.tooFar')})`;
        if (snap.use && me.carry < cap - 0.01) { this.send({ t: 'scoop', p: pid, source: pick.id! }); this.synth.click(); }
        const chain = st.chains.find((c) => c.source === pick.id);
        if (chain && !me.chain && digit === '8') this.send({ t: 'joinChain', p: pid, chain: chain.id });
        return `[E] ${t('action.scoop')}${chain && !me.chain ? ` · [8] ${t('action.joinChain')}` : ''}`;
      }
      case 'village': {
        if (!near) return `${t('action.village')} (${t('action.tooFar')})`;
        if (snap.use) { this.panel = 'village'; this.input.unlock(); this.synth.click(); }
        if (me.carry > 0 && digit === '1') this.send({ t: 'sell', p: pid });
        return `[E] ${t('action.village')}${me.carry > 0 ? ` · [1] ${t('action.sell')}` : ''}`;
      }
      case 'forest': {
        if (!me.tools.includes('axt')) return t('bld.baum') + ' – ' + t('tool.axt') + '?';
        if (!near) return `${t('action.chop')} (${t('action.tooFar')})`;
        if (snap.use) { this.send({ t: 'chop', p: pid }); this.synth.click(); }
        return `[E] ${t('action.chop')}`;
      }
      case 'building': {
        const b = st.buildings.find((x) => x.id === pick.id);
        if (!b) return null;
        const name = t('bld.' + b.type);
        if (!near) return `${name} (${t('action.tooFar')})`;
        if (snap.use) { this.selectedBuilding = b.id; this.panel = 'building'; this.input.unlock(); this.synth.click(); }
        if (b.cap > 0 && me.carry > 0 && digit === '1') this.send({ t: 'pourTank', p: pid, building: b.id });
        if (b.cap > 0 && b.liters > 0 && digit === '2') this.send({ t: 'fillFromTank', p: pid, building: b.id });
        return `[E] ${name}${b.cap > 0 ? ` (${Math.round(b.liters)}/${b.cap} ${t('gen.liters')}) · [1] ${t('action.pourTank')} · [2] ${t('action.fillFromTank')}` : ''}${b.condition < 0.6 ? ` · [3] ${t('action.repair')}` : ''}`;
      }
      case 'route': {
        const r = st.routes.find((x) => x.id === pick.id);
        if (!r) return null;
        const name = `${t('route.' + r.kind)} ${Math.round(r.condition * 100)} % · ${r.flow.toFixed(2)} L/s`;
        if (!near) return name;
        if (snap.use) { this.send({ t: 'repair', p: pid, id: r.id }); this.synth.click(); }
        return `[E] ${t('action.repair')} · ${name}`;
      }
      case 'chain': {
        const c = st.chains.find((x) => x.id === pick.id);
        if (!c) return null;
        if (snap.use) { this.send(me.chain ? { t: 'leaveChain', p: pid } : { t: 'joinChain', p: pid, chain: c.id }); this.synth.click(); }
        return `[E] ${me.chain ? t('action.leaveChain') : t('action.joinChain')} · ${c.flow.toFixed(2)} L/s`;
      }
      default: {
        if (me.chain && snap.use) this.send({ t: 'leaveChain', p: pid });
        if (me.carry > 0 && digit === '0') this.send({ t: 'pour', p: pid, zone: st.stone.line });
        return me.chain ? `[E] ${t('action.leaveChain')}` : null;
      }
    }
  }

  private digitPressed(): string | null { return this.input.edgeDigit; }

  // ---------------------------------------------------------------- placement
  startPlacement(mode: PlaceMode): void {
    this.place = mode; this.panel = 'none'; this.view.setPreview(null);
    if (mode && mode.kind === 'building') {
      const def = buildingDef(mode.type);
      const ghost = new THREE.Mesh(new THREE.BoxGeometry(2.4, def?.tank ? 1.6 : 1.8, 2.2), new THREE.MeshBasicMaterial({ color: PALETTE.folie, transparent: true, opacity: 0.4, wireframe: false }));
      this.previewObj = ghost; this.view.setPreview(ghost);
    }
  }

  private updatePlacement(snap: InputSnapshot, pick: Pick): void {
    const st = this.state; const me = this.me!;
    if (!this.place) return;
    if (this.place.kind === 'building') {
      const def = buildingDef(this.place.type)!;
      const gp = this.view.groundPoint();
      const ghost = this.previewObj as THREE.Mesh;
      let zone: number | undefined;
      let pos = gp;
      if (def.zone) { zone = pick.kind === 'zone' ? pick.zone : this.nearestZone(gp); if (zone !== undefined) { const zp = zonePos(st, zone); const d = Math.hypot(zp.x, zp.z); pos = new THREE.Vector3((zp.x / d) * (d + 2), this.view.groundY(zp.x, zp.z), (zp.z / d) * (d + 2)); } }
      if (def.near === 'stone' && pos && Math.hypot(pos.x, pos.z) > st.stone.radius + 14) pos = null;
      if (def.near === 'village' && pos) { const v = landscapeDef(st.landscape).village; pos = new THREE.Vector3(v[0] + 3, this.view.groundY(v[0] + 3, v[1] + 3), v[1] + 3); }
      if (ghost && pos) { ghost.visible = true; ghost.position.copy(pos).add(new THREE.Vector3(0, 0.9, 0)); const ok = st.eco.money >= def.cost && st.eco.wood >= (def.wood ?? 0); (ghost.material as THREE.MeshBasicMaterial).color.set(ok ? PALETTE.folie : PALETTE.stempel); }
      else if (ghost) ghost.visible = false;
      if ((snap.click || snap.use) && pos) { this.send({ t: 'build', p: me.id, type: this.place.type, x: pos.x, z: pos.z, zone }); this.synth.stamp(); this.place = null; this.view.setPreview(null); }
    } else {
      const rm = this.place;
      const gp = this.view.groundPoint();
      // preview line
      const pts = [...rm.points];
      if (gp) pts.push({ x: gp.x, z: gp.z });
      if (pts.length >= 1) {
        const from = rm.from ?? this.nearestSource(pts[0]);
        const to: RouteTarget | null = pts.length >= 2 ? this.routeTargetNear(pts[pts.length - 1]) : null;
        const ev = from && to && pts.length >= 2 ? evaluateRoute(st, rm.routeKind, pts, from, to, rm.pumped) : null;
        const color = ev ? (ev.ok ? PALETTE.folie : PALETTE.stempel) : PALETTE.pappeDunkel;
        const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, this.view.groundY(p.x, p.z) + 0.5, p.z)));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
        const g = new THREE.Group(); g.add(line);
        for (const p of pts) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshBasicMaterial({ color })); m.position.set(p.x, this.view.groundY(p.x, p.z) + 0.5, p.z); g.add(m); }
        this.view.setPreview(g);
        this.placeInfo = ev ? `${t('route.' + rm.routeKind)} ${ev.length.toFixed(0)} m · ${t('build.cost')} ${Math.round(ev.cost)} + ${ev.wood} ${t('build.wood')} · ${ev.ok ? t('build.ok') : t('build.notOk')}` : t('build.route');
        if ((snap.click || snap.use) && gp) {
          if (rm.points.length === 0) { const src = this.nearestSource({ x: gp.x, z: gp.z }); if (!src) { this.synth.cancel(); return; } rm.from = src; const spos = this.sourcePos(src); rm.points.push({ x: spos.x, z: spos.z }); }
          else rm.points.push({ x: gp.x, z: gp.z });
          this.synth.click();
        }
        if (snap.rightClick || snap.next) {
          if (rm.points.length >= 2 && rm.from) {
            const tgt = this.routeTargetNear(rm.points[rm.points.length - 1]);
            if (tgt) { const end = tgt.kind === 'zone' ? zonePos(st, tgt.zone) : st.buildings.find((b) => b.id === (tgt as { id: string }).id)!.pos; rm.points[rm.points.length - 1] = { x: end.x, z: end.z }; this.send({ t: 'route', p: me.id, kind: rm.routeKind, points: rm.points, from: rm.from, to: tgt, pumped: rm.pumped }); this.synth.stamp(); }
            else this.synth.cancel();
          }
          this.place = null; this.view.setPreview(null);
        }
      }
    }
  }
  placeInfo = '';

  private nearestZone(p: THREE.Vector3 | null): number | undefined {
    if (!p) return undefined;
    const a = Math.atan2(p.x, p.z);
    return ((Math.round((a / (Math.PI * 2)) * 8) % 8) + 8) % 8;
  }
  private nearestSource(p: { x: number; z: number }): string | null {
    let best: string | null = null, bd = 12;
    for (const s of this.state.sources) { if (!s.unlocked || s.kind === 'regen' || s.kind === 'tau') continue; const d = dist(s.pos, p); if (d < bd) { bd = d; best = s.id; } }
    for (const b of this.state.buildings) { if (b.cap <= 0) continue; const d = dist(b.pos, p); if (d < bd) { bd = d; best = b.id; } }
    return best;
  }
  private sourcePos(id: string): { x: number; z: number } {
    const s = this.state.sources.find((x) => x.id === id); if (s) return s.pos;
    const b = this.state.buildings.find((x) => x.id === id); return b ? b.pos : { x: 0, z: 0 };
  }
  private routeTargetNear(p: { x: number; z: number }): RouteTarget | null {
    for (const b of this.state.buildings) if ((b.cap > 0 || b.type === 'strahlwerk') && dist(b.pos, p) < 6) return { kind: 'building', id: b.id };
    if (Math.hypot(p.x, p.z) < this.state.stone.radius + 8) return { kind: 'zone', zone: this.nearestZone(new THREE.Vector3(p.x, 0, p.z))! };
    return null;
  }

  private drawPlaceHelp(): void {
    const W = this.ui.canvas.width, H = this.ui.canvas.height;
    const text = this.place?.kind === 'building' ? `${t('bld.' + this.place.type)} – ${t('build.place')}` : this.placeInfo || t('build.route');
    const pw = this.ui.measure(text, 14) + 40;
    this.ui.panel(W / 2 - pw / 2, H - 120, pw, 34);
    this.ui.label(text, W / 2, H - 98, 14, PALETTE.tinte, 'center');
  }

  // ---------------------------------------------------------------- panels
  private pendingAction: (() => void) | null = null;
  private handleUIActivation(): void {
    if (this.pendingAction) { const a = this.pendingAction; this.pendingAction = null; a(); }
  }
  private act(id: string, fn: () => void): void { if (this.ui.activated === id) this.pendingAction = fn; }

  private drawBuildPanel(): void {
    const ui = this.ui, st = this.state, me = this.me!;
    const W = ui.canvas.width, H = ui.canvas.height;
    const px = Math.max(20, W / 2 - 420), py = 60, pw = Math.min(840, W - 40), ph = H - 120;
    ui.panel(px, py, pw, ph);
    ui.label(t('build.title'), px + 20, py + 34, 22);
    ui.label(`${t('hud.money')} ${Math.floor(st.eco.money)} · ${t('hud.wood')} ${Math.floor(st.eco.wood)}`, px + pw - 20, py + 34, 14, '#5a4a3a', 'right');
    let y = py + 60; const colW = (pw - 60) / 2;
    ui.label(t('build.routes'), px + 20, y + 16, 15, '#5a4a3a'); y += 24;
    const routeOpts: [string, 'rinne' | 'rohr', boolean][] = [['rinne', 'rinne', false], ['rohr', 'rohr', false], ['rohr_pumpe', 'rohr', true]];
    for (const [id, kind, pumped] of routeOpts) {
      const def = content.routes[kind];
      const ok = hasResearch(st, def.requires) && (!pumped || hasResearch(st, content.routes.pumpe.requires));
      const label = `${t('route.' + kind)}${pumped ? ' + ' + t('route.pumpe') : ''}  ${def.costPerM}/m${def.woodPerM ? ` + ${def.woodPerM} ${t('build.wood')}/m` : ''}${pumped ? ` + ${content.routes.pumpe.cost}` : ''}${ok ? '' : ' – ' + t('build.locked')}`;
      if (ui.button('route:' + id, px + 20, y, colW, 34, label, !ok)) this.act('route:' + id, () => this.startPlacement({ kind: 'route', routeKind: kind, pumped, points: [], from: null }));
      y += 40;
    }
    y += 6; ui.label(t('build.buildings'), px + 20, y + 16, 15, '#5a4a3a'); y += 24;
    const startY = y; let col = 0;
    for (const b of content.buildings) {
      const ok = hasResearch(st, b.requires) && (b.needs !== 'waterwheel' || landscapeDef(st.landscape).waterwheel);
      const afford = st.eco.money >= b.cost && st.eco.wood >= (b.wood ?? 0);
      const label = `${t('bld.' + b.id)}  ${b.cost}${b.wood ? ` + ${b.wood} ${t('build.wood')}` : ''}${ok ? '' : ' – ' + t('build.locked')}`;
      const x = px + 20 + col * (colW + 20);
      if (ui.button('bld:' + b.id, x, y, colW, 32, label, !ok || !afford)) this.act('bld:' + b.id, () => this.startPlacement({ kind: 'building', type: b.id }));
      col++; if (col === 2) { col = 0; y += 38; }
      if (y > py + ph - 60) break;
    }
    void startY; void me;
    if (ui.button('close', px + pw - 140, py + ph - 48, 120, 34, t('plan.close'))) this.act('close', () => { this.panel = 'none'; });
  }

  private drawResearchPanel(): void {
    const ui = this.ui, st = this.state, me = this.me!;
    const W = ui.canvas.width, H = ui.canvas.height;
    const px = Math.max(20, W / 2 - 460), py = 50, pw = Math.min(920, W - 40), ph = H - 100;
    ui.panel(px, py, pw, ph);
    ui.label(t('research.title'), px + 20, py + 34, 22);
    ui.label(`${t('hud.money')} ${Math.floor(st.eco.money)}`, px + pw - 20, py + 34, 14, '#5a4a3a', 'right');
    if (st.research.offered) {
      ui.label(t('research.perk'), px + 20, py + 64, 15, PALETTE.stempel);
      st.research.offered.forEach((pk, i) => { if (ui.button('perk:' + pk, px + 20 + i * ((pw - 60) / 3 + 10), py + 76, (pw - 60) / 3, 36, t('perk.' + pk))) this.act('perk:' + pk, () => { this.send({ t: 'perk', p: me.id, id: pk }); this.synth.stamp(); }); });
    }
    const branches = ['wasser', 'kraft', 'hitze', 'kaelte', 'werk', 'gruen', 'handel', 'tropfen'];
    const colW = (pw - 40) / 4 - 10;
    const top = py + (st.research.offered ? 130 : 66);
    branches.forEach((br, bi) => {
      const x = px + 20 + (bi % 4) * (colW + 10);
      let y = top + Math.floor(bi / 4) * ((ph - 120) / 2);
      ui.label(t('branch.' + br), x, y + 14, 14, '#5a4a3a'); y += 22;
      for (const n of content.research.nodes.filter((r) => r.branch === br)) {
        const done = st.research.done.includes(n.id);
        const current = st.research.current?.id === n.id;
        const reqOk = n.requires.every((req) => req.split('|').some((a) => st.research.done.includes(a)));
        const label = done ? `✓ ${t('res.' + n.id)}` : current ? `… ${t('res.' + n.id)}` : `${t('res.' + n.id)} ${n.cost}`;
        const disabled = done || current || !reqOk || !!st.research.current || st.eco.money < n.cost;
        if (ui.button('res:' + n.id, x, y, colW, 28, label, disabled)) this.act('res:' + n.id, () => { this.send({ t: 'research', p: me.id, id: n.id }); this.synth.stamp(); });
        y += 32;
      }
    });
    if (ui.button('close', px + pw - 140, py + ph - 48, 120, 34, t('plan.close'))) this.act('close', () => { this.panel = 'none'; });
  }

  private drawVillagePanel(): void {
    const ui = this.ui, st = this.state, me = this.me!;
    const W = ui.canvas.width, H = ui.canvas.height;
    const px = Math.max(20, W / 2 - 400), py = 60, pw = Math.min(800, W - 40), ph = H - 120;
    ui.panel(px, py, pw, ph);
    ui.label(t('action.village'), px + 20, py + 34, 22);
    ui.label(`${t('hud.money')} ${Math.floor(st.eco.money)} · ${t('hud.wood')} ${Math.floor(st.eco.wood)} · ${t('hud.loan')} ${Math.round(st.eco.loan)}`, px + pw - 20, py + 34, 14, '#5a4a3a', 'right');
    const colW = (pw - 60) / 2;
    let y = py + 60;
    ui.label(t('build.tools'), px + 20, y + 16, 15, '#5a4a3a');
    ui.label(t('build.workers'), px + 40 + colW, y + 16, 15, '#5a4a3a'); y += 24;
    let yl = y, yr = y;
    for (const tool of content.tools) {
      if (tool.id === 'haende') continue;
      const has = me.tools.includes(tool.id);
      const ok = hasResearch(st, tool.requires);
      const label = has ? `${t('tool.' + tool.id)} – ${t('gen.ok')}` : `${t('tool.' + tool.id)}  ${tool.cost}${ok ? '' : ' – ' + t('build.locked')}`;
      if (ui.button('tool:' + tool.id, px + 20, yl, colW, 32, label, has || !ok || st.eco.money < tool.cost)) this.act('tool:' + tool.id, () => { this.send({ t: 'buyTool', p: me.id, tool: tool.id }); this.synth.coin(); });
      yl += 36;
    }
    for (const held of me.tools.filter((x) => x !== 'haende')) { if (ui.button('drop:' + held, px + 20, yl, colW, 30, `${t('tool.' + held)} ✗`)) this.act('drop:' + held, () => this.send({ t: 'dropTool', p: me.id, tool: held })); yl += 34; }
    const [la, lb] = [st.stone.line, st.stone.line + 4];
    const src = st.sources.find((s) => s.unlocked && s.kind !== 'regen' && s.kind !== 'tau')?.id ?? 'fluss';
    const tasks: [string, WorkerTask][] = [[`${t('task.carry')} → ${t('hud.zone', { n: la + 1 })}`, { type: 'carry', source: src, target: { kind: 'zone', zone: la } }], [`${t('task.carry')} → ${t('hud.zone', { n: lb + 1 })}`, { type: 'carry', source: src, target: { kind: 'zone', zone: lb } }], [`${t('task.carry')} → ${t('action.sell')}`, { type: 'carry', source: src, target: { kind: 'village' } }]];
    for (const wd of content.workers) {
      const ok = hasResearch(st, wd.requires);
      const label = `${t('worker.' + wd.id)}  ${wd.hire} + ${wd.wage}/${t('hud.day', { n: '' }).trim()}${ok ? '' : ' – ' + t('build.locked')}`;
      const full = st.workers.length >= st.eco.workerSlots;
      if (ui.button('hire:' + wd.id, px + 40 + colW, yr, colW, 32, label, !ok || full || st.eco.money < wd.hire)) this.act('hire:' + wd.id, () => { const task: WorkerTask = wd.id === 'wart' ? { type: 'maintain' } : wd.id === 'bohrtrupp' ? { type: 'drill', zone: la, deep: false } : tasks[0][1]; this.send({ t: 'hire', p: me.id, kind: wd.id, task }); this.synth.coin(); });
      yr += 36;
    }
    yr += 8;
    const wp = woodPrice(st);
    if (ui.button('wood', px + 40 + colW, yr, colW, 32, `${t('build.buyWood')} ×5  ${Math.round(wp * 5)}`, st.eco.money < wp * 5)) this.act('wood', () => { this.send({ t: 'buyWood', p: me.id, amount: 5 }); this.synth.coin(); }); yr += 36;
    const sp = landscapeDef(st.landscape).sandPrice;
    if (ui.button('sand', px + 40 + colW, yr, colW, 32, `${t('build.buySand')} ×10  ${sp * 10}`, st.eco.money < sp * 10)) this.act('sand', () => { this.send({ t: 'buySand', p: me.id, amount: 10 }); this.synth.coin(); }); yr += 36;
    const loanMax = hasResearch(st, 'buergschaft') ? content.economy.loan.maxBuergschaft : content.economy.loan.max;
    if (ui.button('loan', px + 40 + colW, yr, colW, 32, `${t('build.loan')} 100 (${Math.round(st.eco.loan)}/${loanMax})`, st.eco.loan + 100 > loanMax)) this.act('loan', () => { this.send({ t: 'loan', p: me.id, amount: 100 }); this.synth.coin(); }); yr += 36;
    if (ui.button('repay', px + 40 + colW, yr, colW, 32, `${t('build.repay')} 100`, st.eco.loan <= 0 || st.eco.money < 100)) this.act('repay', () => { this.send({ t: 'repay', p: me.id, amount: 100 }); this.synth.coin(); }); yr += 36;
    if (me.carry > 0 && ui.button('sell', px + 40 + colW, yr, colW, 32, `${t('action.sell')} (${me.carry.toFixed(0)} ${t('gen.liters')})`)) this.act('sell', () => { this.send({ t: 'sell', p: me.id }); this.synth.coin(); });
    if (ui.button('close', px + pw - 140, py + ph - 48, 120, 34, t('plan.close'))) this.act('close', () => { this.panel = 'none'; });
  }

  private drawBuildingPanel(): void {
    const ui = this.ui, st = this.state, me = this.me!;
    const b = st.buildings.find((x) => x.id === this.selectedBuilding);
    if (!b) { this.panel = 'none'; return; }
    const W = ui.canvas.width, H = ui.canvas.height;
    const px = W / 2 - 240, py = H / 2 - 160, pw = 480, ph = 320;
    ui.panel(px, py, pw, ph);
    ui.label(t('bld.' + b.type), px + 20, py + 34, 22);
    let y = py + 60;
    const def = buildingDef(b.type);
    if (b.cap > 0) {
      ui.label(`${Math.round(b.liters)} / ${b.cap} ${t('gen.liters')} · ${b.temp.toFixed(0)} °C`, px + 20, y + 14, 14, '#5a4a3a'); y += 24;
      if (ui.button('bpour', px + 20, y, 210, 32, t('action.pourTank'), me.carry <= 0)) this.act('bpour', () => this.send({ t: 'pourTank', p: me.id, building: b.id }));
      if (ui.button('bfill', px + 250, y, 210, 32, t('action.fillFromTank'), b.liters <= 0)) this.act('bfill', () => this.send({ t: 'fillFromTank', p: me.id, building: b.id }));
      y += 40;
      const outZones = ['–', ...Array.from({ length: 8 }, (_, i) => t('hud.zone', { n: i + 1 }))];
      const cur = b.out ? b.out.zone + 1 : 0;
      const next = ui.select('bout', px + 20, y, 440, 32, t('action.setOut'), outZones, cur);
      if (next !== cur) this.pendingAction = () => this.send({ t: 'setOut', p: me.id, building: b.id, zone: next === 0 ? null : next - 1, rate: b.out?.rate ?? 0.4 });
      y += 40;
      const rate = ui.slider('brate', px + 20, y, 440, 32, `${t('action.setOut')} L/s`, b.out?.rate ?? 0.4, 0.05, 3, 0.05);
      if (b.out && Math.abs(rate - b.out.rate) > 0.01) this.pendingAction = () => this.send({ t: 'setOut', p: me.id, building: b.id, zone: b.out!.zone, rate });
      y += 40;
      if (def?.valve) { const rz = st.stone.zones.reduce((bi, z, i) => (z.T > st.stone.zones[bi].T && i % 4 === st.stone.line ? i : bi), st.stone.line); if (ui.button('brelease', px + 20, y, 440, 34, `${t('action.release')} → ${t('hud.zone', { n: rz + 1 })} (${Math.round(b.liters)} ${t('gen.liters')})`, b.liters <= 0)) this.act('brelease', () => { this.send({ t: 'release', p: me.id, building: b.id, zone: rz, liters: b.liters }); this.panel = 'none'; }); y += 40; }
    }
    if (b.type === 'tretmuehle') { ui.label(`${t('hud.workers')}: ${b.workers.length}`, px + 20, y + 14, 14, '#5a4a3a'); y += 24; const idle = st.workers.find((w) => !w.task || w.task.type === 'carry'); if (ui.button('btread', px + 20, y, 440, 32, t('task.tread'), !idle)) this.act('btread', () => this.send({ t: 'assign', p: me.id, worker: idle!.id, task: { type: 'tread', building: b.id } })); y += 40; }
    if (ui.button('brepair', px + 20, y, 210, 32, `${t('action.repair')} (${Math.round(b.condition * 100)} %)`, b.condition > 0.95)) this.act('brepair', () => this.send({ t: 'repair', p: me.id, id: b.id }));
    if (ui.button('bdemolish', px + 250, y, 210, 32, '✗', false)) this.act('bdemolish', () => { this.send({ t: 'demolish', p: me.id, id: b.id }); this.panel = 'none'; });
    if (ui.button('close', px + pw - 140, py + ph - 48, 120, 34, t('plan.close'))) this.act('close', () => { this.panel = 'none'; });
  }

  private drawPlanTable(): void {
    const ui = this.ui, st = this.state, me = this.me!;
    const W = ui.canvas.width, H = ui.canvas.height;
    const px = 20, py = 20, pw = W - 40, ph = H - 40;
    ui.panel(px, py, pw, ph, false, '#e8d6ad');
    ui.label(t('plan.title'), px + 20, py + 34, 22);
    // map: top-down, 320 m square
    const mapS = Math.min(ph - 80, pw * 0.55), mx = px + 20, my = py + 50;
    const ctx = ui.ctx;
    const land = landscapeDef(st.landscape);
    const cells = 48;
    for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
      const x = -150 + (i + 0.5) * (300 / cells), z = -150 + (j + 0.5) * (300 / cells);
      const h = this.view.groundY(x, z);
      const shade = Math.max(0, Math.min(1, (h + 10) / 30));
      ctx.fillStyle = `rgb(${Math.round(180 + shade * 40)},${Math.round(150 + shade * 40)},${Math.round(100 + shade * 30)})`;
      ctx.fillRect(mx + (i / cells) * mapS, my + ((cells - 1 - j) / cells) * mapS, mapS / cells + 1, mapS / cells + 1);
    }
    const toMap = (x: number, z: number) => ({ x: mx + ((x + 150) / 300) * mapS, y: my + ((150 - z) / 300) * mapS });
    ctx.strokeStyle = PALETTE.tinte; ctx.lineWidth = 1.5; ctx.strokeRect(mx, my, mapS, mapS);
    // sources
    for (const s of st.sources) { if (s.kind === 'regen' || s.kind === 'tau') continue; const p = toMap(s.pos.x, s.pos.z); ctx.fillStyle = PALETTE.folie; ctx.beginPath(); ctx.arc(p.x, p.y, s.kind === 'meer' ? 14 : 6, 0, Math.PI * 2); ctx.fill(); ui.label(s.id, p.x + 8, p.y + 4, 10, '#2f6fb3'); }
    // routes
    for (const r of st.routes) { ctx.strokeStyle = r.kind === 'rinne' ? '#a8875a' : '#4a4a56'; ctx.lineWidth = r.condition < 0.3 ? 1 : 3; ctx.beginPath(); r.points.forEach((p, i) => { const q = toMap(p.x, p.z); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }); ctx.stroke(); }
    for (const c of st.chains) { const s = st.sources.find((x) => x.id === c.source); if (!s) continue; const a = toMap(s.pos.x, s.pos.z), b = toMap(0, 0); ctx.setLineDash([4, 4]); ctx.strokeStyle = PALETTE.folie; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); }
    // village, forest
    const v = toMap(land.village[0], land.village[1]); ctx.fillStyle = PALETTE.stempel; ctx.fillRect(v.x - 5, v.y - 5, 10, 10); ui.label('Dorf', v.x + 8, v.y + 4, 10, PALETTE.stempel);
    const f = toMap(land.forest[0], land.forest[1]); ctx.fillStyle = PALETTE.moos; ctx.beginPath(); ctx.arc(f.x, f.y, 8, 0, Math.PI * 2); ctx.fill();
    // buildings
    for (const b of st.buildings) { const p = toMap(b.pos.x, b.pos.z); ctx.fillStyle = PALETTE.pappeDunkel; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); }
    // stone with zones coloured by temperature
    const c0 = toMap(0, 0); const sr = (st.stone.radius / 300) * mapS * 2.2;
    for (let z = 0; z < 8; z++) { const zz = st.stone.zones[z]; const a0 = ((z - 0.5) / 8) * Math.PI * 2, a1 = ((z + 0.5) / 8) * Math.PI * 2; const heat = Math.max(0, Math.min(1, (zz.T + 10) / 130)); ctx.fillStyle = `rgb(${Math.round(120 + heat * 135)},${Math.round(150 - heat * 90)},${Math.round(200 - heat * 160)})`; ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.arc(c0.x, c0.y, sr, -a1 + Math.PI / 2 - Math.PI, -a0 + Math.PI / 2 - Math.PI, true); ctx.closePath(); ctx.fill(); if (z % 4 === st.stone.line) { ctx.strokeStyle = PALETTE.stempel; ctx.lineWidth = 2; ctx.stroke(); } }
    // workers and players
    for (const w of st.workers) { const p = toMap(w.pos.x, w.pos.z); ctx.fillStyle = w.strike ? PALETTE.stempel : '#4f6fa8'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); }
    for (const p of st.players) { const q = toMap(p.pos.x, p.pos.z); ctx.fillStyle = p.id === me.id ? '#d8563c' : '#e8b04a'; ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = PALETTE.tinte; ctx.stroke(); }
    // stats column
    const sx = mx + mapS + 24, sw = pw - mapS - 64;
    let y = py + 60;
    ui.label(t('plan.stats'), sx, y, 16); y += 22;
    const total = METHODS.reduce((a, m) => a + st.stone.dmg[m], 0) || 1;
    for (const m of METHODS) { const sh = st.stone.dmg[m] / total; ui.label(`${t('method.' + m)}`, sx, y + 12, 12); ui.bar(sx + 150, y, Math.max(40, sw - 220), 12, sh, METHOD_COLORS[m]); ui.label(`${Math.round(sh * 100)} %`, sx + sw - 40, y + 12, 11, '#5a4a3a', 'right'); y += 18; }
    y += 8;
    const inc = st.eco.income;
    ui.label(`${t('result.earned')}: ${Math.round(st.eco.earned)} (Rat ${Math.round(inc.council)} · Prämie ${Math.round(inc.premium)} · Verkauf ${Math.round(inc.sale)} · Schaulustige ${Math.round(inc.spectators)})`, sx, y + 12, 11, '#5a4a3a'); y += 18;
    ui.label(`${t('result.spent')}: ${Math.round(st.eco.spent)} · ${t('result.water')}: ${Math.round(st.stats.waterDelivered)} ${t('gen.liters')} · ${t('result.effective')}: ${Math.round(st.stats.waterEffective)}`, sx, y + 12, 11, '#5a4a3a'); y += 18;
    ui.label(`${t('hud.forecast')}: ${t('weather.' + st.weather.today)} → ${st.weather.forecast.map((w) => t('weather.' + w)).join(' → ')}`, sx, y + 12, 11, '#5a4a3a'); y += 26;
    // workers list with task cycling
    ui.label(t('build.workers'), sx, y + 12, 14); y += 20;
    const [la, lb] = [st.stone.line, st.stone.line + 4];
    const src = st.sources.find((s) => s.unlocked && s.kind !== 'regen' && s.kind !== 'tau')?.id ?? 'fluss';
    const taskOptions: [string, WorkerTask][] = [
      [`${t('task.carry')} ${t('hud.zone', { n: la + 1 })}`, { type: 'carry', source: src, target: { kind: 'zone', zone: la } }],
      [`${t('task.carry')} ${t('hud.zone', { n: lb + 1 })}`, { type: 'carry', source: src, target: { kind: 'zone', zone: lb } }],
      [`${t('task.carry')} ${t('action.sell')}`, { type: 'carry', source: src, target: { kind: 'village' } }],
      [t('task.maintain'), { type: 'maintain' }], [t('task.chop'), { type: 'chop' }], [`${t('task.drill')} ${t('hud.zone', { n: la + 1 })}`, { type: 'drill', zone: la, deep: false }], [`${t('task.wedges')} ${t('hud.zone', { n: la + 1 })}`, { type: 'wedges', zone: la }],
    ];
    for (const b of st.buildings.filter((x) => x.cap > 0)) taskOptions.push([`${t('task.carry')} ${t('bld.' + b.type)}`, { type: 'carry', source: src, target: { kind: 'building', id: b.id } }]);
    for (const b of st.buildings.filter((x) => x.type === 'tretmuehle')) taskOptions.push([t('task.tread'), { type: 'tread', building: b.id }]);
    for (const c of st.chains) taskOptions.push([t('task.chain'), { type: 'chain', chain: c.id }]);
    for (const w of st.workers.slice(0, 9)) {
      const cur = taskOptions.findIndex(([, task]) => JSON.stringify(task) === JSON.stringify(w.task));
      const idx = ui.select('wk:' + w.id, sx, y, sw, 26, `${t('worker.' + w.kind)}`, taskOptions.map(([l]) => l), Math.max(0, cur));
      if (idx !== Math.max(0, cur)) this.pendingAction = () => this.send({ t: 'assign', p: me.id, worker: w.id, task: taskOptions[idx][1] });
      y += 30;
      if (y > py + ph - 90) break;
    }
    if (st.workers.length > 0 && ui.button('chain', sx, py + ph - 86, sw / 2 - 10, 30, t('task.chain'), st.chains.length > 0)) this.act('chain', () => this.send({ t: 'chain', p: me.id, source: src, target: { kind: 'zone', zone: la }, workers: st.workers.filter((w) => w.kind === 'traeger').map((w) => w.id) }));
    if (ui.button('sync', sx + sw / 2, py + ph - 86, sw / 2, 30, t('action.syncCall'))) this.act('sync', () => this.send({ t: 'syncCall', p: me.id, inTicks: 100 }));
    if (ui.button('close', px + pw - 140, py + ph - 48, 120, 34, t('plan.close'))) this.act('close', () => { this.panel = 'none'; });
  }

  private drawScenario(): void {
    const ui = this.ui; const W = ui.canvas.width;
    const step = this.scenarioSteps[this.scenarioStep];
    if (!step) { ui.panel(W - 336, 100, 320, 40); ui.label(t('tutorial.done'), W - 320, 126, 14, PALETTE.moos); return; }
    ui.panel(W - 336, 100, 320, 60);
    ui.label(`${t('tutorial.title')} ${this.scenarioStep + 1}/${this.scenarioSteps.length}`, W - 320, 122, 12, '#5a4a3a');
    ui.label(t('tut.' + step.split(':')[0], { x: step.split(':')[1] ?? '' }), W - 320, 144, 13);
  }

  /** Advance scenario steps based on the state. */
  checkScenario(): void {
    const step = this.scenarioSteps[this.scenarioStep];
    if (!step) return;
    const st = this.state, me = this.me!;
    const [k, arg] = step.split(':');
    let done = false;
    switch (k) {
      case 'scoop': done = st.stats.waterScooped > 0; break;
      case 'pour': done = st.stats.waterDelivered > 0; break;
      case 'buyTool': done = me.tools.includes(arg); break;
      case 'hire': done = st.workers.some((w) => w.kind === arg); break;
      case 'line': done = st.stone.zones.some((z) => z.tapped); break;
      case 'research': done = st.research.done.includes(arg); break;
      case 'route': done = st.routes.length > 0; break;
      case 'build': done = st.buildings.some((b) => b.type === arg); break;
      case 'release': done = st.stats.bursts > 0; break;
      case 'freeze': done = st.stats.freezes > 0; break;
      case 'drill': done = st.stone.zones.some((z) => z.holes > 0 || z.deepHoles > 0); break;
      case 'wedge': done = st.stone.zones.some((z) => z.wedges > 0); break;
      case 'charge': done = st.stats.steamOk + st.stats.steamFail > 0; break;
      case 'plant': done = st.stone.zones.some((z) => z.growths.length > 0); break;
      case 'progress': done = st.stone.progress / st.stone.hp >= Number(arg) / 100; break;
    }
    if (done) { this.scenarioStep++; this.synth.bell(); }
  }
}
void toolDef; void workerDef; void researchNode;
export type { MethodId };
