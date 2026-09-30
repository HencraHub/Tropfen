# GDD – „Ein Tropfen auf den heißen Stein“

Stand: Meilenstein 4/5 (Zahlen aus `src/data/`; die Datendateien sind maßgeblich, dieses Dokument erklärt die Formeln). Alle Formeln laufen im Kern `src/sim/` mit eigener, engineunabhängiger Mathematik (`dmath.ts`).

## 1. Kern in einem Satz
Ein Stein mit Gesicht liegt in der Mitte der Welt. Der Spieler bringt Wasser dorthin, auf immer klügere Weise, und spaltet ihn mit einer Kombination aus Hitze, Kälte, Beharrlichkeit, Holz, Dampf, Druck oder Wurzeln. Zeit ist die Wertung.

## 2. Einheiten und Takt
| Größe | Wert |
|---|---|
| Simulationstakt | 10 Hz (100 ms), deterministisch, Zufall aus Seed (xoshiro128**) |
| Spieltag | 6 Minuten Spielzeit = 3600 Ticks; Sonnenaufgang 6 h, Mittag 12 h, Untergang 18 h |
| Solo-Standard | Ziel: Bestzeit 25–45 min (4–7,5 Spieltage) |
| Rennen | Stein mit 45 % Widerstand: 12–20 min |
| Karte | Meter; Stein im Ursprung, Radius 6 m (Rennen 4,5 m) |
| Gehen | 4 m/s (Spieler), Träger 3,5 m/s, Karren 2,5 m/s; Steigung bremst |

## 3. Der Stein
### 3.1 Zustand
- `hp` Spaltwiderstand (Solo Standard: 100 000 „Spaltpunkte“ × Gesteinsfaktor; Rennen × 0,45).
- `progress` 0..hp, Fortschritt in % im HUD.
- 8 Zonen (Sektoren um den Stein, 0 = Norden, im Uhrzeigersinn). Je Zone: Temperatur `T` (°C), Feuchte `wet` 0..1, Rissfüllung `fill` (Liter), Bohrlöcher `holes`, Keile `wedges` mit Nässe `wedgeWet`, Bäume `trees` mit Wuchs `growth`, Dampfladung `charge`, Schwachstelle `weak` (Multiplikator, verborgen bis abgeklopft).
- Spaltlinie: zwei gegenüberliegende Zonen (`line`, `line+4`) plus Mitte. Schaden in Linienzonen zählt voll, sonst 50 %. Linie neu wählen kostet 60 Geld (Rat: „Änderung des Planungsbescheids“).

### 3.2 Temperatur je Zone
Pro Tick (dt = 0,1 s):
```
sonne   = max(0, sin(π·(h−6)/12)) · wetterSonne · zonenLage(h, zone)
T += (Aeff − T) · kLeit · dt + sonne · kSonne · dt − schatten · dt
Aeff = ambient(h, landschaft, wetter) + launenVersatz
```
- `zonenLage`: Zonen, die der Sonne zugewandt sind (Osten morgens, Süden mittags, Westen abends), erhalten bis zu +60 % Sonne, abgewandte −60 %. Dadurch gibt es zu jeder Tageszeit einen heißen und einen schattigen Sektor.
- Wasser kühlt: `T −= (T − Twasser) · min(1, L / thermMasse)`, thermMasse = 250 L je Zone (Granit 300, Basalt 220).
- Gebäude: Brennspiegel +18 °C/min bei Sonne auf seine Zone, Feuerstelle +25 °C/min (verbraucht 1 Holz/min), Sonnensegel −70 % Sonne auf seine Zone, gewachsene Bäume −20 % je Wuchs.

### 3.3 Verdampfung und wirksames Wasser
```
e = clamp((T − 40) / 120, 0.05, 0.95) · launeVerdampfung
wirksam = L · (1 − e)
wet += wirksam / 40            (40 L machen eine Zone nass)
wet −= (0,15 + 0,01·max(0, T−20)) je Spielstunde
```
Der Rat zahlt nur für wirksames Wasser (Abschnitt 8). Bei 40 °C verdampfen 5 %, bei 100 °C 50 %, bei 154 °C alles. Regen benetzt (0,012 L je Tick und Zone), wird aber nicht bezahlt.

