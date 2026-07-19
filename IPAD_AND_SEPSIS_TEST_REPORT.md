# TeleCare – iPad- und Frau Berger-Update: Testbericht

## Umgesetzt

- Eigener Tabletmodus für 768–1180 px
- getrennte Regeln für Quer- und Hochformat
- dynamische Viewport-Höhe (`100dvh`)
- größere Touchflächen und 16-px-Eingabefelder
- fixierte Vitalleiste und dauerhaft erreichbare Chateingabe
- Querformat: Patient/Personal links, Chat mittig, Aufträge rechts
- Hochformat: Chat zuerst, danach die beiden Seitenbereiche
- Fall 05 „Frau Berger“: septischer Schock bei katheterassoziierter Urosepsis
- fallbezogene Anamnese, Labor, BGA, EKG, POCUS, Personal, Ausgangszustand und Bewertung
- eigenes vasoplegisches Frau Bergermodell
- Volumenreagibilität, aber MAP-Ziel erst mit Noradrenalin zuverlässig erreichbar
- Blutkulturen, Urinkultur und Antibiotikagabe mehrfach dokumentierbar

## Automatische Prüfungen

- Syntaxprüfung aller JavaScript-Dateien: bestanden
- Laden beider Fälle über die Fall-Engine: bestanden
- Serverstart: bestanden
- Hauptseite, Dozentenbereich, `cases.js` und `/api/status`: bestanden
- Tablet-Breakpoints, Ausrichtungshinweis, Touchgrößen und dynamische Viewport-Höhe: statisch geprüft

## Deterministische Physiologietests

Simulation jeweils 10 Minuten ohne Zufallsjitter:

| Szenario | Ergebnis |
|---|---|
| Leicht, unbehandelt | kein Stillstand; schwere persistierende Kreislaufinstabilität |
| Mittel, unbehandelt | kein Stillstand innerhalb 10 min; deutliche Dekompensation |
| Schwer, unbehandelt | Kreislaufstillstand nach ca. 8:21 min |
| Mittel + 500 ml Kristalloid | moderater, nicht ausreichender MAP-Anstieg |
| Mittel + 500 ml + Nor 0,05 + O₂ | etwa 77/59 mmHg, MAP ca. 65, SpO₂ ca. 98 % |
| 1.500 ml + Nor 0,10 | deutliche Hypertonie als erkennbare Übertherapie |

## Medizinische Einordnung

Das Modell ist bewusst didaktisch und nicht klinisch validiert. Es bildet die gewünschte Lernlogik ab: Volumen verbessert die Vorlast, reicht allein aber nicht sicher für einen MAP von 65 mmHg; Noradrenalin ist wegen der Vasoplegie erforderlich. Eine zu hohe Kombination aus Volumen und Noradrenalin kann zur Übertherapie führen.
