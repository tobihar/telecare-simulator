# TeleCare – Update- und Prüfbericht

## Umgesetzte Änderungen

- Herzfrequenz im Blutungsschock etwas weniger ausgeprägt und je nach Schwierigkeit auf etwa 172–180/min begrenzt.
- Stärkere Einschränkung der diastolischen Füllung bei ausgeprägter Tachykardie; Atropin erhöht dadurch nicht mehr fälschlich deutlich den MAP.
- SpO₂-Verlauf des bestehenden Falls bewusst beibehalten, damit die Sauerstoffgabe didaktisch relevant bleibt.
- Volumeneffekt von 500 ml Kristalloid läuft nach einer kurzen Plateauphase graduell aus, statt schlagartig zu enden.
- Propofol verursacht eine deutlich stärkere Atem- und Kreislaufdepression.
- Rocuronium und Succinylcholin führen ohne Beatmung zu fortschreitender Desaturation ohne künstliches Plateau bei 42–55 %.
- Schwere Hypoxie verursacht zeitabhängig eine Abnahme der Kontraktilität und später eine hypoxische Bradykardisierung.
- Schocklage bleibt bewusst kräftig und für 180 Sekunden wirksam.
- Fibrinogenkonzentrat als Medikament ergänzt; es reduziert im Blutungsfall die simulierte fortlaufende Blutungs-/Hb-Verlustrate.
- Neue Labor-, BGA-, EKG-, Sono- und Blutbankbefunde werden im Chat grün hervorgehoben.
- Sono: freie Flüssigkeit im Abdomen nachweisbar; Abdomen gespannt und hart.
- Auswertung: „Chirurgie rechtzeitig informiert“ beziehungsweise „Chirurgie verspätet oder nicht informiert“.
- Eine BGA mit Hb zählt nun als Hb-Kontrolle, auch ohne separates Labor-Hb.
- Blutproduktdialog in zwei eindeutige Spalten gegliedert: ungekreuzte und gekreuzte EK, jeweils Anforderung direkt über Gabe.
- Admin-Detailansicht zeigt Verlaufskurven für Herzfrequenz, MAP und SpO₂.
- Druckansicht des Abschlussberichts für mehrseitigen A4-Ausdruck angepasst; Scrollbegrenzungen und Dialog-Maximalhöhen werden beim Drucken aufgehoben.

## Automatisierte Realismusprüfung

Deterministische Tests prüften:

1. unbehandelten Blutdruckabfall und kompensatorischen HF-Anstieg,
2. HF-Begrenzung,
3. graduelles Auslaufen des Volumeneffekts,
4. Rocuronium ohne Beatmung,
5. Rocuronium mit Beatmung,
6. zeitabhängige Kreislaufdepression bei schwerer Hypoxie,
7. Propofol-bedingte Atem- und Kreislaufdepression,
8. Atropinwirkung bei bestehender Tachykardie,
9. blutungsreduzierenden Effekt von Fibrinogen,
10. SpO₂-Verbesserung durch Sauerstoff,
11. Abstufung der drei Schwierigkeitsgrade.

Alle 11 Tests bestanden.

## Monte-Carlo-/Stabilitätstest

- 1.235 Simulationsläufe insgesamt
- 50 Läufe je Kombination aus drei Schwierigkeitsgraden und sieben Szenarien
- fünf zusätzliche Läufe für jedes der 37 hinterlegten Medikamente
- keine NaN-, Infinity- oder Laufzeitfehler

Unbehandelte Mittelwerte nach zehn Minuten:

| Schwierigkeit | HF | MAP | SpO₂ | AF | Hb |
|---|---:|---:|---:|---:|---:|
| Leicht | ca. 172/min | ca. 30 mmHg | ca. 84 % | ca. 29/min | 6,5 g/dl |
| Mittel | ca. 172/min | ca. 24 mmHg | ca. 78 % | ca. 32/min | 6,0 g/dl |
| Schwer | ca. 180/min | ca. 24 mmHg | ca. 63 % | ca. 35/min | 5,4 g/dl |

Die tatsächliche Spielbeendigung bei Mittel/Schwer erfolgt zusätzlich über die zeitabhängige Kreislaufstillstandslogik in `app.js`.

## Technische Prüfung

- Syntaxprüfung: `cases.js`, `medications.js`, `interventions.js`, `physiology.js`, `app.js`, `admin.js`, `server.js` bestanden.
- 12 statische Integrationsprüfungen bestanden, darunter Skriptreihenfolge, UI-IDs, Befundhervorhebung, Druck-CSS, Admin-Kurven, BGA-Hb-Scoring, Blutproduktlayout und Fibrinogen-Eintrag.
- Lokaler Server startet; `/api/status` antwortet korrekt.
- Alle 37 Medikamente konnten in der Simulationsengine wiederholt verarbeitet werden, ohne Laufzeitfehler.

## Einschränkung

Die automatisierten Prüfungen decken medizinische Verlaufslogik, Konfiguration, Syntax und zentrale UI-Verknüpfungen ab. Eine vollständige visuelle Prüfung des nativen Browser-Druckdialogs und aller Touch-Gesten auf einem konkreten iPad ist in dieser Umgebung nicht reproduzierbar. Vor einer Unterrichtseinheit empfiehlt sich daher ein kurzer manueller Test auf Chrome und iPad/Safari.