### 3.3a Quellen
Jede Quelle hat einen Vorrat (Fluss/Meer praktisch unbegrenzt, Bergquelle 600 L, Brunnen 250–400 L), der sich mit ihrer Rate füllt. Eimerketten schöpfen zuerst, dann nehmen Rinnen und Rohre, dann Träger und Spieler; ein leerer Vorrat lässt Träger warten. Regen und Tau liefern nur in Regenfang/Taunetz.

### 3.4 Schwachstellen und Abklopfen
- 2–3 Zonen tragen einen Faktor 1,6–2,2 (Dickschädel: 2,5). Unbekannt bis Abklopfen (Klopfhammer, 5 s je Zone; Plappermaul 3 s).
- Abklopfen ist eine Aktion am Stein; der Stein antwortet („hohl“, „dumpf“).

### 3.5 Launen (1–2 je Stein, aus dem Seed)
| Laune | Wirkung |
|---|---|
| wasserscheu | Verdampfung ×1,4 |
| Morgenmuffel | Sonnenaufnahme vor 10 h ×0,4 |
| Hitzkopf | Abkühlung ×0,6 (gut für Thermoschock/Dampf, schlecht für Frost) |
| Frostbeule | Frostschaden ×1,3, Feuchte fällt ×1,5 schneller |
| Dickschädel | Widerstand +15 %, Schwachstellen ×2,5 |
| Plappermaul | Schaulustige +30 %, Abklopfen 3 s |
| Nachtaktiv | Schaden nachts ×1,2, tagsüber ×0,9 |

## 4. Spaltmethoden
Der Gesamtschaden pro Tick ist die Summe aller Methoden; die Statistik führt den Anteil jeder Methode („Hauptmethode“ = größter Anteil). Alle Konstanten stehen in `src/data/methods.json`.

### 4.1 Thermoschock
- Auslöser: ein Guss in einem Tick (Eimer, Joch, Karrenkippe, Tankventil).
- Alle Güsse eines Ticks (±3 Ticks, Synchronguss!) werden addiert. Wirksame Liter `effL`: bis zum Knie 150 L überlinear `150·(L/150)^1,3`, darüber unterlinear `150 + (L−150)^0,75`.
- `dmg = kTS(0,9) · susTS · effL · max(0, (T0 − Twasser) − 30)^1,15 · zone.weak · linie`, T0 = Temperatur vor dem Guss.
- Stärke: riesige Einzelwirkung, Wasserqualität egal, kaltes Bergwasser doppelt gut. Schwäche: braucht heißen Stein (Mittag, Brennspiegel, Feuer) und Speicher; jeder Guss kühlt den Stein, danach Aufheizpause. Konter: Wolken, Regen, Frostwart-Segel, Morgenmuffel. Synergie: Feuerstelle (Holz), Hochtank, kalte Quelle, Dampfdruck (gleiche Hitze).

### 4.2 Frostsprengung
- Wasser füllt Risse: `fill += wirksam` bis `cap = 120 + 300 · progress/hp` Liter. Wasser in warmen Rissen läuft aus: `fill −= fill · 0,5 · max(0, T−15)/20` je Spielstunde – wer abends gießt, hat nachts volle Risse (Timing, Schatten).
- Gefriert, wenn `T < 0` und Füllung > 0: einmalig pro Frostzyklus `dmg = kF(52) · susF · fill · launeFrost · (Nachtwache ? 1,3 : 1)`, danach `fill ·= 0,3`; Tauen ab 2 °C.
- Stärke: kein Verbrauch außer Wasser, arbeitet nachts allein. Schwäche: braucht Nächte unter 0 °C (Hochland, Steppe; sonst nur mit Eiskeller), Schatten am Tag, Geduld, wächst erst mit Fortschritt. Konter: Hitzkopf, Küste, Hitzewelle. Synergie: Sonnensegel, Wurzelschatten, Steter Tropfen (füllt nachts weiter).

