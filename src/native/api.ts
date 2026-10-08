import { Directory, Filesystem } from "@capacitor/filesystem";
import { confirmedReceiptError, receiptValidationState } from "../../shared/receipt-validation.js";
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import {
  attachmentTokenSchema,
  calculateReceipt,
  createEmptyDraft,
  createUuid,
  receiptDraftSchema,
  saveReceiptSchema,
  updateReceiptSchema,
  receiptMutationSchema,
  type AttachmentToken,
  type ExtractionResponse,
  type SaveReceiptRequest,
  type UpdateReceiptRequest,
  type ReceiptMutationRequest
} from "../../shared/receipt.js";
import { parsePastedReceiptJson } from "../../shared/receipt-import.js";
import { groupHistoryEntries } from "../history.js";
import type { AppConfig, HistoryEntry, StoredReceipt } from "../../shared/receipt-api.js";
import initialMigration from "./migrations/001_initial.sql?raw";
import crudMigration from "./migrations/002_receipt_crud.sql?raw";
import { validateNativeBackup, type NativeBackup } from "../../shared/native-backup.js";

type ReceiptRow = {
  id: string;
  revision: number;
  deleted_at: string | null;
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
const preparedImages = new WeakMap<File, AttachmentToken>();
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
  const db = await sqlite.createConnection(databaseName, false, "no-encryption", 2, false);
  await db.open();
  const versionRows = await db.query("PRAGMA user_version;");
  const version = Number((versionRows.values?.[0] as { user_version?: number } | undefined)?.user_version ?? 0);
  if (version > 2) throw new Error("Diese Itemly-Datenbank wurde mit einer neueren App-Version erstellt.");
  if (version < 1) await db.execute(initialMigration);
  if (version < 2) await db.execute(crudMigration);
  // Only remove content-addressed files with no committed receipt reference.
  // This reclaims images selected before an abandoned or interrupted import.
  await pruneUnreferencedImages(db).catch(() => undefined);
  return db;
}

async function pruneUnreferencedImages(db: SQLiteDBConnection): Promise<void> {
  const result = await db.query("SELECT image_sha256 FROM receipts WHERE image_sha256 IS NOT NULL;");
  const referenced = new Set((result.values ?? []).map((row) => (row as { image_sha256: string }).image_sha256));
  const staleBefore = Date.now() - 24 * 60 * 60 * 1000;
  let files;
  try {
    files = (await Filesystem.readdir({ path: imageFolder, directory: Directory.Data })).files;
  } catch {
    return;
  }
  for (const file of files) {
    // Keep recently selected images across a WebView/HMR restart so an
    // in-progress import cannot lose its private copy.
    if (file.type !== "file" || !Number.isFinite(file.mtime) || file.mtime > staleBefore) continue;
    if (!/^[a-f0-9]{64}\.(?:jpg|png|webp|heic|heif)$/.test(file.name)) continue;
    if (referenced.has(file.name.slice(0, 64))) continue;
    await Filesystem.deleteFile({ path: `${imageFolder}/${file.name}`, directory: Directory.Data }).catch(() => undefined);
  }
}

async function rows<T>(sql: string, values: (string | number | null)[] = []): Promise<T[]> {
  const result = await (await database()).query(sql, values);
  return (result.values ?? []) as T[];
}

function imagePath(token: string): string {
  // Never use a path supplied by pasted JSON or an unvalidated token.
  return `${imageFolder}/${attachmentTokenSchema.shape.token.parse(token)}`;
}

async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  const chunks: string[] = [];
  for (let index = 0; index < view.length; index += 32_768) {
    chunks.push(String.fromCharCode(...view.subarray(index, index + 32_768)));
  }
  return btoa(chunks.join(""));
}

async function verifyStoredImage(path: string, expectedSha256: string): Promise<void> {
  let data;
  try {
    ({ data } = await Filesystem.readFile({ path, directory: Directory.Data }));
  } catch {
    throw new Error("Das lokal gespeicherte Bonbild ist nicht verfügbar. Bitte wähle es erneut aus.");
  }
  if (typeof data !== "string") throw new Error("Das gespeicherte Bonbild konnte nicht gelesen werden.");
  const binary = atob(data);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (await hashBytes(bytes.buffer) !== expectedSha256) {
    throw new Error("Das gespeicherte Bonbild ist beschädigt. Bitte wähle es erneut aus.");
  }
}

