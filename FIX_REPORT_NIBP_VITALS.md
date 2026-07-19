# Fix-Bericht

## Behoben

- Die nichtinvasive Blutdruckmessung dauert weiterhin 20 Sekunden, bindet aber keine Pflegefachperson und keinen Arzt mehr.
- Die Vitalparameter verändern sich wieder. Ursache waren versehentlich umbenannte JavaScript-Variablen in `physiology.js` (`easyFrau Berger`), die bei jedem Physiologie-Tick einen Fehler ausgelöst haben.
- Der bereits unerwünschte Feedbackpunkt zur rechtzeitigen Erkennung des septischen Schocks wurde entfernt.

## Prüfung

Die JavaScript-Syntax von `app.js`, `physiology.js`, `cases.js`, `interventions.js`, `medications.js` und `server.js` wurde mit `node --check` geprüft.
