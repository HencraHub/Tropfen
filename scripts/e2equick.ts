/** Quick manual check: run a solo game with a bot at high speed and report errors/progress. */
import { chromium } from '@playwright/test';
const [url = 'http://localhost:5173/?solo=1&seed=e2e&land=flusstal&rock=kalkstein&bot=tropfmeister&speed=120', secs = '60', shot = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 300)); });
await page.goto(url, { waitUntil: 'load' });
const t0 = Date.now();
while (Date.now() - t0 < Number(secs) * 1000) {
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => { const a = (window as any).__app; const s = a?.session?.state; return s ? { tick: s.tick, prog: s.stone.progress / s.stone.hp, money: s.eco.money, finished: !!s.finished, screen: a.screen, err: (window as any).__lastError } : { screen: a?.screen }; });
  console.log(JSON.stringify(info));
  if (info.finished || info.err) break;
}
if (shot) await page.screenshot({ path: shot });
console.log('errors:', errors.slice(0, 10).join('\n') || 'none');
await browser.close();
