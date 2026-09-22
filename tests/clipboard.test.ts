import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "../src/clipboard.js";

afterEach(() => vi.unstubAllGlobals());

describe("copyText", () => {
  it("uses the modern Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyText("Vorlage")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("Vorlage");
  });

  it("falls back to execCommand when Clipboard API is blocked", async () => {
    const textarea = {
      value: "",
      readOnly: false,
      tabIndex: 0,
      style: {},
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
      remove: vi.fn()
    };
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) } });
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(textarea),
      body: { appendChild: vi.fn() },
      execCommand
    });

    await expect(copyText("Vorlage")).resolves.toBe(true);
    expect(textarea.value).toBe("Vorlage");
    expect(textarea.select).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(textarea.remove).toHaveBeenCalled();
  });

  it("reports failure when neither copy method succeeds", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", {});

    await expect(copyText("Vorlage")).resolves.toBe(false);
  });
});
