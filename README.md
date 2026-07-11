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
