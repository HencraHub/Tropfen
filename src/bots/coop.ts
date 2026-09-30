import { content, landscapeDef, dist } from '../sim/index';
import { BotCtx } from './toolkit';
import { type Strategy, tropfmeister, keilschlaeger, hitzkopf } from './strategies';

/**
 * Coordinated team of two: one brain, two bodies.
 * A ("Baumeister") runs the shared plan: research, routes, drilling, wedges.
 * B ("Läufer") keeps a chain of workers running, carries water and wood and synchronises gushes with A.
 * Both share one memory object.
 */
export const teamAbgestimmt: Strategy = {
  id: 'team_abgestimmt', main: 'none',
  step(c) {
    const role = c.mem.roles as Record<string, 'A' | 'B'>;
    if (role[c.pid] !== 'A') return;
    // The plan is the wedge/drip hybrid of the solo bots, but purchases are made by A only.
    c.mem.perkPrefer = ['zaeher_traeger', 'quellrecht', 'dichte_rinnen', 'holzsegen'];
    c.perk();
    if (c.state.tick < 20 && c.state.eco.loan === 0) c.loan(200);
    if (c.opening()) return;
    keilschlaegerStep(c);
    // B's equipment is bought by A at the village too (A passes by anyway): B gets the axe.
    const b = c.state.players.find((p) => role[p.id] === 'B');
    if (b && !b.tools.includes('axt') && c.afford(25)) { c.out.push({ t: 'buyTool', p: b.id, tool: 'axt' }); c.spent += 25; }
    if (b && !b.tools.includes('eimer') && !b.tools.includes('tragjoch') && c.afford(20)) { c.out.push({ t: 'buyTool', p: b.id, tool: 'eimer' }); c.spent += 20; }
    // Chain: once workers are cheap relative to income, run a bucket chain to the drip zone
    const [la] = c.lineZones();
    const src = c.bestSource('near');
    if (src) {
      const s = c.state.sources.find((x) => x.id === src)!;
      const len = dist(s.pos, { x: 0, z: 0 }) - c.state.stone.radius;
      const need = Math.ceil(len / content.routes.carry.chainSpacing) - 3; // players cover 3 slots
      const chain = c.state.chains[0];
      if (!chain && c.state.workers.length >= Math.max(3, need) && need <= 8) {
        c.out.push({ t: 'chain', p: c.pid, source: src, target: { kind: 'zone', zone: la }, workers: c.state.workers.filter((w) => w.kind === 'traeger').map((w) => w.id) });
      }
    }
  },
  body(c) {
    const role = c.mem.roles as Record<string, 'A' | 'B'>;
    if (role[c.pid] === 'A') { keilschlaeger.body(c); return; }
    // ---- B
    if (!c.idle()) return;
    const chain = c.state.chains[0];
    if (chain && !c.p.chain && chain.workers.length >= 3) { c.out.push({ t: 'joinChain', p: c.pid, chain: chain.id }); return; }
    // wood for wedges when A has holes waiting
    const holesFree = c.state.stone.zones.reduce((a, z) => a + Math.max(0, z.holes - z.wedges), 0);
    if (c.hasTool('axt') && holesFree > c.wood && c.wood < 8) { c.chop(); return; }
    // otherwise water the driest wedge zone or the drip zone
    const [la, lb] = c.lineZones();
    let best = la, bw = 2;
    for (const z of [la, lb, (la + 1) % 8, (la + 7) % 8, (lb + 1) % 8, (lb + 7) % 8]) { const zz = c.zone(z); if (zz.wedges > 0 && zz.wedgeWet < bw) { bw = zz.wedgeWet; best = z; } }
    c.carryLoop({ kind: 'zone', zone: best });
  },
};

function keilschlaegerStep(c: BotCtx): void {
  // reuse the solo keilschlaeger's plan but skip its own opening (already done)
  c.mem.openingDone = true;
  keilschlaeger.step(c);
}

/** Two independent solo bots in one world, each with its own memory and plan. */
export function makeUncoordinatedPair(): { pid: string; strategy: Strategy; mem: Record<string, unknown> }[] {
  return [
    { pid: 'p1', strategy: keilschlaeger, mem: {} },
    { pid: 'p2', strategy: tropfmeister, mem: {} },
  ];
}

export function makeCoordinatedPair(): { pid: string; strategy: Strategy; mem: Record<string, unknown> }[] {
  const mem: Record<string, unknown> = { roles: { p1: 'A', p2: 'B' } };
  return [
    { pid: 'p1', strategy: teamAbgestimmt, mem },
    { pid: 'p2', strategy: teamAbgestimmt, mem },
  ];
}
void hitzkopf; void landscapeDef;
