# Galen · TeleCare-Simulator

Interaktive Simulation für medizinisches Personal: Die Teilnehmenden betreuen per
Telekonsultation einen kritisch kranken Patienten und steuern das Team vor Ort
über einen Chat. Ein vereinfachtes physiologisches Modell reagiert auf die
Maßnahmen. Nur für Lehre und Training – nicht zur Behandlung realer Patienten.

## Module

| Pfad | Inhalt |
| --- | --- |
| `/` | Landingpage (`landing.html`) |
| `/simulator` | Hub: Name, Modul, Fall, Schwierigkeit und Dauer wählen |
| `/shock` | Schock-Simulator (`index.html`, `app.js`, Fälle in `cases.js`) |
| `/vent.html` | Experimenteller Anästhesie-/Beatmungssimulator (`vent*.js`) |
| `/admin` | Dozentenbereich: Ergebnisse, Evaluationen, CSV-Export |

Der Chat erkennt eindeutige Aufträge zuerst lokal per Regeln. Nur unklare
Eingaben gehen an Gemini; jede von Gemini vorgeschlagene Aktion wird lokal
nochmals gegen den eingegebenen Text geprüft.

## Lokal starten

Voraussetzung: Node.js 20 oder neuer. Es gibt keine npm-Abhängigkeiten.

```bash
npm start   # http://localhost:3000
npm test
```

Konfiguration über Umgebungsvariablen oder eine lokale `.env` (wird nicht
eingecheckt und nie ausgeliefert):

| Variable | Zweck |
| --- | --- |
| `GEMINI_API_KEY` | Aktiviert die KI-Chatauswertung (ohne: nur Regel-Chat) |
| `GEMINI_MODEL` | Optional, Standard `gemini-3.1-flash-lite` |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Speicherung von Ergebnissen und Evaluationen |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` | Dozentenlogin (Standard-Benutzer `dozent`) |
| `EVALUATION_SKIP_PASSWORD` | Passwort zum Überspringen der Evaluation |
| `CHAT_LIMIT_PER_MINUTE` | KI-Anfragen pro IP und Minute (Standard 60; Kursräume teilen oft eine IP) |
| `CHAT_LIMIT_PER_HOUR` | KI-Anfragen insgesamt pro Stunde (Standard 600) |
| `PORT` | Port, Standard 3000 |

## Datenbank

`supabase-setup.sql` legt die Tabellen `simulation_results` (personenbezogen,
mit Benutzername) und `simulation_evaluations` (anonym) an.
`supabase-evaluation-migration.sql` anonymisiert ältere Evaluationsdaten.

## Sicherheit

- Der Server liefert nur Frontend-Dateien aus (`.html`, `.js`, `.css`, Bilder).
  Dotfiles, `server.js`, SQL-Skripte, `package.json` und Tests bleiben privat.
- KI-Chat, Admin-Login und Skip-Passwort sind rate-limitiert (im Speicher,
  pro Instanz).
- Scores werden im Browser berechnet und sind daher nicht manipulationssicher.
