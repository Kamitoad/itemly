import { createEmptyDraft, createEmptyItem, type ReceiptDraft } from "../shared/receipt.js";

const currencyError = "Bitte wähle oder bestätige die Währung. Der Bon kann bereits als Entwurf gespeichert werden.";
const balanceError = "Ein nicht ausgeglichener Bon kann nur als Entwurf gespeichert werden.";

// Independent expected outcomes characterize both adapters before consolidation.
export const receiptValidationCases: {
  name: string;
  change: (draft: ReceiptDraft) => void;
  state: "incomplete" | "discrepancy" | "balanced";
  error: string | null;
}[] = [
  { name: "balanced unverified item", change: () => undefined, state: "balanced", error: null },
  { name: "missing printed total", change: (draft) => { draft.totalMinor = null; }, state: "incomplete", error: balanceError },
  { name: "missing line price", change: (draft) => { draft.items[0].lineTotalMinor = null; }, state: "incomplete", error: balanceError },
  { name: "different printed total", change: (draft) => { draft.totalMinor = 101; }, state: "discrepancy", error: balanceError },
  { name: "unknown currency takes priority over imbalance", change: (draft) => { draft.currency = "XXX"; draft.totalMinor = 101; }, state: "incomplete", error: currencyError },
  { name: "suggested currency", change: (draft) => { draft.fieldSources.currency = "uncertain"; }, state: "incomplete", error: currencyError },
  { name: "currency uncertainty path", change: (draft) => { draft.uncertaintyFields = ["/currency"]; }, state: "incomplete", error: currencyError },
  { name: "empty receipt with zero total", change: (draft) => { draft.items = []; draft.totalMinor = 0; }, state: "discrepancy", error: balanceError },
  { name: "excluded position without price", change: (draft) => { draft.items.push({ ...createEmptyItem(2), excluded: true }); }, state: "balanced", error: null },
  { name: "explicit zero price", change: (draft) => { draft.items[0].lineTotalMinor = 0; draft.totalMinor = 0; }, state: "balanced", error: null }
];

export function validationDraft(change: (draft: ReceiptDraft) => void): ReceiptDraft {
  const draft = createEmptyDraft("CAD");
  draft.merchantName = "Validation shop";
  draft.items = [{ ...createEmptyItem(1), rawName: "RAW ITEM", normalizedName: "Item", quantity: "1.000001", lineTotalMinor: 100, verified: false }];
  draft.totalMinor = 100;
  change(draft);
  return draft;
}
