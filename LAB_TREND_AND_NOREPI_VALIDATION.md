# TeleCare – Validierung Laborverlauf und volumenabhängiges Noradrenalin

## Neue Funktionen

- Laborparameter können beliebig oft erneut angefordert werden.
- Jede Laborabnahme speichert einen zeitgestempelten Ergebnissatz.
- Laborverläufe werden tabellarisch mit den Messzeitpunkten als Spalten dargestellt.
- BGA-Verläufe werden im gleichen Tabellenformat dargestellt.
- Labor- und BGA-Verläufe werden im gespeicherten Ergebnis und im Dozentenbereich angezeigt.
- Noradrenalin wirkt abhängig vom aktuellen effektiven Volumenstatus.

## Realismustest Noradrenalin

50 simulierte Läufe auf „Schwer“, Auswertung nach 7 Minuten:

| Szenario | mittlerer MAP |
|---|---:|
| ohne Volumen, ohne Noradrenalin | 30,35 mmHg |
| ohne Volumen, Noradrenalin 0,05 µg/kg/min | 34,16 mmHg |
| 500 ml Volumen, ohne Noradrenalin | 39,90 mmHg |
| 500 ml Volumen, Noradrenalin 0,05 µg/kg/min | 46,36 mmHg |

Damit beträgt der zusätzliche Noradrenalineffekt:

- bei starker Hypovolämie: etwa +3,81 mmHg MAP
- nach 500 ml Kristalloid: etwa +6,46 mmHg MAP

Das Modell bildet damit bewusst ab, dass Noradrenalin bei ausgeprägtem Volumenmangel nur begrenzt wirkt und nach Verbesserung der Vorlast stärker greift.

## Funktionsprüfungen

- Zwei wiederholte Hb-/Laktat-Laboranforderungen wurden gespeichert und gemeinsam als Verlaufstabelle gerendert.
- Zwei wiederholte BGA wurden gespeichert und gemeinsam als Verlaufstabelle gerendert.
- Dynamische Werte wie Hb und Laktat unterschieden sich korrekt zwischen den Zeitpunkten.
- 37 Medikamentenkonfigurationen wurden ohne NaN- oder Laufzeitfehler durch die Physiologie-Engine getestet.
- 9 zentrale Interventionsszenarien wurden ohne NaN- oder Laufzeitfehler getestet.
- Syntaxprüfung aller JavaScript-Dateien erfolgreich.
- Serverstart, Hauptseite und `/api/status` erfolgreich geprüft.

## Einordnung

Die Berechnung ist weiterhin ein didaktisches, semi-physiologisches Modell. Sie ist nicht als validiertes hämodynamisches Patientenmodell zu verstehen.
