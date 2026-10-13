# Galen · TeleCare-Simulator

Interaktive Simulation für medizinisches Personal: Die Teilnehmenden betreuen per
Telekonsultation einen kritisch kranken Patienten und steuern das Team vor Ort
über einen Chat. Ein vereinfachtes physiologisches Modell reagiert auf die
Maßnahmen. Nur für Lehre und Training – nicht zur Behandlung realer Patienten.

## Module

| Pfad | Inhalt |
| --- | --- |
| `/` | Landingpage (`public/landing.html`) |
| `/simulator` | Hub: Name, Modul, Fall, Schwierigkeit und Dauer wählen |
| `/shock` | Schock-Simulator (`public/index.html`, `app.js`, Fälle in `cases.js`) |
| `/vent.html` | Experimenteller Anästhesie-/Beatmungssimulator (`vent*.js`) |
| `/admin` | Dozentenbereich: Ergebnisse, Evaluationen, CSV-Export |

Der Chat erkennt eindeutige Aufträge zuerst lokal per Regeln. Nur unklare
Eingaben gehen an Gemini; jede von Gemini vorgeschlagene Aktion wird lokal
nochmals gegen den eingegebenen Text geprüft.

## Aufbau

Läuft komplett kostenlos auf Cloudflare – ohne Kaltstart und ohne pausierende
Datenbank:

- `public/` – alle Frontend-Dateien. Nur dieser Ordner ist öffentlich.
- `src/worker.js` – Backend als Cloudflare Worker (API, Login, Rate-Limits).
- `src/gemini.js` – Prompt und Aufruf der Gemini-API.
- `migrations/` – Datenbankschema für Cloudflare D1 (SQLite).
- `wrangler.jsonc` – Cloudflare-Konfiguration.

## Erstmalige Einrichtung

Voraussetzungen: Node.js 22 oder neuer und ein kostenloser Cloudflare-Account.

```bash
npm install
npx wrangler login                 # öffnet den Browser zur Anmeldung
npx wrangler d1 create telecare    # legt die Datenbank an
```

Die von `d1 create` ausgegebene `database_id` in `wrangler.jsonc` eintragen.
Danach die Geheimnisse setzen (jeweils wird nach dem Wert gefragt):

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET            # z. B. aus: openssl rand -base64 32
npx wrangler secret put EVALUATION_SKIP_PASSWORD
```

Veröffentlichen (wendet zuerst neue Datenbank-Migrationen an):

```bash
npm run deploy
```

Die App ist dann unter `https://telecare-simulator.<dein-name>.workers.dev`
erreichbar.

**Automatisch aus GitHub deployen (optional):** Im Cloudflare-Dashboard unter
*Workers & Pages → telecare-simulator → Settings → Builds* das Repository
verbinden und als Deploy-Befehl `npm run deploy` eintragen. Dann wird jeder
Push auf `main` automatisch veröffentlicht.

## Lokal entwickeln

```bash
cp .dev.vars.example .dev.vars    # Werte eintragen
npm run dev                       # http://localhost:8787, lokale Datenbank
npm test
```

## Konfiguration

Geheimnisse (per `wrangler secret put`, lokal in `.dev.vars`):

| Variable | Zweck |
| --- | --- |
| `GEMINI_API_KEY` | Aktiviert die KI-Chatauswertung (ohne: nur Regel-Chat) |
| `ADMIN_PASSWORD`, `SESSION_SECRET` | Dozentenlogin |
| `EVALUATION_SKIP_PASSWORD` | Passwort zum Überspringen der Evaluation |

Normale Variablen (in `wrangler.jsonc` unter `vars`):

| Variable | Zweck |
| --- | --- |
| `ADMIN_USERNAME` | Benutzername für den Dozentenlogin (Standard `dozent`) |
| `GEMINI_MODEL` | Gemini-Modell, Standard `gemini-3.1-flash-lite` |
| `CHAT_LIMIT_PER_MINUTE` | KI-Anfragen pro IP und Minute (Standard 60; Kursräume teilen oft eine IP) |
| `CHAT_LIMIT_PER_HOUR` | KI-Anfragen insgesamt pro Stunde (Standard 600) |

## Daten

- `simulation_results` – personenbezogen (Benutzername, Verlauf, Score).
- `simulation_evaluations` – anonym: kein Benutzer, keine Durchlauf-ID, nur
  der Kalendertag.

Direkt in die Datenbank schauen:
`npx wrangler d1 execute telecare --remote --command "SELECT count(*) FROM simulation_results"`

## Sicherheit

- Ausgeliefert wird nur `public/`; Quellcode, Konfiguration und Tests nie.
- KI-Chat, Admin-Login und Skip-Passwort sind rate-limitiert (Zähler in D1).
- Scores werden im Browser berechnet und sind daher nicht manipulationssicher.