export async function prepareReceiptImage(file: File): Promise<AttachmentToken> {
  const mimeType = file.type === "image/jpg" ? "image/jpeg" : file.type.toLowerCase();
  const extension = mimeExtensions[mimeType];
  if (!extension) throw new Error("Unterstützt werden JPEG, PNG, WebP, HEIC und HEIF.");
  if (file.size < 1 || file.size > maximumImageBytes) throw new Error("Das Bonbild muss zwischen 1 Byte und 15 MB groß sein.");
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    throw new Error("Das gewählte Bonbild ist nicht lesbar. Wähle es erneut oder importiere das JSON ohne Bild.");
  }
  if (bytes.byteLength !== file.size) throw new Error("Das Bonbild wurde nicht vollständig gelesen. Wähle es erneut aus.");
  await database();
  const sha256 = await hashBytes(bytes);
  const token = `${sha256}.${extension}`;
  const path = imagePath(token);
  let alreadyStored = false;
  try {
    await Filesystem.stat({ path, directory: Directory.Data });
    alreadyStored = true;
  } catch {
    // The content-addressed image has not been copied into private storage.
  }
  if (alreadyStored) {
    await verifyStoredImage(path, sha256);
  } else {
    await Filesystem.writeFile({ path, directory: Directory.Data, data: toBase64(bytes), recursive: true });
    await verifyStoredImage(path, sha256);
  }
  const attachment = attachmentTokenSchema.parse({
    token,
    sha256,
    mimeType,
    originalName: file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 180) || "receipt-image",
    imageUrl: URL.createObjectURL(new Blob([bytes], { type: mimeType }))
  });
  preparedImages.set(file, attachment);
  return attachment;
}

async function imageFromFile(file: File): Promise<AttachmentToken> {
  return preparedImages.get(file) ?? prepareReceiptImage(file);
}

async function existingDuplicate(sha256: string | undefined): Promise<string | null> {
  if (!sha256) return null;
  await writeQueue;
  const match = await rows<{ id: string }>("SELECT id FROM receipts WHERE image_sha256 = ? AND deleted_at IS NULL LIMIT 1;", [sha256]);
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

async function ensureImageSaved(attachment: AttachmentToken): Promise<void> {
  if (attachment.token !== `${attachment.sha256}.${mimeExtensions[attachment.mimeType]}`) {
    throw new Error("Das Bonbild ist ungültig. Wähle es erneut aus.");
  }
  await verifyStoredImage(imagePath(attachment.token), attachment.sha256);
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
    revision: row.revision,
    deletedAt: row.deleted_at,
    status: row.status,
    validationState: receiptValidationState(draft),
    scannedAt: row.scanned_at,
    confirmedAt: row.confirmed_at,
    draft,
    attachment: await storedAttachment(row.attachment_json),
    calculations: calculateReceipt(draft)
  };
}

export async function saveReceipt(input: SaveReceiptRequest): Promise<{ id: string; receipt: StoredReceipt }> {
  return withWriteLock(() => saveNewReceipt(input));
}

// A connection cannot host overlapping transactions. Queue public reads too,
// so a concurrent history view never observes a partially restored transaction.
let writeQueue: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation);
  writeQueue = result.catch(() => undefined);
  return result;
}

async function saveNewReceipt(input: SaveReceiptRequest): Promise<{ id: string; receipt: StoredReceipt }> {
  const request = saveReceiptSchema.parse(input);
  const db = await database();
  const prior = await rows<ReceiptRow>("SELECT * FROM receipts WHERE client_mutation_id = ? LIMIT 1;", [request.clientMutationId]);
  if (prior[0]) return { id: prior[0].id, receipt: await mapReceipt(prior[0]) };

  const confirmationError = confirmedReceiptError(request.status, request.draft);
  if (confirmationError) throw new Error(confirmationError);
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
  if (request.extractionId) pendingExtractions.delete(request.extractionId);
  return { id: saved[0].id, receipt: await mapReceipt(saved[0]) };
}

export async function loadHistory(search = "", trash = false): Promise<{ receipts: HistoryEntry[] }> {
  return withWriteLock(() => loadHistoryUnlocked(search, trash));
}

