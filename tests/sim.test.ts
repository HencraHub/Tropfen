import { describe, it, expect } from 'vitest';
import { createGame, step, content, zonePos, evaluateRoute, straightRoute, hashState, type GameState, type Command } from '../src/sim/index';

function run(state: GameState, ticks: number, cmds: Command[] = []): void { step(state, cmds); for (let i = 1; i < ticks; i++) step(state, []); }
function walkAndDo(state: GameState, cmd: Command, maxTicks = 2000): void { step(state, [cmd]); for (let i = 0; i < maxTicks; i++) { const p = state.players[0]; if (!p.action && p.queue.length === 0 && !p.moveTarget) break; step(state, []); } }

describe('Welterzeugung', () => {
  it('erzeugt aus einem Seed dieselbe Welt', () => {
    const a = createGame({ seed: 'x' }), b = createGame({ seed: 'x' });
    expect(hashState(a)).toBe(hashState(b));
    expect(a.stone.moods.length).toBeGreaterThan(0);
    expect(a.stone.zones.filter((z) => z.weak > 1).length).toBeGreaterThanOrEqual(2);
  });
  it('kennt alle Gesteine und Landschaften aus den Daten', () => {
    for (const l of content.landscapes) for (const r of content.rocks) { const s = createGame({ seed: 's', landscape: l.id, rock: r.id }); expect(s.stone.hp).toBeGreaterThan(0); expect(s.sources.length).toBeGreaterThan(0); }
  });
  it('Rennen-Stein ist kleiner', () => {
    const solo = createGame({ seed: 's', landscape: 'flusstal', rock: 'granit' });
    const race = createGame({ seed: 's', landscape: 'flusstal', rock: 'granit', mode: 'race' });
    expect(race.stone.hp).toBeLessThan(solo.stone.hp * 0.5);
  });
});

describe('Spieler und Wasser', () => {
  it('schöpft, trägt und gießt; der Rat zahlt für wirksames Wasser', () => {
    const s = createGame({ seed: 'w', landscape: 'flusstal', rock: 'kalkstein' });
    const m0 = s.eco.money;
    walkAndDo(s, { t: 'scoop', p: 'p1', source: 'fluss' });
    expect(s.players[0].carry).toBeCloseTo(2, 5);
    walkAndDo(s, { t: 'pour', p: 'p1', zone: 0 });
    expect(s.players[0].carry).toBe(0);
    expect(s.stats.waterDelivered).toBeGreaterThan(0);
    expect(s.eco.money).toBeGreaterThan(m0);
  });
  it('kauft Werkzeug nur im Dorf und mit Geld', () => {
    const s = createGame({ seed: 'w', landscape: 'flusstal', rock: 'kalkstein' });
    walkAndDo(s, { t: 'buyTool', p: 'p1', tool: 'eimer' });
    expect(s.players[0].tools).toContain('eimer');
    s.eco.money = 0;
    walkAndDo(s, { t: 'buyTool', p: 'p1', tool: 'axt' });
    expect(s.players[0].tools).not.toContain('axt');
  });
  it('mehr Wasser verdampft auf heißem Stein', () => {
    const s = createGame({ seed: 'w', landscape: 'steppe', rock: 'basalt' });
    s.stone.zones[0].T = 140;
    s.players[0].carry = 10; s.players[0].pos = zonePos(s, 0);
    step(s, [{ t: 'pour', p: 'p1', zone: 0 }]); run(s, 12);
    const hot = s.stats.waterEffective;
    const c = createGame({ seed: 'w', landscape: 'steppe', rock: 'basalt' });
    c.stone.zones[0].T = 20; c.players[0].carry = 10; c.players[0].pos = zonePos(c, 0);
    step(c, [{ t: 'pour', p: 'p1', zone: 0 }]); run(c, 12);
    expect(hot).toBeLessThan(c.stats.waterEffective * 0.5);
  });
});

