# Architektur

Itemly ist eine lokale Full-Stack-TypeScript-Anwendung mit austauschbaren Grenzen für Extraktion, Speicherung und Persistenz.

## Komponenten

- `src/` enthält die React-Oberfläche, den mobilen Prüfablauf und den API-Client.
- `shared/` enthält versionierte Zod-Schemas, Betragslogik und die Normalisierung importierter Daten.
- `server/` enthält Express-Routen, Extraktionsadapter, SQLite-Zugriff, Backups und Wiederherstellung.
- `server/migrations/` enthält unveränderliche, explizit angewendete SQLite-Migrationen.
- `tests/` deckt Domänenlogik, Importgrenzen und Persistenzverhalten ab.

## Datenfluss

```text
Bonbild oder manuelle Eingabe
          │
          ▼
optionale Extraktion / JSON-Import
          │
          ▼
Schema-Validierung und ungeprüfter Entwurf
          │
          ▼
sichtbare Kontrolle und Betragsabgleich
          │
          ▼
atomare SQLite-Speicherung + optionales Originalbild
```

## Domänenregeln

- Geld wird als ganzzahlige Minor Units gespeichert.
- Mengen und Packungsgrößen bleiben exakte Dezimalstrings.
- Gedruckte Summen werden nicht durch berechnete Werte überschrieben.
- Ein bestätigter Einkauf muss vollständig bepreist und rechnerisch ausgeglichen sein.
- Entwürfe dürfen unvollständig oder unausgeglichen sein.
- Prüfhäkchen dokumentieren nur die menschliche Kontrolle.
- Rohdaten aus Bon, OCR oder KI gelten immer als nicht vertrauenswürdig.

## Persistenz

SQLite speichert Händler-Snapshots, Einkäufe, Artikel, Anpassungen, Anhänge und Audit-Ereignisse. Migrationen werden genau einmal in `_migrations` registriert. Bestätigte Speicherungen laufen in einer Transaktion und verwenden eine vom Client erzeugte Mutations-ID zur Idempotenz.

Originalbilder liegen inhaltsadressiert neben der Datenbank. Portable Backups enthalten Datenbank und Bilder, ändern aber nicht den Zustand eines externen Backup-Ziels.

## Sicherheitsgrenze

Die App besitzt in Version 0.1.0 keine Anmeldung. Das Netzwerk selbst ist daher die Vertrauensgrenze. Ein öffentlicher Betrieb benötigt einen vorgeschalteten Reverse Proxy mit HTTPS und Zugriffskontrolle.
