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

const state = vi.hoisted(() => ({ version: 0, records: [] as TestRow[] }));

vi.mock("@capacitor-community/sqlite", () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    async createConnection() {
      return {
        open: async () => undefined,
        execute: async () => { state.version = 1; },
        query: async (sql: string, values: string[] = []) => {
          if (sql.startsWith("PRAGMA")) return { values: [{ user_version: state.version }] };
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

vi.mock("@capacitor/filesystem", () => ({ Directory: { Data: "DATA" }, Filesystem: {} }));

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
});
