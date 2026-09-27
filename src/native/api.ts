import { Directory, Filesystem } from "@capacitor/filesystem";
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import {
  attachmentTokenSchema,
  calculateReceipt,
  createEmptyDraft,
  createUuid,
  receiptDraftSchema,
  saveReceiptSchema,
  type AttachmentToken,
  type ExtractionResponse,
  type SaveReceiptRequest
} from "../../shared/receipt.js";
import { parsePastedReceiptJson } from "../../shared/receipt-import.js";
import { groupHistoryEntries } from "../history.js";
import type { AppConfig, HistoryEntry, StoredReceipt } from "../api.js";
import initialMigration from "./migrations/001_initial.sql?raw";

type ReceiptRow = {
  id: string;
  client_mutation_id: string;
  status: "draft" | "confirmed";
  scanned_at: string;
  confirmed_at: string | null;
  draft_json: string;
  attachment_json: string | null;
  image_sha256: string | null;
  extraction_json: string | null;
};

const databaseName = "itemly";
const imageFolder = "receipts";
const maximumImageBytes = 15 * 1024 * 1024;
const mimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif"
};
const pendingImages = new Map<string, File>();
const pendingExtractions = new Map<string, unknown>();
let connectionPromise: Promise<SQLiteDBConnection> | null = null;

async function database(): Promise<SQLiteDBConnection> {
  connectionPromise ??= openDatabase().catch((error: unknown) => {
    connectionPromise = null;
    throw error;
  });
  return connectionPromise;
}

async function openDatabase(): Promise<SQLiteDBConnection> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const db = await sqlite.createConnection(databaseName, false, "no-encryption", 1, false);
  await db.open();
  const versionRows = await db.query("PRAGMA user_version;");
  const version = Number((versionRows.values?.[0] as { user_version?: number } | undefined)?.user_version ?? 0);
  if (version > 1) throw new Error("Diese Itemly-Datenbank wurde mit einer neueren App-Version erstellt.");
  if (version < 1) await db.execute(initialMigration);
  return db;
}

async function rows<T>(sql: string, values: (string | number | null)[] = []): Promise<T[]> {
  const result = await (await database()).query(sql, values);
  return (result.values ?? []) as T[];
}

function imagePath(token: string): string {
  // Never use a path supplied by pasted JSON or an unvalidated token.
  return `${imageFolder}/${attachmentTokenSchema.shape.token.parse(token)}`;
}

async function hashFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function imageFromFile(file: File): Promise<AttachmentToken> {
  const mimeType = file.type === "image/jpg" ? "image/jpeg" : file.type.toLowerCase();
  const extension = mimeExtensions[mimeType];
  if (!extension) throw new Error("Unterstützt werden JPEG, PNG, WebP, HEIC und HEIF.");
  if (file.size < 1 || file.size > maximumImageBytes) throw new Error("Das Bonbild muss zwischen 1 Byte und 15 MB groß sein.");
  const sha256 = await hashFile(file);
  const token = `${sha256}.${extension}`;
  pendingImages.set(token, file);
  return attachmentTokenSchema.parse({
    token,
    sha256,
    mimeType,
    originalName: file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 180) || "receipt-image",
    imageUrl: URL.createObjectURL(file)
  });
}

async function existingDuplicate(sha256: string | undefined): Promise<string | null> {
  if (!sha256) return null;
  const match = await rows<{ id: string }>("SELECT id FROM receipts WHERE image_sha256 = ? LIMIT 1;", [sha256]);
  return match[0]?.id ?? null;
}

function extraction(provider: string, rawResult: unknown): ExtractionResponse["extraction"] {
  const id = createUuid();
  pendingExtractions.set(id, { provider, rawResult, extractedAt: new Date().toISOString() });
  return {
    id,
    provider,
    model: null,
    status: provider === "manual" ? "manual" : "completed",
    disclosure: provider === "manual"
      ? "Das Bild bleibt auf diesem Gerät. Bitte erfasse die Angaben manuell."
      : "Das eingefügte JSON wurde lokal geprüft. Itemly hat keine KI-API aufgerufen.",
    duplicateReceiptId: null
  };
}

export async function loadConfig(): Promise<AppConfig> {
  await database();
  return {
    extractionMode: "manual",
    provider: "manual",
    model: null,
    disclosure: "Das Bild bleibt auf diesem Gerät. Es wird kein KI-Dienst aufgerufen; erfasse die Werte selbst oder importiere ChatGPT-JSON."
  };
}

export async function extractReceipt(file: File): Promise<ExtractionResponse> {
  const attachment = await imageFromFile(file);
  return {
    draft: createEmptyDraft(),
    attachment,
    extraction: {
      ...extraction("manual", null),
      duplicateReceiptId: await existingDuplicate(attachment.sha256)
    }
  };
}

export async function importChatGptReceipt(content: string, file: File | null): Promise<ExtractionResponse> {
  const { draft, rawResult } = parsePastedReceiptJson(content);
  const attachment = file ? await imageFromFile(file) : null;
  return {
    draft,
    attachment,
    extraction: {
      ...extraction("chatgpt-paste", rawResult),
      duplicateReceiptId: await existingDuplicate(attachment?.sha256)
    }
  };
}

function fileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Das Bild konnte nicht gelesen werden."));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(file);
  });
}