async function loadHistoryUnlocked(search: string, trash: boolean): Promise<{ receipts: HistoryEntry[] }> {
  const all = await rows<ReceiptRow>("SELECT * FROM receipts ORDER BY scanned_at DESC;");
  const term = search.trim().toLocaleLowerCase();
  const entries = all.flatMap((row) => {
    if (Boolean(row.deleted_at) !== trash) return [];
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
      validationState: receiptValidationState(draft)
    } satisfies HistoryEntry];
  });
  return { receipts: groupHistoryEntries(entries).flatMap((group) => group.entries) };
}

export async function loadReceipt(id: string): Promise<{ receipt: StoredReceipt }> {
  return withWriteLock(() => loadReceiptUnlocked(id));
}

async function loadReceiptUnlocked(id: string): Promise<{ receipt: StoredReceipt }> {
  const match = await rows<ReceiptRow>("SELECT * FROM receipts WHERE id = ? LIMIT 1;", [id]);
  if (!match[0]) throw new Error("Einkauf nicht gefunden.");
  return { receipt: await mapReceipt(match[0]) };
}

async function mutateReceipt(id: string, input: ReceiptMutationRequest, action: "update" | "delete" | "restore", update?: UpdateReceiptRequest): Promise<{ id: string; receipt: StoredReceipt }> {
  const request = receiptMutationSchema.parse(input);
  const db = await database();
  await db.beginTransaction();
  try {
    const mutations = await rows<{ receipt_id: string; action: string }>("SELECT receipt_id, action FROM receipt_mutations WHERE id = ?;", [request.clientMutationId]);
    const mutation = mutations[0];
    if (mutation && (mutation.receipt_id !== id || mutation.action !== action)) throw new Error("Diese Änderung gehört zu einem anderen Vorgang.");
    const found = await rows<ReceiptRow>("SELECT * FROM receipts WHERE id = ? LIMIT 1;", [id]);
    const previous = found[0];
    if (!previous) throw new Error("Einkauf nicht gefunden.");
    if (!mutation) {
      if (previous.revision !== request.expectedRevision || (action === "restore" ? !previous.deleted_at : previous.deleted_at)) {
        throw new Error("Der Beleg wurde geändert oder gelöscht. Bitte öffne ihn erneut; deine Änderungen bleiben erhalten.");
      }
      const timestamp = new Date().toISOString();
      let oldValue: string | null;
      let newValue: string | null;
      if (update) {
        const confirmationError = confirmedReceiptError(update.status, update.draft);
        if (confirmationError) throw new Error(confirmationError);
        oldValue = previous.draft_json;
        newValue = JSON.stringify(update.draft);
        await db.run(`UPDATE receipts SET draft_json = ?, status = ?, confirmed_at = ?, revision = revision + 1 WHERE id = ?;`,
          [newValue, update.status, update.status === "confirmed" ? previous.confirmed_at ?? timestamp : null, id], false);
      } else {
        oldValue = JSON.stringify(previous.deleted_at);
        newValue = JSON.stringify(action === "delete" ? timestamp : null);
        await db.run("UPDATE receipts SET deleted_at = ?, revision = revision + 1 WHERE id = ?;", [action === "delete" ? timestamp : null, id], false);
      }
      await db.run("INSERT INTO receipt_mutations (id, receipt_id, action, created_at) VALUES (?, ?, ?, ?);", [request.clientMutationId, id, action, timestamp], false);
      await db.run("INSERT INTO receipt_audit_events (id, receipt_id, action, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?, ?);", [createUuid(), id, action, oldValue, newValue, timestamp], false);
    }
    await db.commitTransaction();
  } catch (error) {
    await db.rollbackTransaction();
    throw error;
  }
  return { id, receipt: (await loadReceiptUnlocked(id)).receipt };
}

export async function updateReceipt(id: string, input: UpdateReceiptRequest): Promise<{ id: string; receipt: StoredReceipt }> {
  const request = updateReceiptSchema.parse(input);
  return withWriteLock(() => mutateReceipt(id, request, "update", request));
}

export async function changeReceiptDeleted(id: string, input: ReceiptMutationRequest, deleted: boolean): Promise<{ id: string; receipt: StoredReceipt }> {
  return withWriteLock(() => mutateReceipt(id, input, deleted ? "delete" : "restore"));
}

