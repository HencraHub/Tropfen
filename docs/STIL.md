# STIL – Bastel-Diorama

Alles im Spiel sieht aus wie ein von Hand gebautes Modell auf einem Schreibtisch: Pappe, Papier, Folie, Watte, Glasperlen, Holzstäbchen, Fäden. Es gibt keine „echten“ Materialien, keine Fotografie, keine glatte Computergrafik. Wenn ein Bildteil so aussieht, als hätte ihn niemand mit Schere und Kleber gemacht, ist er falsch.

## 1. Palette
| Name | Hex | Verwendung |
|---|---|---|
| Pappe | `#c9a76b` | Gelände-Schichten, Gebäudewände |
| Pappe dunkel | `#a37f47` | Wellpappkanten, Schatten in Kanten |
| Kraftpapier | `#e8d6ad` | Wege, Papierstreifen, Sprechblasen |
| Papierweiß | `#f6f0e1` | Watte, Wolken, Dampf, Augenweiß |
| Folienblau | `#5aa9e6` | Fluss, Meer, Wasserbehälter |
| Folienblau tief | `#2f6fb3` | Tiefe Stellen, Wasserkanten |
| Glasperle | `#a9dcff` | Wassertropfen, Perlenketten in Rinnen |
| Steingrau warm | `#9a8f86` | Stein Grundton (Granit); Basalt `#5d5a5f`; Kalk `#d8cdb0`; Sandstein `#d1a06a` |
| Glut | `#ff7a3d` | Heiße Zonen, Feuer, Warnungen |
| Frost | `#bfe8ff` | Kalte Zonen, Eis |
| Moos | `#7fa650` | Bäume, Wald (Schwammbäume) |
| Tinte | `#2b2320` | Konturen, Schrift, Pupillen |
| Rat-Stempelrot | `#b5382e` | Behördenstempel, Bescheide |
| Nachtblau | `#1c2440` | Nachthimmel (Tonpapier) |

Hintergrund ist ein Tonpapier-Himmel (Tag: `#cfe6f5`, Abend `#f0b489`, Nacht `#1c2440`), nie ein Verlauf mit Glanz. Kein reines Schwarz, kein reines Weiß.

## 2. Materialien (alle im Code erzeugt, `src/client/materials/`)
- **Papierfaser**: Rauschen aus feinen Fasern (Canvas: 3000 kurze Striche in zwei Richtungen, 6 % Deckung) als Farbmultiplikator auf jeder Papierfläche.
- **Wellpappkante**: Gelände-Schichten und Gebäudekanten tragen eine Streifentextur (Wellen 3 mm) in Pappe dunkel; sichtbar an jeder Schnittkante.
- **Folie**: Fluss und Meer sind Flächen mit hoher Glanzstärke (`roughness 0.15`, `metalness 0.1`), Ränder gerade geschnitten, gelegentlich ein Knick (UV-Wobble).
- **Watte**: Dampf und Wolken sind Bündel aus 5–9 weichen Kugeln mit `roughness 1`, leicht durchscheinend, Ränder fransig durch Alpha-Rauschen.
- **Glasperle**: Wasser in Bewegung sind Kugeln 4–8 cm, `roughness 0.05`, mit Glanzpunkt; Wasser im Behälter ist Folie.
- **Wackelauge**: weiße Scheibe mit schwarzer Pupille, die träge der Bewegung nachläuft (Federmodell), auf Stein, Träger, Esel, Windrad.
- **Konturen**: Jede Kante hat eine Tintenlinie (EdgesGeometry, Tinte, 1 px) mit 8-Hz-Wackeln (Vertex-Versatz ±0,6 cm, quantisiert).
- **Schrift**: eigene Strichschrift „Klammerschrift“ (Polylinien im Code, leicht wackelig), für HUD, Menüs, Sprechblasen und Stempel. Keine Systemschrift sichtbar. Behördentexte in Blocksatz mit rotem Stempel.

