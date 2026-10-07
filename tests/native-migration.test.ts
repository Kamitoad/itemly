import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const initialMigration = readFileSync(new URL("../src/native/migrations/001_initial.sql", import.meta.url), "utf8");
const crudMigration = readFileSync(new URL("../src/native/migrations/002_receipt_crud.sql", import.meta.url), "utf8");

describe("Android SQLite migration", () => {
  it("upgrades existing receipts without dropping drafts or image references", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(initialMigration);
      db.prepare("INSERT INTO receipts(id, client_mutation_id, status, scanned_at, draft_json, attachment_json) VALUES (?, ?, ?, ?, ?, ?)")
        .run("legacy", "old-mutation", "draft", "2026-09-26", '{"currency":"CAD"}', '{"token":"original"}');
      db.exec(crudMigration);
      expect(db.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 2 });
      expect(db.prepare("SELECT * FROM receipts WHERE id = 'legacy'").get()).toMatchObject({ revision: 1, deleted_at: null, draft_json: '{"currency":"CAD"}', attachment_json: '{"token":"original"}' });
    } finally { db.close(); }
  });
  it("creates versioned, idempotent receipt storage with a unique mutation ID", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(initialMigration);
      db.exec(initialMigration);
      const version = db.prepare("PRAGMA user_version").get() as { user_version: number };
      expect(version.user_version).toBe(1);
      const insert = db.prepare(`INSERT INTO receipts
        (id, client_mutation_id, status, scanned_at, draft_json)
        VALUES (?, ?, ?, ?, ?)`);
      insert.run("one", "mutation-1", "draft", "2026-09-26T00:00:00Z", "{}");
      expect(() => insert.run("two", "mutation-1", "draft", "2026-09-26T00:00:00Z", "{}"))
        .toThrow();
      expect(() => insert.run("three", "mutation-2", "invalid", "2026-09-26T00:00:00Z", "{}"))
        .toThrow();
    } finally {
      db.close();
    }
  });
});
