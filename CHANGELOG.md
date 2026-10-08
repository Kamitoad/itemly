# Changelog

All notable changes to Itemly are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Money fields preserve partial input while typing and format only when leaving the field, allowing corrections such as 1,29 to 1,32 without automatic completion. Invalid amounts are shown explicitly and cannot silently retain an earlier valid value.
- README Android backup guidance now distinguishes implemented export/restore, pending physical-device acceptance, and unsupported webserver-to-Android backup migration.

### Added

- Rendered React interaction tests for receipt review, money-field editing, invalid input, arithmetic feedback, and item creation in new and saved receipts.
- Matching create/update validation cases for both persistence adapters, including incomplete drafts, currency warnings, excluded items, and idempotent retries.
- Android user-initiated full backup export via the system document picker, including receipt images, original extraction data, drafts, trash, audit history, and preferences.
- Validated, empty-database-only Android restore with a confirmation preview, image checksums, transactional writes, rollback, and failure cleanup.
- A manually dispatched durable-signed preview APK workflow and protected local signing setup, allowing later APKs to install as updates without deleting receipts.
- Backup corruption, restore failure, document cancellation, preference failure, and signing-boundary tests. Physical-device update/restore acceptance is still pending.

### Changed

- Receipt review, item cards, field controls, status indicators, and shared icons were extracted from the main application module without changing their UI structure or styling.
- UI-facing API contracts and equivalent receipt validation rules are shared between web and Android adapters; database models, transactions, and backup formats remain separate.
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
