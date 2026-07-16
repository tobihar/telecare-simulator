# TeleCare – Evaluationserweiterung

## Vor dem Deployment

1. Die Datei `supabase-setup.sql` erneut vollständig im Supabase SQL Editor ausführen. Das Skript ist migrationssicher (`if not exists`).
2. In Render unter **Environment** ergänzen:

```text
EVALUATION_SKIP_PASSWORD=DEIN_DOZENTENPASSWORT
```

3. Alle Dateien auf GitHub ersetzen und Render neu deployen.

## Ablauf

- Nach Fallende erscheint die Evaluation vor der persönlichen Auswertung.
- Alle Likert-Fragen und die Frage nach technischen Problemen sind verpflichtend.
- Die Eingaben werden lokal fortlaufend gespeichert. Wird die Website geschlossen, erscheint die noch offene Evaluation beim nächsten Aufruf wieder.
- Mit dem Dozentenpasswort kann die Evaluation übersprungen werden.
- Der Noradrenalin-Perfusor geht bei weiterem Klick auf `−` unter der niedrigsten Stufe in **Standby (0,00 µg/kg/min)**. Mit `+` wird er wieder gestartet.
- Evaluationen erscheinen in der Detailansicht des Dozentenbereichs und im CSV-Export.
