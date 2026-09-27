import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  galleryResult: { results: [] as unknown[] },
  readData: "",
  readError: false
}));

vi.mock("@capacitor/camera", () => ({
  Camera: {
    takePhoto: vi.fn(),
    chooseFromGallery: vi.fn(async () => state.galleryResult)
  },
  MediaTypeSelection: { Photo: 0 }
}));

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    readFile: vi.fn(async () => {
      if (state.readError) throw new Error("stale reference");
      return { data: state.readData };
    })
  }
}));

import { Camera } from "@capacitor/camera";
import { Filesystem } from "@capacitor/filesystem";
import { mediaResultToFile, selectNativeImage } from "../src/native/image-picker.js";

describe("native image picker", () => {
  it("reads the native URI into an independent in-memory image", async () => {
    state.readData = btoa("receipt bytes");
    state.galleryResult = { results: [{ uri: "file:///cache/receipt.jpg", metadata: { format: "jpg", size: 13 } }] };
    const file = await selectNativeImage("gallery");
    expect(Camera.chooseFromGallery).toHaveBeenCalledWith(expect.objectContaining({ allowMultipleSelection: false, includeMetadata: true }));
    expect(Filesystem.readFile).toHaveBeenCalledWith({ path: "file:///cache/receipt.jpg" });
    expect(file?.type).toBe("image/jpeg");
    expect(await file?.text()).toBe("receipt bytes");
  });

  it("treats a canceled gallery selection as no image", async () => {
    state.galleryResult = { results: [] };
    await expect(selectNativeImage("gallery")).resolves.toBeNull();
  });

  it("shows a local error when the native URI cannot be read", async () => {
    state.readError = true;
    await expect(mediaResultToFile({ uri: "file:///cache/missing.jpg", metadata: { format: "jpg" } } as Parameters<typeof mediaResultToFile>[0]))
      .rejects.toThrow("konnte nicht gelesen werden");
    state.readError = false;
  });

  it("rejects oversized media before reading", async () => {
    await expect(mediaResultToFile({ uri: "file:///cache/large.jpg", metadata: { format: "jpg", size: 16 * 1024 * 1024 } } as Parameters<typeof mediaResultToFile>[0]))
      .rejects.toThrow("höchstens 15 MB");
  });
});
