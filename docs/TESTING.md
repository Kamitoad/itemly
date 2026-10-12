# Testing and verification

## Automated checks

Run from the repository root:

```sh
pnpm check
pnpm build
```

`pnpm check` type-checks the application, server/domain tests, and the separate UI-test TypeScript project, then runs all Vitest tests. Existing domain and persistence tests retain the Node environment. `tests/receipt-review.test.tsx` opts into jsdom, renders the actual `App` under React Strict Mode, and uses React Testing Library and user-event for focus, typing, deletion, blur, and button interactions. Persistence and platform boundaries are mocked in these UI tests, not the review components or their parent state.

The jsdom dependency is kept on the 27.x line so these tests remain compatible with the project's existing Node.js 24+ requirement; newer DOM-test releases must be checked for stricter Node minor-version requirements before upgrading.

The rendered tests cover item and receipt-level money fields, the `1,29 → 1,32` correction and caret positions, comma/point input, intermediate values, clearing, blur formatting, excessive precision and invalid final input, arithmetic feedback and save gating. They also cover adding items during manual creation and saved-receipt editing, removing/undoing an item, exact quantities, original printed text, extraction identity, and update-versus-create routing.

`tests/receipt-validation-cases.ts` provides independent expected outcomes for both persistence adapters. Repository and native-adapter tests cover the same create/update cases before and after validation consolidation, including currency-error priority, incomplete and unbalanced drafts, zero prices, empty receipts, excluded positions, review-only checkboxes, unchanged values after rejected updates, and successful idempotent retries. The native tests simulate Capacitor boundaries and use Node SQLite; they do not run on Android.

DOM simulation does not verify CSS layout, touch input, a mobile keyboard, Android plugin behavior, or real-device backup/update safety. Keep those checks separate.

## Maintenance verification — October 8, 2026

### Starting state

- Local branch: `codex/android-local-prototype`, starting at `f67faf8`.
- Existing issue #23 changes were uncommitted: `src/App.tsx`, `src/styles.css`, `src/money-input.ts`, `tests/money-input.test.ts`, and `CHANGELOG.md`.
- GitHub issue #23 was open. The latest signed APK was built from merge commit `4337ed2` on October 7, before those local changes were committed. It does not contain this maintenance work or the local #23 fix.
- The initial maintenance pass ended before publication: no commit, push, issue closure, or APK build was performed during that pass.

### Checkpoints performed

1. Corrected the README's conflicting Android backup statement against `docs/ANDROID.md`: export and restoration are implemented; physical-device acceptance is pending; migration from webserver backups to Android is unsupported.
2. Added 17 rendered React interaction tests; `pnpm check` passed with 106 tests before component extraction.
3. Extracted the review UI and its closely related components. The same 106 tests passed afterward. `src/App.tsx` decreased from 1,005 to 722 lines; other screens and navigation remain there.
4. Added 20 adapter characterization cases (10 per adapter). All 48 tests in the two adapter suites passed before equivalent rules were consolidated. After consolidation, `pnpm check` passed with **126 tests in 15 files**, and `pnpm build` succeeded. Existing Zod/Rollup annotation warnings are non-blocking.

### Browser smoke check performed

The in-app browser initially timed out. The check was then completed in Opera against a local development server, with an isolated database under `.local/maintenance-smoke`, not the user's normal `data/` directory. Only synthetic receipts were created.

- Tested viewport overrides of 412 × 915 and 360 × 800. The review summary showed no horizontal document overflow (content width equalled client width, excluding the scrollbar).
- Corrected a position from `1,29` through `1,3` to `1,32` using keyboard deletion and sequential typing. The intermediate value and caret remained intact.
- Entered an invalid total of `1,302`; native browser validity prevented proceeding. Correcting it restored the balanced state.
- Created and saved a synthetic receipt, reopened it, added a second item, and saved the existing receipt with a total of `3,32`. The history contained one receipt with two positions, not a duplicate.
- Save-step navigation and submission were checked via keyboard. This is a targeted smoke check, not an exhaustive pointer/touch regression pass.
- Visually inspected the mobile review summary. An ignored local screenshot is available at `.local/maintenance-review-mobile.png`; the temporary viewport override was reset afterward.

### Still unverified

