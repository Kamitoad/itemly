CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  website TEXT
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  merchant_id TEXT REFERENCES merchants(id),
  store_number TEXT,
  address_text TEXT,
  city TEXT,
  region TEXT,
  country_code TEXT,
  postal_code TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  parent_id TEXT REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  brand TEXT,
  description TEXT,
  barcode TEXT,
  category_id TEXT REFERENCES categories(id),
  package_size TEXT,
  package_unit TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  client_mutation_id TEXT NOT NULL UNIQUE,
  merchant_id TEXT REFERENCES merchants(id),
  store_id TEXT REFERENCES stores(id),
  merchant_name_snapshot TEXT,
  store_name_snapshot TEXT,
  address_text TEXT,
  receipt_number TEXT,
  transaction_id TEXT,
  purchased_date TEXT,
  purchased_time TEXT,
  timezone TEXT,
  currency TEXT NOT NULL,
  subtotal_minor INTEGER,
  discount_total_minor INTEGER,
  tax_total_minor INTEGER,
  total_minor INTEGER,
  item_count TEXT,
  position_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft', 'confirmed')),
  validation_state TEXT NOT NULL CHECK(validation_state IN ('incomplete', 'discrepancy', 'balanced')),
  scanned_at TEXT NOT NULL,
  confirmed_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipt_items (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id),
  line_number INTEGER,
  raw_name TEXT,
  normalized_name TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  sku TEXT,
  plu TEXT,
  quantity TEXT,
  quantity_unit TEXT,
  package_size TEXT,
  package_unit TEXT,
  unit_price_minor INTEGER,
  line_total_minor INTEGER,
  discount_minor INTEGER,
  price_per_reference_unit_minor INTEGER,
  reference_unit TEXT,
  category_snapshot TEXT,
  tax_code TEXT,
  tax_minor INTEGER,
  notes TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  uncertainty_fields TEXT NOT NULL DEFAULT '[]',
  excluded INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  method_type TEXT,
  card_brand TEXT,
  last4 TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  payment_method_id TEXT REFERENCES payment_methods(id),
  method_type TEXT,
  amount_minor INTEGER,
  currency TEXT NOT NULL,
  displayed_last4 TEXT,
  card_brand TEXT,
  reference TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS adjustments (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  receipt_item_id TEXT REFERENCES receipt_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  tax_code TEXT,
  source_line TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL,
  storage_provider TEXT NOT NULL,
  storage_reference TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS extractions (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL,
  model_identifier TEXT,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  raw_result TEXT,
  uncertainty_fields TEXT NOT NULL,
  validation_errors TEXT NOT NULL,
  extracted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_extractions (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  model_identifier TEXT,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  raw_result TEXT,
  uncertainty_fields TEXT NOT NULL,
  validation_errors TEXT NOT NULL,
  extracted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_path TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  source TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(purchased_date DESC, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_merchant ON receipts(merchant_name_snapshot);
CREATE INDEX IF NOT EXISTS idx_items_receipt ON receipt_items(receipt_id, line_number);
CREATE INDEX IF NOT EXISTS idx_items_name ON receipt_items(normalized_name);
CREATE INDEX IF NOT EXISTS idx_attachments_hash ON attachments(sha256);
