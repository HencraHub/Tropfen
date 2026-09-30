import type { Lang } from './i18n';

export interface Settings {
  lang: Lang;
  quality: 'low' | 'medium' | 'high';
  shadows: boolean;
  particles: number; // 0, 0.5, 1
  scale: number;     // render scale 0.6..1
  fov: number;
  master: number; sfx: number; music: number;
  sensitivity: number;
  invertY: boolean;
  gamepad: boolean;
  name: string;
  server: string;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'de', quality: 'medium', shadows: true, particles: 1, scale: 1, fov: 70,
  master: 0.8, sfx: 0.8, music: 0.5, sensitivity: 1, invertY: false, gamepad: true, name: 'Spieler',
  server: typeof location !== 'undefined' ? `ws://${location.hostname || 'localhost'}:8787` : 'ws://localhost:8787',
};

const KEY = 'tropfen.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function applyQuality(s: Settings): Settings {
  if (s.quality === 'low') return { ...s, shadows: false, particles: 0.5, scale: 0.7 };
  if (s.quality === 'high') return { ...s, shadows: true, particles: 1, scale: 1 };
  return { ...s, shadows: true, particles: 1, scale: 0.85 };
}
