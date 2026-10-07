import { z } from "zod";
import { attachmentTokenSchema, calculateReceipt, receiptDraftSchema } from "./receipt.js";
import { needsCurrencyReview } from "./currency.js";

// Versioned logical snapshots, not executable SQL or platform-specific DB files.
export const maximumBackupBytes = 100 * 1024 * 1024;
const jsonText = z.string().max(maximumBackupBytes).refine((value) => {
  try { JSON.parse(value); return true; } catch { return false; }
}, "Ungültige JSON-Daten in der Sicherung.");
const uuid = z.string().uuid();
const timestamp = z.string().datetime();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const receiptRowSchema = z.object({
  id: uuid,
  revision: z.number().int().positive().safe(),
  deleted_at: timestamp.nullable(),
  client_mutation_id: uuid,
  status: z.enum(["draft", "confirmed"]),
  scanned_at: timestamp,
  confirmed_at: timestamp.nullable(),
  draft_json: jsonText,
  attachment_json: jsonText.nullable(),
  image_sha256: sha256.nullable(),
  extraction_json: jsonText.nullable()
}).strict();
const mutationSchema = z.object({
  id: uuid, receipt_id: uuid, action: z.enum(["update", "delete", "restore"]), created_at: timestamp
}).strict();
const auditSchema = z.object({
  id: uuid, receipt_id: uuid, action: z.enum(["update", "delete", "restore"]),
  old_value: jsonText.nullable(), new_value: jsonText.nullable(), changed_at: timestamp
}).strict();
export const nativeBackupSchema = z.object({
  format: z.literal("itemly-android-backup"),
  version: z.literal(1),
  exportedAt: timestamp,
  receipts: z.array(receiptRowSchema).max(10_000),
  mutations: z.array(mutationSchema).max(100_000),
  auditEvents: z.array(auditSchema).max(100_000),
  images: z.array(z.object({
    token: z.string().regex(/^[a-f0-9]{64}\.(?:jpg|png|webp|heic|heif)$/),
    sha256,
    mimeType: attachmentTokenSchema.shape.mimeType,
    dataBase64: z.string().min(4).max(20 * 1024 * 1024).regex(/^[A-Za-z0-9+/]*={0,2}$/).refine((value) => value.length % 4 === 0)
  }).strict()).max(10_000),
  preferences: z.object({
    lastCurrency: z.string().regex(/^[A-Z]{3}$/).refine((value) => value !== "XXX").nullable(),
    theme: z.enum(["dark", "light"]).nullable()
  }).strict()
}).strict();
export type NativeBackup = z.infer<typeof nativeBackupSchema>;
export type BackupSummary = ReturnType<typeof summarizeBackup>;
const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };

export async function validateNativeBackup(raw: unknown): Promise<NativeBackup> {
  const parsed = nativeBackupSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Die Datei ist keine unterstützte, vollständige Itemly-Handy-Sicherung (Version 1).");
  const backup = parsed.data;
  function unique(values: string[]): Set<string> {
    const result = new Set(values);
    if (result.size !== values.length) throw new Error("Die Sicherung enthält doppelte IDs oder Bilder.");
    return result;
  }
  const ids = unique(backup.receipts.map((row) => row.id));
  unique(backup.receipts.map((row) => row.client_mutation_id));
  unique(backup.mutations.map((row) => row.id));
  unique(backup.auditEvents.map((row) => row.id));
  unique(backup.images.map((image) => image.token));
  for (const row of [...backup.mutations, ...backup.auditEvents]) {
    if (!ids.has(row.receipt_id)) throw new Error("Die Sicherung enthält einen Änderungsverlauf ohne zugehörigen Beleg.");
  }
  const images = new Map(backup.images.map((image) => [image.token, image]));
  const referenced = new Set<string>();
  for (const row of backup.receipts) {
    const draft = receiptDraftSchema.safeParse(JSON.parse(row.draft_json));
    if (!draft.success) throw new Error("Ein Beleg in der Sicherung hat ein ungültiges Format.");
    if (row.status === "confirmed" && (needsCurrencyReview(draft.data) || !calculateReceipt(draft.data).isBalanced || !row.confirmed_at)) {
      throw new Error("Ein bestätigter Beleg in der Sicherung ist nicht vollständig oder ausgeglichen.");
    }
    if (row.attachment_json) {
      const attachment = attachmentTokenSchema.safeParse(JSON.parse(row.attachment_json));
      if (!attachment.success) throw new Error("Ein Bildverweis in der Sicherung ist ungültig.");
      const value = attachment.data;
      const image = images.get(value.token);
      if (!image || image.sha256 !== value.sha256 || image.mimeType !== value.mimeType || row.image_sha256 !== value.sha256) {
        throw new Error("In der Sicherung fehlt ein zugehöriges Bonbild.");
      }
      // Never restore remote URLs, data URLs, or device-specific paths.
      row.attachment_json = JSON.stringify({ ...value, imageUrl: "" });
      referenced.add(value.token);
    } else if (row.image_sha256 !== null) {
      throw new Error("Ein Bildverweis in der Sicherung ist unvollständig.");
    }
  }
  if (referenced.size !== images.size) throw new Error("Die Sicherung enthält Bilder ohne zugehörigen Beleg.");
  for (const image of backup.images) {
    if (image.token !== `${image.sha256}.${extensions[image.mimeType]}`) throw new Error("Ein Bildname in der Sicherung ist ungültig.");
    let binary: string;
    try {
      binary = atob(image.dataBase64);
      if (btoa(binary) !== image.dataBase64) throw new Error("Non-canonical base64");
    } catch { throw new Error("Ein Bonbild in der Sicherung ist ungültig kodiert."); }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.byteLength === 0 || bytes.byteLength > 15 * 1024 * 1024) throw new Error("Ein Bonbild in der Sicherung ist zu groß.");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (actual !== image.sha256) throw new Error("Ein Bonbild in der Sicherung ist beschädigt (Prüfsumme stimmt nicht).");
  }
  return backup;
}

export async function parseNativeBackup(content: string): Promise<NativeBackup> {
  if (content.length > maximumBackupBytes || new TextEncoder().encode(content).byteLength > maximumBackupBytes) {
    throw new Error("Die Sicherung ist zu groß. Unterstützt werden derzeit bis zu 100 MB.");
  }
  let raw: unknown;
  try { raw = JSON.parse(content); } catch { throw new Error("Die Sicherungsdatei enthält kein gültiges JSON."); }
  return validateNativeBackup(raw);
}

export function summarizeBackup(backup: NativeBackup) {
  return {
    exportedAt: backup.exportedAt,
    receipts: backup.receipts.length,
    items: backup.receipts.reduce((sum, row) => sum + receiptDraftSchema.parse(JSON.parse(row.draft_json)).items.length, 0),
    images: backup.images.length,
    trash: backup.receipts.filter((row) => row.deleted_at !== null).length
  };
}
