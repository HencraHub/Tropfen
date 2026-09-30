/**
 * Screenshots for docs/ABNAHME.md: style probe, early phase, mid-game per method, planning table, finale.
 * Requires the dev server on :5173 (npm run dev). Co-op screenshots come from the e2e run (docs/screenshots/e2e-*.png).
 */
import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

mkdirSync('docs/screenshots', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const base = 'http://localhost:5173';

async function lookAtStone(page: Page): Promise<void> {
  await page.evaluate(() => {
    const a = (window as any).__app; const s = a.session.state; const me = s.players.find((p: any) => p.id === a.session.playerId);
    // step back to 16 m from the stone (local state) and face the origin
    const d = Math.hypot(me.pos.x, me.pos.z) || 1;
    me.pos.x = (me.pos.x / d) * 16; me.pos.z = (me.pos.z / d) * 16; me.moveTarget = null; me.queue = []; me.action = null;
    a.play.yaw = Math.atan2(me.pos.x, me.pos.z); a.play.pitch = -0.1;
    a.session.speed = 0;
  });
  await page.waitForTimeout(700);
}
async function waitProgress(page: Page, p: number, timeout = 240000): Promise<void> {
  await page.waitForFunction((pp) => { const a = (window as any).__app; const s = a?.session?.state; return s && s.stone.progress / s.stone.hp >= pp; }, p, { timeout });
}
async function shot(page: Page, name: string): Promise<void> { await page.screenshot({ path: `docs/screenshots/${name}.png` }); console.log('saved', name); }

const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
// 1 style probe
await page.goto(`${base}/?probe=1&land=flusstal&rock=granit&hour=15`); await page.waitForTimeout(3000); await shot(page, 'stilprobe');
await page.goto(`${base}/?probe=1&land=steppe&rock=basalt&hour=20`); await page.waitForTimeout(3000); await shot(page, 'stilprobe-nacht');
// 2 main menu
await page.goto(`${base}/`); await page.waitForTimeout(1500); await shot(page, 'hauptmenue');
// 3 early phase (real speed, autopilot keilschlaeger)
await page.goto(`${base}/?solo=1&seed=abnahme&land=flusstal&rock=kalkstein&bot=keilschlaeger&speed=20`);
await page.waitForFunction(() => (window as any).__app?.session?.state?.stats?.waterScooped > 0, null, { timeout: 120000 });
await page.waitForTimeout(1500); await lookAtStone(page); await shot(page, 'fruehphase');
// 4 mid-game per method
const methods: [string, string, string, string][] = [['thermoschock', 'hitzkopf', 'steppe', 'basalt'], ['frost', 'frostwart', 'hochland', 'granit'], ['tropfen', 'tropfmeister', 'kueste', 'kalkstein'], ['keile', 'keilschlaeger', 'flusstal', 'sandstein'], ['dampf', 'dampfkessel', 'steppe', 'basalt'], ['strahl', 'ingenieur', 'kueste', 'sandstein'], ['wurzel', 'gaertner', 'flusstal', 'kalkstein']];
for (const [m, bot, land, rock] of methods) {
  await page.goto(`${base}/?solo=1&seed=abnahme-${m}&land=${land}&rock=${rock}&bot=${bot}&speed=120&gfx=low`);
  await waitProgress(page, 0.4, 400000);
  await page.evaluate(() => { const a = (window as any).__app; a.session.speed = 0; });
  // switch to full quality for the picture: rebuild the view with shadows on
  await lookAtStone(page); await page.waitForTimeout(500);
  await shot(page, `mittelspiel-${m}`);
  if (m === 'keile') { await page.keyboard.press('Tab'); await page.waitForTimeout(600); await shot(page, 'planungstisch'); await page.keyboard.press('Tab'); }
  if (m === 'tropfen') { await page.keyboard.press('KeyR'); await page.waitForTimeout(600); await shot(page, 'forschung'); await page.keyboard.press('KeyR'); await page.keyboard.press('KeyB'); await page.waitForTimeout(600); await shot(page, 'bauen'); await page.keyboard.press('KeyB'); }
}
// 5 finale
await page.goto(`${base}/?solo=1&seed=abnahme-finale&land=flusstal&rock=sandstein&bot=keilschlaeger&speed=120&gfx=low`);
await page.waitForFunction(() => !!(window as any).__app?.session?.state?.finished, null, { timeout: 500000 });
await page.evaluate(() => { const a = (window as any).__app; a.session.speed = 0; const s = a.session.state; const me = s.players[0]; a.play.yaw = Math.atan2(me.pos.x, me.pos.z); a.play.pitch = -0.05; });
await page.waitForTimeout(2200); await shot(page, 'finale');
await page.waitForTimeout(4000); await shot(page, 'ergebnis');
await browser.close();
