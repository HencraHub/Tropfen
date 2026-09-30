/**
 * Steam bridge: achievements, leaderboards and lobbies. In the browser this is a no-op that logs; under Electron
 * the preload exposes `window.tropfenSteam`, backed by steamworks.js in the main process (see src/electron/steam.ts).
 */
export interface SteamBridge {
  available: boolean;
  achievement(id: string): void;
  leaderboard(name: string, score: number): void;
  playerName(): string | null;
}

declare global { interface Window { tropfenSteam?: SteamBridge } }

const nullBridge: SteamBridge = {
  available: false,
  achievement: (id) => { if (typeof console !== 'undefined') console.info('[steam] achievement (offline):', id); },
  leaderboard: (name, score) => { if (typeof console !== 'undefined') console.info('[steam] leaderboard (offline):', name, score); },
  playerName: () => null,
};

export const steam: SteamBridge = typeof window !== 'undefined' && window.tropfenSteam ? window.tropfenSteam : nullBridge;

/** Achievement ids per method and the leaderboards per scoring, as configured in Steamworks. */
export const ACHIEVEMENTS = ['METHODE_THERMOSCHOCK', 'METHODE_FROST', 'METHODE_TROPFEN', 'METHODE_KEILE', 'METHODE_DAMPF', 'METHODE_STRAHL', 'METHODE_WURZEL'];
export const LEADERBOARDS = ['zeit', 'wasser', 'billig', 'ohne_rohre'];
