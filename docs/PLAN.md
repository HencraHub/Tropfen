# PLAN

Arbeitsstand, immer zuerst lesen. Nach jedem Block aktualisieren.

## Meilensteine
- [x] M1 Projektgerüst, Simulationskern, Methoden spielbar im Zielstil, Stilprobe-Szene (`?probe=1`).
- [~] M2 Alle Systeme (7 Methoden, 4 Gesteine, 4 Landschaften, Logistik, Wirtschaft, Forschung, Wetter/Ereignisse) fertig; Balance (`npm run balance`) noch nicht grün: (a) ≥ 3 Methoden je Kombination fehlt in einigen Kombinationen, (e) Bestzeiten auf weichem Gestein knapp unter 25 min.
- [x] M3 Koop und Rennen (Server, Lobby, Raumcode, Wiedereinstieg), `npm run test:e2e` grün (Solo, Koop 3 Clients, Rennen, Wiedereinstieg).
- [~] M4 Feinschliff: Animation/Ton/Gamepad/Lehrgang/Tagesaufgabe/Planungstisch/Einstellungen/Speichern vorhanden; Optik-Nachbesserung nach Screenshot-Prüfung läuft.
- [~] M5 Steam-Reife: Electron-Hülle, Steam-Brücke, README, LIZENZEN vorhanden; ABNAHME.md folgt nach grünem Balance-Lauf.

## Aktueller Stand
Balance-Schleife (siehe `docs/BALANCE.md`, `scripts/baltable.py` für die Kurzübersicht). Werkzeuge: `npx tsx scripts/matrix.ts <seed>` (alle Kombinationen × Bots, 1 Seed), `npx tsx scripts/trybot.ts <land> <rock> <bot|all> <seed>` (Details mit Route-/Online-Zeit und Rate), `npx tsx scripts/why.ts <land> <rock> <bot> <seed> <min> <everyTicks>` (Zonen, Tanks, Feuer je Intervall), `SEEDS=3 WORKERS=3 npm run balance` (Zwischenstand).
Stand der Balance-Schleife: 20-Seed-Lauf zuletzt mit 6 (a)-Verstößen (hochland/kalkstein, hochland/basalt, kueste/granit, kueste/sandstein, steppe/granit, steppe/kalkstein), (b)–(e) grün. Seitdem: Wasserspeicher-Muster bei knappen Quellen, Frost-Kühlfenster, Sonnensegel, Teilgüsse, Ingenieur-Rinnenübernahme, zweite Tropfleitung per Pumprohr (macht den Tropfmeister auf weichem Gestein sehr schnell, Regel (e)/(b) prüfen). Nächster Schritt: neuen 20-Seed-Lauf auswerten, dann ABNAHME.md.

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
