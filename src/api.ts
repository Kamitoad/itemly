import type { AttachmentToken, ExtractionResponse, ReceiptDraft } from "../shared/receipt.js";
import { Capacitor } from "@capacitor/core";
import * as nativeApi from "./native/api.js";

export interface AppConfig {
  extractionMode: "manual" | "external";
  provider: string;
  model: string | null;
  disclosure: string;
}

export interface HistoryEntry {
  id: string;
  merchantName: string | null;
  purchasedDate: string | null;
  purchasedTime: string | null;
  scannedAt: string;
  totalMinor: number | null;
  currency: string;
  positionCount: number;
  status: "draft" | "confirmed";
  validationState: "incomplete" | "discrepancy" | "balanced";
}

export interface StoredReceipt {
  id: string;
  status: "draft" | "confirmed";
  validationState: "incomplete" | "discrepancy" | "balanced";
  scannedAt: string;
  confirmedAt: string | null;
  draft: ReceiptDraft;
  attachment: AttachmentToken | null;
  calculations: {
    positionCount: number;
    itemCount: number | null;
    itemsTotalMinor: number;
    adjustmentsTotalMinor: number;
    calculatedTotalMinor: number;
    differenceMinor: number | null;
    isBalanced: boolean;
    missingPriceCount: number;
  };
}

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

export async function saveReceipt(input: {
  clientMutationId: string;
  status: "draft" | "confirmed";
  draft: ReceiptDraft;
  attachment: AttachmentToken | null;
  extractionId: string | null;
}): Promise<{ id: string; receipt: StoredReceipt }> {
  if (Capacitor.isNativePlatform()) return nativeApi.saveReceipt(input);
  return json("/api/receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}

export function loadHistory(search = ""): Promise<{ receipts: HistoryEntry[] }> {
  if (Capacitor.isNativePlatform()) return nativeApi.loadHistory(search);
  return json(`/api/receipts?q=${encodeURIComponent(search)}`);
}

export function loadReceipt(id: string): Promise<{ receipt: StoredReceipt }> {
  if (Capacitor.isNativePlatform()) return nativeApi.loadReceipt(id);
  return json(`/api/receipts/${encodeURIComponent(id)}`);
}
