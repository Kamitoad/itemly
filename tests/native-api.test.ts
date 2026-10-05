import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createEmptyDraft, createEmptyItem, createUuid } from "../shared/receipt.js";
import { applyCurrencyPreference, confirmCurrency } from "../shared/currency.js";

type TestRow = {
  id: string;
  client_mutation_id: string;
  status: string;
  scanned_at: string;
  confirmed_at: string | null;
  draft_json: string;
  attachment_json: string | null;
  image_sha256: string | null;
  extraction_json: string | null;
};

const state = vi.hoisted(() => ({
  db: null as DatabaseSync | null,
  records: [] as TestRow[],
  images: new Map<string, string>(),
  failImageWrite: false
}));

vi.mock("@capacitor-community/sqlite", async () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    async createConnection() {
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(":memory:");
      db.exec("PRAGMA foreign_keys = ON;");
      state.db = db;
      function refresh() { state.records = db.prepare("SELECT * FROM receipts").all() as TestRow[]; }
      return {
        open: async () => undefined,
        execute: async (sql: string) => { db.exec(sql); },
        query: async (sql: string, values: string[] = []) => {
          return { values: db.prepare(sql).all(...values) };
        },
        run: async (sql: string, values: (string | number | null)[]) => {
          const result = db.prepare(sql).run(...values);
          refresh();
          return { changes: { changes: Number(result.changes) } };
        },
        beginTransaction: async () => { db.exec("BEGIN IMMEDIATE"); },
        commitTransaction: async () => { db.exec("COMMIT"); refresh(); },
        rollbackTransaction: async () => { db.exec("ROLLBACK"); refresh(); }
      };
    }
  }
}));

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Filesystem: {
    readdir: async () => ({ files: [...state.images.keys()].map((path) => ({ name: path.split("/").at(-1) })) }),
    deleteFile: async ({ path }: { path: string }) => { state.images.delete(path); },
    stat: async ({ path }: { path: string }) => {
      if (!state.images.has(path)) throw new Error("File not found");
      return { size: state.images.get(path)!.length };
    },
    readFile: async ({ path }: { path: string }) => {
      const data = state.images.get(path);
      if (!data) throw new Error("File not found");
      return { data };
    },
    writeFile: async ({ path, data }: { path: string; data: string }) => {
      if (state.failImageWrite) throw new Error("Disk full");
      state.images.set(path, data);
    }
  }
}));

import * as nativeApi from "../src/native/api.js";

beforeEach(() => {
  state.db?.exec("DELETE FROM receipt_audit_events; DELETE FROM receipt_mutations; DELETE FROM receipts;");
  state.records.length = 0;
  state.images.clear();
});

