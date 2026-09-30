Bedingung: Lies docs/AUFTRAG.md und, falls vorhanden, docs/PLAN.md, setze den Auftrag vollständig um und arbeite dort weiter, wo der Plan steht. Erfüllt ist das Ziel erst, wenn du in dieser Unterhaltung die Ergebnisse von `npm test`, `npm run balance` und `npm run test:e2e` zeigst, alle drei mit Exit-Code 0, und danach den Inhalt von docs/ABNAHME.md mit Nachweis zu jedem Abnahmekriterium und der Liste der nicht geprüften Punkte. Nebenbedingungen: keine Prüfung abschwächen oder überspringen, die Schwellen aus dem Auftrag bleiben unverändert, jeder Meilenstein ist committet.
Gesetzt: 2026-09-30 11:10
Runden: 6
Status: aktiv
Letzte Prüfung: nicht erfüllt – npm test grün (25 Tests), e2e-Specs einzeln grün, Balance-Lauf (20 Seeds) zuletzt mit 6 Verstößen gegen Regel (a); Bot-Verbesserungen (Wasserspeicher bei knappen Quellen, Frost-Zeitfenster, Sonnensegel, zweite Tropfleitung) eingebaut, neuer 20-Seed-Lauf läuft.
Nächster Schritt: Ergebnis des 20-Seed-Laufs lesen, verbleibende (a)/(b)/(e)-Verstöße beheben, dann npm test / npm run balance / npm run test:e2e am Stück zeigen, ABNAHME.md schreiben, committen und pushen.
Nachweise: npm test Exit 0 (25 Tests, in dieser Sitzung); e2e-Specs solo/coop/race/reconnect einzeln grün (frühere Runde); Screenshots in docs/screenshots/ (neu aufgenommen 14:25–14:41).
