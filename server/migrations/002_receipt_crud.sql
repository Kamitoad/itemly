ALTER TABLE receipts ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE receipts ADD COLUMN deleted_at TEXT;
CREATE TABLE receipt_mutations (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts(id),
  action TEXT NOT NULL CHECK(action IN ('update', 'delete', 'restore')),
  created_at TEXT NOT NULL
);
