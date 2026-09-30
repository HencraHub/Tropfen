import { describe, it, expect } from 'vitest';
import { createGame, step, hashState, type Command, type GameState } from '../src/sim/index';
import { botCommands, strategyById, makeCoordinatedPair } from '../src/bots/index';

function playFor(state: GameState, seats: Parameters<typeof botCommands>[1], ticks: number, record?: Command[][]): void {
  for (let i = 0; i < ticks; i++) { const cmds = botCommands(state, seats); if (record) record.push(cmds); step(state, cmds); }
}

describe('Determinismus', () => {
  it('gleicher Seed und gleiche Kommandos ergeben denselben Zustand', () => {
    const a = createGame({ seed: 'det', landscape: 'flusstal', rock: 'granit' });
    const b = createGame({ seed: 'det', landscape: 'flusstal', rock: 'granit' });
    const seatsA = [{ pid: 'p1', strategy: strategyById('keilschlaeger')!, mem: {} }];
    const rec: Command[][] = [];
    playFor(a, seatsA, 6000, rec);
    for (const cmds of rec) step(b, cmds);
    expect(hashState(b)).toBe(hashState(a));
  });

  it('JSON-Schnappschuss und Weiterspielen (Lockstep) bleiben identisch', () => {
    const a = createGame({ seed: 'snap', landscape: 'kueste', rock: 'basalt', mode: 'coop', players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] });
    const seats = makeCoordinatedPair();
    playFor(a, seats, 5000);
    const copy = JSON.parse(JSON.stringify(a)) as GameState;
    expect(hashState(copy)).toBe(hashState(a));
    const rec: Command[][] = [];
    playFor(a, seats, 6000, rec);
    for (const cmds of rec) step(copy, JSON.parse(JSON.stringify(cmds)));
    expect(copy.tick).toBe(a.tick);
    if (hashState(copy) !== hashState(a)) {
      // find the first differing top-level field for the report
      const diff = Object.keys(a).filter((k) => JSON.stringify((a as unknown as Record<string, unknown>)[k]) !== JSON.stringify((copy as unknown as Record<string, unknown>)[k]));
      expect(diff, 'abweichende Felder').toEqual([]);
    }
    expect(hashState(copy)).toBe(hashState(a));
  });

  it('kein NaN im Zustand nach einer langen Partie', () => {
    const a = createGame({ seed: 'nan', landscape: 'steppe', rock: 'sandstein' });
    playFor(a, [{ pid: 'p1', strategy: strategyById('hitzkopf')!, mem: {} }], 20000);
    let nan = 0;
    const walk = (v: unknown): void => { if (typeof v === 'number') { if (!Number.isFinite(v)) nan++; } else if (v && typeof v === 'object') for (const x of Object.values(v as Record<string, unknown>)) walk(x); };
    walk(a);
    expect(nan).toBe(0);
  });
});
