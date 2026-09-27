import { describe, expect, it, vi } from "vitest";
import { createEmptyDraft, createEmptyItem, createUuid } from "../shared/receipt.js";

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
  version: 0,
  records: [] as TestRow[],
  images: new Map<string, string>(),
  failImageWrite: false
}));

vi.mock("@capacitor-community/sqlite", () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    async createConnection() {
      return {
        open: async () => undefined,
        execute: async () => { state.version = 1; },
        query: async (sql: string, values: string[] = []) => {
          if (sql.startsWith("PRAGMA")) return { values: [{ user_version: state.version }] };
          if (sql.includes("SELECT image_sha256")) return { values: state.records.map((row) => ({ image_sha256: row.image_sha256 })).filter((row) => row.image_sha256) };
          if (sql.includes("WHERE client_mutation_id")) return { values: state.records.filter((row) => row.client_mutation_id === values[0]) };
          if (sql.includes("WHERE image_sha256")) return { values: state.records.filter((row) => row.image_sha256 === values[0]) };
          if (sql.includes("WHERE id")) return { values: state.records.filter((row) => row.id === values[0]) };
          return { values: [...state.records] };
        },
        run: async (_sql: string, values: unknown[]) => {
          if (state.records.some((row) => row.client_mutation_id === values[1])) return;
          state.records.push({
            id: values[0] as string,
            client_mutation_id: values[1] as string,
            status: values[2] as string,
            scanned_at: values[3] as string,
            confirmed_at: values[4] as string | null,
            draft_json: values[5] as string,
            attachment_json: values[6] as string | null,
            image_sha256: values[7] as string | null,
            extraction_json: values[8] as string | null
          });
        }
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

describe("phone-local receipt adapter", () => {
  it("saves balanced receipts locally and makes retries idempotent", async () => {
    state.records.length = 0;
    await expect(nativeApi.loadConfig()).resolves.toMatchObject({ extractionMode: "manual" });
    const draft = createEmptyDraft();
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
