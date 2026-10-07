import { registerPlugin } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { createUuid } from "../../shared/receipt.js";
import { maximumBackupBytes, parseNativeBackup, type NativeBackup } from "../../shared/native-backup.js";
import { createNativeBackup, restoreNativeBackup } from "./api.js";
import { readLastCurrency } from "../currency-preference.js";

const documents = registerPlugin<{
  save(options: { cacheName: string }): Promise<{ cancelled: boolean }>;
  open(): Promise<{ cancelled: boolean; cacheName?: string }>;
}>("BackupDocuments");

function backupPreferences(): NativeBackup["preferences"] {
  return { lastCurrency: readLastCurrency(), theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light" };
}

export async function exportPhoneBackup(): Promise<boolean> {
  const backup = await createNativeBackup(backupPreferences());
  const content = JSON.stringify(backup);
  if (new TextEncoder().encode(content).byteLength > maximumBackupBytes) throw new Error("Die Sicherung ist zu groß. Unterstützt werden derzeit bis zu 100 MB.");
  const path = `itemly-backup-${createUuid()}.json`;
  try {
    await Filesystem.writeFile({ path, directory: Directory.Cache, data: content, encoding: Encoding.UTF8 });
    return !(await documents.save({ cacheName: path })).cancelled;
  } finally {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
  }
}

export async function selectPhoneBackup(): Promise<NativeBackup | null> {
  const selected = await documents.open();
  if (selected.cancelled) return null;
  const path = selected.cacheName;
  if (!path || !/^itemly-backup-[a-f0-9-]{36}\.json$/.test(path)) throw new Error("Die gewählte Sicherung ist nicht verfügbar.");
  try {
    const { data } = await Filesystem.readFile({ path, directory: Directory.Cache, encoding: Encoding.UTF8 });
    if (typeof data !== "string") throw new Error("Die Sicherung konnte nicht gelesen werden.");
    return await parseNativeBackup(data);
  } finally {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
  }
}

export async function importPhoneBackup(backup: NativeBackup): Promise<{ preferenceWarning: boolean }> {
  const preferences = await restoreNativeBackup(backup);
  let preferenceWarning = false;
  try {
    if (preferences.lastCurrency) localStorage.setItem("itemly-last-currency", preferences.lastCurrency);
    else localStorage.removeItem("itemly-last-currency");
    if (preferences.theme) localStorage.setItem("itemly-theme", preferences.theme);
    else localStorage.removeItem("itemly-theme");
  } catch { preferenceWarning = true; }
  return { preferenceWarning };
}
