import { content, createGame, dayOf, METHODS, type GameConfig, type MethodId } from '../sim/index';
import scenarios from '../data/scenarios.json';
import { Input } from './game/input';
import { UI } from './ui/widgets';
import { Synth } from './audio/synth';
import { LocalSession, type Session } from './game/session';
import { WorldView } from './game/view';
import { Play } from './game/play';
import { t, setLang, getLang, type Lang } from './i18n';
import { loadSettings, saveSettings, applyQuality, type Settings } from './settings';
import { saveGame, loadGame, clearSave, addBest, loadBest } from './save';
import { PALETTE } from './materials/paper';
import { makeAutopilot } from './autopilot';
import { NetSession, type LobbyInfo } from './net/client';
import { steam } from '../steam/bridge';

type Screen = 'menu' | 'newgame' | 'settings' | 'scenarios' | 'lobby' | 'game' | 'pause' | 'result' | 'best';

interface NewGameForm { seed: string; landscape: number; rock: number; mode: 'solo' | 'coop' | 'race' }

export function startApp(gl: HTMLCanvasElement, ui: HTMLCanvasElement, params: URLSearchParams): void {
  const app = new App(gl, ui, params);
  app.run();
}

class App {
  input: Input;
  ui: UI;
  synth = new Synth();
  settings: Settings;
  screen: Screen = 'menu';
  form: NewGameForm = { seed: Math.random().toString(36).slice(2, 8), landscape: 0, rock: 0, mode: 'solo' };
  session: Session | null = null;
  view: WorldView | null = null;
  play: Play | null = null;
  lobby: LobbyInfo | null = null;
  net: NetSession | null = null;
  roomCode = '';
  lobbyStatus = '';
  private last = performance.now();
  private start = performance.now();
  private autosaveTimer = 0;
  private resultData: { minutes: number; won: boolean; ranking: { name: string; minutes: number | null; pid: string }[] } | null = null;
  private pendingAction: (() => void) | null = null;
  private speedParam: number;
  private demoBot: string | null;

  constructor(public gl: HTMLCanvasElement, public uiCanvas: HTMLCanvasElement, public params: URLSearchParams) {
    this.settings = loadSettings();
    if (params.get('lang')) this.settings.lang = params.get('lang') as Lang;
    if (params.get('gfx') === 'low') { this.settings.quality = 'low'; this.settings.shadows = false; this.settings.particles = 0.5; this.settings.scale = 0.6; }
    setLang(this.settings.lang);
    this.input = new Input(gl);
    this.input.sensitivity = this.settings.sensitivity; this.input.invertY = this.settings.invertY;
    this.ui = new UI(uiCanvas);
    this.speedParam = Number(params.get('speed') ?? 1);
    this.demoBot = params.get('bot');
    const resume = () => { this.synth.init(); this.synth.resume(); this.synth.setVolumes(this.settings.master, this.settings.sfx, this.settings.music); };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
    // direct launch for tests/demos: ?solo=1&seed=..&land=..&rock=..&bot=hitzkopf&speed=60
    if (params.get('solo')) this.newGame({ seed: params.get('seed') ?? 'test', landscape: params.get('land') ?? undefined, rock: params.get('rock') ?? undefined, mode: 'solo' });
    else if (params.get('online')) { this.roomCode = params.get('room') ?? ''; this.screen = 'lobby'; this.connect(params.get('mode') as 'coop' | 'race' | null, params.get('room')); }
    (window as unknown as { __app: App }).__app = this;
  }

