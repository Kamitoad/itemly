import type { AttachmentToken, ExtractionResponse, SaveReceiptRequest, UpdateReceiptRequest, ReceiptMutationRequest } from "../shared/receipt.js";
import { Capacitor } from "@capacitor/core";
import * as nativeApi from "./native/api.js";

import type { AppConfig, HistoryEntry, StoredReceipt } from "../shared/receipt-api.js";
export type { AppConfig, HistoryEntry, StoredReceipt } from "../shared/receipt-api.js";

async function json<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || `Anfrage fehlgeschlagen (${response.status})`);
  return body as T;
}

export function loadConfig(): Promise<AppConfig> {
  if (Capacitor.isNativePlatform()) return nativeApi.loadConfig();
  return json<AppConfig>("/api/config");
}

export function prepareReceiptImage(file: File): Promise<AttachmentToken | null> {
  if (Capacitor.isNativePlatform()) return nativeApi.prepareReceiptImage(file);
  return Promise.resolve(null);
}

export async function extractReceipt(file: File): Promise<ExtractionResponse & { extractionError?: string }> {
  if (Capacitor.isNativePlatform()) return nativeApi.extractReceipt(file);
  const data = new FormData();
  data.append("receipt", file);
  return json<ExtractionResponse & { extractionError?: string }>("/api/extractions", { method: "POST", body: data });
}

export async function importChatGptReceipt(content: string, file: File | null): Promise<ExtractionResponse> {
  if (Capacitor.isNativePlatform()) return nativeApi.importChatGptReceipt(content, file);
  const data = new FormData();
  data.append("content", content);
  if (file) data.append("receipt", file);
  return json<ExtractionResponse>("/api/imports/chatgpt", { method: "POST", body: data });
}

export async function saveReceipt(input: SaveReceiptRequest): Promise<{ id: string; receipt: StoredReceipt }> {
  if (Capacitor.isNativePlatform()) return nativeApi.saveReceipt(input);
  return json("/api/receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}

export function loadHistory(search = "", trash = false): Promise<{ receipts: HistoryEntry[] }> {
  if (Capacitor.isNativePlatform()) return nativeApi.loadHistory(search, trash);
  return json(`/api/receipts?q=${encodeURIComponent(search)}&trash=${trash}`);
}

export function updateReceipt(id: string, input: UpdateReceiptRequest): Promise<{ id: string; receipt: StoredReceipt }> {
  if (Capacitor.isNativePlatform()) return nativeApi.updateReceipt(id, input);
  return json(`/api/receipts/${encodeURIComponent(id)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  });
}

export function changeReceiptDeleted(id: string, input: ReceiptMutationRequest, deleted: boolean): Promise<{ id: string; receipt: StoredReceipt }> {
  if (Capacitor.isNativePlatform()) return nativeApi.changeReceiptDeleted(id, input, deleted);
  return json(`/api/receipts/${encodeURIComponent(id)}${deleted ? "" : "/restore"}`, {
    method: deleted ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  });
}

export function loadReceipt(id: string): Promise<{ receipt: StoredReceipt }> {
  if (Capacitor.isNativePlatform()) return nativeApi.loadReceipt(id);
  return json(`/api/receipts/${encodeURIComponent(id)}`);
}
