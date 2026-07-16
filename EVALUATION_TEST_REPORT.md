# TeleCare – Testbericht Evaluation und Adminbereich

## Statische Prüfungen

- JavaScript-Syntax aller Dateien mit `node --check`: bestanden
- alle neuen Evaluationselemente genau einmal in `index.html`: bestanden
- alle im Admin-JavaScript verwendeten IDs in `admin.html` vorhanden: bestanden
- Noradrenalin-Standby als isolierter Funktionstest: bestanden

## Server- und Datenbankintegration

Mit einem lokalen Supabase-kompatiblen Testserver wurden folgende Abläufe ausgeführt:

1. Simulationsergebnis speichern
2. vollständige Evaluation mit 13 Likert-Antworten speichern
3. Ergebnisstatus auf „Evaluation abgegeben“ aktualisieren
4. Dozentenlogin
5. Ergebnisliste abrufen
6. Detailansicht einschließlich verknüpfter Evaluation abrufen
7. falsches Überspringpasswort ablehnen (HTTP 401)
8. korrektes Überspringpasswort akzeptieren
9. kombinierter CSV-Export von Ergebnis- und Evaluationsdaten

Alle Tests waren erfolgreich.

## Normales Interface

Geprüft wurden außerdem:

- Abschluss führt zuerst zur Evaluation und nicht direkt zur Auswertung
- Pflichtfelder und 1–5-Skala sind vollständig vorhanden
- technische Probleme können mit Ja/Nein angegeben werden
- Zwischenspeicherung erfolgt bei jeder Änderung sowie beim Verlassen der Seite
- eine offene Evaluation wird aus `localStorage` wiederhergestellt
- die persönliche Auswertung wird erst nach Abgabe oder passwortgeschütztem Überspringen geöffnet

## Noradrenalin

- niedrigste Stufe + Minus → Standby
- Standby + Plus → 0,02 µg/kg/min
- Stop → Perfusor vollständig beendet
- im Standby wird der Physiologie-Engine eine Noradrenalinrate von 0 übergeben

## Einschränkung

Die automatische Wiederherstellung einer offenen Evaluation gilt für denselben Browser auf demselben Gerät. Eine geräteübergreifende Wiederaufnahme eines noch nicht abgesendeten Fragebogens ist nicht vorgesehen.
