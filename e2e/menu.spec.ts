import { test, expect } from '@playwright/test';
import { collectErrors, waitFor } from './helpers';

/** Menus with the mouse: main menu → new game → start; pause via Escape; settings from the pause menu. */
async function clickItem(page: import('@playwright/test').Page, id: string): Promise<void> {
  let it: { x: number; y: number; w: number; h: number } | null = null;
  for (let tries = 0; tries < 20 && !it; tries++) { // the widget list is that of the last drawn frame
    it = await page.evaluate((wanted) => {
      const a = (window as unknown as { __app: { ui: { items: { id: string; x: number; y: number; w: number; h: number }[] } } }).__app;
      return a.ui.items.find((i) => i.id === wanted) ?? null;
    }, id);
    if (!it) await page.waitForTimeout(150);
  }
  if (!it) throw new Error(`Menüpunkt ${id} nicht gefunden`);
  await page.mouse.move(it.x + it.w / 2, it.y + it.h / 2);
  await page.waitForTimeout(120);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);
}

test('Menüs per Maus und Tastatur: Neues Spiel, Start, Pause, Einstellungen', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?gfx=low');
  await waitFor(page, (s) => s.screen === 'menu', 20000, 'Hauptmenü');
  // keyboard: Enter activates the focused item (first item = new game), Escape goes back
  await page.keyboard.press('Enter');
  await waitFor(page, (s) => s.screen === 'newgame', 5000, 'Neues Spiel per Enter');
  await page.keyboard.press('Escape');
  await waitFor(page, (s) => s.screen === 'menu', 5000, 'zurück per Escape');
  // mouse
  await clickItem(page, 'new');
  await waitFor(page, (s) => s.screen === 'newgame', 5000, 'Bildschirm Neues Spiel');
  await clickItem(page, 'start');
  await waitFor(page, (s) => s.screen === 'game' && s.tick > 0, 20000, 'Partie läuft');
  await page.keyboard.press('Escape');
  await waitFor(page, (s) => s.screen === 'pause', 5000, 'Pausemenü');
  await clickItem(page, 'settings');
  await waitFor(page, (s) => s.screen === 'settings', 5000, 'Einstellungen');
  await page.keyboard.press('Escape');
  await waitFor(page, (s) => s.screen === 'pause', 5000, 'zurück im Pausemenü');
  await clickItem(page, 'resume');
  await waitFor(page, (s) => s.screen === 'game', 5000, 'weiterspielen per Klick');
  expect(errors, errors.join('\n')).toEqual([]);
});