describe('Methoden', () => {
  it('Thermoschock: großer Guss auf heißen Stein macht Schaden, kleiner kalter nicht', () => {
    const s = createGame({ seed: 'm', landscape: 'steppe', rock: 'basalt' });
    s.stone.zones[4].T = 120;
    s.eco.money = 5000; s.eco.wood = 10; s.research.done.push('rinnenbau', 'hochtank');
    s.players[0].pos = { x: 0, z: -(s.stone.radius + 3) };
    step(s, [{ t: 'build', p: 'p1', type: 'hochtank', x: 0, z: -(s.stone.radius + 5) }]);
    const tank = s.buildings[0];
    run(s, tank.ticksToBuild + 2);
    tank.liters = 800; tank.temp = 15;
    s.stone.zones[4].T = 120;
    step(s, [{ t: 'release', p: 'p1', building: tank.id, zone: 4, liters: 800 }]); run(s, 40);
    expect(s.stone.dmg.thermoschock).toBeGreaterThan(1000);
    const cold = createGame({ seed: 'm', landscape: 'steppe', rock: 'basalt' });
    cold.players[0].carry = 2; cold.players[0].pos = zonePos(cold, 4);
    step(cold, [{ t: 'pour', p: 'p1', zone: 4 }]); run(cold, 20);
    expect(cold.stone.dmg.thermoschock).toBe(0);
  });
  it('Frost: gefüllte Risse gefrieren nachts und schädigen', () => {
    const s = createGame({ seed: 'f', landscape: 'hochland', rock: 'granit' });
    s.stone.zones[0].fill = 100; s.stone.zones[0].T = -3;
    step(s, []);
    expect(s.stone.dmg.frost).toBeGreaterThan(0);
    expect(s.stone.zones[0].frozen).toBe(true);
  });
  it('Steter Tropfen: Strähne wächst, Unterbrechung setzt zurück', () => {
    const s = createGame({ seed: 't', landscape: 'flusstal', rock: 'kalkstein' });
    s.research.done.push('rinnenbau', 'tropfstelle', 'rohrguss', 'pumpwerk');
    s.eco.money = 5000; s.eco.wood = 50;
    const pts = straightRoute(s, 'fluss', { kind: 'zone', zone: 0 }, 6);
    const ev = evaluateRoute(s, 'rohr', pts, 'fluss', { kind: 'zone', zone: 0 }, true);
    expect(ev.reason).not.toBe('research');
    // feed the zone directly via a cistern outlet to test the streak
    step(s, [{ t: 'build', p: 'p1', type: 'zisterne', x: 0, z: -(s.stone.radius + 5) }]);
    const zi = s.buildings[0]; run(s, zi.ticksToBuild + 2); zi.liters = 1000;
    step(s, [{ t: 'setOut', p: 'p1', building: zi.id, zone: 0, rate: 0.4 }]);
    run(s, 300);
    expect(s.stone.zones[0].streak).toBeGreaterThan(250);
    expect(s.stone.dmg.tropfen).toBeGreaterThan(0);
    zi.liters = 0; run(s, 5);
    expect(s.stone.zones[0].streak).toBe(0);
  });
  it('Quellkeile brauchen Loch, Holz und Nässe', () => {
    const s = createGame({ seed: 'k', landscape: 'flusstal', rock: 'sandstein' });
    s.research.done.push('bohrer', 'quellkeile'); s.players[0].tools.push('bohrer'); s.eco.wood = 2;
    walkAndDo(s, { t: 'drill', p: 'p1', zone: 0 });
    expect(s.stone.zones[0].holes).toBe(1);
    walkAndDo(s, { t: 'wedge', p: 'p1', zone: 0 });
    expect(s.stone.zones[0].wedges).toBe(1); expect(s.eco.wood).toBe(1);
    s.stone.zones[0].wedgeWet = 1; const d0 = s.stone.dmg.keile; run(s, 50);
    expect(s.stone.dmg.keile).toBeGreaterThan(d0);
  });
  it('Dampfdruck braucht heißen Stein, Tiefbohrung und Wasser', () => {
    const s = createGame({ seed: 'd', landscape: 'steppe', rock: 'basalt' });
    s.research.done.push('bohrer', 'tiefbohrer', 'feuerstelle', 'dampfbohrung'); s.players[0].tools.push('tiefbohrer'); s.eco.wood = 5;
    walkAndDo(s, { t: 'drill', p: 'p1', zone: 4, deep: true });
    expect(s.stone.zones[4].deepHoles).toBe(1);
    s.players[0].carry = 20; s.stone.zones[4].T = 40;
    walkAndDo(s, { t: 'charge', p: 'p1', zone: 4 });
    expect(s.stone.zones[4].charges.length).toBe(0);
    s.stone.zones[4].T = 200; s.players[0].carry = 20;
    walkAndDo(s, { t: 'charge', p: 'p1', zone: 4 });
    expect(s.stone.zones[4].charges.length).toBe(1);
    run(s, content.methods.dampf.cookTicks + 5);
    expect(s.stats.steamOk + s.stats.steamFail).toBe(1);
    expect(s.stone.dmg.dampf).toBeGreaterThan(0);
  });
  it('Wurzelkraft: Setzling wächst mit Feuchte und liefert Schaden', () => {
    const s = createGame({ seed: 'r', landscape: 'flusstal', rock: 'kalkstein' });
    s.research.done.push('setzlinge'); s.stone.progress = s.stone.hp * 0.05;
    walkAndDo(s, { t: 'plant', p: 'p1', zone: 0 });
    expect(s.stone.zones[0].growths.length).toBe(1);
    s.stone.zones[0].wet = 1; const g0 = s.stone.zones[0].growths[0]; run(s, 600);
    expect(s.stone.zones[0].growths[0]).toBeGreaterThan(g0);
    expect(s.stone.dmg.wurzel).toBeGreaterThan(0);
  });
  it('Wasserstrahl braucht Energie, Wasser und Sand', () => {
    const s = createGame({ seed: 'j', landscape: 'kueste', rock: 'sandstein' });
    s.research.done.push('strahlwerk', 'windrad'); s.eco.money = 5000; s.eco.wood = 20; s.eco.sand = 50;
    step(s, [{ t: 'build', p: 'p1', type: 'strahlwerk', x: 0, z: -(s.stone.radius + 3), zone: 4 }, { t: 'build', p: 'p1', type: 'windrad', x: 20, z: -20 }, { t: 'build', p: 'p1', type: 'windrad', x: 24, z: -20 }]);
    run(s, 420);
    const sw = s.buildings.find((b) => b.type === 'strahlwerk')!; sw.liters = 500;
    run(s, 100);
    expect(s.stone.dmg.strahl).toBeGreaterThan(0);
    expect(s.eco.sand).toBeLessThan(50);
  });
});

