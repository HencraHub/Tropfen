# Ein Tropfen auf den heißen Stein

Strategiespiel in Ego-Perspektive: Ein riesiger, heißer Stein mit Gesicht soll mit Wasser gespalten werden. Sieben Spaltmethoden, vier Gesteine, vier Landschaften, Logistik, Wirtschaft, Forschung. Allein, kooperativ (2–4 an einem Stein) oder als Wettrennen. Optik: Bastel-Diorama aus Pappe und Papier, alles im Code erzeugt.

## Start in wenigen Befehlen
```bash
npm install
npm run dev          # Spiel im Browser: http://localhost:5173
npm run server       # Koop-/Rennen-Server auf ws://localhost:8787 (zweites Terminal)
```
Steuerung: WASD gehen · Maus umsehen · E benutzen · Zifferntasten für Aktionen am Stein · B bauen · R Forschung · Tab Planungstisch · Esc Pause. Gamepad wird unterstützt.

Schnellstart-Parameter (auch für Tests): `?solo=1&seed=abc&land=flusstal&rock=granit`, Zeitraffer `&speed=60`, Autopilot `&bot=tropfmeister`, Stilprobe `?probe=1`.

## Prüfen
```bash
npm test             # Typprüfung + Vitest (Simulation, Spiellogik, Determinismus)
npm run balance      # Balance-Lauf: 8 Strategie-Bots, planloser Bot, Koop-Paare, je Gestein×Landschaft 20 Seeds → docs/BALANCE.md
npm run test:e2e     # Playwright im Headless-Browser: Solo, Koop (3 Clients), Rennen, Wiedereinstieg
npm run screenshots  # Screenshots für docs/ABNAHME.md
```

## Aufbau
- `src/sim` Simulationskern (deterministisch, 10 Hz, Seed-Zufall, ohne Browser). Wird von Spiel, Server und Bots geteilt.
- `src/data` alle Inhalte als JSON: Methoden, Gebäude, Werkzeuge, Routen, Arbeiter, Forschung, Gesteine, Landschaften, Wetter, Ereignisse, Launen, Vorteile, Szenarien, Übersetzungen.
- `src/bots` Strategie-Bots, `src/balance` Balance-Lauf.
- `src/server` WebSocket-Server (Räume mit Code, Lobby, Gastgeber startet, serverautoritär im Lockstep, Wiedereinstieg per Token).
- `src/client` three.js-Spiel mit eigener Papier-Oberfläche und Strichschrift, `src/electron` Hülle, `src/steam` Steam-Brücke.
- Dokumente: `docs/GDD.md`, `docs/STIL.md`, `docs/PLAN.md`, `docs/ENTSCHEIDUNGEN.md`, `docs/BALANCE.md`, `docs/ABNAHME.md`, `docs/LIZENZEN.md`, `docs/ASSET-PROMPTS.md`.

## Electron und Steam
```bash
npm install --save-dev electron electron-builder steamworks.js   # nicht Teil der Standardinstallation
npm run electron:dev     # Spiel in der Electron-Hülle
npm run electron:build   # Pakete unter release/ (Windows, Linux; macOS auf einem Mac)
```
Schritte bis zum Steam-Upload:
1. Steam-App-ID im Steamworks-Partnerbereich anlegen; in `src/electron/steam.ts` (`APP_ID`) eintragen und `steam_appid.txt` neben die Binärdatei legen (für Tests; im Store-Build nicht mitliefern).
2. Erfolge anlegen (IDs `METHODE_THERMOSCHOCK`, `METHODE_FROST`, `METHODE_TROPFEN`, `METHODE_KEILE`, `METHODE_DAMPF`, `METHODE_STRAHL`, `METHODE_WURZEL`) und Bestenlisten (`zeit`, `wasser`, `billig`, `ohne_rohre`; Sortierung aufsteigend, Anzeige Sekunden bzw. Liter bzw. Geld).
3. Steamworks-SDK herunterladen, `sdk/redistributable_bin/<Plattform>` neben die gebaute Anwendung kopieren (steamworks.js erwartet die Bibliotheken dort).
4. Bestenlisten: `steamworks.js` 0.4.0 enthält noch keine Leaderboard-API (zwei offene PRs). Bis eine gemergt ist, meldet `src/steam/bridge.ts` Bestzeiten an den eigenen Spielserver, der sie per Steam Web API (`ISteamLeaderboards`, Publisher-Key als Umgebungsvariable `STEAM_PUBLISHER_KEY`) einträgt; siehe `docs/ENTSCHEIDUNGEN.md`.
5. `npm run electron:build`, dann mit SteamPipe (`steamcmd +login <konto> +run_app_build <build.vdf>`) hochladen; ein Beispiel-`build.vdf` liegt unter `steam/`.
6. Im Partnerbereich: Depots, Startoptionen (`tropfen.exe` bzw. `tropfen`), Steam-Deck-Prüfung (Gamepad-Bedienung ist eingebaut, Ziel 60 fps mit Qualitätsstufe „mittel“).

## Lizenzen
Siehe `docs/LIZENZEN.md`: nur eigene und im Code erzeugte Inhalte, Bibliotheken unter MIT/Apache-2.0.
