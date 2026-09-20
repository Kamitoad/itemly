# Sicherheitsrichtlinie

## Unterstützte Versionen

Itemly befindet sich in einer frühen MVP-Phase. Sicherheitskorrekturen werden für die jeweils aktuelle Version auf dem `main`-Branch bereitgestellt.

## Schwachstellen melden

Bitte veröffentliche mögliche Schwachstellen nicht als öffentliches Issue. Nutze stattdessen die private Sicherheitsmeldung unter:

https://github.com/Kamitoad/itemly/security/advisories/new

Beschreibe nach Möglichkeit die betroffene Version, die notwendigen Schritte zur Reproduktion, mögliche Auswirkungen und bekannte Gegenmaßnahmen. Veröffentliche keine echten Bonbilder, Einkaufsdaten oder Zugangsschlüssel.

## Sicherheitsgrenzen von v0.1.0

- Itemly ist für einen privaten Rechner oder ein vertrauenswürdiges Heimnetz ausgelegt.
- Es existieren noch keine Benutzerkonten, Anmeldung oder Rechteverwaltung.
- Der Server sollte nicht direkt aus dem öffentlichen Internet erreichbar sein.
- API-Schlüssel gehören ausschließlich in die lokale `.env`-Datei und niemals in Browsercode, Commits oder Screenshots.
- Bon- und KI-Ausgaben gelten als nicht vertrauenswürdige Daten und werden validiert.
- Originalwerte und rechnerische Abweichungen werden sichtbar erhalten.

Diese Grenzen sind Teil des aktuellen Designs und keine Zusage, dass ein öffentlicher Mehrbenutzerbetrieb sicher unterstützt wird.
