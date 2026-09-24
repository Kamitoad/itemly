# Itemly – Receipt Tracker

[![CI](https://github.com/Kamitoad/itemly/actions/workflows/ci.yml/badge.svg)](https://github.com/Kamitoad/itemly/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2ea44f.svg)](LICENSE)

> Capture receipts privately, review every detail, and store your data locally.

Itemly is a mobile-first, self-hosted web app for structured purchase data. Receipt images and data stay on your own computer by default. You can enter receipts manually, use a free copy-and-paste workflow with a regular ChatGPT chat, or optionally configure an OpenAI-compatible API provider.

![Itemly in dark mode](docs/images/itemly-home.jpg)

## Why Itemly?

Many receipt apps require an account, cloud storage, or a paid AI service. Itemly takes a different approach:

- **Local first:** A SQLite database and original images live in a local data directory.
- **No recurring AI cost required:** Manual entry and ChatGPT JSON import need no API key.
- **Review before saving:** Extracted details remain unverified until you check them.
- **Transparent totals:** Printed values are preserved; discrepancies are shown instead of silently corrected.
- **Replaceable integrations:** Extraction, file storage, and persistence are separate adapters.

## What v0.1.0 includes

- Camera and gallery selection with preview and explicit consent before external processing
- Validated JSON import from a regular ChatGPT chat
- A fully manual workflow without AI access
- Editing of merchant, item, payment, and total details during review
- Uncertainty markers for extracted items and fields
- Arithmetic checks for line items, discounts, taxes, deposits, and fees
- Drafts and atomic, idempotent saves of balanced purchases
- Local history with search and detail views
- Single-receipt export, portable export with the original image, and full backup
- Installable PWA with light and dark themes

## Quick start

Requirements:

- Node.js 24 or newer
- pnpm 11.24.0

```sh
pnpm install
pnpm dev
```

The development services are then available at:

- Web app: `http://localhost:5173`
- API: `http://localhost:8787`

To test on a phone connected to the same Wi-Fi network, use the network URL printed by the development server, for example `http://192.168.1.10:5173`.

## Production use

```sh
pnpm build
pnpm start
```

The complete app is then served at `http://localhost:8787`.

Itemly v0.1.0 has no user accounts or access control. Run the server only on a private computer or trusted home network unless you add suitable access protection. Do not expose it directly to the public internet.

## Capture receipts without an API key

1. Select **ChatGPT-JSON importieren** in Itemly.
2. Copy the provided prompt template.
3. Send the template and receipt image in a regular ChatGPT chat.
4. Paste the returned JSON into Itemly.
5. Review every value before saving.

This workflow does not use an AI API inside Itemly. Uploading the image to ChatGPT is a separate, deliberate user action. Common copy-and-paste artifacts are repaired, but the data is still fully validated and never automatically marked as reviewed.

## Optional API configuration

Copy `.env.example` to `.env` and configure it as needed:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

The key stays on the server and is never sent to the browser. A receipt image is sent to the configured provider only after an explicit notice. Without a key, manual entry and ChatGPT JSON import remain available.

## Local data and backups

By default, Itemly uses `./data`:

- `receipts.sqlite` – relational SQLite database
- `receipts/` – content-addressed original images

The entire directory and `.env` are excluded from Git. Download a full backup from the purchase overview or through `GET /api/backup`.

To restore a backup:

```sh
pnpm restore <backup.json> <empty-destination-directory>
```

Then point `DATA_DIR` to the destination directory, start Itemly, and inspect at least one purchase and its image.

## Quality checks

```sh
pnpm check
pnpm build
```

Tests cover schema validation, arithmetic, discounts, taxes, fees, uncertainties, duplicate detection, idempotency, transactions, backups, and extraction failures. The same checks run on pushes and pull requests in GitHub Actions.

## Architecture and project information

- [Architecture](docs/ARCHITECTURE.md)
- [Privacy and data flow](PRIVACY.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [v0.2.0 roadmap](https://github.com/Kamitoad/itemly/issues/8) and [v0.3.0 roadmap](https://github.com/Kamitoad/itemly/issues/21)

## Planned improvements

- Clear details for each uncertain field
- Editing previously saved purchases
- A more convenient editor for fees, deposits, and discounts
- CSV reports and statistics
- Optional, replaceable backup destinations

## License

The source code is available under the [MIT License](LICENSE) © 2026 Chasan Moustafa.
