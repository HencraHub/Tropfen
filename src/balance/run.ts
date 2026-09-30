/**
 * Balance run: every rock × landscape with N seeds, all strategy bots, the greedy bot and two coop pairs.
 * Exit code 1 if any acceptance rule (a)–(e) from docs/AUFTRAG.md is violated. Report: docs/BALANCE.md.
 */
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { content, type MethodId } from '../sim/index';
import { STRATEGIES, GREEDY } from '../bots/index';
import type { Job, JobResult } from './worker';

const SEEDS = Number(process.env.SEEDS ?? 20);
const WORKERS = Number(process.env.WORKERS ?? Math.max(1, cpus().length));
const LANDS = (process.env.LANDS ?? content.landscapes.map((l) => l.id).join(',')).split(',');
const ROCKS = (process.env.ROCKS ?? content.rocks.map((r) => r.id).join(',')).split(',');
const BOTS = (process.env.BOTS ?? [...STRATEGIES.map((s) => s.id), GREEDY.id, 'coop_abgestimmt', 'coop_nebeneinander'].join(',')).split(',');
const OUT = process.env.BALANCE_OUT ?? 'docs/BALANCE.md';

const jobs: Job[] = [];
let id = 0;
for (const landscape of LANDS) for (const rock of ROCKS) for (let s = 0; s < SEEDS; s++) for (const bot of BOTS) jobs.push({ id: id++, landscape, rock, seed: `balance-${s}`, bot });

