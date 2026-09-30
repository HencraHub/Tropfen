import type { Strategy } from './strategies';
import { tropfmeister } from './strategies';
import { dist, content } from '../sim/index';

/**
 * Coordinated team: two drip players who split the work.
 * Arbeitsteilung: A taps the stone and takes the loan (one opening for the team), A's channel feeds line zone 1,
 *   B's channel feeds line zone 2, so "Doppeltropf" counts two drip points; B never hires carriers of its own.
 * Eimerkette: as soon as the team has three carriers and the source is near, B forms a bucket chain with them
 *   to its zone (a drip point long before B's channel exists) and steps out only for its own village trips.
 * Synchronguss: when the sunny line zone is hot and both carry water, A calls a synchronised gush.
 * Two solo players (the uncoordinated pair) both tap, both take a loan, both build into the same zone.
 */
export const teamAbgestimmt: Strategy = {
  id: 'team_abgestimmt', main: 'none',
  step(c) {
    const roles = c.mem.roles as Record<string, 'A' | 'B'>;
    const role = roles[c.pid];
    const me = c.mem[role] as Record<string, unknown>;
    const saved = c.mem;
    // each role has its own plan memory, the team memory holds the roles and the shared opening
    if (role === 'B') {
      me.openingDone = true; me.noLoan = false; me.noCarriers = true; me.dripZone = 1; me.noSecondRoute = true;
      // B waits with building until A has tapped the stone and set the line (Arbeitsteilung, one opening)
      if (!(c.mem.A as Record<string, unknown>).openingDone) { c.carryTools(); return; }
    }
    else { me.dripZone = 0; me.noSecondRoute = true; me.maxCarriers = 2; }
    me.perkPrefer = ['dichte_rinnen', 'quellrecht', 'ratsgunst', 'zaeher_traeger'];
    c.mem = me;
    tropfmeister.step(c);
    c.mem = saved;
    if (role !== 'B') return;
    // B: bucket chain from the richest near source with two own hands plus itself; leave it for village trips
    const p = c.p;
    const chain = c.state.chains[0];
    if (p.chain && p.queue.length > 0) { c.out.push({ t: 'leaveChain', p: c.pid }); return; }
    const lb = c.lineZones()[1];
    if (!chain && !c.hasRoute({ kind: 'zone', zone: lb })) {
      let src: string | null = null, best = 0;
      for (const s of c.state.sources) { if (!s.unlocked || s.kind === 'regen' || s.kind === 'tau') continue; const len = dist(s.pos, { x: 0, z: 0 }) - c.state.stone.radius; if (len > 130) continue; if (s.flow > best) { best = s.flow; src = s.id; } }
      if (src) {
        const s = c.state.sources.find((x) => x.id === src)!;
        const len = dist(s.pos, { x: 0, z: 0 }) - c.state.stone.radius;
        const mine = c.state.workers.filter((w) => w.kind === 'traeger' && w.task && w.task.type === 'chain');
        const want = Math.min(3, Math.max(2, Math.ceil(len / content.routes.carry.chainSpacing) - 1));
        const chainHands = c.state.workers.filter((w) => w.kind === 'traeger' && (w.task === null || (w.task.type === 'carry' && (w.task as { source: string }).source === src && c.mem.bHired)));
        if (chainHands.length < want) { if (c.state.workers.length < c.state.eco.workerSlots && c.afford(60)) { c.hire('traeger', { type: 'carry', source: src, target: { kind: 'zone', zone: lb } }); (c.mem as Record<string, unknown>).bHired = true; } }
        else c.out.push({ t: 'chain', p: c.pid, source: src, target: { kind: 'zone', zone: lb }, workers: chainHands.slice(0, want).map((w) => w.id) });
        void mine;
      }
    }
    // dissolve the chain when B's channel exists or when the source is used up by the channels: hands become carriers
    if (chain) {
      const starved = chain.flow < 0.05 ? ((c.mem.starved as number) ?? 0) + 1 : 0;
      c.mem.starved = starved;
      const la = c.lineZones()[0];
      const srcFlow = c.state.sources.find((x) => x.id === chain.source)?.flow ?? 0;
      // a scarce source cannot feed both the channel and the chain: once A's channel runs, the hands carry instead
      if (c.hasRoute({ kind: 'zone', zone: lb }) || (starved > 40 && c.state.tick > 3000) || (c.hasRoute({ kind: 'zone', zone: la }) && srcFlow < 2.5)) {
        c.out.push({ t: 'unchain', p: c.pid, chain: chain.id });
        const src = c.bestSource('near');
        if (src) for (const w of chain.workers) c.out.push({ t: 'assign', p: c.pid, worker: w, task: { type: 'carry', source: src, target: { kind: 'zone', zone: lb } } });
      }
    } else if (c.state.tick > 3000) {
      // no chain possible: B keeps two carriers of its own on its zone
      const mine = c.state.workers.filter((w) => w.kind === 'traeger' && w.task && w.task.type === 'carry' && (w.task.target as { zone?: number }).zone === lb);
      if (mine.length < 2 && c.state.workers.length < c.state.eco.workerSlots) { const src = c.bestSource('near'); if (src) c.hire('traeger', { type: 'carry', source: src, target: { kind: 'zone', zone: lb } }); }
    }
  },
  body(c) {
    const roles = c.mem.roles as Record<string, 'A' | 'B'>;
    const role = roles[c.pid];
    const me = c.mem[role] as Record<string, unknown>;
    const saved = c.mem; c.mem = me;
    if (role === 'B') {
      const chain = c.state.chains[0];
      if (chain && !c.p.chain && c.idle()) { c.out.push({ t: 'joinChain', p: c.pid, chain: chain.id }); c.mem = saved; return; }
    }
    // synchronised gush: both carry water and the sunny line zone is hot
    const st = c.state;
    const [l0, l1] = c.lineZones();
    const hz = st.stone.zones[l0].T > st.stone.zones[l1].T ? l0 : l1;
    const both = st.players.every((pl) => pl.carry >= 8);
    if (role === 'A' && both && st.stone.zones[hz].T - 20 > 60 && !st.syncCall && c.idle()) c.out.push({ t: 'syncCall', p: c.pid, inTicks: 60 });
    if (st.syncCall && st.tick >= st.syncCall.tick - 60 && c.p.carry >= 8 && !c.p.chain) {
      if (st.tick >= st.syncCall.tick && c.idle()) c.out.push({ t: 'pour', p: c.pid, zone: hz });
      else if (c.idle()) { const zp = { x: 0, z: -(st.stone.radius + 2) }; c.goto(zp.x, zp.z); }
      c.mem = saved; return;
    }
    tropfmeister.body(c);
    c.mem = saved;
  },
};

/** Two independent solo bots in one world: own memory, own opening, own loan, own purchases, no chain. */
export function makeUncoordinatedPair(): { pid: string; strategy: Strategy; mem: Record<string, unknown> }[] {
  return [
    { pid: 'p1', strategy: tropfmeister, mem: {} },
    { pid: 'p2', strategy: tropfmeister, mem: {} },
  ];
}

export function makeCoordinatedPair(): { pid: string; strategy: Strategy; mem: Record<string, unknown> }[] {
  const mem: Record<string, unknown> = { roles: { p1: 'A', p2: 'B' }, A: {}, B: {} };
  return [
    { pid: 'p1', strategy: teamAbgestimmt, mem },
    { pid: 'p2', strategy: teamAbgestimmt, mem },
  ];
}