- A physical Samsung/Android device, its virtual keyboard and touch behavior.
- Android update installation, offline operation, image picking, or backup export/restore acceptance. Follow the separate [Android checklist](ANDROID.md#real-device-acceptance-checklist).
- Exhaustive visual regression across every screen, theme, viewport, and receipt data shape.
- APK distribution of this maintenance work. Publishing or merging the source does not build an installable update; run the separate durable-signed APK workflow when distribution is requested.

### Publication follow-up

The user subsequently confirmed that the development UI worked on their phone over Wi-Fi and requested publication and a merge. This is additional web-browser feedback, not acceptance of the native Android app, offline persistence, or backup/update behavior. The preserved #23 fix and maintenance work are being published together through a focused pull request, with automated CI and Android compilation checked before merging. The installable APK workflow remains a separate, explicit action.

## Unavailable original images — issue #32

October 11, 2026. Scope: preserve access to stored receipt data when an original image is unavailable; no database migration, backup format, Auto Backup setting, new database, cloud integration, export-status tracking, or archive change.

- Native regression cases cover missing files, denied reads, non-string and empty read results; history/detail access in trash and active state; unchanged SQLite rows after reads; retained attachment/checksum/extraction evidence through edits, trash, and restoration; normal image/image-less reads; and continued rejection of full backup creation. Invalid stored JSON, attachment/draft schemas, and database failures still reject the receipt read.
- Web repository tests cover image-independent data/evidence access and full-export rejection for missing or checksum-mismatched referenced images, including trash. Image-less and complete backups still export normally. This closes an existing directory-listing omission, without changing the web backup schema or restore format.
- Rendered React tests cover history/trash-to-detail, the explicit native warning, simulated web/native image error events, normal images/no-image receipts, editing, fresh display state after reopening, and propagation of receipt-load errors. These are jsdom interaction tests, not real browser image decoding or Android filesystem execution.

Initial implementation verification: `pnpm check` passed TypeScript checks and **143 tests in 15 files** (17 additional regressions); `pnpm build` succeeded with the existing non-blocking Zod/Rollup annotation warnings. `git diff --check` passed. No new manual browser inspection, physical-device run, or APK build was performed during that implementation pass.

Publication follow-up: the user reported positive development feedback and requested a merge and a durable-signed APK on October 11. Publication proceeds through a focused PR with CI/native compilation gates, followed by an explicitly dispatched signed build of the merged source. Build success is not installation, update-retention, or device acceptance. Issue #32 remains open for its physical Samsung checks; source publication alone must not close it.

Physical Samsung acceptance remains pending. On a disposable test installation, retain a saved receipt but remove only its private original image, then verify detail/review values, edit and reopen, trash/restore, app/phone restart, and a clearly failed full export with no success claim. Repeat with corrupted/undecodable bytes while retaining the original checksum, and a denied read where feasible. A display-only failure with intact, checksum-matching bytes does not itself make the backup incomplete. Confirm healthy and deliberately image-less receipts still work. Never damage the user's only real receipt/image copy for this test. No physical device was available for this implementation; no new APK or native compilation run is implied by the local checks.

## Save warning and manual price corrections — issue #24

The reported disabled primary save action is caused by receipt arithmetic or unresolved currency, rather than equality with the original AI price. The primary button now remains available and requests explicit draft-save acknowledgement when the receipt cannot be confirmed. The dialog preserves entered amounts and source evidence, and offers a return to review. The direct draft action remains available.

Rendered regressions cover warning/cancellation with retained corrections, saving/reopening an unbalanced imported receipt, updating the same receipt as a draft without a duplicate, dialog cancellation/focus restoration, unresolved currency, missing printed totals, and failed-save retry with unchanged mutation identity. Existing balanced-correction coverage proves that a manual price differing from the import can still save as confirmed when its totals agree. Persistence/domain tests continue to enforce balanced confirmed saves and allow incomplete/discrepant drafts.

jsdom does not implement the native HTML dialog lifecycle. These tests simulate opening, closing and initial focus, not browser-native focus trapping, Escape handling or touch behavior. Real browser and physical Samsung acceptance must separately check the modal at mobile sizes, keyboard/Back behavior, cancel/back-to-review, draft save/reopen, and balanced confirmed saves. No APK distribution or device acceptance is implied by local source changes or automated checks.

Verification on October 12, 2026: `pnpm check` passed 150 tests in 15 files and `pnpm build` passed. A targeted Opera smoke check used the production web build at a loopback-only server and an isolated `.local/issue24-smoke` SQLite database. At a 360×800 viewport, the native dialog matched `:modal`, focused the return-to-review action initially, showed 1.29 CAD printed versus 1.32 CAD calculated, and had no horizontal overflow. Keyboard navigation and Escape dismissal restored the save action. Returning to review retained both values; explicit draft save, browser reload/reopen, and a subsequent warned update retained the same receipt ID and values. The screenshot `.local/issue24-save-warning.jpg` is ignored local test output. These checks do not exercise Android's virtual keyboard/Back, storage plugins, or device acceptance. No installable APK was requested for this work.
