import { isKnownCurrency, needsCurrencyReview } from "../shared/currency.js";
import type { ReceiptDraft } from "../shared/receipt.js";

const preferenceKey = "itemly-last-currency";

export function readLastCurrency(): string | null {
  try {
    const value = localStorage.getItem(preferenceKey);
    return isKnownCurrency(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLastCurrency(currency: string): void {
  if (!isKnownCurrency(currency)) return;
  try {
    localStorage.setItem(preferenceKey, currency);
  } catch {
    // Preference storage must never turn a successful receipt save into a failure.
  }
}

export function currencyToRemember(draft: ReceiptDraft): string | null {
  return needsCurrencyReview(draft) ? null : draft.currency;
}
