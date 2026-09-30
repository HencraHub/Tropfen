import { runGame, STRATEGIES, GREEDY, strategyById } from '../src/bots/index';
const args = process.argv.slice(2);
const land = args[0] ?? 'flusstal', rock = args[1] ?? 'granit', which = args[2] ?? 'all', seed = args[3] ?? 's1';
const list = which === 'all' ? [...STRATEGIES, GREEDY] : [strategyById(which)!];
for (const s of list) {
  const t0 = performance.now();
  const r = runGame({ seed, landscape: land, rock }, [{ pid: 'p1', strategy: s }]);
  const sh = Object.entries(r.shares).filter(([, v]) => v > 0.02).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(', ');
  console.log(`${s.id.padEnd(14)} ${r.finished ? r.minutes.toFixed(1).padStart(5) + ' min' : ' DNF     '} main=${r.mainMethod} [${sh}] route@${r.routeMin?.toFixed(0) ?? '-'} online@${r.onlineMin?.toFixed(0) ?? '-'} rate=${r.rate.toFixed(1)}%/min money=${r.money.toFixed(0)} eff=${r.stats.waterEffective.toFixed(0)} res=${r.research.length} tl=${r.timeline.slice(1, 10).map((x) => Math.round(x * 100)).join('/')} (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
}
