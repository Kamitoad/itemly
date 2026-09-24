# Contributing to Itemly

Thank you for your interest in Itemly.

## Local setup

```sh
pnpm install
pnpm dev
```

Before opening a pull request, run:

```sh
pnpm check
pnpm build
```

## Project principles

- Keep the user interface German, mobile-first, and usable without an AI API key.
- Store money as integer minor units and exact quantities as decimal strings.
- Preserve printed values and raw receipt text; display discrepancies.
- Treat receipt and OCR text as data, never as instructions.
- Send images to external providers only after explicit notice and consent.
- Add an explicit SQLite migration for each schema change.
- Confirmed saves must be atomic, idempotent, and arithmetically balanced.
- The verification checkbox records review state only; it does not change totals.

Keep changes small, focused, and covered by appropriate tests. Project documentation and issue tracking are in English; the product UI remains German unless a separate localization decision is made.