async function runAll(): Promise<JobResult[]> {
  const results: JobResult[] = [];
  const perWorker = Math.ceil(jobs.length / WORKERS);
  let done = 0;
  const t0 = Date.now();
  const tasks: Promise<void>[] = [];
  for (let w = 0; w < WORKERS; w++) {
    const slice = jobs.filter((_, i) => i % WORKERS === w);
    if (slice.length === 0) continue;
    tasks.push(new Promise<void>((resolve, reject) => {
      const entry = new URL('./worker.ts', import.meta.url).href;
      const boot = `import { register } from 'tsx/esm/api'; register(); await import(${JSON.stringify(entry)});`;
      const worker = new Worker(boot, { eval: true, workerData: { jobs: slice } });
      worker.on('message', (m: { progress?: number; done?: JobResult[] }) => {
        if (m.progress) { done += m.progress; if (done % 50 === 0) process.stderr.write(`\r${done}/${jobs.length} Partien (${((Date.now() - t0) / 1000).toFixed(0)} s)`); }
        if (m.done) { results.push(...m.done); resolve(); }
      });
      worker.on('error', reject);
      worker.on('exit', (code) => { if (code !== 0) reject(new Error('worker exit ' + code)); });
    }));
  }
  await Promise.all(tasks);
  process.stderr.write(`\r${jobs.length}/${jobs.length} Partien (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
  void perWorker;
  return results;
}

interface BotAgg { bot: string; mean: number; finished: number; main: MethodId | null; mains: Record<string, number>; times: number[] }

function mean(a: number[]): number { return a.reduce((x, y) => x + y, 0) / Math.max(1, a.length); }

runAll().then((results) => {
  const byJob = new Map(results.map((r) => [r.id, r.result]));
  const lines: string[] = [];
  const violations: string[] = [];
  const fastestCount: Record<string, number> = {};
  const coopSum = { a: 0, n: 0, k: 0 };
  let combos = 0;
  lines.push('# Balance-Bericht', '', `Seeds je Kombination: ${SEEDS}. Bots: ${BOTS.join(', ')}. Zeit = Mittelwert der Spielzeit in Minuten über alle Seeds (nicht beendete Partien zählen mit 90 min).`, '');
  lines.push('Regeln (docs/AUFTRAG.md, Auslegung in docs/ENTSCHEIDUNGEN.md): (a) je Kombination ≥ 3 Bots mit verschiedener Hauptmethode ≤ 1,2 × Bestzeit; (b) kein Bot in > 40 % der Kombinationen der schnellste; (c) je Kombination planloser Bot ≥ 1,3 × Bestzeit; (d) abgestimmtes Koop-Paar ≤ 0,85 × Zeit des unabgestimmten Paars im Mittel über alle Kombinationen; (e) Bestzeit jeder Kombination 25–45 min.', '');
  for (const landscape of LANDS) for (const rock of ROCKS) {
    combos++;
    const aggs: BotAgg[] = [];
    for (const bot of BOTS) {
      const rs = jobs.filter((j) => j.landscape === landscape && j.rock === rock && j.bot === bot).map((j) => byJob.get(j.id)!);
      const times = rs.map((r) => (r.finished ? r.minutes : 90));
      const mains: Record<string, number> = {};
      for (const r of rs) { const m = r.mainMethod ?? 'none'; mains[m] = (mains[m] ?? 0) + 1; }
      let main: MethodId | null = null; let best = 0;
      for (const [m, n] of Object.entries(mains)) if (n > best && m !== 'none') { best = n; main = m as MethodId; }
      aggs.push({ bot, mean: mean(times), finished: rs.filter((r) => r.finished).length, main, mains, times });
    }
    const solo = aggs.filter((a) => STRATEGIES.some((s) => s.id === a.bot));
    const greedy = aggs.find((a) => a.bot === GREEDY.id);
    const coopA = aggs.find((a) => a.bot === 'coop_abgestimmt');
    const coopN = aggs.find((a) => a.bot === 'coop_nebeneinander');
    const key = `${landscape}/${rock}`;
    const bestTime = solo.length > 0 ? Math.min(...solo.map((a) => a.mean)) : NaN;
    const fastest = solo.find((a) => a.mean === bestTime);
    if (fastest) fastestCount[fastest.bot] = (fastestCount[fastest.bot] ?? 0) + 1;
    const within = solo.filter((a) => a.mean <= bestTime * 1.2);
    const distinct = new Set(within.map((a) => a.main ?? a.bot));
    lines.push(`## ${key}`, '', '| Bot | Zeit (min) | beendet | Hauptmethode |', '|---|---|---|---|');
    for (const a of [...solo, ...(greedy ? [greedy] : []), ...(coopA ? [coopA] : []), ...(coopN ? [coopN] : [])]) lines.push(`| ${a.bot} | ${a.mean.toFixed(1)} | ${a.finished}/${a.times.length} | ${a.main ?? '–'} (${Object.entries(a.mains).map(([m, n]) => `${m} ${n}`).join(', ')}) |`);
    if (fastest) lines.push('', `Bestzeit ${bestTime.toFixed(1)} min (${fastest.bot}); innerhalb 20 %: ${within.map((a) => `${a.bot}=${a.main}`).join(', ')} → ${distinct.size} Methoden.`);
    if (solo.length > 0 && distinct.size < 3) violations.push(`(a) ${key}: nur ${distinct.size} verschiedene Hauptmethoden innerhalb 20 % der Bestzeit (${within.map((a) => a.bot + ':' + a.main).join(', ')})`);
    if (greedy) { const ratio = greedy.mean / bestTime; lines.push(`Planlos: ${greedy.mean.toFixed(1)} min = ${ratio.toFixed(2)} × Bestzeit.`); if (ratio < 1.3) violations.push(`(c) ${key}: planloser Bot nur ${ratio.toFixed(2)} × Bestzeit`); }
    if (coopA && coopN) { const ratio = coopA.mean / coopN.mean; lines.push(`Koop abgestimmt ${coopA.mean.toFixed(1)} min vs nebeneinander ${coopN.mean.toFixed(1)} min = ${ratio.toFixed(2)}.`); coopSum.a += coopA.mean; coopSum.n += coopN.mean; coopSum.k++; }
    if (solo.length > 0 && (bestTime < 25 || bestTime > 45)) violations.push(`(e) ${key}: Bestzeit ${bestTime.toFixed(1)} min außerhalb 25–45`);
    lines.push('');
  }
  if (coopSum.k > 0) {
    const ratio = coopSum.a / coopSum.n;
    lines.push('## Koop', '', `Abgestimmtes Paar im Mittel ${(coopSum.a / coopSum.k).toFixed(1)} min, unabgestimmtes Paar ${(coopSum.n / coopSum.k).toFixed(1)} min → Verhältnis ${ratio.toFixed(3)} (Regel d: ≤ 0,85, Mittelwert über alle Kombinationen, siehe docs/ENTSCHEIDUNGEN.md).`, '');
    if (ratio > 0.85) violations.push(`(d) abgestimmtes Paar im Mittel nur ${((1 - ratio) * 100).toFixed(0)} % schneller (Verhältnis ${ratio.toFixed(3)})`);
  }
  lines.push('## Schnellster Bot je Kombination', '');
  for (const [bot, n] of Object.entries(fastestCount)) {
    lines.push(`- ${bot}: ${n}/${combos} (${((n / combos) * 100).toFixed(0)} %)`);
    if (n / combos > 0.4) violations.push(`(b) ${bot} ist in ${n}/${combos} Kombinationen der schnellste (> 40 %)`);
  }
  lines.push('', '## Ergebnis', '');
  if (violations.length === 0) lines.push('Alle Regeln (a)–(e) erfüllt.');
  else { lines.push('Verstöße:', ''); for (const v of violations) lines.push(`- ${v}`); }
  mkdirSync('docs', { recursive: true });
  writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(lines.slice(lines.indexOf('## Schnellster Bot je Kombination')).join('\n'));
  console.log(`Bericht: ${OUT}`);
  process.exit(violations.length === 0 ? 0 : 1);
}).catch((e) => { console.error(e); process.exit(2); });
