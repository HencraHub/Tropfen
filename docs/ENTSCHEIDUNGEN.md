# ENTSCHEIDUNGEN

Kurz, datiert, mit Grund. Neueste oben.

## 2026-09-30 Deterministische Mathematik im Kern
Node (V8 12) und Chromium (V8 13) liefern bei `Math.sin/cos/exp/pow/hypot` in seltenen Fällen ein anderes letztes Bit; im Lockstep driftete der Client nach ~1000 Ticks vom Server ab. `src/sim/dmath.ts` implementiert diese Funktionen aus `+ − × ÷ sqrt` (IEEE-exakt) mit Reihen und Bereichsreduktion; der Kern benutzt nur noch diese. Test: `tests/dmath.test.ts` (Abweichung < 1e-9), `tests/determinismus.test.ts`.

## 2026-09-30 Netz: Lockstep-Wiedergabe statt Zustandsübertragung
Der Server rechnet und sendet je Tick nur die Kommandoliste (plus alle 50 Ticks einen Hash). Clients spielen dieselben Kommandos auf ihrer Kopie ab; bei Hash-Abweichung oder Lücke fordern sie einen Schnappschuss an. Wiedereinstieg: Token beim Hello, Schnappschuss, weiter im Takt. Spart Bandbreite (Zustand ≈ 30 KB) und macht „Weltzustand identisch“ prüfbar.

## 2026-09-30 Quellen haben einen Vorrat
Brunnen und Quellen füllen sich mit ihrer Rate; Rinnen, Eimerketten und Schöpfen ziehen aus demselben Vorrat. Wasserarme Landschaften (Steppe, Hochland) begrenzen damit alle Methoden gleich, Rinnen sind kein Freibrief.

## 2026-09-30 Thermoschock-Kurve mit Knie
Wirksame Liter: überlinear (^1,3) bis 150 L, darüber unterlinear (^0,75). So lohnt der Synchronguss zweier Eimer, ein 2000-L-Tank ist aber kein Sofortsieg.

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
- (d) abgestimmtes Koop-Paar ≤ 0,85 × Zeit des unabgestimmten Paars, gemessen als Mittelwert über alle Kombinationen (der Auftrag nennt für (d) anders als für (a) und (c) keine Einzelkombination; die Schwelle 15 % bleibt). Beide Paare spielen dieselbe Methode (Steter Tropfen): das unabgestimmte Paar sind zwei unabhängige Solo-Bots (zwei Eröffnungen, zwei Kredite, beide Rinnen in dieselbe Zone), das abgestimmte Paar teilt die Arbeit (eine Eröffnung, getrennte Tropfzonen für „Doppeltropf“, Eimerkette mit eigenen Trägern, Synchronguss bei heißem Stein).
- (e) Bestzeit jeder Kombination in [25, 45] min.

## 2026-09-30 Knappe Quellen: Wasserspeicher am Stein statt Zonenrinne
Steppe (Brunnen 1,2 L/s) und Hochland (Bergquelle 1,5 L/s) haben nur Vorratsquellen. Eine Rinne (Kapazität 2 L/s) nimmt den gesamten Zufluss, Träger und Spieler stehen an der leeren Quelle. Die Bots führen dort die Rinne in Zisterne oder Fass am Stein und verteilen per Hand; Fässer bekommen einen Auslass in Tropfstärke. Das ist keine Sim-Änderung, sondern Spielweise; Menschen können dasselbe tun (Fass 40 Geld, ohne Forschung). Sandstein-Widerstand 1,15 → 1,35 und Kalkstein 1,2 → 1,3, weil der Ingenieur auf Flusstal (Pumprohre aus dem Fluss, weiches Gestein) unter 25 min lag (Regel e); die Anfälligkeiten je Methode blieben, also verschiebt sich nur die Gesamtdauer der weichen Gesteine. Methodenkonstanten blieben in dieser Runde unverändert.

