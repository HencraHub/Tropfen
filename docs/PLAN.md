# PLAN

Arbeitsstand, immer zuerst lesen. Nach jedem Block aktualisieren.

## Meilensteine
- [x] M1 Projektgerüst, Simulationskern, Methoden spielbar im Zielstil, Stilprobe-Szene (`?probe=1`).
- [x] M2 Alle Systeme (7 Methoden, 4 Gesteine, 4 Landschaften, Logistik, Wirtschaft, Forschung, Wetter/Ereignisse) fertig; `npm run balance` grün (20 Seeds, Regeln a–e).
- [x] M3 Koop und Rennen (Server, Lobby, Raumcode, Wiedereinstieg), `npm run test:e2e` grün (Solo, Koop 3 Clients, Rennen, Wiedereinstieg).
- [x] M4 Feinschliff: Animation/Ton/Gamepad/Lehrgang/Tagesaufgabe/Planungstisch/Einstellungen/Speichern vorhanden; Screenshots gegen STIL.md geprüft (docs/ABNAHME.md §4).
- [x] M5 Steam-Reife: Electron-Hülle, Steam-Brücke, README, LIZENZEN, ABNAHME.md vorhanden (Electron-Build und Steam-Upload nicht prüfbar, siehe ABNAHME §5).

## Aktueller Stand
Abnahme erreicht (2026-09-30): `npm test` (26 Tests), `npm run balance` (3520 Partien, alle Regeln), `npm run test:e2e` (4 Tests) mit Exit-Code 0; docs/ABNAHME.md führt jedes Kriterium mit Nachweis. Balance-Werkzeuge siehe CLAUDE.md. Nächster Schritt (offen für die Zukunft): Electron-Build auf einem Rechner mit Netz, Steam-App-ID eintragen, Gamepad an Hardware, Tonabnahme.

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