  run(): void {
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(this.speedParam > 1 ? 0.6 : 0.1, (now - this.last) / 1000);
      this.last = now;
      const frame = Math.floor(((now - this.start) / 1000) * 8);
      const snap = this.input.poll();
      try { this.tick(dt, frame, snap); } catch (e) { console.error(e); (window as unknown as { __lastError: string }).__lastError = String(e); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private nowSec(): number { return (performance.now() - this.start) / 1000; }

  // ------------------------------------------------------------ game lifecycle
  newGame(cfg: Partial<GameConfig> & { seed: string }, scenario?: (typeof scenarios)[number]): void {
    this.disposeGame();
    const full = { ...cfg, players: cfg.players ?? [{ id: 'p1', name: this.settings.name }] };
    if (scenario) full.moods = scenario.moods;
    const session = new LocalSession(full, 'p1');
    if (scenario) session.state.eco.money = scenario.startMoney;
    this.attachSession(session);
    if (scenario && this.play) this.play.scenarioSteps = scenario.steps;
    if (this.demoBot && this.play) session.providers.push(makeAutopilot('p1', this.demoBot));
    session.speed = this.speedParam;
  }

  private attachSession(session: Session): void {
    this.session = session;
    const vs = applyQuality(this.settings);
    this.view = new WorldView(this.gl, session.state, { shadows: vs.shadows, particles: vs.particles, scale: vs.scale, fov: this.settings.fov });
    this.play = new Play(session, this.view, this.ui, this.input, this.synth, () => this.nowSec());
    this.play.toast(t('council.welcome', { seed: session.state.cfg.seed }), 'council', 12);
    this.screen = 'game';
    this.resultData = null;
    this.input.wantLock = true;
  }

  continueGame(): void {
    const sg = loadGame();
    if (!sg) return;
    this.disposeGame();
    const session = new LocalSession({ seed: sg.state.cfg.seed }, sg.playerId, sg.state);
    this.attachSession(session);
    if (this.play) this.play.yaw = sg.yaw;
  }

  private disposeGame(): void {
    this.session?.dispose(); this.view?.dispose();
    this.session = null; this.view = null; this.play = null; this.net = null;
    this.input.unlock(); this.input.wantLock = false;
  }

  private finishGame(): void {
    if (!this.session) return;
    const st = this.session.state;
    const minutes = (st.finished ? st.finished.tick : st.tick) / 600;
    const standings = this.session.standings();
    const ranking = standings.length > 0 ? standings.map((s) => ({ name: s.name, minutes: s.finished !== null ? s.finished / 600 : null, pid: s.pid })).sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999)) : [{ name: this.settings.name, minutes, pid: this.session.playerId }];
    this.resultData = { minutes, won: !!st.finished, ranking };
    if (st.finished && this.session.mode === 'solo' && !this.demoBot) {
      const total = METHODS.reduce((a, m) => a + st.stone.dmg[m], 0) || 1;
      const main = METHODS.reduce((b, m) => (st.stone.dmg[m] > st.stone.dmg[b] ? m : b), 'tropfen' as MethodId);
      addBest({ seed: st.cfg.seed, landscape: st.landscape, rock: st.stone.rock, minutes, water: st.stats.waterDelivered, money: st.stats.moneySpent, pipes: st.stats.pipeMeters, main, date: new Date().toISOString().slice(0, 10) });
      steam.achievement('METHODE_' + main.toUpperCase());
      steam.leaderboard('zeit', Math.round(minutes * 60)); steam.leaderboard('wasser', Math.round(st.stats.waterDelivered)); steam.leaderboard('billig', Math.round(st.stats.moneySpent));
      if (st.stats.pipeMeters === 0) steam.leaderboard('ohne_rohre', Math.round(minutes * 60));
      void total;
      clearSave();
    }
    this.screen = 'result';
    this.input.unlock(); this.input.wantLock = false;
  }

  // ------------------------------------------------------------ online
  connect(mode: 'coop' | 'race' | null, room: string | null): void {
    this.lobbyStatus = t('lobby.connecting');
    const server = this.params.get('server') ?? this.settings.server;
    const net = new NetSession(server, this.settings.name, {
      onLobby: (info) => { this.lobby = info; this.lobbyStatus = ''; this.roomCode = info.code; },
      onStart: (session) => { this.attachSession(session); const bot = this.demoBot; if (bot) session.providers.push(makeAutopilot(session.playerId, bot)); },
      onError: (msg) => { this.lobbyStatus = msg; },
      onNotice: (key) => { this.play?.toast(t(key), 'council', 4); },
    });
    this.net = net;
    net.connect().then(() => {
      if (room) net.join(room); else net.create(mode ?? 'coop', this.speedParam);
    }).catch(() => { this.lobbyStatus = t('lobby.error'); });
  }