## 3. Formen
- Gelände: Höhenlinien als gestapelte Pappschichten (Stufen 0,8 m), oben Pappe, Kanten Wellpappe, Wege als aufgeklebter Kraftpapierstreifen.
- Stein: grober Polyeder (Ikosaeder, 2 Unterteilungen, Zufallsversatz), Kanten Tinte; Gesicht: zwei Wackelaugen, Mund als Papierstreifen (Formen: neutral, grimmig, o, zittern), Augenbrauen als Pappstreifen. Schwitzen: Glasperlen, die an der Seite herablaufen. Riss: Tintenlinie, die mit dem Fortschritt wächst und sich verzweigt, gezeichnet auf Canvas-Textur.
- Figuren: Hampelmann aus flachen Pappteilen (Rumpf, Kopf, 2 Arme, 2 Beine), Gelenke mit sichtbaren Musterklammern (kleine Messingscheiben), Bewegung im Stop-Motion-Takt (8 Bilder/s), Gehen = Beine pendeln ±35°.
- Eigene Hände: zwei Papphände unten im Bild, halten Eimer/Werkzeug; Stop-Motion-Wippen beim Gehen.
- Gebäude: Pop-up-Faltung – beim Bau klappen Wände aus einer flachen Grundplatte hoch (Rotation um Bodenkante, 0,6 s, in 5 Schritten), Dach zuletzt.
- Sonne: gelbe Pappscheibe an einem Holzstab, der über den Himmel schwenkt; Mond gleiches Prinzip in Papierweiß.
- Wolken: Wattebündel an sichtbarem Faden (Linie nach oben), driften.
- Fluss: gerade geschnittener Folienstreifen mit glitzernden Perlen; Meer: große Folie mit Papierschaumkante.
- Bäume: Schwammkugeln (Moos) auf Zahnstocherstamm.
- Werkzeuge und Behälter: Pappzylinder mit sichtbarer Klebelasche.

## 4. Licht
- Eine Schreibtischlampe: warmes Spotlicht (3000 K, `#ffd9a8`) von schräg oben (45°), weiche Schatten (PCF), deutlich sichtbarer Kontaktschatten unter jedem Objekt (zusätzlich flache dunkle Scheibe, „Aufgeklebter Schatten“).
- Umgebungslicht kühl-schwach, bei Nacht Lampe gedimmt und bläulich; Feuer als flackerndes Punktlicht.
- Keine Bloom-Explosionen, kein Lens-Flare, keine Volumetrik.

## 5. Animationsregeln
1. Alles Bewegte läuft mit 8 Bildern je Sekunde (Stop-Motion-Quantisierung), außer Kamera und Wasserperlen (flüssig, weil Glas).
2. Jede Aktion bekommt Stauchen und Strecken (Squash & Stretch bis 15 %) und einen Ton.
3. Erscheinen = Aufklappen (Gebäude) oder Aufploppen (Werkzeuge: Skalierung 0 → 1,15 → 1 in 3 Schritten).
4. Der Stein reagiert auf jede Methode anders: Thermoschock → zusammenzucken, Augen weit; Frost → zittern, blaue Lippen; Tropfen → genervtes Augenrollen; Keile → Grimasse; Dampf → Luft anhalten, Backen aufblasen; Strahl → Augen zusammenkneifen; Wurzeln → Kitzel-Grinsen. Sprechblasen im Behördenton-Gegenteil: der Stein ist patzig.
5. Träger stolpern (Wahrscheinlichkeit im Kern), dann kippt der Eimer: Perlen spritzen, Figur liegt 1 s flach.
6. Finale: Riss läuft in 3 s durch, Stein hält die Luft an, Knacks, beide Hälften kippen auseinander, Konfetti aus Papierschnipseln, Lampe schwenkt.

## 6. Verbote
- Keine nackten Grundkörper (Würfel/Kugel ohne Papiermaterial und Kontur).
- Keine Systemschrift, keine Verläufe mit Glanz, kein Lens-Flare, keine fotorealistischen Texturen, keine KI-Bilder mit Perspektive oder Beleuchtung (nur flache, freigestellte Bastelteile).
- Keine Bewegung ohne Ton, kein Ereignis ohne Reaktion des Steins oder des Rats.
- Kein UI-Element ohne Papierrand (Sprechblasen, Zettel, Stempel).

## 7. Prüfliste für Screenshots
- Sind Kanten als Wellpappe erkennbar? Gibt es Tintenkonturen?
- Trägt jede wichtige Figur Wackelaugen?
- Ist das Wasser aus Perlen oder Folie, der Dampf aus Watte?
- Ist die Schrift die Strichschrift, mit Papierrand?
- Sieht man die Lampe (warme Richtung, Kontaktschatten)?
- Ist die Sonne an ihrem Stab, hängen die Wolken an Fäden?
- Bewegt sich etwas im Bild ruckelig (8 Hz) und nichts glatt außer Perlen?
