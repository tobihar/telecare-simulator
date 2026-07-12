# TeleCare – technischer Vergleichstest

Verglichene Stände:
- Vorher: `telecare-simulator-startscreen-fixed`
- Neu: `telecare-simulator-medication-engine`

## Simulationsvergleich

Mit identischen, reproduzierbaren Zufallsfolgen wurden je 50 unbehandelte 10-Minuten-Verläufe pro Schwierigkeitsgrad simuliert.

| Schwierigkeit | Läufe | verglichene Verlaufspunkte | maximale Abweichung HF/RRsys/RRdia/MAP/SpO₂ |
|---|---:|---:|---:|
| Leicht | 50 | 10.050 | 0 |
| Mittel | 50 | 10.050 | 0 |
| Schwer | 50 | 10.050 | 0 |

Damit waren sämtliche verglichenen Vitalparameterverläufe beider Versionen numerisch identisch.

Zusätzlich wurden 45 Therapie-Szenarien (36 Medikamente und 9 zentrale Interventionen) mit jeweils fünf reproduzierbaren Durchläufen verglichen. Alle 225 Szenarien ergaben in beiden Versionen identische physiologische Resultate.

## Funktionsprüfung

Geprüft wurden:
- 24 unmittelbare bzw. auftragsbasierte Aktionen
- alle 36 Medikamente
- venöse und arterielle BGA
- NIBP, Atemfrequenz, Temperatur und Blutzucker
- PVK und arterielle Kanüle
- POCUS/Sonografie
- Sauerstoff, Beatmung, Schocklage, Volumen, Noradrenalin, TXA und EK
- 96 Medikamentennamen und Synonyme in der lokalen Chaterkennung
- JavaScript-Syntax aller Dateien
- Reihenfolge der geladenen Skripte
- lokale Auslieferung von Hauptseite, `/admin` und `/api/status`

## Behobener Fehler

Bei den Formulierungen „Noradrenalin Bolus“ und „Noradrenalin Perfusor“ wurde zusätzlich fälschlich `Adrenalin` erkannt, weil „Adrenalin“ als Teilwort in „Noradrenalin“ vorkommt. Die Chaterkennung wurde korrigiert. Nun entsteht jeweils nur die passende Noradrenalin-Aktion.

## Einschränkung

Die Tests prüfen die Simulationslogik, Auftragsverarbeitung, Chaterkennung und Serverauslieferung automatisiert. Sie ersetzen keinen vollständigen visuellen End-to-End-Test in jedem Browser und auf jedem Gerät. Vor einem Unterrichtseinsatz sollte deshalb weiterhin ein kurzer Testlauf in Chrome und auf dem iPad erfolgen.
