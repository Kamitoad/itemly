import { afterEach, describe, expect, it, vi } from "vitest";
import { ManualExtractor, OpenAICompatibleExtractor } from "../server/extraction.js";
import { parsePastedReceiptJson, ReceiptImportError } from "../shared/receipt-import.js";
import { calculateReceipt } from "../shared/receipt.js";

afterEach(() => vi.unstubAllGlobals());

describe("extraction adapters", () => {
  it("keeps the application usable without an API key", async () => {
    const result = await new ManualExtractor().extract();
    expect(result.status).toBe("manual");
    expect(result.draft.items).toEqual([]);
    expect(result.draft.merchantName).toBeNull();
  });

  it("surfaces provider failure instead of fabricating receipt data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider unavailable", { status: 503 })));
    const extractor = new OpenAICompatibleExtractor("secret", "vision-model", "https://provider.invalid/v1");
    await expect(extractor.extract(Buffer.from("image"), "image/jpeg")).rejects.toThrow("503");
  });
});

describe("pasted ChatGPT receipt JSON", () => {
  it("accepts a fenced JSON object and normalizes it into an unverified draft", () => {
    const content = `\`\`\`json
      {
        "merchantName": "Markt",
        "purchasedDate": "2026-09-19",
        "currency": "EUR",
        "taxTotalMinor": 19,
        "totalMinor": 119,
        "items": [{
          "lineNumber": 1,
          "rawName": "MILCH 1,5L",
          "normalizedName": "Milch",
          "quantity": "1,5",
          "lineTotalMinor": 100,
          "uncertainties": []
        }]
      }
    \`\`\``;

    const { draft, rawResult } = parsePastedReceiptJson(content);

    expect(rawResult).toMatchObject({ merchantName: "Markt", totalMinor: 119 });
    expect(draft).toMatchObject({ merchantName: "Markt", currency: "EUR", totalMinor: 119 });
    expect(draft.items[0]).toMatchObject({
      rawName: "MILCH 1,5L",
      quantity: "1.5",
      lineTotalMinor: 100,
      verified: false,
      source: "extracted"
    });
    expect(draft.items[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects decimal money values instead of silently rounding them", () => {
    const content = JSON.stringify({ currency: "EUR", totalMinor: 4.99, items: [] });
    expect(() => parsePastedReceiptJson(content)).toThrow(ReceiptImportError);
  });

  it("rejects surrounding prose so that only explicit JSON is imported", () => {
    const content = `Hier ist das Ergebnis: ${JSON.stringify({ currency: "EUR", items: [] })}`;
    expect(() => parsePastedReceiptJson(content)).toThrow("kein gültiges JSON");
  });

  it("normalizes ChatGPT tax rows and human-readable source evidence without double counting", () => {
    const content = JSON.stringify({
      merchantName: "Walmart",
      currency: "CAD",
      taxTotalMinor: 129,
      totalMinor: 1806,
      items: [
        { rawName: "ITEM A", normalizedName: "Item A", quantity: "1", lineTotalMinor: 1677, uncertainties: [] }
      ],
      adjustments: [
        { type: "tax", name: "GST", rate: "5.0000", amountMinor: 59 },
        { type: "tax", name: "PST", rate: "7.0000", amountMinor: 70 }
      ],
      uncertaintyFields: ["items[0].sku"],
      fieldSources: { merchantName: "Walmart logo", totalMinor: "TOTAL $18.06" }
    });

    const { draft, rawResult } = parsePastedReceiptJson(content);

    expect(rawResult).toMatchObject({ fieldSources: { merchantName: "Walmart logo" } });
    expect(draft.adjustments).toEqual([]);
    expect(draft.taxTotalMinor).toBe(129);
    expect(draft.fieldSources).toMatchObject({ merchantName: "extracted", "items[0].sku": "uncertain" });
    expect(calculateReceipt(draft)).toMatchObject({ calculatedTotalMinor: 1806, isBalanced: true });
  });

  it("repairs common Markdown escapes added while copying JSON", () => {
    const content = String.raw`{"currency":"EUR","items":\[\],"adjustments":\[\]}`;
    expect(parsePastedReceiptJson(content).draft.items).toEqual([]);
  });

  it("accepts a numeric adjustment sourceLine and preserves it as text", () => {
    const content = JSON.stringify({
      currency: "CAD",
      items: [],
      adjustments: [{ type: "fee", label: "Container fee", amountMinor: 7, sourceLine: 17 }]
    });

    expect(parsePastedReceiptJson(content).draft.adjustments[0]?.sourceLine).toBe("17");
  });

  it("repairs HTML spaces and escaped underscores introduced while copying", () => {
    const content = String.raw`{
      &#x20;"merchantName": "Walmart",
      &#x20;"currency": "CAD",
      &#x20;"items": [],
      &#x20;"adjustments": [],
      &#x20;"uncertaintyFields": ["timezone"],
      &#x20;"fieldSources": { "timezone": "not\_visible" }
    }`;

    const { draft } = parsePastedReceiptJson(content);

    expect(draft.merchantName).toBe("Walmart");
    expect(draft.fieldSources.timezone).toBe("uncertain");
  });

  it("normalizes an overlong item uncertainty without rejecting the receipt", () => {
    const longUncertainty = `The printed product identifier cannot be read with certainty because ${"the image is blurry ".repeat(8)}`;
    const content = JSON.stringify({
      currency: "EUR",
      items: [{
        normalizedName: "Artikel",
        uncertainties: [longUncertainty, " quantity ", "quantity", ""]
      }]
    });

    const { draft, rawResult } = parsePastedReceiptJson(content);

    expect(draft.items[0]?.uncertainties).toHaveLength(2);
    expect(draft.items[0]?.uncertainties[0]).toHaveLength(100);
    expect(draft.items[0]?.uncertainties[0]).toMatch(/\.\.\.$/);
    expect(draft.items[0]?.uncertainties[1]).toBe("quantity");
    expect(draft.items[0]?.source).toBe("uncertain");
    expect((rawResult as { items: Array<{ uncertainties: string[] }> }).items[0]?.uncertainties[0]).toBe(longUncertainty);
  });
});
