CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  client_mutation_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'confirmed')),
  scanned_at TEXT NOT NULL,
  confirmed_at TEXT,
  draft_json TEXT NOT NULL,
  attachment_json TEXT,
  image_sha256 TEXT,
  extraction_json TEXT
);
CREATE INDEX IF NOT EXISTS receipts_scanned_at_idx ON receipts (scanned_at DESC);
CREATE INDEX IF NOT EXISTS receipts_image_sha256_idx ON receipts (image_sha256);
PRAGMA user_version = 1;
