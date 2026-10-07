# Experimental Android prototype

This is a development build, not a published app or a verified backup-safe release. It is designed to run without a PC after installation, but a real device test is still required before claiming that it does.

## Build and install

For a local build, requirements are Node.js 24+, pnpm 11.24+, and Android Studio with Android SDK and its bundled JDK. A USB connection is not required. This repository does not bundle the Android toolchain or an APK.

1. Run `pnpm install`.
2. Run `pnpm android:sync` to check, build, and copy the web assets into `android/`.
3. Run `pnpm android:open` and let Android Studio finish its first Gradle/SDK synchronization.
4. On Android 11 or later, pair the phone with Android Studio using **Wireless debugging** in Developer options, with both devices on the same Wi-Fi network. Select it in Android Studio and run the `app` debug configuration. See the [official wireless debugging guide](https://developer.android.com/studio/run/device).

## Test without Android Studio or USB

For repeat installations that retain real receipts, use **Android installable update APK**, described below. Do not use the disposable PR APK as your ongoing installation.

The **Android PR validation** workflow still automatically compiles app changes, including the native plugin and durable-signing configuration, with a throwaway PKCS12 test key. It never uses repository signing secrets and no longer uploads installable APKs. Historical `itemly-android-YYYY-MM-DD-HHMMSS-preview-pr-N` artifacts used temporary keys and cannot normally update each other or the durable-signed app. They use the same `com.kamitoad.itemly.preview` app ID: installing one may require removing an existing Preview installation and its private data. Never alternate historical disposable APKs with durable updates. `com.kamitoad.itemly` and `com.kamitoad.itemly.live` are separate installations with separate databases.

## Durable, manually requested updates

The **Android installable update APK** workflow is `workflow_dispatch` only: commits and PR updates do not trigger it. It installs as **Itemly Preview**, retains `com.kamitoad.itemly.preview`, and uses a persistent PKCS12 signing key. The version code is UTC seconds since January 1, 2024, rather than a fixed `1`. Its artifact includes the APK, commit, version code, and SHA-256 fingerprint of the public signing certificate. It is still a debuggable development build, not a Play Store release.

### One-time signing setup

From the repository directory in Windows PowerShell, with Git for Windows and an authenticated GitHub CLI:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-android-signing.ps1 -Upload
```

The script generates a random password and a persistent RSA signing key, protects `.local/signing` for the current Windows user and SYSTEM, and uploads **only** these GitHub Actions repository secrets:

- `ITEMLY_ANDROID_KEYSTORE_BASE64`
- `ITEMLY_ANDROID_KEYSTORE_PASSWORD`

The signing alias is `itemly-preview`. The same password protects the store and private key. A repeat setup refuses to replace existing GitHub secrets; missing halves of the local setup also cause a failure. Never regenerate the key just to resolve a build problem. If an upload was interrupted between secrets, use the original local files to complete the missing secret; do not create a new installation identity.

**Keep an independent, secure copy of both `.local/signing/itemly-preview.p12` and `.local/signing/credentials.json`.** These ignored, sensitive files are not protected by Git history. Losing both the signing key and its recovery copy can prevent future APK updates. Do not paste their contents into issues, chats, commits, or build logs.

Signing secrets are not used in PR workflows and are never exposed through `pull_request_target`. The signed workflow has read-only repository permissions, no persisted checkout credential, and removes its temporary runner keystore even after failure. Run it only for code you have reviewed and trust; manually selecting a branch authorizes its build scripts to execute in a job that later handles signing material. Repository write access is a trust boundary: a collaborator who can modify workflows may request repository secrets in their own workflow. Do not grant untrusted collaborators write access; use a protected signing environment with required approval if the contributor model expands.

### First installation and later updates

1. Merge the reviewed workflow into the repository's default branch. GitHub requires a `workflow_dispatch` workflow to exist there before it can be invoked.
2. In **Actions → Android installable update APK → Run workflow**, select the trusted branch and run it.
3. Download the `itemly-installable-update-RUN_ID` ZIP and extract its APK on the phone.
4. The first durable APK cannot replace an old temporary-key Preview. If the old app has data, export and verify a backup first. If the old APK predates backup support and its original key is unavailable, this version cannot add an export button in place; do not uninstall important data. For an empty old installation, uninstall it once and install the durable APK.
5. For every subsequent update, download the **same durable workflow's** APK and tap **Update**. Do not uninstall. Older version codes or a different certificate must be rejected, not worked around by deleting real data.

All build prerequisites and secrets must be present: a durable build fails explicitly rather than silently falling back to a new debug key. Repository settings and secret setup do not themselves trigger an APK build.

## Phone backup and restore

In the Android history screen, expand **Daten & Sicherung**. **Backup exportieren** writes one unencrypted JSON document through Android's system **Save as** picker. Choose an external document location such as Downloads or Documents, not app-private storage. The app streams the newly created document, reads it back, and checks its SHA-256 digest before reporting success. Cancelling is not success. A failed export attempts to remove the newly created incomplete document; a provider may refuse cleanup.

The file includes all stored receipts (confirmed, drafts, and trash), all items including excluded positions, images, original extraction JSON, IDs, timestamps, revisions, mutation history, audit events, last-used currency, and theme. Unsaved forms, image selections, and uncommitted extractions are excluded. Multiple receipts sharing one image export its bytes only once. No credentials are included. The document is personal data: choose its destination carefully. Selecting a cloud document provider sends the file to that provider at the user's request; Itemly does not connect a Google account or silently upload anything.

**Backup importieren** opens a system document picker, immediately copies the chosen file to temporary app storage, and validates it before showing receipt/item/image/trash counts and the export date. **Jetzt wiederherstellen** is a separate explicit confirmation. The target database must be completely empty, including trash and mutation/audit records. There is no merge, overwrite, or wipe action. Restored IDs and exact stored values are preserved, not recalculated or automatically verified.

The format is `itemly-android-backup`, version `1`; webserver database backups and single-receipt ChatGPT JSON are not interchangeable with it. Invalid schemas, future versions, duplicate IDs, missing images, invalid image names/paths, dangling audit references, image checksum mismatches, and unbalanced confirmed receipts are rejected. Restores verify and write images before committing all receipt/history rows in one SQLite transaction. Failed imports roll back the database and remove newly copied images; an interruption may leave only unreferenced image files, reclaimed by startup pruning. Public native reads wait for writes so they do not expose partial restores. Preferences are applied after the commit; failure to apply them produces a warning rather than misreporting the restored receipts as lost. A restored theme takes effect on the next app launch.

The first version limits documents to **100 MB**, individual images to **15 MB**, and restores to **10,000 receipts**. JSON/base64 snapshots have memory overhead; large libraries will need a future streaming archive format. Keep the app open during export/import. Temporary copies are removed on ordinary completion/cancellation/failure; an OS kill may leave private cache files until Android clears them. Backup integrity checks detect corruption but do not authenticate a file's author: import only backups you trust.

Export to an external location before uninstalling. On the new, empty installation, select the file and restore it. Verify real receipts and their images before treating a backup as your only copy. Automatic Android cloud backup remains disabled.

## Wireless live reload for native testing

For frequent UI and TypeScript fixes, use a separate local development app with [Capacitor live reload](https://capacitorjs.com/docs/guides/live-reload). This requires Android Studio/SDK on the PC, a running Vite server, and the phone and PC on the same trusted Wi-Fi network. It does **not** require a USB cable. Pair the phone once using Android Studio's [Wireless debugging](https://developer.android.com/studio/run/device) (Android 11 or newer).

In PowerShell, start the web server in one terminal:

```powershell
pnpm dev:web
```

In another terminal, substitute the PC's current LAN IP for the example address:

```powershell
$env:ORG_GRADLE_PROJECT_itemlyLive = 'true'
pnpm exec cap run android -l --host 10.0.0.189 --port 5173
```

The opt-in Gradle property gives this local debug build the separate application ID `com.kamitoad.itemly.live`; it can coexist with the GitHub-built `com.kamitoad.itemly` APK, so testing does not require uninstalling that app or deleting its data. Keep the `cap run` terminal open and edit the React/TypeScript/CSS sources: Vite reloads the app on the phone. This development build depends on the PC and Wi-Fi while live reload is active. Changes to native plugins, Android configuration, or Gradle still require rebuilding/redeploying the development app. In particular, the native Camera plugin added for image selection requires one new native installation before later web-code fixes can live-reload. Do not use the live-reload build as an offline release or on an untrusted network. If Windows Firewall prompts, allow the Vite server only on the private network.

The normal `pnpm dev` URL opened in a phone browser is useful for web UI work, but it uses the PC API, **not** Android's SQLite and Filesystem adapters. Test native storage bugs inside the wireless-deployed development app. The existing GitHub CI APK cannot be converted into a live-reload app after installation. Its signing key differs from the PC's debug key, so do not attempt to replace it in place or uninstall it if it contains data you need.

The generated Android project uses the application ID `com.kamitoad.itemly`. No Google account, home server, or AI API key is needed to enter and save receipts. The normal ChatGPT copy-and-paste workflow still requires the user to access ChatGPT separately; Itemly itself does not upload the photo to ChatGPT.

## Storage and privacy

- SQLite stores the validated draft, review state, and original imported JSON on the phone. Selected receipt image bytes are stored in the app's private data directory, addressed by SHA-256.
- Android uses the native Camera and Photo Picker instead of a WebView file input. It reads the returned app-accessible image URI immediately and copies the image bytes into private storage before the user switches to ChatGPT or imports JSON. The native picker may process an image; byte-for-byte identity with the source gallery file is not guaranteed. A failed image read leaves the JSON-only import available. Unreferenced image copies from interrupted/abandoned captures are removed on a later app start once they are at least a day old.
- The Android adapter does not call `/api` or the PC server for capture, import, save, search, or detail views.
- Android automatic cloud backup is disabled. No cloud backup is configured by Itemly.
- Uninstalling the app removes its private data. User-initiated Android export/restore is implemented as described above but still needs real-device acceptance testing. Migration from the PC/webserver backup format is not implemented. Do not make this prototype your only copy of important receipts.

## Real-device acceptance checklist

- Capture a photo with the camera and choose one from the gallery; verify both previews.
- Save an incomplete draft with its image, and save a balanced confirmed receipt. Reopen both from history.
- Force-stop and restart the app, then restart the phone. Verify the same receipts and original images remain.
- Turn on airplane mode and repeat capture, save, history, and detail. Check that no PC API request occurs.
- Attempt to save an unbalanced confirmed receipt; it must be rejected while the draft remains editable.
- Retry the same save after a simulated interruption and check that only one receipt appears.
- Edit a saved receipt, add/change/remove items, and verify the same receipt ID and original image after restarting. Incomplete edits must remain drafts.
- Move a receipt to the trash, restart, and restore it with all items and its image. Trash is not permanent erasure.
- Open the same receipt twice and attempt a stale update; the newer revision must not be overwritten.
- Test low-storage and failed-image-write behavior. A receipt must not point at an incomplete image.
- Export drafts, confirmed receipts, and trash with images to Downloads; cancel a second export and verify it does not report success. Confirm the resulting document is available outside the app.
- Install a later **durable-signed** APK as an update. Confirm receipt IDs, values, original JSON, images, edits, and trash remain after restart.
- On a separate disposable installation, export, uninstall, install again, and restore. Compare IDs, exact quantities, amounts, review state, original JSON, audit history, and images. Restore alone is not successful-backup verification.
- Try a damaged image, malformed/future backup, nonempty target (including trash-only), cancelled picker, denied document access, low storage, and interrupted restore. Existing data must remain untouched; a fresh target must remain empty after a failed restore.

The prototype is not accepted until these checks pass on a physical Samsung device, including updating between two durable APKs and uninstall/restore. Keep issue #12 and #13 open until then. This development environment has no Android SDK/JDK; the native Java plugin must also pass the GitHub Android compilation job before device acceptance.