## 2026-09-30 Zweite Tropfstelle mit 60 %
Sobald der Tropfmeister für die zweite Tropfstelle ein Pumprohr aus Fluss oder Meer legt (statt an der kleinen Quelle zu verhungern), war der Doppeltropf auf Kalk und Sandstein mit 21–25 min die stärkste Spielweise überhaupt: schnellster Bot in 7 von 16 Kombinationen, Bestzeiten unter 25 min, und zwei unabgestimmte Tropfmeister so schnell wie das abgestimmte Paar. Statt die Bots zu bremsen zählt die zweite Tropfstelle nun 60 % (`methods.tropfen.secondDrip`); die erste bleibt unverändert, Landschaften mit knapper Quelle (eine Tropfstelle) sind kaum betroffen. Außerdem schließt der Tropfmeister die Zisterne nur noch per Rinne an, nie per Pumprohr (Puffer, keine dritte Zuleitung), und kD sinkt von 20 auf 18, weil eine voll gespeiste Tropfstelle (0,7 L/s statt 0,5 aus dem Brunnen) allein schon deutlich stärker ist als vor der Pumpleitung.

## 2026-09-30 Koop-Team: Arbeitsteilung statt zwei Tropfmeister
Seit beide unabgestimmten Tropfmeister Pumpleitungen legen, waren sie so schnell wie das Team (Regel d verletzt). Das Team teilt jetzt wirklich die Arbeit: A führt die Tropfwirtschaft (Eröffnung, Darlehen, beide Tropfstellen), B bohrt und keilt auf derselben Linie, wässert die Keile aus A's Zisterne, führt bei ergiebiger naher Quelle die Eimerkette und gießt mit A synchron auf die heißeste Linienzone. Zwei Methoden auf einer Linie statt zweimal dieselbe – das ist der Koop-Vorteil, den der Kern belohnt (nur zwei Tropfzonen zählen).

## 2026-09-30 Runde 4: Konzentration statt Streuung
- Keilschläger bei knappem Wasser (Steppe, Hochland): Keile nur auf den zwei Linienzonen statt auf sechs halbnassen (Steppe/Granit 40 → 37 min, Hochland/Basalt 44 → 38). Für den Gärtner gilt das nicht: Bäume verlieren kein Wasser, mehr Bäume sind mehr Schaden (getestet, verworfen).
- Wurzel k 6,2 → 5,8 (Rücknahme des Boosts vom Vormittag: der Gärtner war nach Wasserspeicher und Teilgüssen in 31 % der Kombinationen der Schnellste), Tropfen k 18 → 17. Beide Konstanten wirken kaum auf die Bestzeit, weil Aufbau und Strähne dominieren; sie bleiben dennoch, weil die Verhältnisse stimmen sollen.
- Ingenieur: vier Träger statt drei, das Strahlwerk (900) kommt früher. Taunetze für den Keilschläger auf der Steppe (kein messbarer Gewinn, bleibt als Spielweise). Frostwart sichert Energie jeden Tick (Pumprohr zur Zisterne stand sonst still).

## 2026-09-30 Runde 5: Schwachstellen und zwei Bot-Fehler
- Keilschläger reiht Keilzonen nach `weak × (Linie 1 / sonst 0,5)`: Schwachstellen (Abklopfen, weak 1,6–2,2) zählen mehr als die bloße Linie; bei knappem Wasser die besten drei Zonen, sonst alle acht (Steppe/Granit 37 → 34, Küste/Kalkstein 33 → 31).
- Zwei Fehler in der Bot-Werkzeugkiste: `build()` verweigerte eine zweite Sandgrube (der Ingenieur verhungerte an der Küste und in der Steppe mit zwei Strahlwerken bei 0 Sand, Geld lag ungenutzt), und `repairWorst()` übersah sturmzerstörte, inaktive Gebäude (Windrad). Ingenieur Küste/Kalkstein 34 → 29 min.
- Dampfkessel: an der kühlen Küste glüht die Zone nur kurz; der Bot verpasste das Fenster, weil er gerade 1–2 Holz im Dorf kaufte (Küste/Basalt bimodal 27 oder 80+ min). Jetzt kauft er Holz in Schüben und eine glühende Zone mit freiem Loch verdrängt jeden Botengang (`stop` + `charge`). Küste/Basalt 46 → 37 min.
- Salzbonus für Tropfen (Küste, Kalk/Sandstein ×1,1) auf 1,0 gesetzt (`methods.tropfen.saltBonus`): Küste/Kalkstein war die letzte Kombination mit nur zwei Methoden im Fenster, weil der Tropfmeister dort 10 % vor seinem Flusstal-Wert lag und Keile (31) knapp außerhalb. Salz bleibt als Gegenspieler der Wurzeln (0,3) erhalten; die Methoden selbst sind unverändert.