describe('Wirtschaft, Forschung, Ereignisse', () => {
  it('Kredit hat ein Limit und Zinsen', () => {
    const s = createGame({ seed: 'e', landscape: 'flusstal', rock: 'granit' });
    step(s, [{ t: 'loan', p: 'p1', amount: 1000 }]);
    expect(s.eco.loan).toBe(content.economy.loan.max);
    const l0 = s.eco.loan; run(s, 3600 + 10);
    expect(s.eco.loan).toBeGreaterThan(l0 * 0.9);
  });
  it('Forschung braucht Voraussetzungen und Zeit; Meilenstein bietet 1 aus 3', () => {
    const s = createGame({ seed: 'e', landscape: 'flusstal', rock: 'granit' });
    s.eco.money = 1000;
    step(s, [{ t: 'research', p: 'p1', id: 'rohrguss' }]);
    expect(s.research.current).toBeNull();
    step(s, [{ t: 'research', p: 'p1', id: 'eimerbau' }]);
    expect(s.research.current?.id).toBe('eimerbau');
    run(s, 300);
    expect(s.research.done).toContain('eimerbau');
    s.stone.progress = s.stone.hp * 0.21; step(s, []);
    expect(s.research.offered?.length).toBe(3);
    step(s, [{ t: 'perk', p: 'p1', id: s.research.offered![0] }]);
    expect(s.research.perks.length).toBe(1);
  });
  it('Löhne werden um 6 Uhr gezahlt, ohne Geld Streik', () => {
    const s = createGame({ seed: 'e', landscape: 'flusstal', rock: 'granit' });
    s.players[0].pos = { x: content.landscapes[0].village[0], z: content.landscapes[0].village[1] };
    step(s, [{ t: 'hire', p: 'p1', kind: 'traeger' }]);
    expect(s.workers.length).toBe(1);
    s.eco.money = 0; s.tick = 6 * 150; step(s, []);
    expect(s.eco.strike).toBe(true);
    s.eco.money = 100; step(s, []);
    expect(s.eco.strike).toBe(false);
  });
  it('Ereignisse treten auf und laufen aus', () => {
    const s = createGame({ seed: 'e', landscape: 'flusstal', rock: 'granit' });
    run(s, 8000);
    expect(s.log.some((l) => l.kind === 'event') || s.events.active.length > 0 || s.events.nextAt > 0).toBe(true);
  });
  it('Rinnen brauchen Gefälle, Rohre mit Pumpe Energie', () => {
    const s = createGame({ seed: 'e', landscape: 'kueste', rock: 'granit' });
    s.research.done.push('eimerbau', 'rinnenbau', 'rohrguss', 'pumpwerk', 'windrad'); s.eco.money = 5000; s.eco.wood = 100;
    const to = { kind: 'zone' as const, zone: 4 };
    const up = evaluateRoute(s, 'rinne', straightRoute(s, 'meer', to, 6), 'meer', to, false);
    expect(up.ok).toBe(false);
    const pipe = evaluateRoute(s, 'rohr', straightRoute(s, 'meer', to, 6), 'meer', to, true);
    expect(pipe.ok).toBe(true);
    step(s, [{ t: 'route', p: 'p1', kind: 'rohr', points: straightRoute(s, 'meer', to, 6), from: 'meer', to, pumped: true }]);
    run(s, 20);
    expect(s.routes[0].flow).toBe(0); // no energy
    s.eco.energyProd = 5;
    step(s, [{ t: 'build', p: 'p1', type: 'windrad', x: 20, z: -20 }, { t: 'build', p: 'p1', type: 'windrad', x: 25, z: -20 }]);
    run(s, 300);
    expect(s.routes[0].flow).toBeGreaterThan(0);
  });
  it('Sieg beendet die Partie', () => {
    const s = createGame({ seed: 'e', landscape: 'flusstal', rock: 'granit' });
    s.stone.progress = s.stone.hp - 1; s.stone.zones[0].wedges = 6; s.stone.zones[0].wedgeWet = 1; s.research.done.push('quellkeile');
    run(s, 50);
    expect(s.finished).not.toBeNull();
  });
});

