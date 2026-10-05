import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../server/database.js";

describe("server CRUD migration", () => {
  it("upgrades an existing database once without dropping stored receipts", () => {
    const directory = mkdtempSync(join(tmpdir(), "itemly-migration-test-"));
    const path = join(directory, "receipts.sqlite");
    let db = new DatabaseSync(path);
    try {
      db.exec(readFileSync(new URL("../server/migrations/001_initial.sql", import.meta.url), "utf8"));
      db.exec("CREATE TABLE _migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);");
      db.prepare("INSERT INTO _migrations VALUES (?, ?)").run("001_initial.sql", "2026-09-26");
      db.prepare(`INSERT INTO receipts(id, client_mutation_id, currency, position_count, status, validation_state, scanned_at, schema_version)
        VALUES ('legacy', 'legacy-mutation', 'CAD', 0, 'draft', 'incomplete', '2026-09-26', '1.0')`).run();
      db.close(); db = openDatabase(path);
      expect(db.prepare("SELECT id, currency, revision, deleted_at FROM receipts").get()).toMatchObject({ id: "legacy", currency: "CAD", revision: 1, deleted_at: null });
      db.close(); db = openDatabase(path);
      expect(db.prepare("SELECT COUNT(*) AS count FROM _migrations").get()).toMatchObject({ count: 2 });
    } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});