  // ------------------------------------------------------------ frame
  private tick(dt: number, frame: number, snap: ReturnType<Input['poll']>): void {
    if (this.pendingAction) { const a = this.pendingAction; this.pendingAction = null; a(); }
    switch (this.screen) {
      case 'game': {
        if (!this.play) { this.screen = 'menu'; return; }
        const r = this.play.update(dt, frame, snap);
        if (this.play.scenarioSteps.length) this.play.checkScenario();
        this.autosaveTimer += dt;
        if (this.autosaveTimer > 30 && this.session instanceof LocalSession && !this.session.state.finished) { this.autosaveTimer = 0; saveGame({ state: this.session.state, playerId: this.session.playerId, savedAt: Date.now(), yaw: this.play.yaw }); }
        if (r === 'pause') { this.screen = 'pause'; this.input.unlock(); this.input.wantLock = false; if (this.session) this.session.paused = this.session.mode === 'solo'; }
        if (r === 'result') this.finishGame();
        break;
      }
      case 'pause': this.drawPause(frame, snap); break;
      case 'menu': this.drawMenu(frame, snap); break;
      case 'newgame': this.drawNewGame(frame, snap); break;
      case 'settings': this.drawSettings(frame, snap); break;
      case 'scenarios': this.drawScenarios(frame, snap); break;
      case 'lobby': this.drawLobby(frame, snap); break;
      case 'result': this.drawResult(frame, snap); break;
      case 'best': this.drawBest(frame, snap); break;
    }
  }

  private act(id: string, fn: () => void): void { if (this.ui.activated === id) { this.pendingAction = fn; this.synth.confirm(); } }

