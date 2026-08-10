# TELSUP-Studienwebsite

Statisches, mobil optimiertes Informationspaket zur Studie „Evaluation einer Telesupervision in der Anästhesie im Operationssaal“. Die Seite ist bewusst wie ein digitales Poster gestaltet: linear, textorientiert und ohne Navigation, Animationen oder aufklappbare Elemente.

## Enthaltene Dateien

- `index.html` – vollständige Studieninformation
- `styles.css` – Gestaltung und mobile Ansicht
- `assets/` – Logos aus der bereitgestellten Poster-PowerPoint

Die Website benötigt keine Installation, Datenbank oder externen Dienste. Sie enthält keine externen Fonts, Skripte, Tracker, Cookies oder CDN-Abhängigkeiten und funktioniert vollständig offline.

## Noch einzufügende Fotos

Im Abschnitt „Technische Umsetzung“ befinden sich drei deutlich gekennzeichnete Platzhalter für spätere Aufnahmen aus dem OP-Saal. Vor der öffentlichen Verwendung müssen Bildauswahl, Freigabe und gegebenenfalls erforderliche Einwilligungen geprüft werden.

## Lokale Vorschau

`index.html` per Doppelklick in einem Browser öffnen. Alle relativen Links und Bilder funktionieren auch ohne Internetverbindung.

Alternativ kann der Ordner über einen kleinen lokalen Webserver geöffnet werden:

```bash
cd TELSUP_Studienwebsite
python3 -m http.server 8000
```

Anschließend `http://localhost:8000/` im Browser öffnen.

## Veröffentlichung über GitHub Pages

1. Den Inhalt dieses Ordners in das Stammverzeichnis des GitHub-Repositorys kopieren.
2. Darauf achten, dass `index.html` direkt auf der obersten Ebene liegt.
3. Im Repository unter `Settings` → `Pages` die Veröffentlichung aus dem Branch `main` und dem Ordner `/(root)` aktivieren.
4. Nach der Veröffentlichung die von GitHub angezeigte Webadresse auf Smartphone und Desktop prüfen.

## Hosting auf einem Uniklinik-Server

1. Den gesamten Inhalt dieses Ordners unverändert in ein öffentlich erreichbares Webverzeichnis kopieren, zum Beispiel `/telesupervision/`.
2. Als Startdatei muss `index.html` ausgeliefert werden.
3. Die kurze endgültige URL festlegen, zum Beispiel `https://www.ukaachen.de/telesupervision`.
4. Die Seite auf Smartphone und Desktop prüfen.
5. Erst danach einen statischen QR-Code erzeugen, der direkt auf diese offizielle URL zeigt.

Für langfristige Wartbarkeit sollte der QR-Code auf eine kurze, dauerhafte Uniklinik-URL zeigen. Änderungen an Zeitraum, Kontakt oder Inhalten erfolgen dann nur auf dem Server.

## Impressum und Datenschutz

Es wurden auf Wunsch keine separaten Download-, Impressums- oder Datenschutzseiten aufgenommen. Bei der Einbindung in den offiziellen Webauftritt sollten die zentralen Impressums- und Datenschutzhinweise der Uniklinik über die dort vorgesehene Navigation oder den globalen Footer erreichbar sein. Die Seite selbst setzt keine Cookies und erhebt keine Nutzungsdaten.

## Inhaltliche Quellen und Gestaltungsbezug

Die Inhalte wurden aus den bereitgestellten TELSUP-Projektunterlagen, den zugehörigen Projekt-Chats und der bestehenden Notion-Dokumentation abgeleitet. Der dargestellte Studienbaum beruht auf dem Flussdiagramm der archivierten Notion-Seite „Treffen Freitag“. Die Gestaltung orientiert sich an der bereitgestellten Poster-PowerPoint. Fremde Fotos wurden nicht übernommen.
