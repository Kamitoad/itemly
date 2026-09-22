import type { ReceiptDatabase } from "./database.js";
import {
  calculateReceipt,
  receiptDraftSchema,
  type ReceiptDraft,
  type SaveReceiptRequest
} from "../shared/receipt.js";

export class ReceiptConflictError extends Error {}

function now(): string {
  return new Date().toISOString();
}

function normalizedMerchant(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-CA");
}

function validationState(draft: ReceiptDraft): "incomplete" | "discrepancy" | "balanced" {
  const calculation = calculateReceipt(draft);
  if (draft.totalMinor === null || calculation.missingPriceCount > 0) return "incomplete";
  return calculation.isBalanced ? "balanced" : "discrepancy";
}

export function storePendingExtraction(
  db: ReceiptDatabase,
  value: {
    id: string;
    model: string | null;
    provider: string;
    status: string;
    rawResult: unknown;
    uncertaintyFields: string[];
    validationErrors: unknown[];
  }
): void {
  db.prepare(`INSERT OR REPLACE INTO pending_extractions
    (id, schema_version, model_identifier, provider, status, raw_result, uncertainty_fields, validation_errors, extracted_at)
    VALUES (?, '1.0', ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      value.id,
      value.model,
      value.provider,
      value.status,
      JSON.stringify(value.rawResult),
      JSON.stringify(value.uncertaintyFields),
      JSON.stringify(value.validationErrors),
      now()
    );
}

export function findDuplicateByHash(db: ReceiptDatabase, sha256: string): string | null {
  const row = db.prepare("SELECT receipt_id FROM attachments WHERE sha256 = ? LIMIT 1").get(sha256) as
    | { receipt_id: string }
    | undefined;
  return row?.receipt_id ?? null;
}

export function saveReceipt(db: ReceiptDatabase, request: SaveReceiptRequest): string {
  const existing = db.prepare("SELECT id FROM receipts WHERE client_mutation_id = ?").get(request.clientMutationId) as
    | { id: string }
    | undefined;
  if (existing) return existing.id;

  const draft = receiptDraftSchema.parse(request.draft);
  const calculation = calculateReceipt(draft);
  if (request.status === "confirmed" && !calculation.isBalanced) {
    throw new ReceiptConflictError("Ein nicht ausgeglichener Bon kann nur als Entwurf gespeichert werden.");
  }

  const receiptId = crypto.randomUUID();
  const createdAt = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    let merchantId: string | null = null;
    if (draft.merchantName) {
      const normalized = normalizedMerchant(draft.merchantName);
      const merchant = db.prepare("SELECT id FROM merchants WHERE normalized_name = ?").get(normalized) as
        | { id: string }
        | undefined;
      merchantId = merchant?.id ?? crypto.randomUUID();
      if (!merchant) {
        db.prepare("INSERT INTO merchants(id, name, normalized_name) VALUES (?, ?, ?)")
          .run(merchantId, draft.merchantName, normalized);
      }
    }

    db.prepare(`INSERT INTO receipts (
      id, client_mutation_id, merchant_id, merchant_name_snapshot, store_name_snapshot, address_text,
      receipt_number, transaction_id, purchased_date, purchased_time, timezone, currency,
      subtotal_minor, discount_total_minor, tax_total_minor, total_minor, item_count, position_count,
      status, validation_state, scanned_at, confirmed_at, notes, schema_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        receiptId,
        request.clientMutationId,
        merchantId,
        draft.merchantName,
        draft.storeName,
        draft.addressText,
        draft.receiptNumber,
        draft.transactionId,
        draft.purchasedDate,
        draft.purchasedTime,
        draft.timezone,
        draft.currency,
        draft.subtotalMinor,
        draft.receiptDiscountMinor,
        draft.taxTotalMinor,
        draft.totalMinor,
        calculation.itemCount === null ? null : String(calculation.itemCount),
        calculation.positionCount,
        request.status,
        validationState(draft),
        createdAt,
        request.status === "confirmed" ? createdAt : null,
        draft.notes,
        draft.schemaVersion
      );

    const itemStatement = db.prepare(`INSERT INTO receipt_items (
      id, receipt_id, line_number, raw_name, normalized_name, description, brand, sku, plu,
      quantity, quantity_unit, package_size, package_unit, unit_price_minor, line_total_minor,
      discount_minor, category_snapshot, tax_code, tax_minor, notes, verified, source,
      uncertainty_fields, excluded
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const item of draft.items) {
      itemStatement.run(
        item.id,
        receiptId,
        item.lineNumber,
        item.rawName,
        item.normalizedName,
        item.description,
        item.brand,
        item.sku,
        item.plu,
        item.quantity,
        item.quantityUnit,
        item.packageSize,
        item.packageUnit,
        item.unitPriceMinor,
        item.lineTotalMinor,
        item.discountMinor,
        item.category,
        item.taxCode,
        item.taxMinor,
        item.notes,
        item.verified ? 1 : 0,
        item.source,
        JSON.stringify(item.uncertainties),
        item.excluded ? 1 : 0
      );
    }

    const adjustmentStatement = db.prepare(`INSERT INTO adjustments
      (id, receipt_id, type, label, amount_minor, source_line) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const adjustment of draft.adjustments) {
      adjustmentStatement.run(
        adjustment.id,
        receiptId,
        adjustment.type,
        adjustment.label,
        adjustment.amountMinor,
        adjustment.sourceLine
      );
    }

    if (draft.paymentMethod || draft.cardBrand || draft.displayedLast4) {
      db.prepare(`INSERT INTO payments
        (id, receipt_id, method_type, amount_minor, currency, displayed_last4, card_brand)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(
          crypto.randomUUID(),
          receiptId,
          draft.paymentMethod,
          draft.totalMinor,
          draft.currency,
          draft.displayedLast4,
          draft.cardBrand
        );
    }

    if (request.attachment) {
      db.prepare(`INSERT INTO attachments
        (id, receipt_id, file_type, storage_provider, storage_reference, original_name, mime_type, sha256, created_at)
        VALUES (?, ?, 'receipt_image', 'local', ?, ?, ?, ?, ?)`)
        .run(
          crypto.randomUUID(),
          receiptId,
          request.attachment.token,
          request.attachment.originalName,
          request.attachment.mimeType,
          request.attachment.sha256,
          createdAt
        );
    }

    if (request.extractionId) {
      db.prepare(`INSERT INTO extractions
        (id, receipt_id, schema_version, model_identifier, provider, status, raw_result,
         uncertainty_fields, validation_errors, extracted_at)
        SELECT id, ?, schema_version, model_identifier, provider, status, raw_result,
         uncertainty_fields, validation_errors, extracted_at
        FROM pending_extractions WHERE id = ?`)
        .run(receiptId, request.extractionId);
      db.prepare("DELETE FROM pending_extractions WHERE id = ?").run(request.extractionId);
    }

    db.prepare(`INSERT INTO audit_events
      (id, receipt_id, entity_type, entity_id, field_path, old_value, new_value, source, changed_at)
      VALUES (?, ?, 'receipt', ?, '$', NULL, ?, 'user', ?)`)
      .run(crypto.randomUUID(), receiptId, receiptId, JSON.stringify(draft), createdAt);

    db.exec("COMMIT");
    return receiptId;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

type Row = Record<string, unknown>;

function mapStoredDraft(receipt: Row, items: Row[], adjustments: Row[], payment: Row | undefined): ReceiptDraft {
  return receiptDraftSchema.parse({
    schemaVersion: receipt.schema_version,
    merchantName: receipt.merchant_name_snapshot,
    storeName: receipt.store_name_snapshot,
    addressText: receipt.address_text,
    purchasedDate: receipt.purchased_date,
    purchasedTime: receipt.purchased_time,
    timezone: receipt.timezone,
    receiptNumber: receipt.receipt_number,
    transactionId: receipt.transaction_id,
    currency: receipt.currency,
    paymentMethod: payment?.method_type ?? null,
    cardBrand: payment?.card_brand ?? null,
    displayedLast4: payment?.displayed_last4 ?? null,
    subtotalMinor: receipt.subtotal_minor,
    receiptDiscountMinor: receipt.discount_total_minor,
    taxTotalMinor: receipt.tax_total_minor,
    totalMinor: receipt.total_minor,
    notes: receipt.notes,
    items: items.map((item) => ({
      id: item.id,
      lineNumber: item.line_number,
      rawName: item.raw_name,
      normalizedName: item.normalized_name,
      description: item.description,
      brand: item.brand,
      sku: item.sku,
      plu: item.plu,
      quantity: item.quantity,
      quantityUnit: item.quantity_unit,
      packageSize: item.package_size,
      packageUnit: item.package_unit,
      unitPriceMinor: item.unit_price_minor,
      lineTotalMinor: item.line_total_minor,
      discountMinor: item.discount_minor,
      category: item.category_snapshot,
      taxCode: item.tax_code,
      taxMinor: item.tax_minor,
      notes: item.notes,
      verified: Boolean(item.verified),
      uncertainties: JSON.parse(String(item.uncertainty_fields)),
      source: item.source,
      excluded: Boolean(item.excluded)
    })),
    adjustments: adjustments.map((adjustment) => ({
      id: adjustment.id,
      type: adjustment.type,
      label: adjustment.label,
      amountMinor: adjustment.amount_minor,
      sourceLine: adjustment.source_line
    })),
    fieldSources: {},
    uncertaintyFields: []
  });
}

export function getReceipt(db: ReceiptDatabase, id: string) {
  const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(id) as Row | undefined;
  if (!receipt) return null;
  const items = db.prepare("SELECT * FROM receipt_items WHERE receipt_id = ? ORDER BY line_number, rowid").all(id) as Row[];
  const adjustments = db.prepare("SELECT * FROM adjustments WHERE receipt_id = ? ORDER BY rowid").all(id) as Row[];
  const payment = db.prepare("SELECT * FROM payments WHERE receipt_id = ? LIMIT 1").get(id) as Row | undefined;
  const attachment = db.prepare("SELECT * FROM attachments WHERE receipt_id = ? ORDER BY created_at LIMIT 1").get(id) as Row | undefined;
  const extractions = db.prepare("SELECT * FROM extractions WHERE receipt_id = ? ORDER BY extracted_at").all(id) as Row[];
  const auditEvents = db.prepare("SELECT * FROM audit_events WHERE receipt_id = ? ORDER BY changed_at").all(id) as Row[];
  const draft = mapStoredDraft(receipt, items, adjustments, payment);
  return {
    id,
    status: receipt.status,
    validationState: receipt.validation_state,
    scannedAt: receipt.scanned_at,
    confirmedAt: receipt.confirmed_at,
    draft,
    calculations: calculateReceipt(draft),
    attachment: attachment
      ? {
          token: attachment.storage_reference,
          mimeType: attachment.mime_type,
          originalName: attachment.original_name,
          sha256: attachment.sha256,
          imageUrl: `/uploads/${attachment.storage_reference}`
        }
      : null,
    extractions: extractions.map((entry) => ({
      id: entry.id,
      schemaVersion: entry.schema_version,
      provider: entry.provider,
      modelIdentifier: entry.model_identifier,
      status: entry.status,
      rawResult: entry.raw_result ? JSON.parse(String(entry.raw_result)) : null,
      uncertaintyFields: JSON.parse(String(entry.uncertainty_fields)),
      validationErrors: JSON.parse(String(entry.validation_errors)),
      extractedAt: entry.extracted_at
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      entityType: event.entity_type,
      entityId: event.entity_id,
      fieldPath: event.field_path,
      oldValue: event.old_value ? JSON.parse(String(event.old_value)) : null,
      newValue: event.new_value ? JSON.parse(String(event.new_value)) : null,
      source: event.source,
      changedAt: event.changed_at
    }))
  };
}

export function listReceipts(db: ReceiptDatabase, search = "") {
  const pattern = `%${search.trim()}%`;
  const rows = db.prepare(`SELECT DISTINCT r.id, r.merchant_name_snapshot, r.purchased_date, r.purchased_time, r.scanned_at,
      r.total_minor, r.currency, r.position_count, r.status, r.validation_state
    FROM receipts r
    LEFT JOIN receipt_items i ON i.receipt_id = r.id
    WHERE (? = '' OR r.merchant_name_snapshot LIKE ? OR i.normalized_name LIKE ? OR i.category_snapshot LIKE ?)
    ORDER BY COALESCE(r.purchased_date, substr(r.scanned_at, 1, 10)) DESC,
      CASE
        WHEN r.purchased_date IS NOT NULL THEN COALESCE(r.purchased_time, '00:00:00')
        ELSE substr(r.scanned_at, 12, 8)
      END DESC,
      r.scanned_at DESC`)
    .all(search.trim(), pattern, pattern, pattern) as Row[];
  return rows.map((row) => ({
    id: row.id,
    merchantName: row.merchant_name_snapshot,
    purchasedDate: row.purchased_date,
    purchasedTime: row.purchased_time,
    scannedAt: row.scanned_at,
    totalMinor: row.total_minor,
    currency: row.currency,
    positionCount: row.position_count,
    status: row.status,
    validationState: row.validation_state
  }));
}