export async function createNativeBackup(preferences: NativeBackup["preferences"]): Promise<NativeBackup> {
  return withWriteLock(async () => {
    const receipts = await rows<ReceiptRow>("SELECT * FROM receipts ORDER BY id;");
    const mutations = await rows<NativeBackup["mutations"][number]>("SELECT * FROM receipt_mutations ORDER BY id;");
    const auditEvents = await rows<NativeBackup["auditEvents"][number]>("SELECT * FROM receipt_audit_events ORDER BY id;");
    const images = new Map<string, NativeBackup["images"][number]>();
    let totalBase64 = 0;
    for (const row of receipts) {
      if (!row.attachment_json) continue;
      const attachment = attachmentTokenSchema.parse(JSON.parse(row.attachment_json));
      if (images.has(attachment.token)) continue;
      let data: string | Blob;
      try {
        ({ data } = await Filesystem.readFile({ path: imagePath(attachment.token), directory: Directory.Data }));
      } catch {
        throw new Error("Ein gespeichertes Bonbild fehlt oder ist nicht lesbar. Die vollständige Sicherung wurde nicht erstellt.");
      }
      if (typeof data !== "string") throw new Error("Ein Bonbild konnte nicht gesichert werden.");
      totalBase64 += data.length;
      if (totalBase64 > 100 * 1024 * 1024) throw new Error("Die Sicherung ist zu groß. Unterstützt werden derzeit bis zu 100 MB.");
      images.set(attachment.token, { token: attachment.token, sha256: attachment.sha256, mimeType: attachment.mimeType, dataBase64: data });
    }
    return validateNativeBackup({ format: "itemly-android-backup", version: 1, exportedAt: new Date().toISOString(), receipts, mutations, auditEvents, images: [...images.values()], preferences });
  });
}

export async function restoreNativeBackup(raw: unknown): Promise<NativeBackup["preferences"]> {
  const backup = await validateNativeBackup(raw);
  return withWriteLock(async () => {
    const db = await database();
    await db.beginTransaction();
    const createdImages: string[] = [];
    try {
      // Include trash and ledgers: never overwrite an existing installation.
      for (const table of ["receipts", "receipt_mutations", "receipt_audit_events"]) {
        const count = await rows<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table};`);
        if (count[0]?.count !== 0) throw new Error("Wiederherstellen ist nur in einer leeren Datenbank möglich – auch der Papierkorb muss leer sein. Vorhandene Daten werden nicht überschrieben.");
      }
      for (const image of backup.images) {
        const path = imagePath(image.token);
        let exists = false;
        try { await Filesystem.stat({ path, directory: Directory.Data }); exists = true; } catch { /* New image. */ }
        if (exists) {
          // The DB is empty, so a damaged file is an orphan from an interrupted
          // capture/restore, not an existing receipt to overwrite.
          try { await verifyStoredImage(path, image.sha256); } catch { exists = false; }
        }
        if (!exists) {
          createdImages.push(path);
          await Filesystem.writeFile({ path, directory: Directory.Data, data: image.dataBase64, recursive: true });
        }
        await verifyStoredImage(path, image.sha256);
      }
      for (const row of backup.receipts) {
        await db.run(`INSERT INTO receipts (id, revision, deleted_at, client_mutation_id, status, scanned_at, confirmed_at, draft_json, attachment_json, image_sha256, extraction_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, [row.id, row.revision, row.deleted_at, row.client_mutation_id, row.status, row.scanned_at, row.confirmed_at, row.draft_json, row.attachment_json, row.image_sha256, row.extraction_json], false);
      }
      for (const row of backup.mutations) {
        await db.run("INSERT INTO receipt_mutations (id, receipt_id, action, created_at) VALUES (?, ?, ?, ?);", [row.id, row.receipt_id, row.action, row.created_at], false);
      }
      for (const row of backup.auditEvents) {
        await db.run("INSERT INTO receipt_audit_events (id, receipt_id, action, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?, ?);", [row.id, row.receipt_id, row.action, row.old_value, row.new_value, row.changed_at], false);
      }
      await db.commitTransaction();
    } catch (error) {
      await db.rollbackTransaction();
      // A process kill can leave orphan images, but never partial DB records.
      // Startup pruning reclaims them; ordinary failures clean them immediately.
      for (const path of createdImages) await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => undefined);
      throw error;
    }
    return backup.preferences;
  });
}
