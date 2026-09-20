import { z } from "zod";

export const provenanceSchema = z.enum([
  "extracted",
  "derived",
  "user_entered",
  "uncertain",
  "not_visible",
  "not_applicable"
]);

const nullableText = z.string().trim().max(500).nullable();
const nullableMoney = z.number().int().safe().nullable();

export const receiptItemSchema = z.object({
  id: z.string().uuid(),
  lineNumber: z.number().int().positive().nullable(),
  rawName: nullableText,
  normalizedName: z.string().trim().max(200),
  description: nullableText,
  brand: nullableText,
  sku: nullableText,
  plu: nullableText,
  quantity: z.string().regex(/^\d+(?:\.\d{1,6})?$/).nullable(),
  quantityUnit: nullableText,
  packageSize: z.string().regex(/^\d+(?:\.\d{1,6})?$/).nullable(),
  packageUnit: nullableText,
  unitPriceMinor: nullableMoney,
  lineTotalMinor: nullableMoney,
  discountMinor: nullableMoney,
  category: nullableText,
  taxCode: nullableText,
  taxMinor: nullableMoney,
  notes: nullableText,
  verified: z.boolean(),
  uncertainties: z.array(z.string().max(100)).max(20),
  source: provenanceSchema,
  excluded: z.boolean()
});

export const adjustmentSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["receipt_discount", "deposit", "fee", "other"]),
  label: z.string().trim().min(1).max(120),
  amountMinor: z.number().int().safe(),
  sourceLine: nullableText
});

export const receiptDraftSchema = z.object({
  schemaVersion: z.literal("1.0"),
  merchantName: nullableText,
  storeName: nullableText,
  addressText: nullableText,
  purchasedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  purchasedTime: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/).nullable(),
  timezone: nullableText,
  receiptNumber: nullableText,
  transactionId: nullableText,
  currency: z.string().regex(/^[A-Z]{3}$/),
  paymentMethod: nullableText,
  cardBrand: nullableText,
  displayedLast4: z.string().regex(/^\d{4}$/).nullable(),
  subtotalMinor: nullableMoney,
  receiptDiscountMinor: nullableMoney,
  taxTotalMinor: nullableMoney,
  totalMinor: nullableMoney,
  notes: z.string().max(5000),
  items: z.array(receiptItemSchema).max(500),
  adjustments: z.array(adjustmentSchema).max(100),
  fieldSources: z.record(z.string(), provenanceSchema),
  uncertaintyFields: z.array(z.string().max(200)).max(100)
});

export const attachmentTokenSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}\.[a-z0-9]+$/),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  originalName: z.string().max(255),
  imageUrl: z.string()
});

export const extractionResponseSchema = z.object({
  draft: receiptDraftSchema,
  attachment: attachmentTokenSchema.nullable(),
  extraction: z.object({
    id: z.string().uuid(),
    provider: z.string(),
    model: z.string().nullable(),
    status: z.enum(["completed", "manual", "failed"]),
    disclosure: z.string(),
    duplicateReceiptId: z.string().uuid().nullable()
  })
});

export const saveReceiptSchema = z.object({
  clientMutationId: z.string().uuid(),
  status: z.enum(["draft", "confirmed"]),
  draft: receiptDraftSchema,
  attachment: attachmentTokenSchema.nullable(),
  extractionId: z.string().uuid().nullable()
});

export type Provenance = z.infer<typeof provenanceSchema>;
export type ReceiptItem = z.infer<typeof receiptItemSchema>;
export type ReceiptDraft = z.infer<typeof receiptDraftSchema>;
export type AttachmentToken = z.infer<typeof attachmentTokenSchema>;
export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;
export type SaveReceiptRequest = z.infer<typeof saveReceiptSchema>;

export interface ReceiptCalculations {
  positionCount: number;
  itemCount: number | null;
  itemsTotalMinor: number;
  adjustmentsTotalMinor: number;
  calculatedTotalMinor: number;
  differenceMinor: number | null;
  isBalanced: boolean;
  missingPriceCount: number;
}

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
};

