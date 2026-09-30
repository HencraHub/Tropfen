# ENTSCHEIDUNGEN

Kurz, datiert, mit Grund. Neueste oben.

## 2026-09-30 Steam-Bibliothek: steamworks.js (ceifa), Bestenlisten über eigene Brücke
Verglichen an der Quelle (github.com, npm):
- **steamworks.js** (ceifa): npm 0.4.0, Commits bis Sep 2025 (PR-Merges, CI-Pflege), MIT. Erfolge (`achievement.activate/isActivated/clear/names`), Lobbys (`matchmaking.createLobby/joinLobby/getLobbies`), P2P-Netz, Overlay für Electron (`electronEnableSteamOverlay()`), Cloud, Workshop. **Keine Bestenlisten-API** in `client.d.ts`; zwei offene PRs (#198 vom 2025-09-02, #208 vom 2026-05-04). Electron braucht `contextIsolation:false`, `nodeIntegration:true` im Renderer oder Nutzung im Main-Prozess (unsere Wahl: Main-Prozess + IPC, damit der Renderer sauber bleibt).
- **greenworks** (Greenheart Games): npm 0.1.0, zuletzt 2022, „best-effort“, veraltete Electron-Versionen. Verworfen.
- **steamwand.js** (JDeffner, koffi-FFI): hat Bestenlisten und Lobbys, aber 1 Stern, 36 Commits, laut README kein Steam-Overlay in Electron. Als Notnagel für Bestenlisten geeignet, nicht als Hauptbibliothek.

Entscheidung: `steamworks.js` im Electron-Main-Prozess für Erfolge, Lobby und Overlay. Bestenlisten laufen über die Schnittstelle `src/steam/bridge.ts` mit zwei Rückenden: (1) `steamworks.js`, sobald ein Leaderboard-PR gemergt ist (Adapter vorbereitet), (2) Steam Web API `ISteamLeaderboards` über den eigenen Spielserver mit Publisher-Key (dokumentierter Valve-Weg). Ohne Steam läuft alles lokal (Bestenlisten in localStorage).

## 2026-09-30 Simulationstakt 10 Hz, Spieltag 6 min
10 Hz reicht für serverautoritäre Bewegung mit Interpolation auf dem Client und hält den Balance-Lauf (mehrere tausend Partien) im Minutenbereich. 6 min je Spieltag ergeben 4–7 Tag-Nacht-Zyklen je Solo-Partie: genug für Frost und Thermoschock-Timing.

## 2026-09-30 Eine npm-Paketwurzel, kein Monorepo
Sim, Bots, Server, Client und Electron liegen unter `src/` in einem Paket. Weniger Werkzeugreibung; die Trennung wird durch Import-Regeln gehalten (Sim importiert nichts aus Client/Server, eslint-frei per tsconfig `paths`-Disziplin und Test).

## 2026-09-30 Eigene Canvas-Oberfläche mit Strichschrift
Der Auftrag verbietet Standardschrift und verlangt Gamepad-Bedienung. Eine im Code erzeugte Strichschrift („Klammerschrift“) auf einem eigenen Canvas-UI erfüllt beides ohne Schriftdateien und hält den Papierlook auch im Menü.

## 2026-09-30 Routen als Polylinien, Höhe aus Landschaftsfunktion
Der Spieler setzt Punkte in Ego-Perspektive; die Sim prüft je Segment Gefälle (Rinne) oder Hub (Rohr/Pumpe). Bots setzen gerade Linien. Beide nutzen dieselbe Prüfung im Kern.

## 2026-09-30 Balance-Kriterien präzisiert (Schwellen unverändert)
- Zeit je Bot und Kombination = Mittelwert über 20 Seeds; „Bestzeit“ = kleinster Mittelwert.
- (a) mindestens drei Bots mit verschiedener Hauptmethode (größter Schadensanteil) ≤ 1,2 × Bestzeit.
- (b) kein Bot in > 40 % der Kombinationen der schnellste.
- (c) planloser Bot ≥ 1,3 × Bestzeit in jeder Kombination.
- (d) abgestimmtes Koop-Paar ≤ 0,85 × Zeit des unabgestimmten Paars, in jeder Kombination.
- (e) Bestzeit jeder Kombination in [25, 45] min.
