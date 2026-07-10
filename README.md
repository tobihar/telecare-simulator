# TeleCare-Simulator

## Start

1. Eine vorhandene `.env` mit Gemini-Schlüssel in diesen Ordner kopieren.
2. Terminal im Ordner öffnen.
3. Einmalig `npm install` ausführen.
4. Danach `npm start` ausführen.
5. Im Browser `http://localhost:3000` öffnen.

## Neu in dieser Version

- erweiterte Medikamentenwirkungen einschließlich neuromuskulärer Blockade
- Beatmung als Chat-Anordnung
- korrekte Erkennung „Arterie legen“
- sichtbarer Hinweis bei fehlendem Personal
- POCUS/Sonografie
- realistischere Hb-Wirkung eines EK
- vorzeitige Auswertung
- Alarmton und gelbes Blinken, separat abschaltbar
- drei Schwierigkeitsgrade mit möglichem Kreislaufstillstand
- neue Labor-, BGA- und Sono-Befunde blinken grün
- ausführlicherer Maßnahmen-Zeitstrahl im Abschlussbericht

Die physiologischen Wirkungen sind vereinfachte didaktische Simulationsmodelle und keine Dosierungs- oder Therapieleitlinie.

## Fehlerkorrektur Juli 2026

- Startfehler durch einen ungültigen Verweis in der statischen BGA-Definition behoben.
- Initialisierung und Hauptbuttons getestet.
- Steuerbuttons in der Kopfzeile vergrößert.


## Änderungen
- Alarmgrenzen: HF 60–120/min, systolisch ab <90 mmHg, SpO₂ <90 %. AF und Temperatur alarmieren nicht.
- Alarmtaste pausiert akustischen und optischen Alarm für 2 Minuten.
- BZ-Messung und Auskultation sind über den Chat möglich.

## Änderungen dieser Version

- Titel: „telecare - von Tobias Harig“
- Medikamenten-/Infusionsmenü entfernt; Arzneimittel und Infusionen bleiben per Chat anweisbar
- Auskultation liefert sofort einen Befund
- Blutproduktmenü ermöglicht Anforderung und Transfusion verfügbarer EK
- Schocklage per Chat, z. B. „Schocklage herstellen“ oder „Beine hochlagern“
- Auswertung enthält ein ausklappbares ABCDE-/SAMPLER-Fenster
