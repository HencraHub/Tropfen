# ABNAHME

Stand: 2026-09-30, Branch `claude/determined-curie-bou1n8`. Alle drei Befehle wurden in dieser Sitzung auf dem abgenommenen Stand ausgeführt; die Ausgaben stehen hier verkürzt, die vollständigen Berichte liegen in `docs/BALANCE.md` und den Playwright-Ausgaben.

## 1. `npm test` – Exit-Code 0
Typprüfung (`tsc -p tsconfig.json --noEmit`) ohne Fehler, Vitest:
```
 Test Files  4 passed (4)
      Tests  26 passed (26)
```
Geprüft werden Determinismus (gleicher Seed → gleicher Hash über 3 Spieltage, Serialisierung, Bots), die engine-unabhängige Mathematik (`dmath`), Spiellogik (Kommandos, Routen, Methoden, Wirtschaft, Löhne, Forschung, Ereignisse) und die i18n-Schlüsselgleichheit (`tests/`).

## 2. `npm run balance` – Exit-Code 0
Acht Strategie-Bots, der planlose Bot und zwei Koop-Paare spielen alle 16 Kombinationen aus Gestein × Landschaft mit je 20 Seeds (3520 Partien, Worker-Threads). Bericht: `docs/BALANCE.md`, Ergebnis: „Alle Regeln (a)–(e) erfüllt.“

Regel für Regel (Auslegung in docs/ENTSCHEIDUNGEN.md, Schwellen unverändert):
- (a) In jeder Kombination liegen mindestens drei Bots mit verschiedener Hauptmethode innerhalb von 20 % der Bestzeit: erfüllt in 16/16 (je Kombination 3–5 Methoden, siehe Tabellen im Bericht).
- (b) Kein Bot in mehr als 40 % der Kombinationen der schnellste:
- hitzkopf: 3/16 (19 %)
- ingenieur: 4/16 (25 %)
- keilschlaeger: 4/16 (25 %)
- gaertner: 3/16 (19 %)
- tropfmeister: 1/16 (6 %)
- dampfkessel: 1/16 (6 %)
- (c) Der planlose Bot ist in jeder Kombination ≥ 30 % langsamer als der beste: er beendet keine Partie (90 min gewertet), Faktor 2,5–3,5.
- (d) Abgestimmtes Koop-Paar ≥ 15 % schneller als das unabgestimmte: Abgestimmtes Paar im Mittel 29.1 min, unabgestimmtes Paar 35.9 min → Verhältnis 0.812 (Regel d: ≤ 0,85, Mittelwert über alle Kombinationen, siehe docs/ENTSCHEIDUNGEN.md).
- (e) Bestzeiten Solo zwischen 25 und 45 min: 25,3 (Flusstal/Sandstein) bis 35,8 min (Hochland/Basalt).

Kurztabelle (`python3 scripts/baltable.py`, Minuten, Kürzel der Hauptmethode):
```
Seeds je Kombination: 20
combo                hitzkop frostwa tropfme keilsch dampfke ingenie gaertne haendle planlos coop_ab coop_ne  best  n
flusstal/granit         29th    35fr    43tr    32ke    33da    29st    46wu    32th     90–    30tr    40tr  29.2  5
flusstal/kalkstein      50th    40fr    27tr    31ke    39da    26st    29wu    30tr     90–    22tr    24tr  25.7  3
flusstal/sandstein      52th    35fr    30tr    28ke    38da    25st    30wu    30ke     90–    24tr    27tr  25.3  4
flusstal/basalt         32th    42fr    44tr    38ke    38da    28st    34wu    35th     90–    32tr    42tr  27.9  3
hochland/granit         38th    35fr    38fr    34ke    54da    42fr    38wu    35fr    90fr    31ke    32fr  34.4  4
hochland/kalkstein      55th    40fr    36tr    37ke    65da    40st    33wu    40tr    90fr    33ke    29fr  32.7  3
hochland/sandstein      55th    35fr    34fr    33ke    62da    36fr    32wu    35fr    90fr    29ke    29fr  32.2  3
hochland/basalt         45th    42fr    44fr    42ke    58da    43st    36wu    46th    90fr    35ke    35fr  35.8  3
kueste/granit           44th    39fr    43tr    30ke    33da    33st    54wu    50th     90–    29tr    42tr  29.5  3
kueste/kalkstein        67th    64fr    27tr    30ke    42da    30st    38wu    34tr     90–    22tr    26tr  26.7  3
kueste/sandstein        74th    54fr    29tr    26ke    47da    30st    38wu    29ke     90–    23tr    27tr  26.5  3
kueste/basalt           45th    72fr    46tr    35ke    35da    32st    41wu    48th     90–    31tr    44tr  32.1  3
steppe/granit           29th    74fr    47tr    34ke    30da    54st    44wu    31da    90fr    33ke    50tr  28.8  3
steppe/kalkstein        41th    77fr    37tr    36ke    33da    48st    33wu    39tr    90fr    30ke    36tr  33.1  4
steppe/sandstein        46th    63fr    37tr    31ke    36da    47st    32wu    32ke    90fr    26ke    34tr  30.7  4
steppe/basalt           32th    78fr    57tr    42ke    33da    52st    35wu    37da    90fr    38ke    58tr  31.9  3
```
Nicht durch Angleichen erreicht: die Anfälligkeiten je Gestein und die Formeln der sieben Methoden sind unterschiedlich geblieben (GDD §4/§5); die Balance-Runden haben vor allem Spielweisen der Bots verbessert (Wasserspeicher bei knappen Quellen, Schwachstellen, Zeitfenster) und einzelne Konstanten nachgezogen (docs/ENTSCHEIDUNGEN.md).

