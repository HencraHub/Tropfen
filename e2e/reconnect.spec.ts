import { test, expect, type Page } from '@playwright/test';
import { collectErrors, waitFor, snapshot } from './helpers';

test('Verbindungsabbruch mit Wiedereinstieg (Koop, zwei Clients)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const pages: Page[] = [];
  const errors: string[][] = [];
  for (let i = 0; i < 2; i++) { const p = await ctx.newPage(); pages.push(p); errors.push(collectErrors(p)); }
  await pages[0].goto(`/?online=1&mode=coop&bot=team&speed=120&gfx=low&server=ws://localhost:8787`);
  const lobby = await waitFor(pages[0], (s) => !!s.code, 30000, 'Raumcode');
  await pages[1].goto(`/?online=1&room=${lobby.code}&bot=team&speed=120&gfx=low&server=ws://localhost:8787`);
  await waitFor(pages[1], (s) => s.screen === 'lobby', 30000, 'Lobby Client 2');
  await pages[0].waitForTimeout(1000);
  await pages[0].evaluate(() => (window as unknown as { __app: any }).__app.net.start());
  for (const p of pages) await waitFor(p, (s) => s.screen === 'game' && s.tick > 0, 60000, 'Start');
  await waitFor(pages[1], (s) => s.progress > 0.05, 5 * 60 * 1000, 'Fortschritt vor dem Abbruch');
  // drop the second client's socket; it must reconnect with its token and resume from a snapshot
  await pages[1].evaluate(() => (window as unknown as { __app: any }).__app.net.simulateDrop());
  const re = await waitFor(pages[1], (s) => (s.reconnects ?? 0) > 0 && s.screen === 'game', 60000, 'Wiedereinstieg');
  expect(re.reconnects).toBeGreaterThan(0);
  const before = await snapshot(pages[1]);
  await waitFor(pages[1], (s) => s.tick > before.tick + 200, 60000, 'läuft nach Wiedereinstieg weiter');
  for (const p of pages) await waitFor(p, (s) => s.finished, 12 * 60 * 1000, 'Spaltung');
  await pages[0].waitForTimeout(3000);
  const snaps = await Promise.all(pages.map((p) => snapshot(p)));
  expect(new Set(snaps.map((s) => s.tick)).size).toBe(1);
  expect(new Set(snaps.map((s) => s.hash)).size).toBe(1);
  for (const e of errors) expect(e, e.join('\n')).toEqual([]);
  await ctx.close();
});
