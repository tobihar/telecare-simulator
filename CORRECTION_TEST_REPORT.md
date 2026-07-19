# Korrektur- und Testbericht

## Umgesetzt

- Laboranforderung für beide Fälle repariert; Fallwechsel baut die Laborliste neu auf.
- PCT, Blutkulturen und Urinkultur sind im Frau Berger-Labor auswählbar.
- Blutkulturen aus dem Chat laufen als regulärer Laborauftrag mit Blutentnahme und Bearbeitungszeit.
- Allgemeine Antibiose-Anordnung startet Piperacillin/Tazobactam.
- Paracetamol als eigenes Medikament ergänzt.
- Medikamentenschutz: Ein nicht genanntes oder nicht verfügbares Medikament darf nicht durch ein anderes ersetzt werden.
- FAST wird als POCUS erkannt und kann keine Noradrenalin-Gabe auslösen.
- SAMPLER-Antworten werden direkt aus der Fallkonfiguration beantwortet.
- Geschlechtsspezifische Vigilanzantwort für Frau Berger.
- Kritische äußere Blutung wird beim Frau Bergerfall korrekt verneint.
- Volumeneffekt im Frau Bergerfall auf 15 Minuten verlängert; Blutungsfall bleibt kurz wirksam.
- Laktat sinkt unter wirksamer Volumen- und Vasopressortherapie deutlich.
- Leichter Frau Bergerfall startet mit systolisch 60 mmHg und deutlich geringerer Anfangsdynamik.
- Neustart startet denselben Fall mit demselben Benutzernamen neu; Ausloggen ist separat im Menü möglich.
- Zeitgerechte Frau Bergererkennung: Formulierungen mit „Frau Berger“, „septisch“, „septischer Schock“ oder „Urosepsis“ innerhalb von 4 Minuten.

## Automatisierte Prüfungen

- JavaScript-Syntax: app.js, cases.js, physiology.js, medications.js, server.js.
- Fall- und Medikamentenregistrierung geprüft.
- Paracetamol, PCT, Blutkulturen, Labor-Schaltfläche, Menü und Medikamentenschutz statisch geprüft.
- Serverstart sowie `/`, `/admin` und `/api/status` geprüft.
- Deterministische Physiologieprüfung:
  - Leicht: HF nach 60 s ca. 118/min, nach 120 s ca. 122/min.
  - Mittel mit 3 × 500 ml und Noradrenalin: Laktat von 10,0 auf ca. 5,3 mmol/l nach 10 Minuten.
  - Volumenwirkung bleibt im Frau Bergerfall über die gesamte 10-Minuten-Simulation erhalten und läuft graduell aus.

## Einschränkung

Die echte Gemini-Antwort konnte ohne gesetzten `GEMINI_API_KEY` nicht als Live-Netzwerkaufruf getestet werden. Lokale Erkennung, Aktionsfilter und Server-Prompt wurden geprüft. Nicht passende KI-Medikamentenaktionen werden clientseitig verworfen.
