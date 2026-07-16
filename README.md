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
