# Experimental Android prototype

This is a development build, not a published app or a verified backup-safe release. It is designed to run without a PC after installation, but a real device test is still required before claiming that it does.

## Build and install

For a local build, requirements are Node.js 24+, pnpm 11.24+, and Android Studio with Android SDK and its bundled JDK. A USB connection is not required. This repository does not bundle the Android toolchain or an APK.

1. Run `pnpm install`.
2. Run `pnpm android:sync` to check, build, and copy the web assets into `android/`.
3. Run `pnpm android:open` and let Android Studio finish its first Gradle/SDK synchronization.
4. On Android 11 or later, pair the phone with Android Studio using **Wireless debugging** in Developer options, with both devices on the same Wi-Fi network. Select it in Android Studio and run the `app` debug configuration. See the [official wireless debugging guide](https://developer.android.com/studio/run/device).

## Test without Android Studio or USB

The `Android debug APK` GitHub Actions workflow builds a signed **test APK** for pull requests that change the app. Open the successful workflow run in the repository's Actions tab on the phone and download the `itemly-android-YYYY-MM-DD-HHMMSS-preview-pr-N` artifact. The timestamp is the APK packaging time in UTC. Extract the ZIP and tap the identically named `.apk` file. Android will ask for permission to install unknown apps from the app used to open the APK. Only install artifacts from a workflow run you trust. The preview build installs as **Itemly Preview** (`com.kamitoad.itemly.preview`), beside an older `com.kamitoad.itemly` APK, so testing a new build does not require removing the older app and its data. The two apps do not share receipts.

Each CI run creates a temporary debug signing key. A later preview APK may not install as an update over a previous preview APK; uninstalling **Itemly Preview** first deletes its app-private receipts and images, but does not affect the older Itemly installation. Use **test receipts only** until backup/restore and durable signing are in place. The artifact expires after seven days and is not a production release.

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
