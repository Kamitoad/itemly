import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeBackup } from "../shared/native-backup.js";

const state = vi.hoisted(() => ({
  documents: { save: vi.fn(), open: vi.fn() },
  fs: { writeFile: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn() },
  create: vi.fn(), restore: vi.fn(), preference: "CAD" as string | null
}));
vi.mock("@capacitor/core", () => ({ registerPlugin: () => state.documents }));
vi.mock("@capacitor/filesystem", () => ({ Directory: { Cache: "CACHE" }, Encoding: { UTF8: "utf8" }, Filesystem: state.fs }));
vi.mock("../src/native/api.js", () => ({ createNativeBackup: state.create, restoreNativeBackup: state.restore }));
vi.mock("../src/currency-preference.js", () => ({ readLastCurrency: () => state.preference }));
import { exportPhoneBackup, importPhoneBackup, selectPhoneBackup } from "../src/native/backup.js";

function fixture(): NativeBackup {
  return {
    format: "itemly-android-backup", version: 1, exportedAt: "2026-10-06T00:00:00.000Z",
    receipts: [], mutations: [], auditEvents: [], images: [], preferences: { lastCurrency: "CAD", theme: "dark" }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.documents.save.mockResolvedValue({ cancelled: false });
  state.documents.open.mockResolvedValue({ cancelled: true });
  state.fs.deleteFile.mockResolvedValue(undefined);
  state.fs.writeFile.mockResolvedValue(undefined);
  state.create.mockResolvedValue(fixture());
  state.restore.mockResolvedValue(fixture().preferences);
  vi.stubGlobal("document", { documentElement: { dataset: { theme: "dark" } } });
  vi.stubGlobal("localStorage", { setItem: vi.fn(), removeItem: vi.fn() });
});

describe("user-initiated native backup document bridge", () => {
  it("exports through the Android document picker and deletes its private temporary file", async () => {
    await expect(exportPhoneBackup()).resolves.toBe(true);
    expect(state.create).toHaveBeenCalledWith({ lastCurrency: "CAD", theme: "dark" });
    const written = state.fs.writeFile.mock.calls[0][0];
    expect(written).toMatchObject({ directory: "CACHE", encoding: "utf8" });
    expect(JSON.parse(written.data)).toEqual(fixture());
    expect(state.documents.save).toHaveBeenCalledWith({ cacheName: written.path });
    expect(state.fs.deleteFile).toHaveBeenCalledWith({ path: written.path, directory: "CACHE" });
  });
  it("does not report success when export is cancelled and cleans up failures", async () => {
    state.documents.save.mockResolvedValueOnce({ cancelled: true });
    await expect(exportPhoneBackup()).resolves.toBe(false);
    state.documents.save.mockRejectedValueOnce(new Error("Provider unavailable"));
    await expect(exportPhoneBackup()).rejects.toThrow("Provider unavailable");
    expect(state.fs.deleteFile).toHaveBeenCalledTimes(2);
  });
  it("does not read a file when import is cancelled", async () => {
    await expect(selectPhoneBackup()).resolves.toBeNull();
    expect(state.fs.readFile).not.toHaveBeenCalled();
    expect(state.restore).not.toHaveBeenCalled();
  });
  it("validates the selected file before presenting a preview and always clears its cache copy", async () => {
    const cacheName = "itemly-backup-00000000-0000-4000-8000-000000000000.json";
    state.documents.open.mockResolvedValue({ cancelled: false, cacheName });
    state.fs.readFile.mockResolvedValueOnce({ data: JSON.stringify(fixture()) });
    await expect(selectPhoneBackup()).resolves.toEqual(fixture());
    expect(state.restore).not.toHaveBeenCalled();
    state.fs.readFile.mockResolvedValueOnce({ data: "broken" });
    await expect(selectPhoneBackup()).rejects.toThrow("gültiges JSON");
    expect(state.fs.deleteFile).toHaveBeenCalledTimes(2);
  });
  it("refuses unexpected cache paths returned by the bridge", async () => {
    state.documents.open.mockResolvedValue({ cancelled: false, cacheName: "../../database" });
    await expect(selectPhoneBackup()).rejects.toThrow("nicht verfügbar");
    expect(state.fs.readFile).not.toHaveBeenCalled();
  });
  it("writes preferences only after a successful database restore and treats preference failure as a warning", async () => {
    state.restore.mockRejectedValueOnce(new Error("Database not empty"));
    await expect(importPhoneBackup(fixture())).rejects.toThrow("Database not empty");
    expect(localStorage.setItem).not.toHaveBeenCalled();
    await expect(importPhoneBackup(fixture())).resolves.toEqual({ preferenceWarning: false });
    expect(localStorage.setItem).toHaveBeenCalledWith("itemly-last-currency", "CAD");
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error("Quota exceeded"); });
    await expect(importPhoneBackup(fixture())).resolves.toEqual({ preferenceWarning: true });
  });
  it("restores absent preferences without retaining stale currency suggestions", async () => {
    state.restore.mockResolvedValue({ lastCurrency: null, theme: null });
    await importPhoneBackup(fixture());
    expect(localStorage.removeItem).toHaveBeenCalledWith("itemly-last-currency");
    expect(localStorage.removeItem).toHaveBeenCalledWith("itemly-theme");
  });
  it("does not write or launch the picker for an oversized backup", async () => {
    // Exercise the byte-size boundary without allocating a 100 MB fixture.
    const encode = vi.spyOn(TextEncoder.prototype, "encode").mockReturnValueOnce({ byteLength: 100 * 1024 * 1024 + 1 } as Uint8Array<ArrayBuffer>);
    try {
      await expect(exportPhoneBackup()).rejects.toThrow("100 MB");
      expect(state.documents.save).not.toHaveBeenCalled();
      expect(state.fs.writeFile).not.toHaveBeenCalled();
    } finally { encode.mockRestore(); }
  });
});
