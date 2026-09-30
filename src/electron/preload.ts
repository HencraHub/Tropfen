import { contextBridge, ipcRenderer } from 'electron';

let available = false;
ipcRenderer.invoke('steam:available').then((v: boolean) => { available = v; });

contextBridge.exposeInMainWorld('tropfenSteam', {
  get available() { return available; },
  achievement: (id: string) => { ipcRenderer.invoke('steam:achievement', id); },
  leaderboard: (name: string, score: number) => { ipcRenderer.invoke('steam:leaderboard', name, score); },
  playerName: () => null,
});
