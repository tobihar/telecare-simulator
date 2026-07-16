# TeleCare – Stufe 1

Diese Version ergänzt den Simulator um:

- verpflichtende Eingabe eines **Benutzernamens**
- automatische Speicherung des Abschlussberichts
- geschützten Dozentenbereich unter **`/admin`**
- Ergebnisliste und Suche
- Detailansicht mit Maßnahmen und Chatverlauf
- CSV-Export

## Lokal starten

1. `.env.example` kopieren und als `.env` speichern.
2. Werte in `.env` eintragen.
3. Starten:

```bash
node server.js
```

4. Simulation: `http://localhost:3000`
5. Dozentenbereich: `http://localhost:3000/admin`

## Supabase einrichten

1. Ein Supabase-Projekt erstellen.
2. Im Supabase-Dashboard den **SQL Editor** öffnen.
3. Den Inhalt von `supabase-setup.sql` einfügen und ausführen.
4. Unter den Projekteinstellungen die Project URL und einen serverseitigen Secret Key kopieren.
5. Auf Render folgende Environment Variables ergänzen:

```text
SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
SUPABASE_SECRET_KEY=DEIN_SECRET_KEY
ADMIN_USERNAME=dozent
ADMIN_PASSWORD=DEIN_STARKES_PASSWORT
SESSION_SECRET=EINE_LANGE_ZUFAELLIGE_ZEICHENFOLGE
```

Der Secret Key darf niemals in `app.js`, GitHub oder den Browser gelangen.

## Render

Build Command:

```bash
echo "No build required"
```

Start Command:

```bash
node server.js
```

Nach dem Upload zu GitHub Render neu deployen. Die Dozentenansicht liegt anschließend unter:

```text
https://DEINE-ADRESSE.onrender.com/admin
```

## Fall-Engine

Die medizinischen Falldaten liegen jetzt in `cases.js`. Die Oberfläche und die allgemeine Simulationslogik bleiben in `app.js`.

Ein neuer Fall wird als Objekt in `cases.js` ergänzt und anschließend in `window.TELECARE_CASES` registriert. Konfigurierbar sind unter anderem:

- Titel, Fallnummer und Setting
- kurze Übergabe
- Ausgangsvitalwerte
- Personal
- Labor- und Sono-Befunde
- Verlaufskurven für leicht, mittel und schwer
- Kreislaufstillstands-Schwellen
- Bewertungskriterien

Der Fall kann anschließend oben im Simulator ausgewählt werden. Während einer laufenden Simulation ist die Fallauswahl gesperrt.

## Zentrale medizinische Wissensschicht

- `medications.js`: Medikamente, Synonyme, Zugangsbedarf, Ausführungszeit und physiologische Basiswirkungen.
- `interventions.js`: nichtmedikamentöse Maßnahmen wie Volumen, EK, Schocklage und Noradrenalin.
- `cases.js`: fallspezifische Wirkungsmodifikatoren unter `treatmentModifiers`.

Ein Multiplikator von `1` lässt die Basiswirkung unverändert. Beispiel: `fluid_500: 0.3` schwächt den Volumeneffekt in einem kardiogenen Fall ab; `norepi_perfusor: 1.5` verstärkt die Reaktion auf Noradrenalin.

## Semi-physiologische Engine

Die Datei `physiology.js` enthält ein bewusst vereinfachtes hybrides Modell für zirkulierendes Volumen, venösen Rückstrom, Gefäßtonus, Kontraktilität, Atemantrieb und Perfusionsdefizit. Es ist keine vollständige Humanphysiologie-Simulation. Details und automatisierte Vergleichsergebnisse stehen in `HYBRID_VALIDATION_REPORT.md`.

## Evaluation nach Fallende

Nach Ende eines Falls erscheint vor der persönlichen Auswertung ein Pflichtfragebogen mit:

- 6 Fragen zum TeleCare-System
- 7 Fragen zum konkreten Fall
- Frage nach technischen Problemen

Alle Likert-Fragen werden von 1 bis 5 beantwortet. Eingaben werden fortlaufend im Browser zwischengespeichert. Wird die Seite geschlossen oder neu geladen, öffnet sich auf demselben Gerät und im selben Browser wieder die noch offene Evaluation.

Die Auswertung wird erst nach erfolgreicher Abgabe angezeigt. Mit einem Dozentenpasswort kann die Evaluation übersprungen werden.

### Einmalige Datenbankmigration

Im Supabase SQL Editor die Datei `supabase-evaluation-migration.sql` ausführen. Alternativ kann die vollständige `supabase-setup.sql` erneut ausgeführt werden.

### Neue Render-Variable

```text
EVALUATION_SKIP_PASSWORD=DEIN_PASSWORT
```

Dieses Passwort ist ausschließlich zum Überspringen der Evaluation gedacht und sollte nicht an Lernende weitergegeben werden.

### Dozentenbereich

Unter `/admin` werden jetzt angezeigt:

- Status der Evaluation: abgegeben, übersprungen oder offen
- alle Einzelantworten in der Detailansicht
- technische Probleme und Freitext
- Evaluationen im CSV-Export

## Noradrenalin-Perfusor

Wird bei der niedrigsten Laufstufe erneut auf `−` geklickt, geht der Perfusor in **Standby (0,00 µg/kg/min)**. Mit `+` wird er wieder auf der niedrigsten Stufe gestartet. `Stop` entfernt den Perfusor vollständig.