  private backdrop(frame: number): void {
    const ctx = this.ui.ctx, W = this.ui.canvas.width, H = this.ui.canvas.height;
    ctx.fillStyle = PALETTE.himmelTag; ctx.fillRect(0, 0, W, H);
    // cardboard layers at the bottom
    for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? PALETTE.pappe : PALETTE.pappeDunkel; const y = H - 40 - i * 34 + Math.sin(frame / 7 + i) * 2; ctx.fillRect(0, y, W, 40); }
    // the stone silhouette with eyes
    ctx.fillStyle = '#7a6a60'; ctx.beginPath(); ctx.ellipse(W * 0.72, H * 0.62, 150, 120, 0, 0, Math.PI * 2); ctx.fill();
    for (const ex of [W * 0.66, W * 0.76]) { ctx.fillStyle = PALETTE.papier; ctx.beginPath(); ctx.arc(ex, H * 0.56, 22, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = PALETTE.tinte; ctx.beginPath(); ctx.arc(ex + Math.sin(frame / 5) * 6, H * 0.56 + 4, 9, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = PALETTE.tinte; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(W * 0.68, H * 0.68); ctx.quadraticCurveTo(W * 0.71, H * 0.7, W * 0.75, H * 0.675); ctx.stroke();
    // sun on a stick
    ctx.strokeStyle = '#b08a5a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(W * 0.15, H); ctx.lineTo(W * 0.15, H * 0.25); ctx.stroke();
    ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(W * 0.15, H * 0.2, 46, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = PALETTE.tinte; ctx.lineWidth = 2; ctx.stroke();
  }

  private drawMenu(frame: number, snap: ReturnType<Input['poll']>): void {
    const ui = this.ui; ui.begin(frame, snap, 'menu'); this.backdrop(frame);
    const W = ui.canvas.width;
    ui.panel(40, 40, 520, 70); ui.label(t('title'), 60, 88, 30);
    const x = 60, w = 300; let y = 140;
    const items: [string, string, () => void][] = [
      ['new', t('menu.newgame'), () => { this.screen = 'newgame'; }],
      ['cont', t('menu.continue'), () => this.continueGame()],
      ['online', t('menu.online'), () => { this.screen = 'lobby'; this.lobby = null; this.lobbyStatus = ''; }],
      ['scen', t('menu.scenarios'), () => { this.screen = 'scenarios'; }],
      ['daily', t('menu.daily'), () => { const d = new Date().toISOString().slice(0, 10); this.newGame({ seed: 'tag-' + d, mode: 'solo' }); }],
      ['best', t('menu.leaderboards'), () => { this.screen = 'best'; }],
      ['settings', t('menu.settings'), () => { this.screen = 'settings'; }],
    ];
    for (const [id, label, fn] of items) { const disabled = id === 'cont' && !loadGame(); if (ui.button(id, x, y, w, 44, label, disabled)) this.act(id, fn); y += 52; }
    ui.label(t('settings.keys'), 60, ui.canvas.height - 20, 11, '#5a4a3a');
    ui.label('v0.1 · ' + t('menu.credits'), W - 20, ui.canvas.height - 20, 11, '#5a4a3a', 'right');
    ui.end();
  }

  private drawNewGame(frame: number, snap: ReturnType<Input['poll']>): void {
    const ui = this.ui; ui.begin(frame, snap, 'newgame'); this.backdrop(frame);
    ui.panel(40, 40, 520, 70); ui.label(t('menu.newgame'), 60, 88, 28);
    const x = 60, w = 420; let y = 140;
    this.input.textMode = true;
    this.form.seed = ui.textInput('seed', x, y, w, 44, t('menu.seed'), this.form.seed, 16); y += 52;
    const lands = [t('menu.random'), ...content.landscapes.map((l) => t('land.' + l.id))];
    this.form.landscape = ui.select('land', x, y, w, 44, t('menu.landscape'), lands, this.form.landscape); y += 52;
    const rocks = [t('menu.random'), ...content.rocks.map((r) => t('rock.' + r.id))];
    this.form.rock = ui.select('rock', x, y, w, 44, t('menu.rock'), rocks, this.form.rock); y += 52;
    if (ui.button('start', x, y, w, 48, t('menu.start'))) this.act('start', () => this.newGame({ seed: this.form.seed || 'stein', landscape: this.form.landscape ? content.landscapes[this.form.landscape - 1].id : undefined, rock: this.form.rock ? content.rocks[this.form.rock - 1].id : undefined, mode: 'solo' })); y += 56;
    if (ui.button('back', x, y, w, 44, t('menu.back')) || snap.cancel) this.act('back', () => { this.screen = 'menu'; });
    if (snap.cancel) this.pendingAction = () => { this.screen = 'menu'; };
    ui.end();
    this.input.textMode = ui.textFocused;
  }

  private drawSettings(frame: number, snap: ReturnType<Input['poll']>): void {
    const ui = this.ui; ui.begin(frame, snap, 'settings'); this.backdrop(frame);
    ui.panel(40, 40, 520, 70); ui.label(t('settings.title'), 60, 88, 28);
    const s = this.settings; const x = 60, w = 460; let y = 130;
    const langs: Lang[] = ['de', 'en'];
    const li = ui.select('lang', x, y, w, 40, t('settings.language'), ['Deutsch', 'English'], langs.indexOf(s.lang)); if (langs[li] !== s.lang) { s.lang = langs[li]; setLang(s.lang); } y += 46;
    const quals: Settings['quality'][] = ['low', 'medium', 'high'];
    const qi = ui.select('quality', x, y, w, 40, t('settings.quality'), quals.map((q) => t('settings.' + q)), quals.indexOf(s.quality)); s.quality = quals[qi]; y += 46;
    s.shadows = ui.toggle('shadows', x, y, w, 40, t('settings.shadows'), s.shadows, t('settings.on'), t('settings.off')); y += 46;
    s.particles = ui.slider('particles', x, y, w, 40, t('settings.particles'), s.particles, 0, 1, 0.5); y += 46;
    s.scale = ui.slider('scale', x, y, w, 40, t('settings.scale'), s.scale, 0.5, 1, 0.1); y += 46;
    s.fov = ui.slider('fov', x, y, w, 40, t('settings.fov'), s.fov, 55, 95, 5); y += 46;
    s.master = ui.slider('master', x, y, w, 40, t('settings.master'), s.master, 0, 1, 0.1); y += 46;
    s.sfx = ui.slider('sfx', x, y, w, 40, t('settings.sfx'), s.sfx, 0, 1, 0.1); y += 46;
    s.music = ui.slider('music', x, y, w, 40, t('settings.music'), s.music, 0, 1, 0.1); y += 46;
    s.sensitivity = ui.slider('sens', x, y, w, 40, t('settings.sensitivity'), s.sensitivity, 0.2, 3, 0.1); y += 46;
    s.invertY = ui.toggle('inv', x, y, w, 40, t('settings.invertY'), s.invertY, t('settings.on'), t('settings.off')); y += 46;
    this.input.textMode = true;
    s.name = ui.textInput('name', x, y, w, 40, t('lobby.name'), s.name, 16); y += 46;
    s.server = ui.textInput('server', x, y, w, 40, t('lobby.server'), s.server, 60); y += 52;
    if (ui.button('back', x, y, w, 44, t('menu.back')) || snap.cancel) this.pendingAction = () => { saveSettings(s); this.input.sensitivity = s.sensitivity; this.input.invertY = s.invertY; this.synth.setVolumes(s.master, s.sfx, s.music); this.screen = this.session ? 'pause' : 'menu'; };
    ui.label(t('settings.keys'), 60, ui.canvas.height - 20, 11, '#5a4a3a');
    ui.end();
    this.input.textMode = ui.textFocused;
  }

  private drawScenarios(frame: number, snap: ReturnType<Input['poll']>): void {
    const ui = this.ui; ui.begin(frame, snap, 'scenarios'); this.backdrop(frame);
    ui.panel(40, 40, 520, 70); ui.label(t('menu.scenarios'), 60, 88, 28);
    const x = 60, w = 420; let y = 130;
    for (const sc of scenarios) {
      const label = sc.method ? `${t('method.' + sc.method)} · ${t('land.' + sc.landscape)}` : `${t('tutorial.title')}: ${t('menu.newgame')}`;
      if (ui.button('sc:' + sc.id, x, y, w, 40, label)) this.act('sc:' + sc.id, () => this.newGame({ seed: sc.seed, landscape: sc.landscape, rock: sc.rock, mode: 'solo' }, sc));
      y += 46;
    }
    y += 10;
    if (ui.button('back', x, y, w, 44, t('menu.back')) || snap.cancel) this.pendingAction = () => { this.screen = 'menu'; };
    ui.end();
  }

  private drawBest(frame: number, snap: ReturnType<Input['poll']>): void {
    const ui = this.ui; ui.begin(frame, snap, 'best'); this.backdrop(frame);
    ui.panel(40, 40, 520, 70); ui.label(t('menu.leaderboards'), 60, 88, 28);
    const list = loadBest();
    const cats: [string, (a: (typeof list)[number]) => number, (a: (typeof list)[number]) => boolean][] = [
      ['result.scoring.time', (a) => a.minutes, () => true], ['result.scoring.water', (a) => a.water, () => true], ['result.scoring.cheap', (a) => a.money, () => true], ['result.scoring.nopipes', (a) => a.minutes, (a) => a.pipes === 0],
    ];
    let x = 60;
    for (const [key, val, filt] of cats) {
      ui.panel(x, 130, 280, 260);
      ui.label(t(key), x + 14, 154, 15);
      const rows = list.filter(filt).sort((a, b) => val(a) - val(b)).slice(0, 8);
      rows.forEach((r, i) => ui.label(`${i + 1}. ${t('land.' + r.landscape)}/${t('rock.' + r.rock)} ${key === 'result.scoring.water' ? Math.round(r.water) + ' L' : key === 'result.scoring.cheap' ? Math.round(r.money) : r.minutes.toFixed(1) + ' min'}`, x + 14, 180 + i * 24, 12, '#5a4a3a'));
      x += 290;
      if (x + 280 > ui.canvas.width) break;
    }
    if (ui.button('back', 60, 410, 300, 44, t('menu.back')) || snap.cancel) this.pendingAction = () => { this.screen = 'menu'; };
    ui.end();
  }

  private drawLobby(frame: number, snap: ReturnType<Input['poll']>): void {
    const ui = this.ui; ui.begin(frame, snap, 'lobby'); this.backdrop(frame);
    ui.panel(40, 40, 520, 70); ui.label(t('lobby.title'), 60, 88, 28);
    const x = 60, w = 420; let y = 130;
    if (!this.net || !this.lobby) {
      this.input.textMode = true;
      this.roomCode = ui.textInput('code', x, y, w, 44, t('lobby.code'), this.roomCode, 6).toUpperCase(); y += 52;
      if (ui.button('join', x, y, w, 44, t('lobby.join'), this.roomCode.length < 4)) this.act('join', () => this.connect(null, this.roomCode)); y += 52;
      if (ui.button('coop', x, y, w, 44, `${t('lobby.create')} – ${t('menu.coop')}`)) this.act('coop', () => this.connect('coop', null)); y += 52;
      if (ui.button('race', x, y, w, 44, `${t('lobby.create')} – ${t('menu.race')}`)) this.act('race', () => this.connect('race', null)); y += 52;
      if (this.lobbyStatus) { ui.label(this.lobbyStatus, x, y + 20, 14, PALETTE.stempel); y += 40; }
    } else {
      const lb = this.lobby;
      ui.label(`${t('lobby.code')}: ${lb.code}   ${t('lobby.mode')}: ${t('menu.' + lb.mode)}`, x, y + 20, 18); y += 40;
      ui.label(`${t('lobby.players')}:`, x, y + 16, 14, '#5a4a3a'); y += 24;
      for (const p of lb.players) { ui.label(`• ${p.name}${p.id === lb.host ? ' (' + t('lobby.host') + ')' : ''}`, x + 10, y + 16, 14); y += 22; }
      y += 10;
      if (lb.host === this.net.playerId) { if (ui.button('start', x, y, w, 48, t('menu.start'))) this.act('start', () => this.net?.start()); y += 56; }
      else { ui.label(t('lobby.waiting'), x, y + 16, 14, '#5a4a3a'); y += 40; }
    }
    if (ui.button('back', x, y, w, 44, t('menu.back')) || snap.cancel) this.pendingAction = () => { this.net?.close(); this.net = null; this.lobby = null; this.screen = 'menu'; };
    ui.end();
    this.input.textMode = ui.textFocused;
  }

  private drawPause(frame: number, snap: ReturnType<Input['poll']>): void {
    const ui = this.ui; ui.begin(frame, snap, 'pause');
    const W = ui.canvas.width, H = ui.canvas.height;
    ui.ctx.fillStyle = 'rgba(28,36,64,0.35)'; ui.ctx.fillRect(0, 0, W, H);
    const x = W / 2 - 160, w = 320; let y = H / 2 - 150;
    ui.panel(x - 20, y - 60, w + 40, 330); ui.label(t('pause.title'), x + w / 2, y - 20, 26, PALETTE.tinte, 'center');
    const resume = () => { this.screen = 'game'; if (this.session) this.session.paused = false; this.input.wantLock = true; };
    if (ui.button('resume', x, y, w, 44, t('pause.resume')) || snap.cancel) this.pendingAction = resume; y += 52;
    if (ui.button('save', x, y, w, 44, t('pause.save'), !(this.session instanceof LocalSession))) this.act('save', () => { if (this.session instanceof LocalSession && this.play) { saveGame({ state: this.session.state, playerId: this.session.playerId, savedAt: Date.now(), yaw: this.play.yaw }); this.play.toast(t('pause.saved'), 'council', 3); } }); y += 52;
    if (ui.button('settings', x, y, w, 44, t('menu.settings'))) this.act('settings', () => { this.screen = 'settings'; }); y += 52;
    if (ui.button('menu', x, y, w, 44, t('pause.menu'))) this.act('menu', () => { if (this.session instanceof LocalSession && this.play) saveGame({ state: this.session.state, playerId: this.session.playerId, savedAt: Date.now(), yaw: this.play.yaw }); this.net?.close(); this.disposeGame(); this.screen = 'menu'; });
    ui.end();
  }

  private drawResult(frame: number, snap: ReturnType<Input['poll']>): void {
    const ui = this.ui; ui.begin(frame, snap, 'result');
    const st = this.session?.state; const rd = this.resultData;
    if (this.view && st && this.play) this.view.update(st, 0.016, frame, this.session!.playerId, this.play.yaw, this.play.pitch, this.nowSec(), 1, null);
    const W = ui.canvas.width, H = ui.canvas.height;
    const x = W / 2 - 300, w = 600; let y = 60;
    ui.panel(x - 20, y - 20, w + 40, H - 80);
    ui.label(t('result.title'), x, y + 30, 28); y += 60;
    if (st && rd) {
      const total = METHODS.reduce((a, m) => a + st.stone.dmg[m], 0) || 1;
      const main = METHODS.reduce((b, m) => (st.stone.dmg[m] > st.stone.dmg[b] ? m : b), 'tropfen' as MethodId);
      ui.label(rd.won ? t('result.won') : t('result.dnf'), x, y, 18, rd.won ? PALETTE.moos : PALETTE.stempel); y += 32;
      const rows = [[t('result.time'), `${rd.minutes.toFixed(1)} ${t('gen.min')} (${t('hud.day', { n: dayOf(st.tick) + 1 })})`], [t('result.main'), `${t('method.' + main)} (${Math.round((st.stone.dmg[main] / total) * 100)} %)`], [t('result.water'), `${Math.round(st.stats.waterDelivered)} ${t('gen.liters')}`], [t('result.effective'), `${Math.round(st.stats.waterEffective)} ${t('gen.liters')}`], [t('result.earned'), `${Math.round(st.stats.moneyEarned)}`], [t('result.spent'), `${Math.round(st.stats.moneySpent)}`], [t('result.pipes'), `${Math.round(st.stats.pipeMeters)} m`], [t('hud.workers'), `${st.workers.length}`]];
      for (const [k, v] of rows) { ui.label(k, x, y, 14, '#5a4a3a'); ui.label(v, x + w, y, 14, PALETTE.tinte, 'right'); y += 22; }
      y += 8;
      // method bars
      for (const m of METHODS) { const sh = st.stone.dmg[m] / total; if (sh < 0.005) continue; ui.label(t('method.' + m), x, y + 11, 12); ui.bar(x + 160, y, w - 220, 12, sh, ({ thermoschock: '#ff7a3d', frost: '#bfe8ff', tropfen: '#5aa9e6', keile: '#a8875a', dampf: '#f0f0f0', strahl: '#2f6fb3', wurzel: '#7fa650' } as Record<string, string>)[m]); ui.label(`${Math.round(sh * 100)} %`, x + w, y + 11, 11, '#5a4a3a', 'right'); y += 18; }
      y += 8;
      if (rd.ranking.length > 1) { ui.label(t('result.ranking'), x, y + 12, 15); y += 24; rd.ranking.forEach((r, i) => { ui.label(`${t('result.rank', { n: i + 1 })}  ${r.name}  ${r.minutes !== null ? r.minutes.toFixed(1) + ' ' + t('gen.min') : t('result.dnf')}`, x + 10, y + 12, 13, r.pid === this.session?.playerId ? PALETTE.stempel : PALETTE.tinte); y += 20; }); y += 8; }
      // timeline sparkline
      const tl = st.stats.timeline;
      if (tl.length > 2) { const gx = x, gy = y, gw = w, gh = 60; ui.ctx.strokeStyle = PALETTE.tinte; ui.ctx.lineWidth = 1; ui.ctx.strokeRect(gx, gy, gw, gh); ui.ctx.strokeStyle = PALETTE.folie; ui.ctx.lineWidth = 2; ui.ctx.beginPath(); tl.forEach((p, i) => { const px = gx + (i / (tl.length - 1)) * gw, py = gy + gh - p.progress * gh; if (i === 0) ui.ctx.moveTo(px, py); else ui.ctx.lineTo(px, py); }); ui.ctx.stroke(); y += gh + 12; }
    }
    y = Math.max(y, H - 150);
    if (ui.button('again', x, y, 280, 44, t('result.again'))) this.act('again', () => { const cfg = st!.cfg; this.newGame({ seed: cfg.seed, landscape: cfg.landscape, rock: cfg.rock, mode: 'solo' }); });
    if (ui.button('menu', x + 320, y, 280, 44, t('result.menu'))) this.act('menu', () => { this.net?.close(); this.disposeGame(); this.screen = 'menu'; });
    ui.end();
  }
}
export { App };
void getLang; void createGame;
