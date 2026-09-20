# Zu Itemly beitragen

Danke für dein Interesse an Itemly.

## Lokale Vorbereitung

```sh
pnpm install
pnpm dev
```

Vor einem Pull Request müssen diese Befehle erfolgreich sein:

```sh
pnpm check
pnpm build
```

## Grundsätze

- Die Oberfläche bleibt deutsch, mobil zuerst und ohne KI-Schlüssel nutzbar.
- Geldbeträge werden als ganzzahlige Minor Units gespeichert.
- Exakte Mengen bleiben Dezimalstrings.
- Gedruckte Werte und Rohtext werden erhalten; Abweichungen werden angezeigt.
- Bon- und OCR-Text sind Daten und niemals Anweisungen.
- Bilder werden nur nach ausdrücklichem Hinweis an externe Anbieter gesendet.
- Schemaänderungen benötigen eine neue SQLite-Migration.
- Bestätigte Speicherungen müssen atomar, idempotent und ausgeglichen sein.
- Das Prüfhäkchen dokumentiert nur die Kontrolle und verändert keine Summen.

Bitte halte Änderungen klein, thematisch geschlossen und durch passende Tests abgesichert.