### 4.3 Steter Tropfen
- Ein Zufluss (Rinne/Rohr/Tank-Auslass/Eimerkette) an einer Tropfstelle mit Rate `r` (L/s), erst nach Forschung „Tropfstelle“. Zählt nur bis `cap` (0,4 L/s; Feinjustierung 0,7); ohne Doppeltropf zählt nur die stärkste Zone, mit Doppeltropf zwei.
- Strähne `streak` (Ticks) wächst, solange `r ≥ 0,05`; sonst 0. `m = 1 + 2 · min(1, streak / 6000)`.
- `dmg = kD(17) · susD · min(r, cap) · m · (0,5 + wet) · (Salz auf Kalk/Sandstein 1,1) · (zweite Tropfstelle 0,6)` je Sekunde
- Stärke: billig, kein Timing, vom Wetter fast unabhängig. Schwäche: braucht Infrastruktur mit Gefälle oder Energie, jede Unterbrechung (Wartung, Dürre, Frost in der Rinne) wirft die Strähne auf 0. Konter: Sturm (Rinnenschaden), Dürre, Salz (Kalk profitiert, Pumpen leiden). Synergie: Zisterne als Puffer, Frost (Risse bleiben gefüllt), Wurzeln (Feuchte).

### 4.4 Quellkeile
- Bohren (Bohrer, 12 s · Härte je Loch, max. 6 Löcher je Zone), Keil setzen (1 Holz, 3 s), wässern.
- `wedgeWet += wirksam / (8 · wedges)`, fällt um `(0,06 + 0,004·max(0,T−20)) · 0,35` je Spielstunde (Keile halten Nässe länger als die Oberfläche).
- `dmg = kW(2,3) · susW · wedges · wedgeWet · (linie ? 1,5 : 1) · weak` je Sekunde
- Stärke: planbar, skaliert mit Holz und Arbeit, unabhängig von Temperatur. Schwäche: Holz, Bohrzeit, jeder Keil will täglich Wasser; harte Gesteine bohren langsam. Konter: Holzknappheit, Hitze (Keile trocknen). Synergie: Wurzelkraft (Bäume liefern Holz), Träger (kleine Mengen genügen), Abklopfen (Keile nur in Schwachstellen).

### 4.5 Dampfdruck
- Tiefbohrung (Tiefbohrer, 36 s · Härte, bis 3 je Zone, je Loch eine Ladung), Ladung: ≥ 10 L (max. 60) in ein Loch bei `T ≥ 85`, Stopfen (1 Holz; mit Sicherheitsventil kein Holz).
- Nach 30 s: `dmg = kS(9) · susS · Liter · max(5, T − 80)`; `pBlow = min(0,9, (0,15 · (T − 80)/60 + Leck(Sandstein 0,1)) · (1 − 0,6·ventil))`. Bei Fehlschlag: Stopfen weg, Schaden halbiert, Spieler/Arbeiter 20 s benommen, aber +20 Schaulust.
- Stärke: höchster Schaden je Liter, Publikumsmagnet. Schwäche: Holz, Zeit, Risiko, Stein muss glühen. Konter: Regen, Sandstein (undicht), Nacht. Synergie: Thermoschock-Hitze, Tribüne, Feuerstelle.

### 4.6 Wasserstrahl
- Strahlwerk (Gebäude am Stein, 900 Geld, Forschung). Verbraucht 4 Energie/s, 1,5 L/s, 0,1 Sand/s. `dmg = kJ · susJ · leistung` mit `leistung = min(1, energie/4) · min(1, wasser/1,5) · min(1, sand/0,1)`.
- Stärke: konstant, wetterfest, stark gegen weiche Gesteine. Schwäche: teuer, hungrig, alles gleichzeitig: Energie, Wasser, Sand. Konter: Energiemangel, Holzpreis bei Dampfmaschine. Synergie: Windrad an der Küste, Sandgrube in der Steppe, Wasserhandel als Anschub.

