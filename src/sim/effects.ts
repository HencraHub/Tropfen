import { content, landscapeDef, perkDef, moodDef, eventDef, type WeatherDef } from './content';
import type { GameState, Vec2 } from './types';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from './types';
import { dsin, dcos, dhypot, PI } from './dmath';

export function hourOf(tick: number): number {
  return (tick % TICKS_PER_DAY) / TICKS_PER_HOUR;
}
export function dayOf(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY);
}
export function isNight(tick: number): boolean {
  const h = hourOf(tick);
  return h < 6 || h >= 19;
}

export function weatherNow(state: GameState): WeatherDef {
  return content.weather[state.weather.today] ?? content.weather.sonnig;
}

export function perkValue(state: GameState, key: string, def: number): number {
  let v = def;
  for (const id of state.research.perks) {
    const p = perkDef(id);
    if (p && typeof p[key] === 'number') v = key === 'nightTemp' || key === 'dayTemp' ? v + (p[key] as number) : v * (p[key] as number);
  }
  return v;
}
export function hasPerk(state: GameState, id: string): boolean {
  return state.research.perks.includes(id);
}
export function moodValue(state: GameState, key: string, def: number): number {
  let v = def;
  for (const id of state.stone.moods) {
    const m = moodDef(id);
    if (m && typeof m[key] === 'number') v *= m[key] as number;
  }
  return v;
}
export function eventValue(state: GameState, key: string, def: number): number {
  let v = def;
  for (const e of state.events.active) {
    const d = eventDef(e.id);
    if (d && typeof d.effect[key] === 'number') v *= d.effect[key] as number;
  }
  return v;
}
export function eventFlag(state: GameState, key: string): boolean {
  for (const e of state.events.active) {
    const d = eventDef(e.id);
    if (d && d.effect[key] === true) return true;
  }
  return false;
}
export function hasResearch(state: GameState, id: string | undefined): boolean {
  return !id || state.research.done.includes(id);
}

/** Ambient air temperature in °C. */
export function ambient(state: GameState): number {
  const l = landscapeDef(state.landscape);
  const h = hourOf(state.tick);
  const w = weatherNow(state);
  const day = l.climate.day + perkValue(state, 'dayTemp', 0);
  const night = l.climate.night + perkValue(state, 'nightTemp', 0);
  // smooth bump peaking at 13h
  let s = 0;
  if (h > 5 && h < 21) s = dsin((PI * (h - 5)) / 16);
  return night + (day - night) * s + w.temp;
}

/** Sun intensity 0..1 (before weather). */
export function sunRaw(tick: number): number {
  const h = hourOf(tick);
  if (h < 6 || h > 18) return 0;
  return dsin((PI * (h - 6)) / 12);
}

/** Sun on the stone before zone facing: raw × weather × climate × morning mood. */
export function sunBase(state: GameState): number {
  const l = landscapeDef(state.landscape);
  const w = weatherNow(state);
  const h = hourOf(state.tick);
  let s = sunRaw(state.tick) * w.sun * l.climate.sun;
  if (h < 10) s *= moodValue(state, 'morningSun', 1);
  return s;
}

export function sunFacing(tick: number, zone: number): number {
  const h = hourOf(tick);
  const az = 2 + ((h - 6) / 12) * 4;
  let diff = Math.abs(zone - az);
  diff = Math.min(diff, 8 - diff);
  return 1 + 0.6 * dcos((diff / 8) * PI * 2);
}

export function sunOnZone(state: GameState, zone: number): number {
  const s = sunBase(state);
  const h = hourOf(state.tick);
  // sun azimuth: east (zone 2) at 6h, south (zone 4) at 12h, west (zone 6) at 18h
  const az = 2 + ((h - 6) / 12) * 4; // zone index of the sun
  let diff = Math.abs(zone - az);
  diff = Math.min(diff, 8 - diff);
  const facing = dcos((diff / 8) * PI * 2); // 1 facing, -1 opposite
  return s * (1 + 0.6 * facing);
}

export function woodPrice(state: GameState): number {
  return landscapeDef(state.landscape).woodPrice * eventValue(state, 'woodPrice', 1) * perkValue(state, 'woodPrice', 1);
}

export function dist(a: Vec2, b: Vec2): number {
  return dhypot(a.x - b.x, a.z - b.z);
}

export function evapFraction(state: GameState, T: number): number {
  const base = Math.min(0.95, Math.max(0.05, (T - 40) / 120));
  return Math.min(0.98, base * moodValue(state, 'evap', 1));
}

export function timeMultiplier(state: GameState): number {
  return isNight(state.tick) ? moodValue(state, 'night', 1) : moodValue(state, 'day', 1);
}
