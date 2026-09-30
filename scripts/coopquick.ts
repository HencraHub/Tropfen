import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const p1 = await ctx.newPage(); const p2 = await ctx.newPage();
for (const p of [p1, p2]) p.on('console', (m) => { if (/DESYNC/.test(m.text())) console.log('CLIENT', m.text().slice(0, 600)); });
await p1.goto('http://localhost:5173/?online=1&mode=coop&bot=team&speed=60&gfx=low&server=ws://localhost:8787');
await p1.waitForFunction(() => (window as any).__app?.lobby?.code);
const code = await p1.evaluate(() => (window as any).__app.lobby.code);
await p2.goto(`http://localhost:5173/?online=1&room=${code}&bot=team&speed=60&gfx=low&server=ws://localhost:8787`);
await p2.waitForFunction(() => (window as any).__app?.lobby);
await p1.waitForTimeout(1000);
await p1.evaluate(() => (window as any).__app.net.start());
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  await p1.waitForTimeout(3000);
  const info = await Promise.all([p1, p2].map((p) => p.evaluate(() => { const a = (window as any).__app; const s = a?.session?.state; return { tick: s?.tick, screen: a?.screen, q: a?.net?.queue?.length, started: a?.net?.started, ws: a?.net?.ws?.readyState, prog: s ? +(s.stone.progress / s.stone.hp).toFixed(3) : 0, desyncs: a?.net?.desyncs, hash: a?.session?.hash?.(), err: (window as any).__lastError }; })));
  console.log(JSON.stringify(info));
  if (info.some((i) => (i.desyncs ?? 0) > 0)) { await p1.waitForTimeout(3000); break; }
}
await browser.close();
