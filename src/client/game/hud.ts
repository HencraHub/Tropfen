import { hourOf, dayOf, METHODS, weatherNow, content, type GameState, type MethodId } from '../../sim/index';
import { t } from '../i18n';
import { PALETTE } from '../materials/paper';
import type { UI } from '../ui/widgets';
import type { Pick } from './view';
import { wrapText } from '../ui/font';

export const METHOD_COLORS: Record<MethodId, string> = { thermoschock: '#ff7a3d', frost: '#bfe8ff', tropfen: '#5aa9e6', keile: '#a8875a', dampf: '#f0f0f0', strahl: '#2f6fb3', wurzel: '#7fa650' };

export interface Toast { text: string; until: number; kind: 'council' | 'stone' }

export function drawHUD(ui: UI, state: GameState, localPid: string, pick: Pick, prompt: string | null, toasts: Toast[], speed: number, standings: { pid: string; name: string; progress: number; finished: number | null }[], now: number): void {
  const W = ui.canvas.width, H = ui.canvas.height;
  const me = state.players.find((p) => p.id === localPid);
  const eco = state.eco;
  // top-left resources
  ui.panel(16, 14, 300, 118);
  ui.label(`${t('hud.money')}: ${Math.floor(eco.money)}${eco.loan > 0 ? `  (${t('hud.loan')} ${Math.round(eco.loan)})` : ''}`, 30, 40, 15);
  ui.label(`${t('hud.wood')}: ${Math.floor(eco.wood)}   ${t('hud.sand')}: ${Math.floor(eco.sand)}   ${t('hud.energy')}: ${eco.energyProd.toFixed(1)}/${eco.energyUse.toFixed(1)}`, 30, 62, 13, '#5a4a3a');
  ui.label(`${t('hud.workers')}: ${state.workers.length}/${eco.workerSlots}${eco.strike ? '  ✗' : ''}   ${me ? `${t('hud.carry')}: ${me.carry.toFixed(0)} ${t('gen.liters')}` : ''}`, 30, 84, 13, '#5a4a3a');
  const tools = me ? me.tools.filter((x) => x !== 'haende').map((x) => t('tool.' + x)).join(', ') : '';
  ui.label(`${tools || t('tool.haende')}`, 30, 106, 13, '#5a4a3a');
  ui.label(`${t('hud.spectacle')}: ${Math.round(eco.spectacle)}`, 30, 124, 12, '#8a7a6a');
  // top-right: time, weather
  const hour = hourOf(state.tick), day = dayOf(state.tick) + 1;
  const w = weatherNow(state);
  ui.panel(W - 236, 14, 220, 78);
  ui.label(`${t('hud.day', { n: day })}  ${Math.floor(hour).toString().padStart(2, '0')}:${Math.floor((hour % 1) * 60).toString().padStart(2, '0')}`, W - 222, 40, 15);
  ui.label(`${t('hud.weather')}: ${t('weather.' + state.weather.today)}  ·  ${t('hud.forecast')}: ${state.weather.forecast.map((f) => t('weather.' + f)).join(', ')}`, W - 222, 62, 11, '#5a4a3a');
  ui.label(`${state.stone.moods.map((m) => t('mood.' + m)).join(', ')}${speed > 1 ? '   ' + t('hud.timelapse', { n: speed }) : ''}`, W - 222, 82, 11, '#8a7a6a');
  void w;
  // bottom: progress bar with method shares
  const bw = Math.min(640, W - 80), bx = (W - bw) / 2, by = H - 46;
  ui.panel(bx - 12, by - 26, bw + 24, 58);
  const total = METHODS.reduce((a, m) => a + state.stone.dmg[m], 0) || 1;
  let cx = bx;
  ui.ctx.fillStyle = PALETTE.papier; ui.ctx.fillRect(bx, by, bw, 16);
  for (const m of METHODS) { const share = (state.stone.dmg[m] / total) * (state.stone.progress / state.stone.hp); const sw = share * bw; ui.ctx.fillStyle = METHOD_COLORS[m]; ui.ctx.fillRect(cx, by, sw, 16); cx += sw; }
  ui.ctx.strokeStyle = PALETTE.tinte; ui.ctx.lineWidth = 1.5; ui.ctx.strokeRect(bx, by, bw, 16);
  // line markers
  ui.label(`${t('hud.progress')} ${((state.stone.progress / state.stone.hp) * 100).toFixed(1)} %`, bx, by - 6, 13);
  const shares = METHODS.filter((m) => state.stone.dmg[m] > 0).sort((a, b) => state.stone.dmg[b] - state.stone.dmg[a]).slice(0, 4).map((m) => `${t('method.' + m)} ${Math.round((state.stone.dmg[m] / total) * 100)} %`).join(' · ');
  ui.label(shares, bx + bw, by - 6, 11, '#5a4a3a', 'right');
  // zone info when looking at the stone
  if (pick.kind === 'zone' && pick.zone !== undefined) {
    const z = state.stone.zones[pick.zone];
    const zx = W / 2 + 40, zy = H / 2 - 20;
    ui.panel(zx, zy, 230, 96);
    ui.label(`${t('hud.zone', { n: pick.zone + 1 })}${pick.zone % 4 === state.stone.line ? ' · ' + t('hud.line') : ''}`, zx + 12, zy + 22, 14);
    ui.label(`${t('hud.temp')}: ${z.T.toFixed(0)} °C   ${t('hud.wet')}: ${Math.round(z.wet * 100)} %`, zx + 12, zy + 42, 12, '#5a4a3a');
    ui.label(`${t('hud.fill')}: ${z.fill.toFixed(0)} ${t('gen.liters')}   ${z.holes > 0 ? `⌀${z.holes}/${z.wedges}` : ''}${z.deepHoles > 0 ? ` ▼${z.deepHoles}/${z.charges.length}` : ''}${z.growths.length > 0 ? ` ♣${z.growths.length}` : ''}`, zx + 12, zy + 60, 12, '#5a4a3a');
    ui.label(`${t('hud.weak')}: ${z.tapped ? (z.weak > 1.05 ? '×' + z.weak.toFixed(1) : '–') : t('hud.weakUnknown')}`, zx + 12, zy + 78, 12, z.tapped && z.weak > 1.05 ? PALETTE.stempel : '#8a7a6a');
  }
  // crosshair
  ui.ctx.strokeStyle = PALETTE.tinte; ui.ctx.lineWidth = 1.5;
  ui.ctx.beginPath(); ui.ctx.arc(W / 2, H / 2, 5, 0, Math.PI * 2); ui.ctx.stroke();
  // prompt
  if (prompt) { const pw = ui.measure(prompt, 15) + 40; ui.panel(W / 2 - pw / 2, H / 2 + 30, pw, 36); ui.label(prompt, W / 2, H / 2 + 54, 15, PALETTE.tinte, 'center'); }
  // toasts (council notices bottom-left, stone bubbles top-centre)
  let cy = H - 110;
  for (const tt of toasts.filter((x) => x.kind === 'council').slice(-4).reverse()) {
    const lines = wrapText(tt.text, 12, 360);
    const h = 18 + lines.length * 16;
    ui.panel(16, cy - h, 400, h, false, tt.until - now < 1.5 ? '#e0cfa0' : PALETTE.kraft);
    lines.forEach((l, i) => ui.label(l, 28, cy - h + 20 + i * 16, 12, '#3a2a20'));
    cy -= h + 8;
  }
  const stoneToast = toasts.filter((x) => x.kind === 'stone').slice(-1)[0];
  if (stoneToast) { const pw = ui.measure(stoneToast.text, 15) + 44; ui.panel(W / 2 - pw / 2, 24, pw, 44, true); ui.label(stoneToast.text, W / 2, 52, 15, PALETTE.tinte, 'center'); }
  // race standings
  if (standings.length > 0) {
    const sx = W - 236, sy = 100;
    ui.panel(sx, sy, 220, 24 + standings.length * 20);
    ui.label(t('hud.race'), sx + 12, sy + 18, 12, '#5a4a3a');
    standings.forEach((s, i) => { ui.label(`${s.name}${s.pid === localPid ? ' ●' : ''}`, sx + 12, sy + 38 + i * 20, 12); ui.bar(sx + 120, sy + 26 + i * 20, 86, 12, s.progress, s.finished !== null ? PALETTE.stempel : PALETTE.folie); });
  }
  // research in progress
  if (state.research.current) { const n = content.research.nodes.find((x) => x.id === state.research.current!.id); ui.label(`${t('research.current')}: ${t('res.' + state.research.current.id)} ${n ? Math.round((1 - state.research.current.ticksLeft / n.ticks) * 100) : 0} %`, W - 222, H - 60, 12, '#5a4a3a'); }
  if (state.research.offered) ui.label(t('council.perkOffer') + ' [R]', W - 222, H - 40, 12, PALETTE.stempel);
}