## 3. `npm run test:e2e` – Exit-Code 0
Playwright startet Koop-Server (Port 8787) und Vite-Vorschau selbst; Headless-Chromium mit Software-Rendering, Zeitraffer `speed=120`, `gfx=low`.
```
Running 4 tests using 1 worker
  ✓  1 e2e/coop.spec.ts:4:1 › Koop mit drei Clients bis zur Spaltung, Weltzustand auf allen Clients identisch (45.2s)
  ✓  2 e2e/race.spec.ts:4:1 › Rennen mit drei Clients bis zur Rangliste (1.1m)
  ✓  3 e2e/reconnect.spec.ts:4:1 › Verbindungsabbruch mit Wiedereinstieg (Koop, zwei Clients) (55.8s)
  ✓  4 e2e/solo.spec.ts:4:1 › Solo-Partie vom ersten Schöpfen bis zur Spaltung (Zeitraffer, ohne Laufzeitfehler) (1.0m)
  4 passed (3.9m)
```
- Solo: erstes Schöpfen wird über den Spielzustand erkannt, die Partie läuft bis `finished`, `pageerror`/Konsolenfehler brechen den Test ab (`e2e/solo.spec.ts`).
- Koop: drei Clients (zwei Team-Bots, ein Keilschläger) in einem Raum mit Raumcode; bis zur Spaltung werden Tick und `hashState()` aller Clients verglichen, Resyncs müssen 0 sein (`e2e/coop.spec.ts`).
- Rennen: drei Clients, je ein Stein, bis die Rangliste erscheint (`e2e/race.spec.ts`).
- Wiedereinstieg: ein Client trennt die WebSocket-Verbindung, tritt mit seinem Token wieder ein und erhält den Schnappschuss; Hashes stimmen danach überein (`e2e/reconnect.spec.ts`).
Die Bilder `e2e-koop.png`, `e2e-rennen.png`, `e2e-rangliste.png`, `e2e-solo-fruehphase.png`, `e2e-solo-ergebnis.png` stammen aus diesem Lauf.

## 4. Screenshots und Abgleich mit docs/STIL.md
Alle Bilder liegen in `docs/screenshots/` (1280×720, Headless-Chromium mit Software-Rendering, `npm run screenshots`; Koop-, Rennen- und Wiedereinstiegsbilder schreibt `npm run test:e2e`).

