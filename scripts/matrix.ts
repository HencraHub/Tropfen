// Quick matrix: every combo × bots with one seed, compact table.
import { runGame, STRATEGIES, GREEDY, strategyById } from '../src/bots/index';
import { content } from '../src/sim/index';
const seed = process.argv[2] ?? 's1';
const which = process.argv[3] ? process.argv[3].split(',') : [...STRATEGIES, GREEDY].map((s) => s.id);
const lands = process.env.LANDS ? process.env.LANDS.split(',') : content.landscapes.map((l) => l.id);
const rocks = process.env.ROCKS ? process.env.ROCKS.split(',') : content.rocks.map((r) => r.id);
console.log('combo'.padEnd(20) + which.map((w) => w.slice(0, 7).padStart(8)).join(''));
for (const l of lands) for (const r of rocks) {
  const row: string[] = [];
  for (const w of which) {
    const res = runGame({ seed, landscape: l, rock: r }, [{ pid: 'p1', strategy: strategyById(w)!, mem: {} }]);
    row.push((res.finished ? res.minutes.toFixed(0) : '>' + Math.round(res.timeline[res.timeline.length - 1] * 100) + '%').padStart(8));
  }
  console.log(`${l}/${r}`.padEnd(20) + row.join(''));
}
