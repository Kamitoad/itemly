import { describe, expect, it } from "vitest";
import {
  calculatePricePerReferenceUnit,
  calculateReceipt,
  createEmptyDraft,
  createEmptyItem,
  createUuid,
  receiptDraftSchema
} from "../shared/receipt.js";

describe("browser-compatible identifiers", () => {
  it("creates a valid UUID when randomUUID is unavailable on an HTTP origin", () => {
    const uuid = createUuid({
      getRandomValues(values) {
        values.set(Array.from({ length: 16 }, (_, index) => index));
        return values;
      }
    });

    expect(uuid).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
    expect(() => receiptDraftSchema.shape.items.element.shape.id.parse(uuid)).not.toThrow();
  });
});

describe("receipt schema and arithmetic", () => {
  it("preserves missing and uncertain fields instead of inventing values", () => {
    const item = createEmptyItem(1);
    item.normalizedName = "Large Eggs";
    item.rawName = "EGGS LG 12";
    item.lineTotalMinor = 499;
    item.uncertainties = ["quantity"];
    item.source = "uncertain";
    const draft = createEmptyDraft();
    draft.merchantName = null;
    draft.taxTotalMinor = null;
    draft.items = [item];
    draft.uncertaintyFields = ["items[0].quantity"];

    const parsed = receiptDraftSchema.parse(draft);
    expect(parsed.merchantName).toBeNull();
    expect(parsed.taxTotalMinor).toBeNull();
    expect(parsed.items[0].rawName).toBe("EGGS LG 12");
    expect(parsed.items[0].uncertainties).toEqual(["quantity"]);
  });

  it("reconciles item totals, discounts, fees and taxes in minor units", () => {
    const draft = createEmptyDraft();
    const first = createEmptyItem(1);
    const second = createEmptyItem(2);
    first.lineTotalMinor = 500;
    second.lineTotalMinor = 700;
    draft.items = [first, second];
    draft.adjustments = [
      { id: crypto.randomUUID(), type: "receipt_discount", label: "Coupon", amountMinor: 100, sourceLine: null },
      { id: crypto.randomUUID(), type: "deposit", label: "Deposit", amountMinor: 25, sourceLine: null }
    ];
    draft.taxTotalMinor = 108;
    draft.totalMinor = 1233;

    expect(calculateReceipt(draft)).toMatchObject({
      itemsTotalMinor: 1200,
      adjustmentsTotalMinor: -75,
      calculatedTotalMinor: 1233,
      differenceMinor: 0,
      isBalanced: true
    });
  });

  it("does not mark a receipt balanced while an item price is missing", () => {
    const draft = createEmptyDraft();
    draft.items = [createEmptyItem(1)];
    draft.totalMinor = 0;
    expect(calculateReceipt(draft)).toMatchObject({ isBalanced: false, missingPriceCount: 1 });
  });

  it("does not confirm an empty zero-value receipt", () => {
    const draft = createEmptyDraft();
    draft.totalMinor = 0;
    expect(calculateReceipt(draft).isBalanced).toBe(false);
  });

  it("includes a separately printed receipt discount without double counting its adjustment", () => {
    const draft = createEmptyDraft();
    const item = createEmptyItem(1);
    item.lineTotalMinor = 1_000;
    draft.items = [item];
    draft.receiptDiscountMinor = 200;
    draft.adjustments = [
      { id: crypto.randomUUID(), type: "receipt_discount", label: "Printed coupon", amountMinor: 200, sourceLine: null },
      { id: crypto.randomUUID(), type: "fee", label: "Bag fee", amountMinor: 25, sourceLine: null }
    ];
    draft.totalMinor = 825;
    expect(calculateReceipt(draft)).toMatchObject({ adjustmentsTotalMinor: -175, calculatedTotalMinor: 825, isBalanced: true });
  });

  it("calculates reference prices without binary floating-point quantities", () => {
    expect(calculatePricePerReferenceUnit(450, "0.75", 1)).toBe(600);
    expect(calculatePricePerReferenceUnit(350, "500", 1000)).toBe(700);
    expect(calculatePricePerReferenceUnit(350, null, 1000)).toBeNull();
  });
});
