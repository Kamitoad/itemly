# Changelog

All notable changes to Itemly are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Android user-initiated full backup export via the system document picker, including receipt images, original extraction data, drafts, trash, audit history, and preferences.
- Validated, empty-database-only Android restore with a confirmation preview, image checksums, transactional writes, rollback, and failure cleanup.
- A manually dispatched durable-signed preview APK workflow and protected local signing setup, allowing later APKs to install as updates without deleting receipts.
- Backup corruption, restore failure, document cancellation, preference failure, and signing-boundary tests. Physical-device update/restore acceptance is still pending.

### Changed

- Automatic Android PR jobs now validate native compilation/signing with a throwaway key but do not distribute APKs; installable update artifacts are manually requested only.
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
