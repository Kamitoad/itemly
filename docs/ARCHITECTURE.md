# Architecture

Itemly is a local TypeScript application with replaceable boundaries for extraction, file storage, and persistence. It has a server-backed web runtime and an experimental phone-local Android runtime.

## Components

- `src/` contains the React UI, mobile review flow, and API client.
- `shared/` contains versioned Zod schemas, arithmetic rules, and normalization of imported data.
- `server/` contains Express routes, extraction adapters, SQLite access, backups, and restore.
- `server/migrations/` contains immutable, explicitly applied SQLite migrations.
- `src/native/` contains the Capacitor Android persistence adapter and its own explicit SQLite migrations.
- `android/` contains the generated, version-controlled Android project.
- `tests/` covers domain logic, import boundaries, persistence behavior, and rendered React interactions.

## Review UI and shared contracts

`src/App.tsx` owns navigation, receipt state, and persistence calls. `src/review/ReviewScreen.tsx` owns the existing review layout and add/remove/undo actions; `ItemCard.tsx` and `fields.tsx` contain its closely related controls. Status indicators and the existing SVG icons live in `src/components/` because other screens reuse them. Components receive drafts and callbacks rather than importing the application or storage adapter. CSS classes and the German mobile-first UI are unchanged.

`src/money-input.ts` preserves editable text and caret independently of integer minor-unit values in the parent draft. Money inputs normalize on blur, retain invalid text, and clear the underlying amount rather than silently retaining an earlier valid value. The review's validity guard prevents continuing or saving while a rendered money field is invalid. Empty values remain allowed in incomplete drafts.

`shared/receipt-api.ts` defines the common UI-facing configuration, history, and receipt contracts. `src/api.ts` re-exports these types for existing callers, and the native adapter imports the contracts directly rather than depending on the web client. The save request uses the existing schema-derived `SaveReceiptRequest`; calculated totals use the existing `ReceiptCalculations` type.

`shared/receipt-validation.ts` contains only the equivalent validation-state calculation and confirmed-save currency/arithmetic checks. Adapters still own schema parsing, error types, idempotency/conflict ordering, transactions, and storage mapping. Web extraction/audit projections and Android-specific backup validation are intentionally not unified. No database migration or backup-format change is involved. See [testing and verification](TESTING.md) for the test boundaries.

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

In the Android prototype, a separate app-private SQLite database stores each validated receipt draft and metadata in one atomic row. The app-private Filesystem directory stores content-addressed originals before the SQLite reference is committed. The native schema uses `PRAGMA user_version` and explicit migrations in `src/native/migrations/`. The two databases are not synchronized. Android backup/restore uses a versioned logical JSON snapshot rather than copying an open SQLite file. It does not change the database schema, so no new migration is required. Real-device acceptance remains open.

## Android backup and update boundaries

`shared/native-backup.ts` validates the Android-specific versioned envelope, receipt rows, relational identities, audit/mutation history, attachment references, and image SHA-256 digests. Raw extraction and audit JSON are retained as data, never executed. Confirmed receipts must satisfy existing currency and arithmetic invariants; incomplete drafts stay incomplete. `src/native/api.ts` serializes complete snapshots/restores with normal mutations and public reads, preventing partial reads on the shared SQLite connection. Restore is empty-target-only, parameterized, and transactional. Image writes are verified before references commit; failure cleans new images, with orphan pruning handling interrupted processes.

`BackupDocumentsPlugin.java` uses Android Storage Access Framework create/open document intents with no broad storage permission. It streams selected documents to/from strictly named private cache files, enforces a 100 MB size limit even when the provider does not publish a size, and verifies exported bytes by reading the destination back. TypeScript handles snapshot validation, preview, explicit restore confirmation, and private cache cleanup. UI exports route to these native functions on Android, never to `/api/backup`. Existing web backup routes remain unchanged; format conversion is separate future work.

The manually dispatched `android-signed-apk.yml` uses a persistent, privately backed-up signing key from repository secrets, retains `com.kamitoad.itemly.preview`, and generates increasing time-based version codes. It fails without credentials rather than signing a replacement identity. Automated PR validation uses a disposable key to exercise the signing configuration, but does not distribute APKs or access real signing credentials. Historical temporary-key APKs are not interchangeable with durable updates. See [Android setup and acceptance](ANDROID.md).

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
