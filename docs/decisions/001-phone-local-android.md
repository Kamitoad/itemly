# ADR 001: Phone-local Android runtime and storage

Status: Proposed — validate with a device prototype before treating this as final.

## Context

Itemly's React interface already supports camera and gallery selection, review, and manual entry. Today every receipt operation in `src/api.ts` calls the Express server. SQLite and receipt images live in the server's `data/` directory, so the current app cannot save a receipt when the computer is off. Installing its PWA does not change that dependency.

The primary product goal is to capture, review, save, search, and reopen receipts on an Android phone without a running computer or network connection. External AI and cloud backups remain optional.

## Proposed decision

Build an Android-first app that bundles the existing React UI with Capacitor. Keep the domain schemas, arithmetic, import validation, and review flow in `shared/`. Put device-specific behavior behind replaceable storage and image adapters:

- Store structured receipts in an app-private SQLite database, with explicit versioned migrations.
- Store original images in app-private persistent file storage, referenced by content hash from SQLite.
- Route capture, history, detail, and save operations to the phone-local adapters when running on Android; do not call the PC API for core operations.
- Preserve the current self-hosted server as a separate runtime during migration, not as a hidden dependency of the Android app.
- Provide user-initiated, validated backup export and restore before relying on phone-local storage as the only copy. Plan migration from the current portable backup format.
- Keep manual entry available offline. The user-driven ChatGPT copy-and-paste flow requires a network connection to ChatGPT, but saving and reviewing its returned JSON must work locally. Do not bundle a server API key or silently upload images.

The mobile persistence adapter must preserve the current rules: exact decimal quantities, integer minor-unit amounts, original printed values, incomplete drafts, and atomic, idempotent, balanced confirmed saves. Because a database transaction cannot atomically commit a separate image file, write and verify the image before committing its database reference, then safely clean up unreferenced temporary files.

## Alternatives considered

- **Browser-only PWA with IndexedDB:** Fastest path to a phone-only proof of concept, but browser storage is best-effort by default and can be deleted through browser settings. It also depends on a stable HTTPS origin for installation and updates. It remains a possible fallback if the native storage prototype fails.
- **Full native Android rewrite:** Strong platform integration, but it would duplicate the existing React UI and domain workflow before we have validated the product.

## Consequences and boundaries

- Android packaging, native storage plugins, and an Android build toolchain become development requirements. They are not runtime requirements for the user once the app is installed.
- App-private Android data is removed when the app is uninstalled. Backup and restore are therefore essential, not optional polish.
- Google Drive or Dropbox is not required for core use. A later cloud option must be explicitly enabled and clearly describe where the backup copy goes.
- Protecting the existing PC server remains necessary while it is used, but it does not make the Android app independent of the PC.

## Prototype required to accept this decision

1. Package a minimal Android build containing the current UI shell.
2. Capture one image and store it alongside one receipt locally.
3. Reopen both after app process termination and a phone restart, with airplane mode enabled.
4. Verify that no request to the PC API occurs during capture, save, history, or detail view.
5. Test failed writes, low storage, repeat saves, and backup export/import on a real Samsung device.

This repository's current development environment has no Android SDK or `adb`, so the real-device prototype is not yet verified. Do not mark issue #12 complete or claim phone-only support until those checks pass.

## References

- [Capacitor documentation](https://capacitorjs.com/docs)
- [Android app-specific storage](https://developer.android.com/training/data-storage/app-specific)
- [Android data and file storage overview](https://developer.android.com/training/data-storage)
- [Browser storage and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
