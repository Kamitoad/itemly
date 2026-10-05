import type { ReceiptDraft } from "./receipt.js";

// ISO 4217's "no currency" code keeps existing string-based storage compatible.
export const UNKNOWN_CURRENCY = "XXX";

export function normalizeCurrency(value: unknown): string {
  if (typeof value !== "string") return UNKNOWN_CURRENCY;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : UNKNOWN_CURRENCY;
}

export function isKnownCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) && value !== UNKNOWN_CURRENCY;
}

function isCurrencyPath(path: string): boolean {
  return path === "currency" || path === "/currency";
}

export function needsCurrencyReview(draft: ReceiptDraft): boolean {
  return !isKnownCurrency(draft.currency)
    || ["uncertain", "not_visible"].includes(draft.fieldSources.currency ?? "")
    || draft.uncertaintyFields.some(isCurrencyPath);
}

export function applyCurrencyPreference(draft: ReceiptDraft, previous: string | null): ReceiptDraft {
  if (draft.currency !== UNKNOWN_CURRENCY || !isKnownCurrency(previous)) return draft;
  return {
    ...draft,
    currency: previous,
    fieldSources: { ...draft.fieldSources, currency: "uncertain" },
    uncertaintyFields: draft.uncertaintyFields.includes("currency") || draft.uncertaintyFields.length >= 100
      ? draft.uncertaintyFields : [...draft.uncertaintyFields, "currency"]
  };
}

export function confirmCurrency(draft: ReceiptDraft, currency: string): ReceiptDraft {
  return {
    ...draft,
    currency,
    fieldSources: { ...draft.fieldSources, currency: "user_entered" },
    uncertaintyFields: draft.uncertaintyFields.filter((path) => !isCurrencyPath(path))
  };
}
