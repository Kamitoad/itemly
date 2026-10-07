import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DatabaseSync } from "node:sqlite";
import { createEmptyDraft, createEmptyItem, type SaveReceiptRequest } from "../shared/receipt.js";
import { applyCurrencyPreference, confirmCurrency, UNKNOWN_CURRENCY } from "../shared/currency.js";
import { openDatabase } from "../server/database.js";
import { createBackupPayload, restoreBackupPayload } from "../server/backup.js";
import {
  findDuplicateByHash,
  getReceipt,
  listReceipts,
  ReceiptConflictError,
  saveReceipt,
  updateReceipt,
  changeReceiptDeleted,
  storePendingExtraction
} from "../server/repository.js";

let directory: string;
let databasePath: string;
let db: DatabaseSync;

function validRequest(): SaveReceiptRequest {
  const draft = createEmptyDraft("CAD");
  const item = createEmptyItem(1);
  item.normalizedName = "Large Eggs";
  item.rawName = "EGGS LG 12";
  item.lineTotalMinor = 499;
  item.unitPriceMinor = 499;
  item.verified = true;
  draft.merchantName = "Walmart";
  draft.purchasedDate = "2026-09-18";
  draft.taxTotalMinor = 0;
  draft.totalMinor = 499;
  draft.items = [item];
  return {
    clientMutationId: crypto.randomUUID(),
    status: "confirmed",
    draft,
    attachment: {
      token: `${"a".repeat(64)}.jpg`,
      mimeType: "image/jpeg",
      sha256: "a".repeat(64),
      originalName: "receipt.jpg",
      imageUrl: `/uploads/${"a".repeat(64)}.jpg`
    },
    extractionId: null
  };
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "receipt-tracker-test-"));
  databasePath = join(directory, "receipts.sqlite");
  db = openDatabase(databasePath);
});

afterEach(() => {
  try { db.close(); } catch { /* already closed in restore test */ }
  rmSync(directory, { recursive: true, force: true });
});

