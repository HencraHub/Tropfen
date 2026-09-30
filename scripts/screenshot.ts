/** Headless screenshot of a page of the dev server. Usage: tsx scripts/screenshot.ts "<url>" out.png [waitMs] */
import { chromium } from '@playwright/test';
const [url, out = 'shot.png', waitMs = '1500'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(Number(waitMs));
await page.screenshot({ path: out });
console.log('saved', out, errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no errors');
await browser.close();