async function ensureImageSaved(attachment: AttachmentToken): Promise<void> {
  const path = imagePath(attachment.token);
  const file = pendingImages.get(attachment.token);
  if (!file || await hashFile(file) !== attachment.sha256 || attachment.token !== `${attachment.sha256}.${mimeExtensions[attachment.mimeType]}`) {
    throw new Error("Das Originalbild ist nicht mehr verfügbar. Wähle es erneut aus.");
  }
  try {
    const existing = await Filesystem.stat({ path, directory: Directory.Data });
    if (existing.size === file.size) return;
  } catch {
    // No durable copy exists yet; write the selected image before the DB reference.
  }
  await Filesystem.writeFile({ path, directory: Directory.Data, data: await fileAsBase64(file), recursive: true });
  const written = await Filesystem.stat({ path, directory: Directory.Data });
  if (written.size !== file.size) throw new Error("Das Bonbild wurde nicht vollständig gespeichert.");
}

async function storedAttachment(value: string | null): Promise<AttachmentToken | null> {
  if (!value) return null;
  const attachment = attachmentTokenSchema.parse(JSON.parse(value));
  const { data } = await Filesystem.readFile({ path: imagePath(attachment.token), directory: Directory.Data });
  if (typeof data !== "string") throw new Error("Das gespeicherte Bonbild konnte nicht gelesen werden.");
  return { ...attachment, imageUrl: `data:${attachment.mimeType};base64,${data}` };
}

async function mapReceipt(row: ReceiptRow): Promise<StoredReceipt> {
  const draft = receiptDraftSchema.parse(JSON.parse(row.draft_json));
  return {
    id: row.id,
    status: row.status,
    validationState: validationState(draft),
    scannedAt: row.scanned_at,
    confirmedAt: row.confirmed_at,
    draft,
    attachment: await storedAttachment(row.attachment_json),
    calculations: calculateReceipt(draft)
  };
}

function validationState(draft: ReturnType<typeof receiptDraftSchema.parse>): StoredReceipt["validationState"] {
  const calculation = calculateReceipt(draft);
  if (draft.totalMinor === null || calculation.missingPriceCount > 0) return "incomplete";
  return calculation.isBalanced ? "balanced" : "discrepancy";
}

export async function saveReceipt(input: SaveReceiptRequest): Promise<{ id: string; receipt: StoredReceipt }> {
  const request = saveReceiptSchema.parse(input);
  const db = await database();
  const prior = await rows<ReceiptRow>("SELECT * FROM receipts WHERE client_mutation_id = ? LIMIT 1;", [request.clientMutationId]);
  if (prior[0]) return { id: prior[0].id, receipt: await mapReceipt(prior[0]) };

  const calculations = calculateReceipt(request.draft);
  if (request.status === "confirmed" && !calculations.isBalanced) {
    throw new Error("Ein nicht ausgeglichener Bon kann nur als Entwurf gespeichert werden.");
  }
  const attachment = request.attachment ? attachmentTokenSchema.parse(request.attachment) : null;
  if (attachment) await ensureImageSaved(attachment);
  const id = createUuid();
  const scannedAt = new Date().toISOString();
  // One row contains the validated draft and its metadata, so SQLite commits
  // the receipt atomically; the unique mutation ID makes retries idempotent.
  await db.run(`INSERT OR IGNORE INTO receipts
    (id, client_mutation_id, status, scanned_at, confirmed_at, draft_json, attachment_json, image_sha256, extraction_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`, [
    id,
    request.clientMutationId,
    request.status,
    scannedAt,
    request.status === "confirmed" ? scannedAt : null,
    JSON.stringify(request.draft),
    attachment ? JSON.stringify({ ...attachment, imageUrl: "" }) : null,
    attachment?.sha256 ?? null,
    request.extractionId ? JSON.stringify(pendingExtractions.get(request.extractionId) ?? null) : null
  ]);
  const saved = await rows<ReceiptRow>("SELECT * FROM receipts WHERE client_mutation_id = ? LIMIT 1;", [request.clientMutationId]);
  if (!saved[0]) throw new Error("Der Bon konnte nicht gespeichert werden.");
  if (attachment) pendingImages.delete(attachment.token);
  if (request.extractionId) pendingExtractions.delete(request.extractionId);
  return { id: saved[0].id, receipt: await mapReceipt(saved[0]) };
}

export async function loadHistory(search = ""): Promise<{ receipts: HistoryEntry[] }> {
  const all = await rows<ReceiptRow>("SELECT * FROM receipts ORDER BY scanned_at DESC;");
  const term = search.trim().toLocaleLowerCase();
  const entries = all.flatMap((row) => {
    const draft = receiptDraftSchema.parse(JSON.parse(row.draft_json));
    if (term && ![draft.merchantName, ...draft.items.flatMap((item) => [item.normalizedName, item.category])]
      .some((value) => value?.toLocaleLowerCase().includes(term))) return [];
    return [{
      id: row.id,
      merchantName: draft.merchantName,
      purchasedDate: draft.purchasedDate,
      purchasedTime: draft.purchasedTime,
      scannedAt: row.scanned_at,
      totalMinor: draft.totalMinor,
      currency: draft.currency,
      positionCount: calculateReceipt(draft).positionCount,
      status: row.status,
      validationState: validationState(draft)
    } satisfies HistoryEntry];
  });
  return { receipts: groupHistoryEntries(entries).flatMap((group) => group.entries) };
}

export async function loadReceipt(id: string): Promise<{ receipt: StoredReceipt }> {
  const match = await rows<ReceiptRow>("SELECT * FROM receipts WHERE id = ? LIMIT 1;", [id]);
  if (!match[0]) throw new Error("Einkauf nicht gefunden.");
  return { receipt: await mapReceipt(match[0]) };
}
