# Privacy and data flow

Itemly is a self-hosted application without user accounts, telemetry, or analytics scripts. This document describes version 0.1.0. Anyone who modifies Itemly or operates it publicly is responsible for the resulting data flows.

## Data processed locally

Itemly may store:

- Receipt images
- Merchant, store, address, purchase date, and time
- Items, quantities, prices, discounts, taxes, deposits, and fees
- Payment method, card brand, and at most the visible last four card digits
- Review status, uncertainties, technical source details, and personal notes

By default, this data is stored in the local `./data` directory. Structured data is stored in SQLite; images are stored in `receipts/`. The browser stores only the chosen appearance and the installable PWA shell.

## AI processing

AI is optional.

### Manual entry and ChatGPT JSON import

During manual entry, Itemly does not send receipt images to an AI provider. For ChatGPT JSON import, the user copies a prompt template and uploads the image to a regular ChatGPT chat themselves. This transfer happens outside Itemly and is subject to that service's terms and settings.

### Configured API provider

If an operator configures an OpenAI-compatible provider, Itemly sends a selected image for extraction only after a visible notice. API keys remain on the server and are not sent to the browser. The provider's terms govern its storage and retention of submitted data.

## Sharing and tracking

Itemly contains no ads, telemetry, or built-in analytics. Without a configured AI provider, Itemly does not transmit purchase data to third parties.

## Backups and deletion

Backups contain the complete SQLite database and available receipt images. Treat them as confidential as the local data directory. The operator is responsible for deleting or moving local data and backups. Version 0.1.0 does not yet offer deletion in the UI.

## Network use

Version 0.1.0 has no login or access control. Run the server only on a private computer or trusted network unless suitable access protection is added in front of it.
