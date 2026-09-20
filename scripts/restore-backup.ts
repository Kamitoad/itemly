import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { restoreBackupPayload } from "../server/backup.js";

const [, , backupFile, targetDirectory] = process.argv;
if (!backupFile || !targetDirectory) {
  console.error("Usage: pnpm restore <backup.json> <empty-target-directory>");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(resolve(backupFile), "utf8")) as unknown;
const target = resolve(targetDirectory);
restoreBackupPayload(payload, target);
console.log(`Backup restored to ${target}`);
