import type { AttachmentToken, ReceiptCalculations, ReceiptDraft } from "./receipt.js";

// Public UI-facing contracts; adapter-specific rows, evidence and backups stay separate.
export type ReceiptValidationState = "incomplete" | "discrepancy" | "balanced";

export interface AppConfig {
  extractionMode: "manual" | "external";
  provider: string;
  model: string | null;
  disclosure: string;
}

export interface HistoryEntry {
  id: string;
  merchantName: string | null;
  purchasedDate: string | null;
  purchasedTime: string | null;
  scannedAt: string;
  totalMinor: number | null;
  currency: string;
  positionCount: number;
  status: "draft" | "confirmed";
  validationState: ReceiptValidationState;
}

export interface StoredReceipt {
  id: string;
  revision: number;
  deletedAt: string | null;
  status: "draft" | "confirmed";
  validationState: ReceiptValidationState;
  scannedAt: string;
  confirmedAt: string | null;
  draft: ReceiptDraft;
  attachment: AttachmentToken | null;
  // Read-time warning only; never persisted or included in the backup schema.
  // Web image requests can fail later and are handled by the image component.
  attachmentWarning?: "unavailable";
  calculations: ReceiptCalculations;
}
