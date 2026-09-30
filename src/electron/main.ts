/**
 * Electron shell for the Steam build. Loads the built game from dist/ and exposes the Steam bridge via preload.
 * steamworks.js runs in the main process (no nodeIntegration in the renderer); see docs/ENTSCHEIDUNGEN.md.
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { initSteam, steamAchievement, steamLeaderboard, steamPlayerName } from './steam';

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1600, height: 900, title: 'Ein Tropfen auf den heißen Stein', backgroundColor: '#cfe6f5',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
    fullscreenable: true, autoHideMenuBar: true,
  });
  win.loadFile(join(__dirname, '..', 'dist', 'index.html'));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  const steam = initSteam();
  ipcMain.handle('steam:available', () => steam.available);
  ipcMain.handle('steam:achievement', (_e, id: string) => steamAchievement(id));
  ipcMain.handle('steam:leaderboard', (_e, name: string, score: number) => steamLeaderboard(name, score));
  ipcMain.handle('steam:name', () => steamPlayerName());
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