### 4.7 Wurzelkraft
- Setzling (12 Geld, Forschung) in Zone mit `progress/hp ≥ 0,03` oder Bohrloch, bis 3 je Zone. `growth += 0,04 · (0,3 + wet) · (1 + growth) · (Salz 0,3) · (Wurzelwerk 1,5) − 0,06·max(0, T−55)/20` je Spielstunde, bis 1.
- `dmg = kR(5,8) · susR · Σ growth² · weak` je Sekunde; Bäume spenden Schatten (−20 % Sonne je Wuchs), liefern ab Wuchs 0,7 alle 2 min 1 Holz.
- Stärke: verstärkt sich selbst, kostet fast nichts, hilft Frost und Keilen. Schwäche: lahmer Start, Salz und Hitze töten Wuchs, braucht Feuchte. Konter: Küste, Steppe, Hitzewelle. Synergie: Bewässerungsring (Rinne wässert Bäume automatisch), Quellkeile (Holz), Frost (Schatten).

## 5. Gesteine (`src/data/rocks.json`)
| Gestein | Widerstand | Härte (Bohren) | Leit | TS | Frost | Tropfen | Keil | Dampf | Strahl | Wurzel |
|---|---|---|---|---|---|---|---|---|---|---|
| Granit | 1.30 | 1.4 | 0.8 | 1.3 | 1.2 | 0.6 | 1.0 | 1.0 | 0.8 | 0.6 |
| Kalkstein | 1.30 | 0.9 | 1.0 | 0.7 | 1.0 | 1.35 | 1.0 | 0.8 | 1.2 | 1.3 |
| Sandstein | 1.35 | 0.7 | 1.0 | 0.6 | 1.3 | 1.1 | 1.25 | 0.7 | 1.4 | 1.2 |
| Basalt | 1.20 | 1.2 | 1.1 | 1.5 | 0.8 | 0.5 | 0.7 | 1.4 | 0.9 | 0.9 |

## 6. Landschaften (`src/data/landscapes.json`)
| Landschaft | Quellen | Klima (Tag/Nacht) | Besonderheit |
|---|---|---|---|
| Flusstal | Fluss 60 m, 5 L/s, 14 °C, −3 m unter Stein (Rinne nur mit Anzapfung stromauf, +4 m, Forschung) oder Rohr mit Pumpe; Regen mittel | 26/12 | Wald nah (Holz 5), Dorf nah, Wasserrad möglich |
| Hochland | Bergquelle 120 m, 1,5 L/s, 6 °C, +15 m; Schneeschmelze mittags mehr | 20/−6 | Nächte gefrieren, Gefälle schenkt Rinnen, Holz teuer |
| Küste | Meer 50 m, unbegrenzt, 18 °C, −5 m (Pumpe nötig); Regen häufig | 28/16 | Wind (Windrad billig), Sand frei, Salz: Tropfen auf Kalk/Sandstein ×1,2, Wurzeln ×0,3, Pumpwartung ×1,5 |
| Steppe | Brunnen 80 m, 1,2 L/s (Vorrat 400 L), 22 °C, ±0; Taunetz morgens; Regen selten | 38/2 | Größter Temperaturhub (Thermoschock, Frost mit Segel), Holz sehr teuer, Sand frei, Rat zahlt +25 % |

## 7. Logistik (`src/data/buildings.json`, `tools.json`)
| Mittel | Kosten | Durchsatz | Verlust | Wartung |
|---|---|---|---|---|
| Hände | 0 | 2 L je Gang | 10 % | – |
| Eimer | 20 | 10 L | 5 % | – |
| Tragjoch | 60 | 20 L | 5 % | – |
| Träger | 30 + 12/Tag | 10 L je Gang, 3,8 m/s | 5 %, Sturm 12 %, Stolpern 2 % je Gang | Lohn |
| Eimerkette | Kräfte im Abstand 16 m (Spieler zählen 1,5) | 0,35 L/s je Kraft · Abdeckung² | 3 % | Lohn; schöpft vor den Rinnen |
| Karren | 120 | 60 L (Spieler) | 2 % | – |
| Esel + Karren | 150 + 8/Tag | 120 L, 2 m/s, autonom | 2 % | Futter |
| Rinne | 3 Geld + 0,2 Holz je m | 2 L/s bei ≥ 1 % Gefälle je Segment; friert unter 0 °C ein | 1 % je 10 m + Verdunstung | Zustand −8 %/Tag, Sturm −30 %/Tag |
| Rohr | 9 je m (Forschung) | 3 L/s; bergauf nur mit Pumpe | 0,2 % je 10 m | −3 %/Tag |
| Pumpe | 180 | hebt 3 L/s; 0,02 Energie/s je m Hub und L/s | – | −5 %/Tag, Salz ×1,5 |
| Fass / Zisterne / Hochtank | 40 / 200 / 400 | 200 / 1000 / 2000 L; Auslass mit einstellbarer Rate (Tropfen, Flutung); Hochtank hat Ventil (Guss in einem Tick) | – | – |
| Wasserrad / Windrad / Tretmühle / Dampfmaschine | 250 / 220 / 90 / 600 | 3 / 2,5 (wind) / 0,8 (Arbeiter) / 6 Energie/s (1 Holz/min) | – | – |

