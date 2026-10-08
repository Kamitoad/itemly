// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App.js";
import * as api from "../src/api.js";
import { calculateReceipt, createEmptyDraft, createEmptyItem, createUuid, type ReceiptDraft } from "../shared/receipt.js";
import type { StoredReceipt } from "../src/api.js";

// Only persistence/platform boundaries are mocked. App navigation, parent state,
// review controls, money inputs, and the save-screen guard are real React UI.
vi.mock("../src/api.js", () => ({
  loadConfig: vi.fn(), loadHistory: vi.fn(), loadReceipt: vi.fn(),
  importChatGptReceipt: vi.fn(), saveReceipt: vi.fn(), updateReceipt: vi.fn(),
  changeReceiptDeleted: vi.fn(), prepareReceiptImage: vi.fn(), extractReceipt: vi.fn()
}));
vi.mock("../src/BackupPanel.js", () => ({ default: () => null }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("../src/native/image-picker.js", () => ({ selectNativeImage: vi.fn() }));

function exampleDraft(): ReceiptDraft {
  const item = { ...createEmptyItem(1), normalizedName: "Kaffee", rawName: "COFFEE RAW", quantity: "1.000001", unitPriceMinor: 129, lineTotalMinor: 129, source: "extracted" as const };
  return { ...createEmptyDraft("CAD"), merchantName: "Testmarkt", items: [item], subtotalMinor: 129, receiptDiscountMinor: 0, taxTotalMinor: 0, totalMinor: 129, fieldSources: { totalMinor: "extracted" } };
}

function stored(draft: ReceiptDraft, id = createUuid(), revision = 1): StoredReceipt {
  return { id, revision, deletedAt: null, status: "confirmed", validationState: "balanced", scannedAt: "2026-10-08T12:00:00Z", confirmedAt: "2026-10-08T12:00:00Z", draft, attachment: null, calculations: calculateReceipt(draft) };
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  document.documentElement.dataset.theme = "dark";
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.mocked(api.loadConfig).mockResolvedValue({ extractionMode: "manual", provider: "manual", model: null, disclosure: "" });
  vi.mocked(api.loadHistory).mockResolvedValue({ receipts: [] });
  vi.mocked(api.saveReceipt).mockImplementation(async (input) => ({ id: "new-receipt", receipt: stored(input.draft, "new-receipt") }));
  vi.mocked(api.updateReceipt).mockImplementation(async (id, input) => ({ id, receipt: stored(input.draft, id, input.expectedRevision + 1) }));
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

type User = ReturnType<typeof userEvent.setup>;

function startApp() {
  const user = userEvent.setup();
  render(<StrictMode><App /></StrictMode>);
  return user;
}

async function openImportedReview(draft = exampleDraft()) {
  const extractionId = createUuid();
  vi.mocked(api.importChatGptReceipt).mockResolvedValue({ draft, attachment: null, extraction: { id: extractionId, provider: "chatgpt-paste", model: null, status: "completed", disclosure: "", duplicateReceiptId: null } });
  const user = startApp();
  await user.click(screen.getByRole("button", { name: "Neuen Bon hinzufügen" }));
  await user.click(screen.getByRole("button", { name: /ChatGPT-JSON importieren/ }));
  await user.type(screen.getByRole("textbox", { name: "Antwort aus ChatGPT" }), "fixture");
  await user.click(screen.getByRole("button", { name: /JSON prüfen und übernehmen/ }));
  await screen.findByRole("heading", { name: "Einkauf prüfen" });
  return { user, extractionId };
}

function money(name: string): HTMLInputElement {
  return screen.getByRole("textbox", { name: (label) => label === name || label.startsWith(`${name} `) }) as HTMLInputElement;
}

async function replace(user: User, input: HTMLInputElement, text: string) {
  await user.clear(input);
  await user.type(input, text);
}

describe("rendered receipt review", () => {
  it.each(["Stückpreis", "Positionssumme", "Gedruckte Zwischensumme", "Rabatte auf den Gesamtbon", "Steuern (GST/PST)", "Gedruckter Gesamtbetrag"])("preserves partial input and caret in %s through parent updates", async (label) => {
    const { user } = await openImportedReview();
    // Use the exact label rather than parsing punctuation in a regular expression.
    const input = screen.getByRole("textbox", { name: (name) => name.startsWith(label) }) as HTMLInputElement;
    await replace(user, input, "1,29");
    await user.keyboard("{End}{Backspace}{Backspace}");
    expect(input.value).toBe("1,");
    expect(input.selectionStart).toBe(2);
    await user.keyboard("3");
    expect(input.value).toBe("1,3");
    expect(input.selectionStart).toBe(3);
    await user.keyboard("2");
    expect(input.value).toBe("1,32");
    expect(input.selectionStart).toBe(4);
    await user.tab();
    expect(input.value).toBe("1,32");
    await user.click(screen.getByRole("button", { name: "Als Entwurf" }));
    await waitFor(() => expect(api.saveReceipt).toHaveBeenCalledOnce());
    const saved = vi.mocked(api.saveReceipt).mock.calls[0][0].draft;
    const value = label === "Stückpreis" ? saved.items[0].unitPriceMinor : label === "Positionssumme" ? saved.items[0].lineTotalMinor : label === "Gedruckte Zwischensumme" ? saved.subtotalMinor : label === "Rabatte auf den Gesamtbon" ? saved.receiptDiscountMinor : label === "Steuern (GST/PST)" ? saved.taxTotalMinor : saved.totalMinor;
    expect(value).toBe(132);
    expect(saved.items[0].rawName).toBe("COFFEE RAW");
    expect(saved.items[0].quantity).toBe("1.000001");
  });

  it.each(["Stückpreis", "Gedruckter Gesamtbetrag"])("allows clearing, replacement and decimal-point formatting on blur in %s", async (label) => {
    const { user } = await openImportedReview();
    const input = money(label);
    await user.clear(input);
    expect(input.value).toBe("");
    await user.tab();
    expect(input.value).toBe("");
    await user.type(input, "1.");
    expect(input.value).toBe("1.");
    await user.keyboard("3");
    expect(input.value).toBe("1.3");
    await user.tab();
    expect(input.value).toBe("1,30");
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Als Entwurf" }));
    await waitFor(() => expect(api.saveReceipt).toHaveBeenCalledOnce());
    const saved = vi.mocked(api.saveReceipt).mock.calls[0][0].draft;
    expect(label === "Stückpreis" ? saved.items[0].unitPriceMinor : saved.totalMinor).toBeNull();
  });

  it.each(["Positionssumme", "Gedruckter Gesamtbetrag"])("blocks proceeding or saving invalid %s and accepts a corrected amount", async (label) => {
    const { user } = await openImportedReview();
    const input = money(label);
    await replace(user, input, "1,302");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.validity.customError).toBe(true);
    await user.tab();
    expect(input.value).toBe("1,302");
    expect(screen.getByRole("alert").textContent).toContain("höchstens zwei Nachkommastellen");
    await user.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("heading", { name: "Einkauf prüfen" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Als Entwurf" }));
    expect(api.saveReceipt).not.toHaveBeenCalled();
    await replace(user, input, "1,29");
    await user.tab();
    expect(input.validity.valid).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("button", { name: "Einkauf speichern" }).hasAttribute("disabled")).toBe(false);
  });

  it("updates calculated totals without overwriting the printed amount or extraction link", async () => {
    const { user, extractionId } = await openImportedReview();
    await replace(user, money("Positionssumme"), "1,32");
    expect(money("Gedruckter Gesamtbetrag").value).toBe("1,29");
    expect(screen.getByText("Prüfung erforderlich")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("button", { name: "Einkauf speichern" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Zurück zur Prüfung" }));
    await replace(user, money("Gedruckter Gesamtbetrag"), "1,32");
    await user.click(screen.getByRole("button", { name: "Weiter" }));
    await user.click(screen.getByRole("button", { name: "Einkauf speichern" }));
    await waitFor(() => expect(api.saveReceipt).toHaveBeenCalledOnce());
    expect(vi.mocked(api.saveReceipt).mock.calls[0][0]).toMatchObject({ status: "confirmed", extractionId, draft: { totalMinor: 132, items: [{ rawName: "COFFEE RAW", lineTotalMinor: 132, verified: false }] } });
  });

  it.each(["abc", "-", "9007199254740992"])("rejects invalid final input %s without falling back to a previous price", async (text) => {
    const { user } = await openImportedReview();
    const input = money("Positionssumme");
    await replace(user, input, text);
    await user.tab();
    expect(input.value).toBe(text);
    expect(input.validity.customError).toBe(true);
    expect(screen.getByText("Unvollständige Daten")).toBeTruthy();
    expect(money("Gedruckter Gesamtbetrag").value).toBe("1,29");
    await user.click(screen.getByRole("button", { name: "Als Entwurf" }));
    expect(api.saveReceipt).not.toHaveBeenCalled();
  });

  it("removes and undoes an item without changing its identity, quantity or raw text", async () => {
    const draft = exampleDraft();
    const { user } = await openImportedReview(draft);
    await user.click(screen.getByRole("button", { name: "Artikel entfernen" }));
    expect(screen.getByText("Noch keine Artikel")).toBeTruthy();
    expect(money("Gedruckter Gesamtbetrag").value).toBe("1,29");
    await user.click(screen.getByRole("button", { name: "Rückgängig" }));
    await user.click(screen.getByRole("button", { name: "Als Entwurf" }));
    await waitFor(() => expect(api.saveReceipt).toHaveBeenCalledOnce());
    expect(vi.mocked(api.saveReceipt).mock.calls[0][0].draft.items).toEqual(draft.items);
  });

  it("adds a manually created item and persists exact amounts and quantities", async () => {
    const user = startApp();
    await user.click(screen.getByRole("button", { name: "Neuen Bon hinzufügen" }));
    await user.click(screen.getByRole("button", { name: /Ohne Bild manuell erfassen/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: /Währung/ }), "CAD");
    await user.click(screen.getByRole("button", { name: "Artikel hinzufügen" }));
    await user.type(screen.getByRole("textbox", { name: "Produktname" }), "Äpfel");
    await replace(user, money("Menge"), "0,405001");
    await user.type(money("Positionssumme"), "1,32");
    await user.type(money("Gedruckter Gesamtbetrag"), "1,32");
    await user.click(screen.getByRole("button", { name: "Weiter" }));
    await user.click(screen.getByRole("button", { name: "Einkauf speichern" }));
    await waitFor(() => expect(api.saveReceipt).toHaveBeenCalledOnce());
    expect(vi.mocked(api.saveReceipt).mock.calls[0][0]).toMatchObject({ status: "confirmed", draft: { totalMinor: 132, items: [{ normalizedName: "Äpfel", quantity: "0.405001", lineTotalMinor: 132, verified: false }] } });
    expect(api.updateReceipt).not.toHaveBeenCalled();
  });

  it("adds an item to a saved receipt without creating a second receipt", async () => {
    const original = stored(exampleDraft());
    vi.mocked(api.loadHistory).mockResolvedValue({ receipts: [{ id: original.id, merchantName: "Testmarkt", purchasedDate: null, purchasedTime: null, scannedAt: original.scannedAt, totalMinor: 129, currency: "CAD", positionCount: 1, status: "confirmed", validationState: "balanced" }] });
    vi.mocked(api.loadReceipt).mockResolvedValue({ receipt: original });
    const user = startApp();
    await user.click(await screen.findByRole("button", { name: /Testmarkt/ }));
    await user.click(screen.getByRole("button", { name: "Beleg bearbeiten" }));
    await user.click(screen.getByRole("button", { name: /＋ Artikel/ }));
    await user.type(screen.getByRole("textbox", { name: "Produktname" }), "Milch");
    await user.type(money("Positionssumme"), "2,00");
    await replace(user, money("Gedruckter Gesamtbetrag"), "3,29");
    await user.click(screen.getByRole("button", { name: "Weiter" }));
    await user.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    await waitFor(() => expect(api.updateReceipt).toHaveBeenCalledOnce());
    expect(vi.mocked(api.updateReceipt).mock.calls[0]).toMatchObject([original.id, { expectedRevision: 1, status: "confirmed", draft: { totalMinor: 329, items: [{ id: original.draft.items[0].id, rawName: "COFFEE RAW", quantity: "1.000001", lineTotalMinor: 129 }, { normalizedName: "Milch", lineTotalMinor: 200 }] } }]);
    expect(api.saveReceipt).not.toHaveBeenCalled();
    expect(original.draft.items).toHaveLength(1);
  });
});
