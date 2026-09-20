import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DatabaseSync } from "node:sqlite";
import { createEmptyDraft, createEmptyItem, type SaveReceiptRequest } from "../shared/receipt.js";
import { openDatabase } from "../server/database.js";
import { createBackupPayload, restoreBackupPayload } from "../server/backup.js";
import {
  findDuplicateByHash,
  getReceipt,
  listReceipts,
  ReceiptConflictError,
  saveReceipt
} from "../server/repository.js";

let directory: string;
let databasePath: string;
let db: DatabaseSync;

function validRequest(): SaveReceiptRequest {
  const draft = createEmptyDraft();
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
