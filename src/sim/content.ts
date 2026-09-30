import methodsJson from '../data/methods.json';
import rocksJson from '../data/rocks.json';
import landscapesJson from '../data/landscapes.json';
import toolsJson from '../data/tools.json';
import buildingsJson from '../data/buildings.json';
import routesJson from '../data/routes.json';
import workersJson from '../data/workers.json';
import economyJson from '../data/economy.json';
import weatherJson from '../data/weather.json';
import eventsJson from '../data/events.json';
import moodsJson from '../data/moods.json';
import perksJson from '../data/perks.json';
import researchJson from '../data/research.json';
import type { MethodId } from './types';

export interface RockDef { id: string; hp: number; hardness: number; conductivity: number; thermalMass: number; color: string; sus: Record<MethodId, number> }
export interface SourceDef { id: string; kind: string; pos: [number, number]; elev: number; flow: number; temp: number; reliability: number; requires?: string; salt?: boolean; meltBoost?: number; store?: number }
export interface LandscapeDef {
  id: string;
  climate: { day: number; night: number; sun: number; wind: number; humidity: number };
  terrain: { slope: [number, number]; hills: [number, number, number, number][] };
  sources: SourceDef[];
  village: [number, number];
  forest: [number, number];
  woodPrice: number;
  sandPrice: number;
  councilFactor: number;
  salt: boolean;
  waterwheel: boolean;
  weather: Record<string, number>;
}
export interface ToolDef { id: string; cost: number; carry?: number; scoopTicks?: number; spill?: number; tapTicks?: number; chopTicks?: number; drillTicks?: number; deepTicks?: number; speed?: number; requires?: string }
export interface BuildingDef {
  id: string; cost: number; wood: number; buildTicks: number; tank?: number; near?: string; valve?: boolean; zone?: boolean;
  heatPerHour?: number; needsSun?: boolean; woodPerMinute?: number; shade?: number; coolPerHour?: number; energy?: number; energyWind?: number;
  energyWorker?: number; needs?: string; sandPerMinute?: number; spectacle?: number; workers?: number; researchSpeed?: number; collects?: string; requires?: string;
}
export interface WorkerDef { id: string; hire: number; wage: number; requires?: string }
export interface WeatherDef { sun: number; temp: number; rain: number; wind: number; cloud: number; dew?: number }
export interface EventDef { id: string; weight: number; durationTicks: number; minDay?: number; effect: Record<string, number | boolean> }
export interface MoodDef { id: string; [k: string]: number | string | undefined }
export interface PerkDef { id: string; [k: string]: number | boolean | string | undefined }
export interface ResearchNode { id: string; branch: string; cost: number; ticks: number; requires: string[] }

export interface Content {
  methods: typeof methodsJson;
  rocks: RockDef[];
  landscapes: LandscapeDef[];
  tools: ToolDef[];
  buildings: BuildingDef[];
  routes: typeof routesJson;
  workers: WorkerDef[];
  economy: typeof economyJson;
  weather: Record<string, WeatherDef>;
  events: EventDef[];
  moods: MoodDef[];
  perks: PerkDef[];
  research: { milestones: number[]; nodes: ResearchNode[] };
}

export const content: Content = {
  methods: methodsJson,
  rocks: rocksJson as unknown as RockDef[],
  landscapes: landscapesJson as unknown as LandscapeDef[],
  tools: toolsJson as unknown as ToolDef[],
  buildings: buildingsJson as unknown as BuildingDef[],
  routes: routesJson,
  workers: workersJson as unknown as WorkerDef[],
  economy: economyJson,
  weather: weatherJson as Record<string, WeatherDef>,
  events: eventsJson as unknown as EventDef[],
  moods: moodsJson as unknown as MoodDef[],
  perks: perksJson as unknown as PerkDef[],
  research: researchJson as { milestones: number[]; nodes: ResearchNode[] },
};

const rockMap = new Map(content.rocks.map((r) => [r.id, r]));
const landMap = new Map(content.landscapes.map((l) => [l.id, l]));
const toolMap = new Map(content.tools.map((t) => [t.id, t]));
const buildingMap = new Map(content.buildings.map((b) => [b.id, b]));
const workerMap = new Map(content.workers.map((w) => [w.id, w]));
const researchMap = new Map(content.research.nodes.map((n) => [n.id, n]));
const moodMap = new Map(content.moods.map((m) => [m.id, m]));
const perkMap = new Map(content.perks.map((p) => [p.id, p]));
const eventMap = new Map(content.events.map((e) => [e.id, e]));

export function rockDef(id: string): RockDef {
  const r = rockMap.get(id);
  if (!r) throw new Error('unknown rock ' + id);
  return r;
}
export function landscapeDef(id: string): LandscapeDef {
  const l = landMap.get(id);
  if (!l) throw new Error('unknown landscape ' + id);
  return l;
}
export function eventDef(id: string): EventDef | undefined {
  return eventMap.get(id);
}
export function toolDef(id: string): ToolDef | undefined {
  return toolMap.get(id);
}
export function buildingDef(id: string): BuildingDef | undefined {
  return buildingMap.get(id);
}
export function workerDef(id: string): WorkerDef | undefined {
  return workerMap.get(id);
}
export function researchNode(id: string): ResearchNode | undefined {
  return researchMap.get(id);
}
export function moodDef(id: string): MoodDef | undefined {
  return moodMap.get(id);
}
export function perkDef(id: string): PerkDef | undefined {
  return perkMap.get(id);
}
