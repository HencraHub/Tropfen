# CLAUDE.md – Arbeitsregeln für dieses Repo

## Zuerst lesen
`docs/PLAN.md` (Stand), `docs/AUFTRAG.md` (Ziel), `docs/GDD.md` (Formeln), `docs/STIL.md` (Optik), `docs/ENTSCHEIDUNGEN.md`.

## Befehle
- `npm install` · `npm run dev` (Vite, Port 5173) · `npm run server` (WebSocket-Server, Port 8787)
- `npm test` – `tsc --noEmit` + Vitest (`tests/`)
- `npm run balance` – Balance-Bots, schreibt `docs/BALANCE.md`, Exit 1 bei Verstoß
- `npm run test:e2e` – Playwright (`e2e/`), startet Server und Vite-Vorschau selbst
- `npm run screenshots` – Screenshots nach `docs/screenshots/`
- `npm run build` · `npm run electron:build`

## Architektur
- `src/sim/` Simulationskern. Kein DOM, kein Zufall außer `Rng` aus dem Seed, kein `Date`. Fester Takt `TICK_MS=100`. Alles, was Spiel, Server und Bots teilen, liegt hier. Eingaben nur über `Command`-Objekte (`src/sim/commands.ts`).
- `src/data/` Inhalte als JSON (Methoden, Gebäude, Forschung, Gesteine, Landschaften, Wetter, Ereignisse, Launen, Szenarien, i18n). Neue Inhalte = neue Einträge, kein Code.
- `src/bots/` Strategie-Bots; benutzen nur `Command`s und den öffentlichen Zustand.
- `src/balance/` Balance-Lauf mit Worker-Threads.
- `src/server/` Node-WebSocket-Server, serverautoritär (Räume, Lobby, Koop, Rennen, Wiedereinstieg).
- `src/client/` three.js + Canvas-UI. `materials/` erzeugt alle Texturen im Code. `ui/` eigene Strichschrift und Menüs. `net/` Sessions (lokal/online).
- `src/electron/` Hülle, `src/steam/` Brücke (Erfolge, Bestenlisten, Lobby) mit Null-Implementierung im Browser.
- `assets/manifest.json` Bildteile: ID → Rückfall im Code (`src/client/assets/fallbacks.ts`) + optionale Datei.

## Regeln
- Determinismus: Sim-Zustand ist reines JSON; `hashState()` muss auf Server und Clients gleich sein. Keine `Map`/`Set` im Zustand, keine Fließkomma-Reduktionen in unbestimmter Reihenfolge.
- Balance nicht durch Angleichen der Methoden oder Lockern der Schwellen erreichen (Auftrag).
- Stilregeln aus `docs/STIL.md`: keine nackten Grundkörper, keine Systemschrift, 8-Hz-Stop-Motion für alles außer Kamera und Perlen, jede Aktion mit Ton.
- Texte: Rat spricht im Behördenton (i18n `council.*`), der Stein patzig (`stone.*`). Deutsch ist Quellsprache, Englisch vollständig.
- Nach jedem Meilenstein: Tests, Balance, Screenshots, Commit, `docs/PLAN.md` aktualisieren.
