# Hybrid Chat Engine – Prüfbericht

## Ziel

Der Chat verarbeitet spielrelevante Aufträge zuverlässig lokal und nutzt Gemini nur als sprachlichen Übersetzer für freie Formulierungen. KI-Aktionen werden vor der Ausführung erneut gegen die tatsächlich eingegebene Nachricht geprüft.

## Neu umgesetzt

- Normalisierung von Groß-/Kleinschreibung, Umlauten, Sonderzeichen und Schreibvarianten.
- Lokale Synonyme für PVK/Viggo/Venflon/Braunüle, Volumen/VE/Ringer, Nor/Noradrenalin, Blutkulturen, Urinkultur, BGA, FAST/POCUS und weitere Maßnahmen.
- `500 VE`, `500 ml Ringer` und ähnliche Angaben werden als 500-ml-Kristalloidgabe erkannt.
- `Nor Bolus` wird ausschließlich als Noradrenalin-Bolus erkannt.
- `Nor Perfusor` wird als Noradrenalin-Perfusor erkannt.
- `Viggo` wird als Auftrag zum Legen eines PVK erkannt.
- Eine reine Frage nach `Zugang` liefert den aktuellen Zugangsbefund.
- Frau Berger besitzt entsprechend dem Fallbogen initial einen rosa PVK und einen Blasenkatheter.
- Gemini darf standardisierte Aktionen zurückgeben, diese werden clientseitig semantisch validiert.
- Nicht zur Eingabe passende KI-Aktionen werden verworfen.
- Medikamentenaktionen werden nur akzeptiert, wenn genau dieses Medikament genannt wurde; allgemeine Antibiose wird als Pip/Taz behandelt.
- Laboraktionen unterstützen Blutkulturen, Urinkultur und weitere Frau Bergerparameter.

## Parser-Tests

Erwartete Zuordnung wurde geprüft:

- `500 ve` → `fluid`
- `500ml ringer` → `fluid`
- `nor bolus` → `norepi_bolus`
- `nor perfusor` → `norepi_perfusor`
- `viggo` → `insert_pvk`
- `zugang` → keine Aktion; anschließend Befundantwort
- `bitte einen zugang legen` → `insert_pvk`
- `paracetamol` → ausschließlich Paracetamol
- `fentanyl` → ausschließlich Fentanyl
- `FAST` → Sonografie/POCUS
- `Blutkulturen abnehmen` → regulärer Laborauftrag

## Technische Prüfung

- `node --check app.js`: bestanden
- `node --check cases.js`: bestanden
- `node --check server.js`: bestanden
- Serverstart: bestanden
- `/api/status`: erfolgreich erreichbar

Ein echter Gemini-Aufruf benötigt weiterhin einen hinterlegten `GEMINI_API_KEY` und konnte lokal ohne Schlüssel nicht live ausgeführt werden.
