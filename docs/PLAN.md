# PLAN

Arbeitsstand, immer zuerst lesen. Nach jedem Block aktualisieren.

## Meilensteine
- [ ] M1 Projektgerüst, Simulationskern, zwei Methoden (Thermoschock, Steter Tropfen) spielbar im Zielstil, Stilprobe-Szene.
- [ ] M2 Alle Systeme (7 Methoden, 4 Gesteine, 4 Landschaften, Logistik, Wirtschaft, Forschung, Wetter/Ereignisse) und Balance (`npm run balance` grün).
- [ ] M3 Koop und Rennen (Server, Lobby, Raumcode, Wiedereinstieg), `npm run test:e2e` grün.
- [ ] M4 Feinschliff: Animation, Ton, Bedienung (Gamepad), Lehrgang/Szenarien, Tagesaufgabe, Planungstisch, Einstellungen, Speichern.
- [ ] M5 Steam-Reife: Electron-Hülle, Steam-Brücke (Erfolge, Bestenlisten), README, LIZENZEN, ABNAHME mit Screenshots.

## Aktueller Stand
M1 begonnen. Dokumente angelegt (AUFTRAG, GDD, STIL, PLAN, ENTSCHEIDUNGEN). Nächster Schritt: package.json, Sim-Kern (`src/sim`), Tests.

## Offene Punkte
- Steam-App-ID unbekannt (Platzhalter 480 = Spacewar). Ohne Zugangsdaten kein Upload.
- Bestenlisten in steamworks.js nicht enthalten (siehe ENTSCHEIDUNGEN).

## Befehle
- `npm test` – Typprüfung + Vitest.
- `npm run balance` – Balance-Lauf (Worker-Threads), Bericht in `docs/BALANCE.md`.
- `npm run test:e2e` – Playwright (Server + Vite-Vorschau werden gestartet).
- `npm run dev` – Vite.
- `npm run server` – Koop-Server.
- `npm run screenshots` – Screenshots für ABNAHME in `docs/screenshots/`.