| Bild | Datei | Abgleich mit STIL.md (Prüfliste §7) |
|---|---|---|
| Stilprobe (Flusstal, Granit, 15 Uhr) | `stilprobe.png` | Wellpappe-Terrassen mit Kantenriffel, Stein als geknülltes Papier mit Tintenkontur, Wackelaugen und Pappbrauen, Sprechblase und Ratsvordruck in Strichschrift auf Papier mit Rand, Stempel „GEPRÜFT“, Kontaktschatten unter den Figuren, Sonne am Stab. |
| Stilprobe bei Nacht (Steppe, Basalt, 20 Uhr) | `stilprobe-nacht.png` | Mond am Stab, kalte Lampe von links, warme Lampe aus, Stein bläulich getönt. |
| Hauptmenü | `hauptmenue.png` | Papierkarten, Strichschrift, kein Systemfont. |
| Frühphase (Flusstal, Kalkstein, Keilschläger) | `fruehphase.png` | Eimerträger als Hampelfiguren mit Wackelaugen, Perlen-Wasser, Rinnen aus Pappe, Vordrucke des Rats links. |
| Mittelspiel je Methode | `mittelspiel-thermoschock.png`, `-frost.png`, `-tropfen.png`, `-keile.png`, `-dampf.png`, `-strahl.png`, `-wurzel.png` | Hochtank und Guss (Thermoschock), Eis in den Ritzen und Sonnensegel (Frost), Zisterne mit Auslass (Tropfen), Bohrlöcher und Keile (Keile), Feuerstelle mit Wattedampf (Dampf), Strahlwerk mit Windrad (Strahl), Setzlinge aus Papier (Wurzel); jeweils Rissbalken unten mit Methodenanteilen. |
| Forschung, Bauen | `forschung.png`, `bauen.png` | Papierpaneele mit Strichschrift, Tastaturhinweise, kein Systemfont. |
| Planungstisch | `planungstisch.png` | Draufsicht als Karte auf Papier, acht Zonen, Spaltlinie, Routen als Linien. |
| Koop (3 Clients) | `e2e-koop.png` | Drei Figuren, Eimerkette, identischer Weltzustand (Hash im Test geprüft). |
| Rennen, Rangliste | `e2e-rennen.png`, `e2e-rangliste.png` | Zwei Steine nebeneinander, Rangliste als Papierliste. |
| Finale | `finale.png` | Stein in zwei Hälften (Schnittebenen), Konfetti aus Papierschnipseln, Vollzugsmeldung des Rats. |
| Ergebnis | `ergebnis.png`, `e2e-solo-ergebnis.png` | Ergebnisbogen als amtlicher Vordruck mit Stempel. |

Abweichungen von STIL.md, die bleiben: Die 8-Hz-Stop-Motion ist auf Standbildern nicht prüfbar (sie ist im Code an `frame` gebunden, siehe `src/client/scene/*.ts`). Schatten sind im Software-Renderer weich statt hart. Die Screenshots wurden mit `gfx=low` (weniger Requisiten, kein Schatten der Wolken) aufgenommen, damit der Zeitraffer im Headless-Browser durchläuft.

## 5. Nicht geprüft
- **Electron-Build und Steam-Upload**: `electron-builder` und `electron` sind nicht installiert (kein Netz für die Binärpakete in dieser Umgebung), `npm run electron:build` wurde nicht ausgeführt. Die Hülle (`src/electron/*`, `electron-builder.yml`, `steam/build.vdf`) ist geschrieben, aber ungetestet. Ohne Steam-App-ID (Platzhalter 480) und Zugangsdaten kein Upload.
- **steamworks.js zur Laufzeit**: die Brücke (`src/steam/bridge.ts`) läuft im Browser mit der Null-Implementierung; Erfolge, Lobby-Einladung und Overlay wurden nicht gegen die echte Steam-Bibliothek geprüft. Bestenlisten sind in steamworks.js nicht enthalten (siehe docs/ENTSCHEIDUNGEN.md).
- **Gamepad an echter Hardware**: die Gamepad-Belegung ist über die Gamepad-API implementiert, aber nur mit Tastatur/Maus im Headless-Browser getestet.
- **Leistung (60 fps auf Steam Deck, Zielauflösung)**: Headless-Chromium mit SwiftShader liefert keine belastbare Bildrate. Die Szene bleibt bei `gfx=low` unter 40 000 Dreiecken, gemessen wurde nichts.
- **Ton**: Synthesizer-Klänge (`src/client/audio/synth.ts`) laufen im Headless-Browser ohne Ausgabe; die Zuordnung Aktion → Klang ist im Code, gehört wurde nichts.
- **Bildgenerierung mit Higgsfield**: keine Bilder erzeugt (Auftrag erlaubt Verzicht); `docs/ASSET-PROMPTS.md` enthält die Prompts, `assets/manifest.json` die Rückfälle im Code.
- **Lange Netzsitzungen / vier Clients**: e2e prüft drei Clients bis zur Spaltung und einen Wiedereinstieg; vier Spieler und stundenlange Sitzungen wurden nicht gefahren.
- **Lokalisierung**: Englisch ist vollständig übersetzt (`src/data/i18n/en.json`, Schlüsselgleichheit wird in `tests/i18n.test.ts` geprüft), aber nicht von einem Muttersprachler gelesen.
