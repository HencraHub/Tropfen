import { createGame, step, hourOf } from '../src/sim/index';
import { botCommands, strategyById } from '../src/bots/index';
const [land = 'flusstal', rock = 'basalt', which = 'hitzkopf', seed = 's1', maxMin = '40', every = '1200'] = process.argv.slice(2);
const seats = [{ pid: 'p1', strategy: strategyById(which)!, mem: {} }];
const s = createGame({ seed, landscape: land, rock, players: [{ id: 'p1', name: which }] });
let lastLog = 0;
const counts: Record<string, number> = {};
while (!s.finished && s.tick < Number(maxMin) * 600) {
  step(s, botCommands(s, seats));
  for (const l of s.log) if (l.tick >= lastLog) counts[l.kind] = (counts[l.kind] ?? 0) + 1;
  lastLog = s.tick;
  if (s.tick % Number(every) === 0) {
    const p = s.players[0];
    const tanks = s.buildings.filter((b) => b.cap > 0).map((b) => `${b.type}${b.active ? '' : '*'}:${b.liters.toFixed(0)}L@${b.temp.toFixed(0)}°`).join(' ');
    const fires = s.buildings.filter((b) => b.type === 'feuerstelle' || b.type === 'brennspiegel').map((b) => `${b.type[0]}${b.zone}${b.timer > 0 ? '🔥' : ''}`).join(' ');
    const z = s.stone.zones;
    console.log(`${(s.tick / 600).toFixed(0).padStart(3)}min h${hourOf(s.tick).toFixed(0).padStart(2)} ${s.weather.today.padEnd(10)} $${s.eco.money.toFixed(0).padStart(5)} wood${String(s.eco.wood).padStart(3)} prog${(s.stone.progress / s.stone.hp * 100).toFixed(1).padStart(5)}% T=${z.map((x) => x.T.toFixed(0)).join('/')} fill=${z.map((x) => x.fill.toFixed(0)).join('/')} wet=${z.map((x) => x.wet.toFixed(1)).join('/')} ${tanks} ${fires} p@(${p.pos.x.toFixed(0)},${p.pos.z.toFixed(0)}) carry${p.carry.toFixed(0)} ${p.action?.kind ?? ''} q${p.queue.length} routes=${s.routes.map((r) => r.flow.toFixed(1)).join(',')} W=${s.workers.map((w) => (w.task?.type ?? '-')[0] + (w.task?.type === 'carry' ? (w.task.target.kind === 'zone' ? w.task.target.zone : w.task.target.kind[0]) : '') + w.phase[0]).join(' ')} ev=${Object.entries(counts).filter(([k]) => ['release', 'freeze', 'thermoschock', 'steamOk', 'steamFail', 'charge', 'stumble', 'strike'].includes(k)).map(([k, v]) => k.slice(0, 5) + v).join(' ')}`);
  }
}
console.log('END', (s.tick / 600).toFixed(1), 'min, dmg', JSON.stringify(Object.fromEntries(Object.entries(s.stone.dmg).map(([k, v]) => [k, Math.round(v)]))));
