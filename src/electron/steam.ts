/**
 * Steam integration (main process). steamworks.js is an optional dependency: without it, or without a running
 * Steam client, everything degrades to no-ops. Leaderboards go through the game server's Web-API bridge until
 * steamworks.js ships a leaderboard API (see docs/ENTSCHEIDUNGEN.md).
 */
export const APP_ID = Number(process.env.STEAM_APP_ID ?? 480); // 480 = Spacewar test app; replace with the real App-ID

interface SteamClient { achievement: { activate(id: string): boolean; isActivated(id: string): boolean }; localplayer: { getName(): string; getSteamId(): { steamId64: bigint } }; }
let client: SteamClient | null = null;

export function initSteam(): { available: boolean } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sw = require('steamworks.js') as { init(appId: number): SteamClient; electronEnableSteamOverlay(): void };
    client = sw.init(APP_ID);
    try { sw.electronEnableSteamOverlay(); } catch { /* overlay optional */ }
    return { available: true };
  } catch (e) {
    console.info('[steam] nicht verfügbar:', (e as Error).message);
    return { available: false };
  }
}

export function steamAchievement(id: string): boolean {
  if (!client) return false;
  try { return client.achievement.isActivated(id) || client.achievement.activate(id); } catch { return false; }
}

export function steamLeaderboard(name: string, score: number): boolean {
  if (!client) return false;
  // steamworks.js 0.4.0 has no leaderboard API: forward to the game server, which uses the Steam Web API.
  const server = process.env.TROPFEN_LEADERBOARD_URL;
  if (!server) return false;
  try {
    const body = JSON.stringify({ name, score, steamId: client.localplayer.getSteamId().steamId64.toString() });
    fetch(server, { method: 'POST', headers: { 'content-type': 'application/json' }, body }).catch(() => undefined);
    return true;
  } catch { return false; }
}

export function steamPlayerName(): string | null {
  try { return client ? client.localplayer.getName() : null; } catch { return null; }
}