export function createUuid(cryptoApi: CryptoLike | undefined = globalThis.crypto as CryptoLike | undefined): string {
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function calculateReceipt(draft: ReceiptDraft): ReceiptCalculations {
  const included = draft.items.filter((item) => !item.excluded);
  const knownLines = included.filter((item) => item.lineTotalMinor !== null);
  const itemsTotalMinor = knownLines.reduce((sum, item) => sum + (item.lineTotalMinor ?? 0), 0);
  const separateAdjustments = draft.adjustments.reduce((sum, adjustment) => {
    if (adjustment.type === "receipt_discount" && draft.receiptDiscountMinor !== null) return sum;
    return sum + (adjustment.type === "receipt_discount" ? -Math.abs(adjustment.amountMinor) : adjustment.amountMinor);
  }, 0);
  const adjustmentsTotalMinor = separateAdjustments - Math.abs(draft.receiptDiscountMinor ?? 0);
  const calculatedTotalMinor = itemsTotalMinor + adjustmentsTotalMinor + (draft.taxTotalMinor ?? 0);
  const differenceMinor = draft.totalMinor === null ? null : draft.totalMinor - calculatedTotalMinor;
  const quantities = included.map((item) => item.quantity).filter((value): value is string => value !== null);
  const itemCount = quantities.length === included.length
    ? quantities.reduce((sum, quantity) => sum + Number(quantity), 0)
    : null;

  return {
    positionCount: included.length,
    itemCount,
    itemsTotalMinor,
    adjustmentsTotalMinor,
    calculatedTotalMinor,
    differenceMinor,
    isBalanced: differenceMinor === 0 && included.length > 0 && knownLines.length === included.length && draft.totalMinor !== null,
    missingPriceCount: included.length - knownLines.length
  };
}

export function createEmptyDraft(currency = "CAD"): ReceiptDraft {
  return {
    schemaVersion: "1.0",
    merchantName: null,
    storeName: null,
    addressText: null,
    purchasedDate: null,
    purchasedTime: null,
    timezone: null,
    receiptNumber: null,
    transactionId: null,
    currency,
    paymentMethod: null,
    cardBrand: null,
    displayedLast4: null,
    subtotalMinor: null,
    receiptDiscountMinor: null,
    taxTotalMinor: null,
    totalMinor: null,
    notes: "",
    items: [],
    adjustments: [],
    fieldSources: {},
    uncertaintyFields: []
  };
}

export function createEmptyItem(lineNumber: number): ReceiptItem {
  return {
    id: createUuid(),
    lineNumber,
    rawName: null,
    normalizedName: "",
    description: null,
    brand: null,
    sku: null,
    plu: null,
    quantity: "1",
    quantityUnit: "Stück",
    packageSize: null,
    packageUnit: null,
    unitPriceMinor: null,
    lineTotalMinor: null,
    discountMinor: null,
    category: null,
    taxCode: null,
    taxMinor: null,
    notes: null,
    verified: false,
    uncertainties: [],
    source: "user_entered",
    excluded: false
  };
}

export function formatMoney(minor: number | null, currency: string, locale = "de-DE"): string {
  if (minor === null) return "Unbekannt";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
}

export function calculatePricePerReferenceUnit(
  lineTotalMinor: number | null,
  quantity: string | null,
  unitsPerReferenceUnit = 1
): number | null {
  if (lineTotalMinor === null || quantity === null || unitsPerReferenceUnit <= 0) return null;
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(quantity);
  if (!match) return null;
  const decimals = match[2]?.length ?? 0;
  const denominator = Number(match[1]) * 10 ** decimals + Number(match[2] ?? 0);
  if (denominator === 0) return null;
  return Math.round((lineTotalMinor * unitsPerReferenceUnit * 10 ** decimals) / denominator);
}
