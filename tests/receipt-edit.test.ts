import { describe, expect, it } from "vitest";
import { createEmptyDraft, createEmptyItem } from "../shared/receipt.js";
import { replaceReceiptItems } from "../shared/receipt-edit.js";

describe("item edits and provenance", () => {
  it("moves warning paths with stable item IDs instead of leaving stale array indices", () => {
    const draft = createEmptyDraft("CAD");
    draft.items = [createEmptyItem(1), createEmptyItem(2)];
    draft.fieldSources = { "items[0].sku": "uncertain", "items.1.quantity": "uncertain", "/items/1/brand": "derived", currency: "extracted" };
    draft.uncertaintyFields = ["items[0].sku", "items.1.quantity", "/items/1/sku", "currency"];
    const removed = replaceReceiptItems(draft, [draft.items[1]]);
    expect(removed.fieldSources).toEqual({ "items.0.quantity": "uncertain", "/items/0/brand": "derived", currency: "extracted" });
    expect(removed.uncertaintyFields).toEqual(["items.0.quantity", "/items/0/sku", "currency"]);
    const restored = replaceReceiptItems(removed, draft.items, draft);
    expect(restored.fieldSources).toEqual(draft.fieldSources);
    expect(new Set(restored.uncertaintyFields)).toEqual(new Set(draft.uncertaintyFields));
  });
});
