# Privacy and data flow

Itemly is a self-hosted application without user accounts, telemetry, or analytics scripts. This document describes version 0.1.0. Anyone who modifies Itemly or operates it publicly is responsible for the resulting data flows.

## Data processed locally

Itemly may store:

- Receipt images
- Merchant, store, address, purchase date, and time
- Items, quantities, prices, discounts, taxes, deposits, and fees
- Payment method, card brand, and at most the visible last four card digits
- Review status, uncertainties, technical source details, and personal notes

In the web runtime, this data is stored in the local `./data` directory. Structured data is stored in SQLite; images are stored in `receipts/`. The browser stores only the chosen appearance and the installable PWA shell.

The experimental Android runtime instead stores receipts and original images in app-private storage on the phone. It does not call the PC API for core operations, and Android system cloud backup is disabled. Device-to-device transfer behavior can vary by Android manufacturer; explicit exclusion rules are also configured. Existing web-server data is not automatically migrated to Android. Uninstalling the app deletes its private data. The unreleased Android version includes user-initiated full export and empty-database restore; see [Android backup instructions](docs/ANDROID.md) and complete the real-device acceptance checks before relying on it.

## AI processing

AI is optional.

### Manual entry and ChatGPT JSON import

During manual entry, Itemly does not send receipt images to an AI provider. For ChatGPT JSON import, the user copies a prompt template and uploads the image to a regular ChatGPT chat themselves. This transfer happens outside Itemly and is subject to that service's terms and settings.

### Configured API provider

If an operator configures an OpenAI-compatible provider, Itemly sends a selected image for extraction only after a visible notice. API keys remain on the server and are not sent to the browser. The provider's terms govern its storage and retention of submitted data.

## Sharing and tracking

Itemly contains no ads, telemetry, or built-in analytics. Without a configured AI provider, Itemly does not automatically transmit purchase data to third parties. A user may explicitly choose a cloud-backed document provider when exporting an Android backup; that provider receives the selected backup under its own terms. Itemly does not silently connect a cloud account.

## Backups and deletion

Web-server backups contain the complete SQLite database and available receipt images. Android backups use a separate, versioned logical JSON format and include stored drafts, confirmed receipts, trash, images, original extraction data, audit history, and relevant appearance/currency preferences. They are unencrypted and can contain sensitive purchase/payment details. Save them outside app-private storage if they must survive uninstall, and protect access to the exported file. Selected external document access is explicit; no broad storage permission is required. Temporary private copies are removed on ordinary completion; an OS interruption may leave cache files until Android clears them.

The unreleased UI supports recoverable receipt trash, not permanent erasure. Trash and previous values in audit history are still included in backups. Deleting a receipt from the normal history does not erase these copies. The user/operator remains responsible for deleting exported backup files and protecting the device/local data directory. Until physical-device update and backup/restore acceptance passes, do not use the Android prototype as the only copy of important data.

## Network use

Version 0.1.0 has no login or access control. Run the server only on a private computer or trusted network unless suitable access protection is added in front of it.