describe("phone-local receipt adapter", () => {
  it("serializes concurrent updates and accepts only one edit of a revision", async () => {
    const draft = createEmptyDraft("CAD");
    const saved = await nativeApi.saveReceipt({ clientMutationId: createUuid(), status: "draft", draft, attachment: null, extractionId: null });
    const edits = ["first", "second"].map((notes) => nativeApi.updateReceipt(saved.id, {
      clientMutationId: createUuid(), expectedRevision: 1, status: "draft", draft: { ...draft, notes }
    }));
    const results = await Promise.allSettled(edits);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await nativeApi.loadReceipt(saved.id)).receipt).toMatchObject({ revision: 2, draft: { notes: "first" } });
  });
  it("updates item CRUD without duplicating the receipt and rejects stale edits", async () => {
    const imported = await nativeApi.importChatGptReceipt('{"currency":"CAD","totalMinor":100,"items":[{"rawName":"ORIGINAL","lineTotalMinor":100}]}', null);
    const saved = await nativeApi.saveReceipt({ clientMutationId: createUuid(), status: "confirmed", draft: imported.draft, attachment: null, extractionId: imported.extraction.id });
    const originalExtraction = state.records[0].extraction_json;
    const added = createEmptyItem(2);
    added.lineTotalMinor = 200;
    const draft = { ...saved.receipt.draft, merchantName: "Corrected shop", totalMinor: 300, items: [{ ...saved.receipt.draft.items[0], normalizedName: "Updated" }, added] };
    const input = { clientMutationId: createUuid(), expectedRevision: 1, status: "confirmed" as const, draft };
    const changed = await nativeApi.updateReceipt(saved.id, input);
    await nativeApi.updateReceipt(saved.id, input);
    expect(changed.receipt).toMatchObject({ revision: 2, scannedAt: saved.receipt.scannedAt, confirmedAt: saved.receipt.confirmedAt });
    expect(changed.receipt.draft.items).toHaveLength(2);
    expect(state.records).toHaveLength(1);
    expect(state.records[0].extraction_json).toBe(originalExtraction);
    await expect(nativeApi.updateReceipt(saved.id, { ...input, clientMutationId: createUuid() })).rejects.toThrow("erneut");
    await expect(nativeApi.updateReceipt(saved.id, { ...input, clientMutationId: createUuid(), expectedRevision: 2, draft: { ...draft, totalMinor: 400 } })).rejects.toThrow("ausgeglichener");
    expect((await nativeApi.loadReceipt(saved.id)).receipt.revision).toBe(2);
    const result = await nativeApi.updateReceipt(saved.id, { ...input, clientMutationId: createUuid(), expectedRevision: 2, draft: { ...draft, items: [added], totalMinor: 200 } });
    expect(result.receipt.draft.items.map((item) => item.id)).toEqual([added.id]);
    expect(state.db!.prepare("SELECT COUNT(*) AS count FROM receipt_audit_events").get()).toMatchObject({ count: 2 });
  });

  it("moves receipts to trash and restores them with their original image", async () => {
    const bytes = new TextEncoder().encode("crud-test-image");
    const file = { name: "receipt.jpg", type: "image/jpeg", size: bytes.byteLength, arrayBuffer: async () => bytes.buffer } as unknown as File;
    const attachment = await nativeApi.prepareReceiptImage(file);
    const draft = createEmptyDraft("CAD");
    const item = createEmptyItem(1); item.lineTotalMinor = 100;
    draft.items = [item]; draft.totalMinor = 100;
    const saved = await nativeApi.saveReceipt({ clientMutationId: createUuid(), status: "confirmed", draft, attachment, extractionId: null });
    const mutation = { clientMutationId: createUuid(), expectedRevision: 1 };
    const deleted = await nativeApi.changeReceiptDeleted(saved.id, mutation, true);
    await nativeApi.changeReceiptDeleted(saved.id, mutation, true);
    expect(deleted.receipt.revision).toBe(2);
    expect((await nativeApi.loadHistory()).receipts).toHaveLength(0);
    expect((await nativeApi.loadHistory("", true)).receipts).toHaveLength(1);
    expect(state.images.size).toBe(1);
    await expect(nativeApi.updateReceipt(saved.id, { clientMutationId: createUuid(), expectedRevision: 2, status: "confirmed", draft })).rejects.toThrow("gelöscht");
    await expect(nativeApi.changeReceiptDeleted(saved.id, { clientMutationId: createUuid(), expectedRevision: 1 }, false)).rejects.toThrow("erneut");
    const restore = { clientMutationId: createUuid(), expectedRevision: 2 };
    const restored = await nativeApi.changeReceiptDeleted(saved.id, restore, false);
    await nativeApi.changeReceiptDeleted(saved.id, restore, false);
    expect(restored.receipt).toMatchObject({ revision: 3, deletedAt: null, draft });
    expect(restored.receipt.attachment?.sha256).toBe(attachment.sha256);
    expect((await nativeApi.loadHistory()).receipts).toHaveLength(1);
    expect((await nativeApi.loadHistory("", true)).receipts).toHaveLength(0);
  });

  it("rolls back an update when its audit record cannot be committed", async () => {
    const draft = createEmptyDraft("CAD");
    const saved = await nativeApi.saveReceipt({ clientMutationId: createUuid(), status: "draft", draft, attachment: null, extractionId: null });
    state.db!.exec("CREATE TEMP TRIGGER fail_audit BEFORE INSERT ON receipt_audit_events BEGIN SELECT RAISE(ABORT, 'Test audit failure'); END;");
    const input = { clientMutationId: createUuid(), expectedRevision: 1, status: "draft" as const, draft: { ...draft, notes: "Must roll back" } };
    try {
      await expect(nativeApi.updateReceipt(saved.id, input)).rejects.toThrow("Test audit failure");
      expect((await nativeApi.loadReceipt(saved.id)).receipt).toMatchObject({ revision: 1, draft: { notes: "" } });
      expect(state.db!.prepare("SELECT COUNT(*) AS count FROM receipt_mutations").get()).toMatchObject({ count: 0 });
    } finally { state.db!.exec("DROP TRIGGER fail_audit;"); }
    await expect(nativeApi.updateReceipt(saved.id, input)).resolves.toHaveProperty("receipt.revision", 2);
  });
  it("preserves unreviewed currency drafts and rejects confirmation until reviewed", async () => {
    const item = createEmptyItem(1);
    item.lineTotalMinor = 100;
    const draft = createEmptyDraft();
    draft.items = [item];
    draft.totalMinor = 100;
    const input = { clientMutationId: createUuid(), status: "confirmed" as const, draft, attachment: null, extractionId: null };
    await expect(nativeApi.saveReceipt(input)).rejects.toThrow("Währung");
    const suggestion = applyCurrencyPreference(draft, "EUR");
    const saved = await nativeApi.saveReceipt({ ...input, status: "draft", draft: suggestion });
    const loaded = (await nativeApi.loadReceipt(saved.id)).receipt.draft;
    expect(loaded.fieldSources.currency).toBe("uncertain");
    await expect(nativeApi.saveReceipt({ ...input, clientMutationId: createUuid(), draft: loaded })).rejects.toThrow("Währung");
    await expect(nativeApi.saveReceipt({ ...input, clientMutationId: createUuid(), draft: confirmCurrency(loaded, "EUR") })).resolves.toHaveProperty("id");
  });
  it("saves balanced receipts locally and makes retries idempotent", async () => {
    state.records.length = 0;
    await expect(nativeApi.loadConfig()).resolves.toMatchObject({ extractionMode: "manual" });
    const draft = createEmptyDraft("CAD");
    const item = createEmptyItem(1);
    item.normalizedName = "Eggs";
    item.lineTotalMinor = 299;
    draft.merchantName = "Shop";
    draft.items = [item];
    draft.totalMinor = 299;
    const input = { clientMutationId: createUuid(), status: "confirmed" as const, draft, attachment: null, extractionId: null };

    const first = await nativeApi.saveReceipt(input);
    const retry = await nativeApi.saveReceipt(input);
    expect(retry.id).toBe(first.id);
    expect(state.records).toHaveLength(1);
    await expect(nativeApi.loadReceipt(first.id)).resolves.toMatchObject({ receipt: { draft: { merchantName: "Shop" } } });
    await expect(nativeApi.loadHistory("egg")).resolves.toMatchObject({ receipts: [{ id: first.id }] });

    const unbalanced = { ...input, clientMutationId: createUuid(), draft: { ...draft, totalMinor: 300 } };
    await expect(nativeApi.saveReceipt(unbalanced)).rejects.toThrow("nicht ausgeglichener Bon");
    expect(state.records).toHaveLength(1);
  });

  it("copies a picked image before import and never reads the picker file again", async () => {
    state.records.length = 0;
    state.images.clear();
    const bytes = new TextEncoder().encode("receipt-photo");
    let reads = 0;
    const file = {
      name: "receipt.jpg",
      type: "image/jpeg",
      size: bytes.byteLength,
      arrayBuffer: async () => {
        reads += 1;
        if (reads > 1) throw new Error("Picker access expired");
        return bytes.buffer;
      }
    } as unknown as File;
    const prepared = await nativeApi.prepareReceiptImage(file);
    expect(reads).toBe(1);
    expect(state.images.has(`receipts/${prepared.token}`)).toBe(true);

    const imported = await nativeApi.importChatGptReceipt('{"merchantName":"Shop","currency":"CAD"}', file);
    expect(imported.attachment?.token).toBe(prepared.token);
    const draft = imported.draft;
    const item = createEmptyItem(1);
    item.lineTotalMinor = 250;
    draft.items = [item];
    draft.totalMinor = 250;
    const saved = await nativeApi.saveReceipt({
      clientMutationId: createUuid(), status: "confirmed", draft,
      attachment: imported.attachment, extractionId: imported.extraction.id
    });
    expect(reads).toBe(1);
    expect(saved.receipt.attachment?.sha256).toBe(prepared.sha256);
    expect(state.records).toHaveLength(1);
  });

  it("keeps JSON-only import available when the image picker cannot be read", async () => {
    const unreadable = {
      name: "receipt.jpg", type: "image/jpeg", size: 100,
      arrayBuffer: async () => { throw new Error("Picker access expired"); }
    } as unknown as File;
    await expect(nativeApi.prepareReceiptImage(unreadable)).rejects.toThrow("Bonbild ist nicht lesbar");
    const result = await nativeApi.importChatGptReceipt('{"merchantName":"Shop","currency":"CAD"}', null);
    expect(result.draft.merchantName).toBe("Shop");
    expect(result.attachment).toBeNull();
  });

  it("does not accept an image that could not be copied into private storage", async () => {
    state.records.length = 0;
    state.failImageWrite = true;
    const bytes = new TextEncoder().encode("another-receipt-photo");
    const file = {
      name: "receipt.jpg", type: "image/jpeg", size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer
    } as unknown as File;
    try {
      await expect(nativeApi.prepareReceiptImage(file)).rejects.toThrow("Disk full");
      expect(state.records).toHaveLength(0);
    } finally {
      state.failImageWrite = false;
    }
  });
});
