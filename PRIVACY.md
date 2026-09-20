# Datenschutz und Datenfluss

Itemly ist eine selbst gehostete Anwendung ohne Benutzerkonten, Telemetrie oder Analyse-Skripte. Diese Datei beschreibt das Verhalten der Version 0.1.0. Wer Itemly verändert oder öffentlich betreibt, ist für die daraus entstehenden Datenflüsse selbst verantwortlich.

## Lokal verarbeitete Daten

Itemly kann folgende Informationen speichern:

- Bonbilder
- Händler, Filiale, Adresse, Datum und Uhrzeit
- Artikel, Mengen, Preise, Rabatte, Steuern, Pfand und Gebühren
- Zahlungsart, Kartenmarke und höchstens die sichtbaren letzten vier Ziffern
- Prüfstatus, Unsicherheiten, technische Herkunftsangaben und persönliche Notizen

Die Daten liegen standardmäßig im lokalen Verzeichnis `./data`. Strukturierte Daten werden in SQLite gespeichert; Bilder liegen im Unterordner `receipts/`. Der Browser speichert lediglich die gewählte Darstellung sowie den installierbaren PWA-Rahmen.

## KI-Verarbeitung

KI ist optional.

### Manueller und ChatGPT-JSON-Ablauf

Beim manuellen Ablauf sendet Itemly keine Bonbilder an einen KI-Anbieter. Beim ChatGPT-JSON-Ablauf kopiert der Benutzer eine Vorlage und lädt das Bild selbst in einen normalen ChatGPT-Chat hoch. Diese Übertragung findet außerhalb von Itemly statt und unterliegt den Bedingungen und Einstellungen des dort verwendeten Dienstes.

### Konfigurierter API-Anbieter

Wenn ein Betreiber einen OpenAI-kompatiblen Anbieter konfiguriert, sendet Itemly ein ausgewähltes Bild erst nach einem sichtbaren Hinweis zur Extraktion an diesen Anbieter. API-Schlüssel verbleiben auf dem Server und werden nicht an den Browser gesendet. Für Speicherung und Aufbewahrung beim Anbieter gelten dessen Bedingungen.

## Weitergabe und Tracking

Itemly enthält keine Werbung, Telemetrie oder eingebauten Analyse-Dienste. Ohne konfigurierten KI-Anbieter werden keine Einkaufsdaten durch Itemly an Dritte übertragen.

## Backups und Löschung

Backups enthalten die vollständige SQLite-Datenbank und vorhandene Bonbilder. Sie sind daher genauso vertraulich wie das lokale Datenverzeichnis. Das Löschen oder Verschieben lokaler Daten und Backups liegt in der Verantwortung des Betreibers. Version 0.1.0 besitzt noch keine Löschfunktion in der Oberfläche.

## Netzwerkbetrieb

Version 0.1.0 besitzt keine Anmeldung oder Zugriffskontrolle. Der Server darf nur auf einem privaten Rechner oder in einem vertrauenswürdigen Netzwerk verwendet werden, sofern nicht eine geeignete Zugriffskontrolle vorgeschaltet wird.
