import { createGame, step } from '../src/sim/index';
const s = createGame({ seed: 'bench', landscape: 'flusstal', rock: 'granit' });
for (let i = 0; i < 5000; i++) step(s, []);
const t0 = performance.now();
for (let i = 0; i < 30000; i++) step(s, []);
console.log(((performance.now() - t0) / 30000 * 1000).toFixed(2), 'us/tick');
