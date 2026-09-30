/** WebSocket game server: rooms with codes, lobby, host starts, server-authoritative simulation, reconnect by token. */
import { WebSocketServer, type WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { Room, type Client } from './room';
import type { ClientMsg, ServerMsg } from '../net/protocol';

const PORT = Number(process.env.PORT ?? 8787);
const rooms = new Map<string, Room>();
const clientsByToken = new Map<string, { client: Client; room: Room | null; ws: WebSocket | null }>();

function code(): string { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)]; return rooms.has(s) ? code() : s; }

export function startServer(port = PORT): WebSocketServer {
  const wss = new WebSocketServer({ port });
  wss.on('connection', (ws) => {
    let entry: { client: Client; room: Room | null; ws: WebSocket | null } | null = null;
    const send = (m: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
    ws.on('message', (raw) => {
      let m: ClientMsg;
      try { m = JSON.parse(String(raw)) as ClientMsg; } catch { return; }
      switch (m.t) {
        case 'hello': {
          const existing = m.token ? clientsByToken.get(m.token) : undefined;
          if (existing) {
            entry = existing; entry.ws = ws;
            entry.client.send = send; entry.client.connected = true;
            send({ t: 'welcome', pid: entry.client.pid, token: m.token! });
            if (entry.room) { entry.room.setConnected(entry.client.pid, true); if (entry.room.started) entry.room.sendSnapshot(entry.client); else entry.room.broadcastLobby(); }
          } else {
            const token = randomBytes(12).toString('hex');
            const pid = 'p' + randomBytes(3).toString('hex');
            entry = { client: { pid, name: (m.name || 'Spieler').slice(0, 16), token, send, connected: true }, room: null, ws };
            clientsByToken.set(token, entry);
            send({ t: 'welcome', pid, token });
          }
          break;
        }
        case 'create': {
          if (!entry) return;
          const r = new Room(code(), m.mode, Math.max(1, Math.min(200, m.speed ?? 1)), m.seed ?? randomBytes(4).toString('hex'), m.landscape, m.rock);
          rooms.set(r.code, r);
          r.onEmpty = () => rooms.delete(r.code);
          entry.room = r; r.add(entry.client);
          break;
        }
        case 'join': {
          if (!entry) return;
          const r = rooms.get(m.code.toUpperCase());
          if (!r) { send({ t: 'error', msg: 'Raum nicht gefunden: ' + m.code }); return; }
          if (r.players.length >= 4) { send({ t: 'error', msg: 'Raum voll' }); return; }
          entry.room = r; r.add(entry.client);
          break;
        }
        case 'start': if (entry?.room && entry.room.host === entry.client.pid) entry.room.start(); break;
        case 'cmd': if (entry?.room) entry.room.command(entry.client.pid, m.cmd); break;
        case 'resync': if (entry?.room) entry.room.sendSnapshot(entry.client); break;
        case 'debugState': if (entry?.room) { const diff = entry.room.debugDiff(entry.client.pid, m.tick, m.state); console.log('DESYNC', entry.client.pid, m.tick, diff); send({ t: 'debugDiff', tick: m.tick, diff }); } break;
        case 'ping': send({ t: 'pong' }); break;
      }
    });
    ws.on('close', () => { if (entry?.room) entry.room.setConnected(entry.client.pid, false); if (entry) entry.ws = null; });
  });
  let last = Date.now();
  setInterval(() => { const now = Date.now(); const dt = Math.min(0.5, (now - last) / 1000); last = now; for (const r of rooms.values()) r.update(dt); }, 50);
  console.log(`Tropfen-Server auf ws://0.0.0.0:${port}`);
  return wss;
}

if (process.argv[1] && /main\.ts$|main\.js$/.test(process.argv[1])) startServer();
