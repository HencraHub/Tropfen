import { content, landscapeDef, rockDef } from './content';
import { evapFraction, perkValue, eventValue } from './effects';
import type { GameState } from './types';

/**
 * Water arrives at a stone zone. Handles evaporation, wetting, cooling, council pay,
 * frost fill, wedge wetting and burst accumulation (thermal shock).
 * `burst` = delivered within a single tick as one gush (bucket, valve, cart).
 */
export function waterOnZone(state: GameState, zone: number, liters: number, temp: number, burst: boolean, drip = false, paid = true): number {
  if (liters <= 0) return 0;
  const z = state.stone.zones[zone];
  const rock = rockDef(state.stone.rock);
  const T0 = z.T;
  const e = evapFraction(state, z.T);
  const eff = liters * (1 - e);
  if (paid) {
    state.stats.waterDelivered += liters;
    state.stats.waterEffective += eff;
    // council pays for effective water
    const land = landscapeDef(state.landscape);
    const pay = eff * content.economy.payPerLiter * land.councilFactor * perkValue(state, 'council', 1);
    earn(state, pay, 'council');
  }
  // wetness and cooling
  z.wet = Math.min(1, z.wet + eff / 40);
  const mass = rock.thermalMass;
  z.T -= (z.T - temp) * Math.min(1, liters / mass);
  // frost fill
  const p = state.stone.progress / state.stone.hp;
  const f = content.methods.frost;
  const cap = f.capBase + f.capPerProgress * p;
  if (!z.frozen) z.fill = Math.min(cap, z.fill + eff * f.fillFraction);
  // wedges
  if (z.wedges > 0) z.wedgeWet = Math.min(1, z.wedgeWet + eff / (content.methods.keile.litersPerWedge * z.wedges));
  if (burst) {
    if (z.burst <= 0) z.burstT0 = T0;
    z.burstTemp = (z.burstTemp * z.burst + temp * liters) / (z.burst + liters);
    z.burst += liters;
    z.burstTicks = content.methods.thermoschock.burstWindowTicks;
  }
  if (drip) z.drip += liters / 0.1; // L/s equivalent this tick
  return eff;
}

export function earn(state: GameState, amount: number, kind: 'council' | 'premium' | 'sale' | 'spectators'): void {
  if (amount <= 0) return;
  let a = amount;
  if (state.eco.loan > 0) {
    const repay = Math.min(state.eco.loan, a * content.economy.loan.repayShare);
    state.eco.loan -= repay;
    a -= repay;
  }
  state.eco.money += a;
  state.eco.earned += amount;
  state.stats.moneyEarned += amount;
  state.eco.income[kind] += amount;
}

export function spend(state: GameState, amount: number): boolean {
  if (state.eco.money + 1e-9 < amount) return false;
  state.eco.money -= amount;
  state.eco.spent += amount;
  state.stats.moneySpent += amount;
  return true;
}

export function sourceRate(state: GameState, sourceId: string): number {
  const s = state.sources.find((x) => x.id === sourceId);
  if (!s || !s.unlocked) return 0;
  let r = s.flow * eventValue(state, 'sourceFlow', 1) * perkValue(state, 'sourceFlow', 1);
  const w = content.weather[state.weather.today];
  if (s.kind === 'regen') r *= w.rain;
  else if (s.kind === 'tau') {
    const h = (state.tick % 3600) / 150;
    r *= state.weather.dewToday && h >= 4 && h < 8 ? 1 : 0;
  } else if (s.kind === 'fluss' || s.kind === 'quelle') {
    r *= 0.7 + 0.3 * s.reliability + (s.kind === 'quelle' ? 0.3 * (w.sun > 0.6 ? 1 : 0) : 0);
  }
  return r;
}
