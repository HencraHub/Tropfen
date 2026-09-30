import { createGame, step } from '../src/sim/index';
import { makeCoordinatedPair, makeUncoordinatedPair } from '../src/bots/index';
import { botCommands, strategyById } from '../src/bots/index';
const [land = 'flusstal', rock = 'granit', which = 'hitzkopf', seed = 's1', maxMin = '10'] = process.argv.slice(2);
const seats = which === 'coopA' ? makeCoordinatedPair() : which === 'coopN' ? makeUncoordinatedPair() : [{ pid: 'p1', strategy: strategyById(which)!, mem: {} }];
const state = createGame({ seed, landscape: land, rock, mode: seats.length > 1 ? 'coop' : 'solo', players: seats.map((s) => ({ id: s.pid, name: s.strategy.id })) });
let lastLog = 0;
while (!state.finished && state.tick < Number(maxMin) * 600) {
  const cmds = botCommands(state, seats);
  if (cmds.length && state.tick < 3000) console.log(state.tick, JSON.stringify(cmds).slice(0, 200));
  step(state, cmds);
  for (const l of state.log) if (l.tick >= lastLog && !['scoop','pour'].includes(l.kind)) console.log('  LOG', l.tick, l.kind, l.id ?? '', l.zone ?? '', l.value !== undefined ? Math.round(l.value) : '', l.text ?? '');
  lastLog = state.tick;
  if (state.tick % Number(process.env.EVERY ?? 3000) === 0) for (const p of state.players) { console.log(`t=${state.tick} min=${(state.tick/600).toFixed(1)} money=${state.eco.money.toFixed(0)} inc=${Object.entries(state.eco.income).map(([k,v])=>k[0]+Math.round(v)).join("/")} spent=${Math.round(state.eco.spent)} effL=${Math.round(state.stats.waterEffective)}/${Math.round(state.stats.waterDelivered)} wood=${state.eco.wood} prog=${(state.stone.progress/state.stone.hp*100).toFixed(1)}% pos=(${p.pos.x.toFixed(0)},${p.pos.z.toFixed(0)}) carry=${p.carry.toFixed(0)} tools=${p.tools} action=${p.action?.kind} mt=${JSON.stringify(p.moveTarget)} workers=${state.workers.length}(${state.workers.map(w=>w.task?.type[0]+w.phase[0]).join('')}) Tline=${state.stone.zones.map(z=>z.T.toFixed(0)).join('/')} chains=${state.chains.map(c=>c.workers.length+'+'+c.players.length+'='+c.flow.toFixed(2))} routes=${state.routes.map(r=>r.kind+':'+r.ok+':'+r.flow.toFixed(2))} bld=${state.buildings.map(b=>b.type+(b.active?'':'*')+(b.cap?':'+b.liters.toFixed(0):''))} dmg=${JSON.stringify(Object.fromEntries(Object.entries(state.stone.dmg).map(([k,v])=>[k,Math.round(v)])))}`); }
}
