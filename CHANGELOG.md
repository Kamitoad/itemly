# Changelog

All notable changes to Itemly are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- The receipt overview is now the home screen and lists purchases newest first.
- A floating “New receipt” button starts capture from anywhere in the overview.
- Cards, date display, empty states, and responsive spacing were refined for more intuitive mobile navigation.
- Project documentation was standardized in English; the product UI remains German.

## [0.1.0] - 2026-09-20

### Added

- Mobile workflow to capture, review, and save receipts
- Manual entry, optional AI adapter, and free ChatGPT JSON import
- Robust cleanup of common clipboard and Markdown artifacts
- SQLite persistence with migrations, transactions, idempotency, and duplicate warnings
- Arithmetic checks for items, discounts, taxes, fees, and deposits
- History, search, detail view, exports, backups, and restore
- Installable PWA with light and dark themes
- Automated tests for schemas, calculations, repositories, backups, and imports

[0.1.0]: https://github.com/Kamitoad/itemly/releases/tag/v0.1.0