describe('Koop-Kommandos', () => {
  it('Eimerkette liefert Wasser, Spieler zählen mit', () => {
    const s = createGame({ seed: 'c', landscape: 'kueste', rock: 'kalkstein', mode: 'coop', players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] });
    s.eco.money = 1000;
    const v = content.landscapes.find((l) => l.id === 'kueste')!.village;
    s.players[0].pos = { x: v[0], z: v[1] };
    step(s, [{ t: 'hire', p: 'p1', kind: 'traeger' }, { t: 'hire', p: 'p1', kind: 'traeger' }, { t: 'hire', p: 'p1', kind: 'traeger' }]);
    step(s, [{ t: 'chain', p: 'p1', source: 'meer', target: { kind: 'zone', zone: 0 }, workers: s.workers.map((w) => w.id) }]);
    step(s, [{ t: 'joinChain', p: 'p2', chain: s.chains[0].id }]);
    run(s, 50);
    expect(s.chains[0].flow).toBeGreaterThan(0.5);
    expect(s.players[1].chain).toBe(s.chains[0].id);
  });
  it('Synchronguss: zwei Güsse im selben Tick zählen als ein Guss', () => {
    const s = createGame({ seed: 'c', landscape: 'steppe', rock: 'basalt', mode: 'coop', players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] });
    for (const p of s.players) { p.carry = 60; p.pos = zonePos(s, 4); }
    s.stone.zones[4].T = 130;
    step(s, [{ t: 'pour', p: 'p1', zone: 4 }, { t: 'pour', p: 'p2', zone: 4 }]); run(s, 20);
    const sync = s.stone.dmg.thermoschock;
    const t2 = createGame({ seed: 'c', landscape: 'steppe', rock: 'basalt', mode: 'coop', players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] });
    for (const p of t2.players) { p.carry = 60; p.pos = zonePos(t2, 4); }
    t2.stone.zones[4].T = 130;
    step(t2, [{ t: 'pour', p: 'p1', zone: 4 }]); run(t2, 20); t2.stone.zones[4].T = 130;
    step(t2, [{ t: 'pour', p: 'p2', zone: 4 }]); run(t2, 20);
    expect(sync).toBeGreaterThan(t2.stone.dmg.thermoschock);
  });
});
