# Architecture

Itemly is a local TypeScript application with replaceable boundaries for extraction, file storage, and persistence. It has a server-backed web runtime and an experimental phone-local Android runtime.

## Components

- `src/` contains the React UI, mobile review flow, and API client.
- `shared/` contains versioned Zod schemas, arithmetic rules, and normalization of imported data.
- `server/` contains Express routes, extraction adapters, SQLite access, backups, and restore.
- `server/migrations/` contains immutable, explicitly applied SQLite migrations.
- `src/native/` contains the Capacitor Android persistence adapter and its own explicit SQLite migrations.
- `android/` contains the generated, version-controlled Android project.
- `tests/` covers domain logic, import boundaries, and persistence behavior.

## Data flow

```text
Receipt image or manual input
            |
            v
Optional extraction / JSON import
            |
            v
Schema validation and unverified draft
            |
            v
Visible review and arithmetic reconciliation
            |
            v
Atomic SQLite save + optional original image
```

## Domain rules

- Store money as integer minor units.
- Keep quantities and package sizes as exact decimal strings.
- Never replace printed totals with calculated values.
- A confirmed purchase must have complete prices, balanced arithmetic, and a known currency with no unresolved currency warning.
- Drafts may be incomplete or unbalanced.
- Verification checkboxes record human review only.
- Always treat raw receipt, OCR, and AI output as untrusted data.

## Persistence

In the web runtime, SQLite stores merchant snapshots, purchases, items, adjustments, attachments, and audit events. Migrations are recorded exactly once in `_migrations`. Confirmed saves run in a transaction and use a client-generated mutation ID for idempotency.

Original images are content-addressed and stored beside the database. Portable backups include the database and images, but do not modify any external backup destination.

In the Android prototype, a separate app-private SQLite database stores each validated receipt draft and metadata in one atomic row. The app-private Filesystem directory stores content-addressed originals before the SQLite reference is committed. The native schema uses `PRAGMA user_version` and an explicit migration in `src/native/migrations/`. The two databases are not synchronized. Backup, restore, and real-device verification are still open work.

## Currency review

Missing, null, or malformed currency values do not block JSON import. Normalization uses the `XXX` no-currency code in incomplete drafts, keeping the existing string-based SQLite and JSON schemas unchanged. The original extraction payload remains untouched, and amounts are never converted or rewritten.

The UI suggests the last successfully saved, reviewed currency when the new receipt has no currency. This device/origin-local preference is stored under `itemly-last-currency` in local storage; if absent, the newest confirmed receipt by scan time seeds it. Detected currencies take precedence. On first use without saved receipts, the review form presents an empty currency selection.

Suggested currencies remain uncertain until explicitly selected or confirmed in the review form. Incomplete drafts can be saved, but both persistence adapters reject confirmed saves with an unresolved currency warning. The web adapter restores provenance and uncertainty paths from the existing full-draft audit snapshot; Android already persists the complete draft. No database migration is necessary because no schema changes are made.

## Receipt and item CRUD

Open a saved receipt and choose **Beleg bearbeiten**, or use an item's **Bearbeiten** link. The existing review form can add, change, or remove items and edit receipt metadata, payment details, notes, and totals. Cancel leaves the stored receipt unchanged. Saving edits updates the same receipt ID; scan time, original image, and original extraction output are retained. Confirmed updates use the same arithmetic and currency checks as confirmed creates; incomplete edits can be stored as drafts.

Both persistence adapters apply schema migration `002_receipt_crud.sql`, adding a revision, a soft-delete timestamp, and a mutation ledger. Mutations include an expected revision and a unique client mutation ID: stale edits are rejected and successful retries do not apply twice. Web updates atomically replace normalized child rows and append old/new draft snapshots to the existing audit trail. Android updates the complete draft and an audit snapshot inside a serialized SQLite transaction.

Deleting requires confirmation and moves the entire receipt, including items and images, to **Papierkorb**. The normal history and image duplicate checks exclude trashed receipts. Restoration keeps the same identity and data. There is no permanent-delete action or automatic expiration yet: trash is recoverable storage, not secure erasure. Web exports and full backups can still contain trashed receipts and audit snapshots. Archived image references are retained, including when several receipts share the same content-addressed file.

Web endpoints are `POST /api/receipts` (create), `GET /api/receipts` and `GET /api/receipts/:id` (read), `PUT /api/receipts/:id` (update), `DELETE /api/receipts/:id` (trash), and `POST /api/receipts/:id/restore` (restore). List trash with `?trash=true`; update/delete/restore requests require `clientMutationId` and `expectedRevision`. Items are edited within the aggregate receipt so totals, review state, and item mutations commit together rather than through separate partially committed item endpoints.

## Security boundary

The app has no login in version 0.1.0, so the network itself is the trust boundary. Public hosting requires a reverse proxy with HTTPS and access control in front of Itemly.

## Phone-local runtime prototype

The Android runtime has no PC API dependency for core operations. It is not yet validated on a physical device. [ADR 001](decisions/001-phone-local-android.md) records the decision and acceptance tests; the [Android guide](ANDROID.md) describes setup and limitations.
