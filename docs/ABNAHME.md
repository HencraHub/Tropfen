# ABNAHME

Stand: wird nach dem grünen Balance-Lauf mit den Befehlsausgaben vervollständigt (Gerüst; Nachweise folgen).

## 1. `npm test`
(Ausgabe folgt)

## 2. `npm run balance`
(Ausgabe folgt; Bericht in docs/BALANCE.md)

## 3. `npm run test:e2e`
(Ausgabe folgt)

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
