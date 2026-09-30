import type { Page } from '@playwright/test';

export interface Snapshot { tick: number; progress: number; finished: boolean; screen: string; err?: string; scooped: number; hash?: string; pid?: string; reconnects?: number; desyncs?: number; standings?: number; code?: string; ranking?: number }

export async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const a = (window as unknown as { __app: any; __lastError?: string }).__app;
    const s = a?.session?.state;
    return {
      tick: s?.tick ?? 0, progress: s ? s.stone.progress / s.stone.hp : 0, finished: !!s?.finished, screen: a?.screen ?? 'none',
      err: (window as unknown as { __lastError?: string }).__lastError, scooped: s?.stats?.waterScooped ?? 0,
      hash: a?.session?.hash ? a.session.hash() : undefined, pid: a?.session?.playerId, reconnects: a?.net?.reconnects, desyncs: a?.net?.desyncs,
      standings: a?.session?.standings ? a.session.standings().length : 0, code: a?.lobby?.code, ranking: a?.resultData?.ranking?.length,
    };
  });
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  return errors;
}

export async function waitFor(page: Page, cond: (s: Snapshot) => boolean, timeoutMs: number, label: string): Promise<Snapshot> {
  const t0 = Date.now();
  let last: Snapshot = await snapshot(page);
  while (Date.now() - t0 < timeoutMs) {
    last = await snapshot(page);
    if (last.err) throw new Error(`Laufzeitfehler (${label}): ${last.err}`);
    if (cond(last)) return last;
    await page.waitForTimeout(1500);
  }
  throw new Error(`Zeitüberschreitung: ${label} (zuletzt ${JSON.stringify(last)})`);
}
