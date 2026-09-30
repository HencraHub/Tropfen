import { test, expect } from '@playwright/test';
import { collectErrors, waitFor } from './helpers';

test('Solo-Partie vom ersten Schöpfen bis zur Spaltung (Zeitraffer, ohne Laufzeitfehler)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?solo=1&seed=e2e-solo&land=flusstal&rock=kalkstein&bot=tropfmeister&speed=120&gfx=low');
  await waitFor(page, (s) => s.screen === 'game' && s.tick > 0, 30000, 'Spielstart');
  const first = await waitFor(page, (s) => s.scooped > 0, 60000, 'erstes Schöpfen');
  expect(first.scooped).toBeGreaterThan(0);
  await page.screenshot({ path: 'docs/screenshots/e2e-solo-fruehphase.png' });
  const done = await waitFor(page, (s) => s.finished, 10 * 60 * 1000, 'Spaltung');
  expect(done.finished).toBe(true);
  expect(done.progress).toBeGreaterThanOrEqual(1);
  await waitFor(page, (s) => s.screen === 'result', 60000, 'Ergebnisbildschirm');
  await page.screenshot({ path: 'docs/screenshots/e2e-solo-ergebnis.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