Routen sind Polylinien aus Segmenten; die Höhe wird je Segmentende aus der Landschaft gelesen. Ein Segment ohne Gefälle blockiert die Rinne. Rohre brauchen für jeden Meter Steigung Pumpenergie. Verluste und Verdunstung wirken je Segment.

## 8. Wirtschaft (`src/data/economy.json`)
- Start: 150 Geld, 0 Holz, 5 Arbeitsplätze (Baracke +4). Zwei Werkzeugplätze je Spieler.
- Rat: 2 Geld je wirksamem Liter; Prämie 25 Geld je 1 % Fortschritt; Meilensteine 25/50/75 %: 120/180/260 Geld (Steppe +25 %).
- Wasserhandel: Zisterne des Dorfes nimmt 800 L/Tag zu 0,35 Geld/L, danach 0,1 (Marktstand: 1200 L, 0,45).
- Schaulustige: Schaulust `S` steigt bei Ereignissen (Dampfstoß +30, Fehlschlag +20, Thermoschock ≥ 500 L +15, Fortschrittsprung +10, Steinrede +3), fällt 10 %/min; Einnahme 0,3·S je Minute; Tribüne ×1,8; Volksfest ×2.
- Kredit: bis 300 (Bürgschaft 800), Zins 10 %/Tag (Bürgschaft 5 %), Tilgung automatisch 30 % der Einnahmen.
- Holz: Wald (Axt, 6 s je Holz, Weg!), Kauf im Dorf (Flusstal 5, Hochland 9, Küste 7, Steppe 10; Holzknappheit ×2), Bäume ab Wuchs 0,7.
- Energie: Pool je Tick; bei Mangel laufen Verbraucher anteilig.
- Arbeiter: Träger, Bohrarbeiter (nur Forschung „Bohrtrupp“), Wartungstrupp. Lohn täglich um 6 h; unbezahlt → Streik bis Zahlung.

## 9. Forschung (`src/data/research.json`)
Ein Netz mit sechs Richtungen; Knoten kosten Geld und Zeit (Schreibstube halbiert). Meilensteine bei 20/45/70 % Fortschritt bieten „1 aus 3“ aus einem Pool von 12 Vorteilen (Seed-abhängig): Zäher Träger, Gute Presse, Steinflüsterer, Ratsgunst, Quellrecht, Frostnacht, Sonnenbrand, Holzsegen, Eilbote, Doppelschicht, Dichte Rinnen, Sparflamme.

Richtungen: Wasser (Eimerbau → Rinnenbau → Rohrguss → Pumpwerk → Hochtank), Kraft (Wasserrad/Windrad → Dampfmaschine → Strahlwerk), Hitze (Brennspiegel → Feuerstelle → Dampfbohrung → Sicherheitsventil), Kälte (Sonnensegel → Nachtwache → Eiskeller), Werk (Bohrer → Quellkeile → Tiefbohrer → Bohrtrupp → Sandgrube), Grün (Setzlinge → Bewässerungsring → Wurzelwerk), Handel (Marktstand → Tribüne → Bürgschaft → Baracke), Tropfen (Tropfstelle → Feinjustierung → Doppeltropf).

## 10. Wetter und Ereignisse (`src/data/weather.json`, `events.json`)
Wetter je Tag aus Landschaftsgewichten: sonnig, wolkig, Regen, Sturm, Hitzewelle, Kältebruch, Nebel. Vorhersage zwei Tage im Planungstisch. Ereignisse etwa eins je Tag: Ratsinspektion, Dürre, Volksfest, Holzknappheit, Streik, Wanderzirkus, Launenwechsel, Tourbus.

