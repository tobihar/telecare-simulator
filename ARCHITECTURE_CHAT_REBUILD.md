# Chat- und Fallengine: stabiler Neuaufbau

## Prinzip

1. Medizinische Standardfragen werden zuerst lokal und deterministisch aus `case.chatFacts`, `history` und `diagnostics` beantwortet.
2. Maßnahmen werden ausschließlich von der lokalen Action-Engine ausgelöst.
3. Gemini ist nur noch ein sprachlicher Fallback für freie Fragen. Von Gemini vorgeschlagene Aktionen werden clientseitig nicht ausgeführt.
4. Fehlt eine Information, lautet die Antwort sinngemäß: „Das ist uns aktuell nicht bekannt.“ Es werden keine plausiblen Angaben erfunden.
5. Alle Falldaten einschließlich Geschlecht, SAMPLER, ABCDE, Diagnostik und Ausgangslage werden an Gemini übergeben.

## Zusätzlich

- Atemwege werden getrennt von Vigilanz beantwortet.
- Weibliche Fälle verwenden „die Patientin“.
- Auf „Leicht“ ist die frühe Herzfrequenzdynamik begrenzt.
- JavaScript und CSS werden mit `Cache-Control: no-store` ausgeliefert, damit nach einem Render-Deploy nicht versehentlich eine alte Programmversion aus dem Browsercache läuft.
