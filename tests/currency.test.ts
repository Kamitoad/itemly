import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCurrencyPreference, confirmCurrency, needsCurrencyReview, UNKNOWN_CURRENCY } from "../shared/currency.js";
import { createEmptyDraft, formatMoney, receiptDraftSchema } from "../shared/receipt.js";
import { currencyToRemember, readLastCurrency, writeLastCurrency } from "../src/currency-preference.js";

afterEach(() => vi.unstubAllGlobals());

describe("currency review and local preference", () => {
  it("leaves the first receipt open instead of inventing a currency", () => {
    const draft = applyCurrencyPreference(createEmptyDraft(), null);
    expect(draft.currency).toBe(UNKNOWN_CURRENCY);
    expect(needsCurrencyReview(draft)).toBe(true);
    expect(currencyToRemember(draft)).toBeNull();
    expect(formatMoney(525, draft.currency)).toBe("5,25");
  });

  it("suggests the previous currency without changing amounts or marking it reviewed", () => {
    const draft = createEmptyDraft();
    draft.totalMinor = 525;
    const suggested = applyCurrencyPreference(draft, "CAD");
    expect(suggested).toMatchObject({ currency: "CAD", totalMinor: 525, fieldSources: { currency: "uncertain" } });
    expect(needsCurrencyReview(suggested)).toBe(true);
    expect(currencyToRemember(suggested)).toBeNull();
    expect(draft.currency).toBe(UNKNOWN_CURRENCY);
  });

  it("never overrides an extracted currency with the previous one", () => {
    const draft = createEmptyDraft("USD");
    expect(applyCurrencyPreference(draft, "CAD")).toBe(draft);
    expect(currencyToRemember(draft)).toBe("USD");
    expect(applyCurrencyPreference(createEmptyDraft(), "invalid").currency).toBe(UNKNOWN_CURRENCY);
  });

  it("clears only currency warnings after explicit confirmation", () => {
    const draft = applyCurrencyPreference(createEmptyDraft(), "CAD");
    draft.uncertaintyFields = ["currency", "/currency", "items[0].sku"];
    const reviewed = confirmCurrency(draft, "CAD");
    expect(needsCurrencyReview(reviewed)).toBe(false);
    expect(reviewed.fieldSources.currency).toBe("user_entered");
    expect(reviewed.uncertaintyFields).toEqual(["items[0].sku"]);
    expect(currencyToRemember(reviewed)).toBe("CAD");
    expect(needsCurrencyReview(confirmCurrency(reviewed, UNKNOWN_CURRENCY))).toBe(true);
  });

  it("keeps the uncertainty limit intact when adding a currency suggestion", () => {
    const draft = createEmptyDraft();
    draft.uncertaintyFields = Array.from({ length: 100 }, (_, index) => `items[${index}].sku`);
    const suggested = applyCurrencyPreference(draft, "EUR");
    expect(() => receiptDraftSchema.parse(suggested)).not.toThrow();
    expect(needsCurrencyReview(suggested)).toBe(true);
  });

  it("persists the last reviewed currency for subsequent sessions", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); }
    });
    expect(readLastCurrency()).toBeNull();
    writeLastCurrency("CAD");
    expect(readLastCurrency()).toBe("CAD");
    writeLastCurrency(UNKNOWN_CURRENCY);
    expect(readLastCurrency()).toBe("CAD");
    writeLastCurrency("EUR");
    expect(applyCurrencyPreference(createEmptyDraft(), readLastCurrency()).currency).toBe("EUR");
  });

  it("ignores corrupt preferences and tolerates unavailable local storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => "null" });
    expect(readLastCurrency()).toBeNull();
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("Storage blocked"); },
      setItem: () => { throw new Error("Storage full"); }
    });
    expect(readLastCurrency()).toBeNull();
    expect(() => writeLastCurrency("CAD")).not.toThrow();
  });
});
