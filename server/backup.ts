import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