## 11. Modi
- Allein: Seed frei; Szenarien (Lehrgang je Methode, `src/data/scenarios.json`); Tagesaufgabe (Seed aus Datum).
- Koop: ein Stein, gemeinsame Kasse, 2 Werkzeugplätze je Spieler; Eimerkette mit Spielern; Synchronguss: mehrere Güsse im selben Tick addieren ihre Liter (Thermoschock wächst überproportional).
- Rennen: ein Stein je Team, gleicher Seed, Fortschritt der anderen sichtbar; Rangliste nach Zeit.
- Wertungen: Zeit; Nebenwertungen: wenigstes Wasser, billigster Sieg, ohne Rohre.

## 12. Bots (Balance, `src/bots/`)
Acht Strategie-Bots (Hitzkopf, Frostwart, Tropfmeister, Keilschläger, Dampfkessel, Ingenieur, Gärtner, Händler), ein planloser Bot (kauft stets das Billigste, gießt irgendwohin), zwei Koop-Paare (abgestimmt: eine Eröffnung, getrennte Tropfzonen, Eimerkette, Synchronguss; nebeneinander: zwei unabhängige Tropfmeister). Bots benutzen ausschließlich Spielerkommandos, dieselben wie der Client. Kommandos, die Nähe brauchen, landen in einer Warteschlange je Spieler, der Kern lässt die Figur hinlaufen (auch Bots laufen wirklich).

Gemeinsame Bausteine (`src/bots/toolkit.ts`): Eröffnung (Darlehen, Dorfgang, Abklopfen aller Zonen, Linie), Forschungsplan mit Voraussetzungen, Routenplanung mit Knick und Restfluss der Quelle, Energie sichern (Tretmühle/Wasserrad/Windrad), Sparen mit Blockade niedrigerer Prioritäten. Bei **knappen Quellen** (nur Vorratsquellen, Summe ≤ 2 L/s: Steppe, Hochland) saugt die erste Rinne die Quelle leer; deshalb führen Keilschläger, Gärtner und Tropfmeister die Rinne in einen Wasserspeicher am Stein (Zisterne bzw. Fass mit Auslass) und verteilen von dort per Hand auf die Arbeitszonen; der Ingenieur reißt bei Bedarf die Zonenrinne ab, damit das Strahlwerk die einzige Rinne bekommt. Auf heißen Landschaften (Steppe) spannen Keilschläger, Tropfmeister und Gärtner Sonnensegel über ihre Linienzonen (weniger Verdunstung, Wurzeln überleben). Der Frostwart flutet die Linie erst, wenn die Zone unter 15 °C und noch nicht gefroren ist (Zisternenauslass, Träger, eigener Körper), tagsüber füllt er die Zisterne. Wer reich ist und freies Wasser hat, baut weitere Rinnen zu trockenen Baum- bzw. Keilzonen (notfalls Pumprohre). Bohrtrupps, deren Zone fertig ist, werden neu eingeteilt.

Koop-Team (`src/bots/coop.ts`, Arbeitsteilung): A eröffnet, nimmt das Darlehen und führt die Tropfwirtschaft mit beiden Tropfstellen; B wartet auf A's Eröffnung und arbeitet auf derselben Linie mit Quellkeilen (bohren, keilen, Keile aus A's Zisterne oder von der Quelle wässern, Teilgüsse je Bedarf), führt bei ergiebiger naher Quelle die Eimerkette zur Gegenzone, bei knapper Quelle zwei eigene Träger in ein Tropffass, und gießt mit A synchron auf die heißeste Linienzone (Synchronguss, Thermoschock-Knie). Das unabgestimmte Paar sind zwei unabhängige Tropfmeister; da nur zwei Tropfzonen zählen, verpufft dort die zweite Tropfwirtschaft. A stellt nur eigene Zonenträger um, nie B's Fassträger.

## 13. Netz
Server rechnet, Clients spielen dieselben Kommandos je Tick nach (Lockstep, Hash-Prüfung alle 50 Ticks, Schnappschuss bei Abweichung oder Wiedereinstieg). Rennen: ein Kern je Spieler, Rangliste alle 10 Ticks.
