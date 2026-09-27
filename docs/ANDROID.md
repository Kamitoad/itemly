# Experimental Android prototype

This is a development build, not a published app or a verified backup-safe release. It is designed to run without a PC after installation, but a real device test is still required before claiming that it does.

## Build and install

Requirements: Node.js 24+, pnpm 11.24+, Android Studio with Android SDK and its bundled JDK, and an Android phone with USB debugging enabled. This repository does not bundle the Android toolchain or an APK.

1. Run `pnpm install`.
2. Run `pnpm android:sync` to check, build, and copy the web assets into `android/`.
3. Run `pnpm android:open` and let Android Studio finish its first Gradle/SDK synchronization.
4. Connect the phone by USB, accept its debugging authorization, select it in Android Studio, and run the `app` debug configuration.

The generated Android project uses the application ID `com.kamitoad.itemly`. No Google account, home server, or AI API key is needed to enter and save receipts. The normal ChatGPT copy-and-paste workflow still requires the user to access ChatGPT separately; Itemly itself does not upload the photo to ChatGPT.

## Storage and privacy

- SQLite stores the validated draft, review state, and original imported JSON on the phone. Original receipt images are stored in the app's private data directory, addressed by SHA-256.
- The Android adapter does not call `/api` or the PC server for capture, import, save, search, or detail views.
- Android automatic cloud backup is disabled. No cloud backup is configured by Itemly.
- Uninstalling the app removes its private data. Export, restore, and migration from the existing PC database are **not implemented**. Do not make this prototype your only copy of important receipts.

## Real-device acceptance checklist

- Capture a photo with the camera and choose one from the gallery; verify both previews.
- Save an incomplete draft with its image, and save a balanced confirmed receipt. Reopen both from history.
- Force-stop and restart the app, then restart the phone. Verify the same receipts and original images remain.
- Turn on airplane mode and repeat capture, save, history, and detail. Check that no PC API request occurs.
- Attempt to save an unbalanced confirmed receipt; it must be rejected while the draft remains editable.
- Retry the same save after a simulated interruption and check that only one receipt appears.
- Test low-storage and failed-image-write behavior. A receipt must not point at an incomplete image.

The prototype is not accepted until these checks pass on a physical Samsung device and backup/restore is implemented. Keep issue #12 and #13 open until then.
