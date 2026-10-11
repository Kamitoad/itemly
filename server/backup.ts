import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

const backupSchema = z.object({
  schemaVersion: z.literal("1.0"),
  createdAt: z.string(),
  database: z.object({ fileName: z.literal("receipts.sqlite"), dataBase64: z.string() }),
  attachments: z.array(z.object({ fileName: z.string().regex(/^[a-f0-9]{64}\.[a-z0-9]+$/), dataBase64: z.string() }))
});

export type BackupPayload = z.infer<typeof backupSchema>;

export function createBackupPayload(databasePath: string, uploadDirectory: string): BackupPayload {
  const attachments = existsSync(uploadDirectory)
    ? readdirSync(uploadDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /^[a-f0-9]{64}\.[a-z0-9]+$/.test(entry.name))
        .map((entry) => ({ fileName: entry.name, dataBase64: readFileSync(join(uploadDirectory, entry.name)).toString("base64") }))
    : [];
  // Include references from drafts and trash too. Listing the directory alone
  // would silently omit a referenced image that no longer exists.
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const references = database.prepare("SELECT storage_reference, sha256 FROM attachments").all();
    const byName = new Map(attachments.map((attachment) => [attachment.fileName, attachment]));
    for (const reference of references) {
      const fileName = z.string().regex(/^[a-f0-9]{64}\.[a-z0-9]+$/).parse(reference.storage_reference);
      const checksum = z.string().regex(/^[a-f0-9]{64}$/).parse(reference.sha256);
      const image = byName.get(fileName);
      if (!image) throw new Error("Ein gespeichertes Bonbild fehlt. Die vollständige Sicherung wurde nicht erstellt.");
      if (createHash("sha256").update(Buffer.from(image.dataBase64, "base64")).digest("hex") !== checksum) {
        throw new Error("Ein gespeichertes Bonbild ist beschädigt. Die vollständige Sicherung wurde nicht erstellt.");
      }
    }
  } finally {
    database.close();
  }
  return {
    schemaVersion: "1.0",
    createdAt: new Date().toISOString(),
    database: { fileName: "receipts.sqlite", dataBase64: readFileSync(databasePath).toString("base64") },
    attachments
  };
}

export function restoreBackupPayload(rawPayload: unknown, targetDirectory: string): void {
  const payload = backupSchema.parse(rawPayload);
  if (existsSync(targetDirectory) && readdirSync(targetDirectory).length > 0) {
    throw new Error("Restore target must be an empty directory.");
  }
  const receiptDirectory = join(targetDirectory, "receipts");
  mkdirSync(receiptDirectory, { recursive: true });
  writeFileSync(join(targetDirectory, payload.database.fileName), Buffer.from(payload.database.dataBase64, "base64"), { flag: "wx" });
  for (const attachment of payload.attachments) {
    writeFileSync(join(receiptDirectory, attachment.fileName), Buffer.from(attachment.dataBase64, "base64"), { flag: "wx" });
  }
}
