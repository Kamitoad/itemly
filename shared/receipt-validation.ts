import { calculateReceipt, type ReceiptDraft, type SaveReceiptRequest } from "./receipt.js";
import { needsCurrencyReview } from "./currency.js";
import type { ReceiptValidationState } from "./receipt-api.js";

// These rules operate on validated drafts only. Adapters retain their own
// schema parsing, conflict/error types, retry ordering, and transaction boundaries.
export function receiptValidationState(draft: ReceiptDraft): ReceiptValidationState {
  const calculation = calculateReceipt(draft);
  if (draft.totalMinor === null || calculation.missingPriceCount > 0 || needsCurrencyReview(draft)) return "incomplete";
  return calculation.isBalanced ? "balanced" : "discrepancy";
}

export function confirmedReceiptError(status: SaveReceiptRequest["status"], draft: ReceiptDraft): string | null {
  if (status !== "confirmed") return null;
  if (needsCurrencyReview(draft)) {
    return "Bitte wähle oder bestätige die Währung. Der Bon kann bereits als Entwurf gespeichert werden.";
  }
  if (!calculateReceipt(draft).isBalanced) {
    return "Ein nicht ausgeglichener Bon kann nur als Entwurf gespeichert werden.";
  }
  return null;
}