describe("transactional receipt persistence", () => {
  it("updates receipt and item CRUD in place while preserving original evidence", () => {
    const request = validRequest();
    const extractionId = crypto.randomUUID();
    storePendingExtraction(db, { id: extractionId, provider: "chatgpt-paste", model: null, status: "completed", rawResult: { merchantName: "Walmart", totalMinor: 499 }, uncertaintyFields: [], validationErrors: [] });
    request.extractionId = extractionId;
    const id = saveReceipt(db, request);
    const original = getReceipt(db, id)!;
    const added = createEmptyItem(2);
    added.normalizedName = "Milk";
    added.lineTotalMinor = 100;
    const draft = { ...original.draft, merchantName: "Corrected shop", totalMinor: 599, items: [{ ...original.draft.items[0], category: "Food" }, added] };
    const update = { clientMutationId: crypto.randomUUID(), expectedRevision: 1, status: "confirmed" as const, draft };
    expect(updateReceipt(db, id, update)).toBe(id);
    expect(updateReceipt(db, id, update)).toBe(id);
    const changed = getReceipt(db, id)!;
    expect(changed).toMatchObject({ revision: 2, scannedAt: original.scannedAt, confirmedAt: original.confirmedAt, attachment: original.attachment });
    expect(changed.draft.items).toHaveLength(2);
    expect(changed.extractions).toEqual(original.extractions);
    expect(changed.auditEvents.at(-1)?.oldValue).toEqual(original.draft);
    expect(listReceipts(db)).toHaveLength(1);
    expect(listReceipts(db, "Milk")).toHaveLength(1);
    const remove = { ...update, clientMutationId: crypto.randomUUID(), expectedRevision: 2, draft: { ...draft, totalMinor: 100, items: [added] } };
    updateReceipt(db, id, remove);
    db.close(); db = openDatabase(databasePath);
    expect(getReceipt(db, id)?.draft.items.map((item) => item.id)).toEqual([added.id]);
    expect(listReceipts(db, "Eggs")).toHaveLength(0);
  });

  it("rejects stale or unbalanced updates and rolls back child conflicts", () => {
    const id = saveReceipt(db, validRequest());
    const original = getReceipt(db, id)!;
    const input = { clientMutationId: crypto.randomUUID(), expectedRevision: 1, status: "confirmed" as const, draft: { ...original.draft, totalMinor: 500 } };
    expect(() => updateReceipt(db, id, input)).toThrow("ausgeglichener");
    expect(getReceipt(db, id)?.revision).toBe(1);
    const otherId = saveReceipt(db, validRequest());
    const collidingItem = getReceipt(db, otherId)!.draft.items[0];
    expect(() => updateReceipt(db, id, { ...input, draft: { ...original.draft, merchantName: "Must roll back", items: [collidingItem] } })).toThrow();
    expect(getReceipt(db, id)?.draft).toEqual(original.draft);
    const good = { ...input, draft: original.draft };
    updateReceipt(db, id, good);
    expect(() => updateReceipt(db, id, { ...good, clientMutationId: crypto.randomUUID() })).toThrow("erneut");
    expect(() => updateReceipt(db, otherId, { ...good, expectedRevision: 1 })).toThrow("anderen Vorgang");
    const uncertain = { ...original.draft, currency: UNKNOWN_CURRENCY };
    expect(() => updateReceipt(db, id, { ...good, clientMutationId: crypto.randomUUID(), expectedRevision: 2, draft: uncertain })).toThrow("Währung");
    updateReceipt(db, id, { ...good, clientMutationId: crypto.randomUUID(), expectedRevision: 2, status: "draft", draft: uncertain });
    expect(getReceipt(db, id)).toMatchObject({ revision: 3, status: "draft", validationState: "incomplete", confirmedAt: null });
  });

  it("soft-deletes and restores receipts idempotently, retaining items and shared images", () => {
    const id = saveReceipt(db, validRequest());
    const second = saveReceipt(db, validRequest());
    const original = getReceipt(db, id)!;
    const mutation = { clientMutationId: crypto.randomUUID(), expectedRevision: 1 };
    changeReceiptDeleted(db, id, mutation, true);
    changeReceiptDeleted(db, id, mutation, true);
    expect(getReceipt(db, id)).toMatchObject({ revision: 2, draft: original.draft, attachment: original.attachment });
    expect(listReceipts(db).map((row) => row.id)).toEqual([second]);
    expect(listReceipts(db, "", true).map((row) => row.id)).toEqual([id]);
    expect(findDuplicateByHash(db, "a".repeat(64))).toBe(second);
    expect(() => updateReceipt(db, id, { clientMutationId: crypto.randomUUID(), expectedRevision: 2, status: "confirmed", draft: original.draft })).toThrow("gelöscht");
    expect(() => changeReceiptDeleted(db, id, { clientMutationId: crypto.randomUUID(), expectedRevision: 1 }, false)).toThrow("erneut");
    const restore = { clientMutationId: crypto.randomUUID(), expectedRevision: 2 };
    changeReceiptDeleted(db, id, restore, false);
    changeReceiptDeleted(db, id, restore, false);
    expect(getReceipt(db, id)).toMatchObject({ revision: 3, deletedAt: null, draft: original.draft });
    expect(listReceipts(db)).toHaveLength(2);
    expect(listReceipts(db, "", true)).toHaveLength(0);
  });

  it("keeps missing and suggested currencies in drafts until reviewed", () => {
    const request = validRequest();
    request.draft.currency = UNKNOWN_CURRENCY;
    expect(() => saveReceipt(db, request)).toThrow("Währung");
    request.status = "draft";
    const missingId = saveReceipt(db, request);
    expect(getReceipt(db, missingId)).toMatchObject({ validationState: "incomplete", draft: { currency: UNKNOWN_CURRENCY } });

    request.clientMutationId = crypto.randomUUID();
    request.draft = applyCurrencyPreference(request.draft, "EUR");
    request.draft.items = request.draft.items.map((item) => ({ ...item, id: crypto.randomUUID() }));
    const suggestedId = saveReceipt(db, request);
    db.close();
    db = openDatabase(databasePath);
    const stored = getReceipt(db, suggestedId)!;
    expect(stored.draft.fieldSources.currency).toBe("uncertain");
    expect(stored.draft.uncertaintyFields).toContain("currency");
    request.clientMutationId = crypto.randomUUID();
    request.status = "confirmed";
    request.draft = stored.draft;
    expect(() => saveReceipt(db, request)).toThrow("Währung");
    request.draft = confirmCurrency(request.draft, "EUR");
    request.draft.items = request.draft.items.map((item) => ({ ...item, id: crypto.randomUUID() }));
    expect(getReceipt(db, saveReceipt(db, request))?.draft.currency).toBe("EUR");
  });
  it("stores and reopens every item plus the original image reference", () => {
    const request = validRequest();
    const id = saveReceipt(db, request);
    const stored = getReceipt(db, id);
    expect(stored?.draft.merchantName).toBe("Walmart");
    expect(stored?.draft.items[0]).toMatchObject({ rawName: "EGGS LG 12", normalizedName: "Large Eggs" });
    expect(stored?.attachment?.sha256).toBe("a".repeat(64));
    expect(listReceipts(db, "Eggs")).toHaveLength(1);
  });

  it("makes retried saves idempotent", () => {
    const request = validRequest();
    const first = saveReceipt(db, request);
    const second = saveReceipt(db, request);
    expect(second).toBe(first);
    expect(listReceipts(db)).toHaveLength(1);
  });

  it("lists receipts in reverse chronological purchase order", () => {
    const older = validRequest();
    older.clientMutationId = crypto.randomUUID();
    older.draft.purchasedDate = "2026-08-10";
    const newer = validRequest();
    newer.clientMutationId = crypto.randomUUID();
    newer.draft.purchasedDate = "2026-09-20";

    const olderId = saveReceipt(db, older);
    const newerId = saveReceipt(db, newer);

    expect(listReceipts(db).map((entry) => entry.id)).toEqual([newerId, olderId]);
  });

  it("lists purchases on the same day by latest purchase time first", () => {
    const morning = validRequest();
    morning.clientMutationId = crypto.randomUUID();
    morning.draft.purchasedTime = "08:15";
    const evening = validRequest();
    evening.clientMutationId = crypto.randomUUID();
    evening.draft.purchasedTime = "19:45";

    const morningId = saveReceipt(db, morning);
    const eveningId = saveReceipt(db, evening);

    expect(listReceipts(db).map((entry) => entry.id)).toEqual([eveningId, morningId]);
    expect(listReceipts(db)[0]?.purchasedTime).toBe("19:45");
  });

  it("rolls back a confirmed receipt with unresolved arithmetic", () => {
    const request = validRequest();
    request.draft.totalMinor = 599;
    expect(() => saveReceipt(db, request)).toThrow(ReceiptConflictError);
    expect(listReceipts(db)).toHaveLength(0);
  });

  it("detects matching image hashes without deleting either record", () => {
    const id = saveReceipt(db, validRequest());
    expect(findDuplicateByHash(db, "a".repeat(64))).toBe(id);
    expect(listReceipts(db)).toHaveLength(1);
  });

  it("restores a checkpointed SQLite backup", () => {
    const id = saveReceipt(db, validRequest());
    const uploadDirectory = join(directory, "receipts");
    mkdirSync(uploadDirectory);
    const attachmentName = `${"a".repeat(64)}.jpg`;
    writeFileSync(join(uploadDirectory, attachmentName), Buffer.from("receipt-image"));
    db.exec("PRAGMA wal_checkpoint(FULL)");
    const backup = createBackupPayload(databasePath, uploadDirectory);
    db.close();
    const restoredDirectory = join(directory, "restored");
    restoreBackupPayload(backup, restoredDirectory);
    db = openDatabase(join(restoredDirectory, "receipts.sqlite"));
    expect(getReceipt(db, id)?.draft.items[0].normalizedName).toBe("Large Eggs");
    expect(readFileSync(join(restoredDirectory, "receipts", attachmentName), "utf8")).toBe("receipt-image");
  });
});
