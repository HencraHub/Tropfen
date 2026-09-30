import { test, expect, type Page } from '@playwright/test';
import { collectErrors, waitFor, snapshot } from './helpers';

test('Koop mit drei Clients bis zur Spaltung, Weltzustand auf allen Clients identisch', async ({ browser }) => {
  const ctx = await browser.newContext();
  const pages: Page[] = [];
  const errors: string[][] = [];
  for (let i = 0; i < 3; i++) { const p = await ctx.newPage(); pages.push(p); errors.push(collectErrors(p)); }
  const bots = ['team', 'team', 'keilschlaeger'];
  await pages[0].goto(`/?online=1&mode=coop&bot=${bots[0]}&speed=120&gfx=low&server=ws://localhost:8787`);
  const lobby = await waitFor(pages[0], (s) => !!s.code, 30000, 'Raumcode');
  for (let i = 1; i < 3; i++) await pages[i].goto(`/?online=1&room=${lobby.code}&bot=${bots[i]}&speed=120&gfx=low&server=ws://localhost:8787`);
  await waitFor(pages[2], (s) => s.screen === 'lobby', 30000, 'Lobby Client 3');
  await pages[0].waitForTimeout(1500);
  await pages[0].evaluate(() => (window as unknown as { __app: any }).__app.net.start());
  for (const p of pages) await waitFor(p, (s) => s.screen === 'game' && s.tick > 0, 60000, 'Koop-Start');
  await pages[0].waitForTimeout(8000);
  await pages[0].screenshot({ path: 'docs/screenshots/e2e-koop.png' });
  for (const p of pages) await waitFor(p, (s) => s.finished, 12 * 60 * 1000, 'Koop-Spaltung');
  // all clients must have applied every tick: same final tick and same state hash
  await pages[0].waitForTimeout(3000);
  const snaps = await Promise.all(pages.map((p) => snapshot(p)));
  const ticks = new Set(snaps.map((s) => s.tick));
  const hashes = new Set(snaps.map((s) => s.hash));
  expect(ticks.size, 'gleicher Tick auf allen Clients ' + JSON.stringify(snaps.map((s) => s.tick))).toBe(1);
  expect(hashes.size, 'gleicher Weltzustand (Hash) auf allen Clients ' + JSON.stringify(snaps.map((s) => s.hash))).toBe(1);
  for (const s of snaps) expect(s.desyncs ?? 0).toBe(0);
  for (const e of errors) expect(e, e.join('\n')).toEqual([]);
  await ctx.close();
});
