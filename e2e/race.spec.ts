import { test, expect, type Page } from '@playwright/test';
import { collectErrors, waitFor } from './helpers';

test('Rennen mit drei Clients bis zur Rangliste', async ({ browser }) => {
  const ctx = await browser.newContext();
  const pages: Page[] = [];
  const errors: string[][] = [];
  for (let i = 0; i < 3; i++) { const p = await ctx.newPage(); pages.push(p); errors.push(collectErrors(p)); }
  const bots = ['keilschlaeger', 'tropfmeister', 'gaertner'];
  await pages[0].goto(`/?online=1&mode=race&bot=${bots[0]}&speed=120&gfx=low&server=ws://localhost:8787`);
  const lobby = await waitFor(pages[0], (s) => !!s.code, 30000, 'Raumcode');
  for (let i = 1; i < 3; i++) await pages[i].goto(`/?online=1&room=${lobby.code}&bot=${bots[i]}&speed=120&gfx=low&server=ws://localhost:8787`);
  await waitFor(pages[2], (s) => s.screen === 'lobby', 30000, 'Lobby Client 3');
  await pages[0].waitForTimeout(1500);
  await pages[0].evaluate(() => (window as unknown as { __app: any }).__app.net.start());
  for (const p of pages) await waitFor(p, (s) => s.screen === 'game' && s.tick > 0, 60000, 'Rennstart');
  await waitFor(pages[0], (s) => (s.standings ?? 0) === 3, 60000, 'Rangliste im HUD');
  await pages[0].waitForTimeout(6000);
  await pages[0].screenshot({ path: 'docs/screenshots/e2e-rennen.png' });
  // every racer finishes its own stone; each result screen shows the ranking of all three
  for (const p of pages) await waitFor(p, (s) => s.screen === 'result', 12 * 60 * 1000, 'Ergebnis mit Rangliste');
  for (const p of pages) { const s = await waitFor(p, (x) => (x.ranking ?? 0) === 3, 30000, 'Rangliste vollständig'); expect(s.ranking).toBe(3); }
  await pages[0].screenshot({ path: 'docs/screenshots/e2e-rangliste.png' });
  for (const e of errors) expect(e, e.join('\n')).toEqual([]);
  await ctx.close();
});
