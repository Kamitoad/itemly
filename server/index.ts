import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z, ZodError } from "zod";
import { attachmentTokenSchema, createEmptyDraft, saveReceiptSchema } from "../shared/receipt.js";
import { parsePastedReceiptJson, ReceiptImportError } from "../shared/receipt-import.js";
import { openDatabase } from "./database.js";
import { createBackupPayload } from "./backup.js";
import { configuredExtractor } from "./extraction.js";
import {
  findDuplicateByHash,
  getReceipt,
  listReceipts,
  ReceiptConflictError,
  saveReceipt,
  storePendingExtraction
} from "./repository.js";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const environmentFile = join(projectRoot, ".env");
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
const dataDir = resolve(process.env.DATA_DIR || join(projectRoot, "data"));
const uploadDir = join(dataDir, "receipts");
const databasePath = join(dataDir, "receipts.sqlite");
mkdirSync(uploadDir, { recursive: true });

const db = openDatabase(databasePath);
const extractor = configuredExtractor(process.env);
const maxUploadBytes = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 15)) * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes, files: 1, fields: 5, fieldSize: 500_000 }
});
const app = express();
const chatGptImportRequestSchema = z.object({ content: z.string().trim().min(1).max(500_000) });
class UnsupportedReceiptImageError extends Error {}

app.disable("x-powered-by");
// Multipart receipt uploads are handled by Multer; only parse explicit JSON requests here.
app.use(express.json({
  limit: "2mb",
  type: (request) => request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase() === "application/json"
}));
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(self)");
  next();
});
app.use("/uploads", express.static(uploadDir, { fallthrough: false, dotfiles: "deny", immutable: true, maxAge: "1y" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, extractor: extractor.provider, model: extractor.model });
});

app.get("/api/config", (_request, response) => {
  response.json({
    extractionMode: extractor.provider === "manual" ? "manual" : "external",
    provider: extractor.provider,
    model: extractor.model,
    disclosure: extractor.provider === "manual"
      ? "Kein KI-Dienst ist konfiguriert. Das Bild bleibt auf diesem Server; die Daten werden manuell eingetragen."
      : "Zur Analyse wird das ausgewählte Bonbild an den konfigurierten externen KI-Dienst übertragen."
  });
});

app.post("/api/extractions", upload.single("receipt"), async (request, response, next) => {
  try {
    if (!request.file) return response.status(400).json({ error: "Bitte ein Bonbild auswählen." });
    const { attachment, duplicateReceiptId } = storeReceiptImage(request.file);
    const extractionId = crypto.randomUUID();

    try {
      const result = await extractor.extract(request.file.buffer, attachment.mimeType);
      storePendingExtraction(db, {
        id: extractionId,
        model: result.model,
        provider: result.provider,
        status: result.status,
        rawResult: result.rawResult,
        uncertaintyFields: result.draft.uncertaintyFields,
        validationErrors: []
      });
      return response.status(201).json({
        draft: result.draft,
        attachment,
        extraction: {
          id: extractionId,
          provider: result.provider,
          model: result.model,
          status: result.status,
          disclosure: result.status === "manual"
            ? "Kein KI-Dienst konfiguriert – bitte Daten manuell erfassen."
            : "Das Bild wurde durch den konfigurierten externen KI-Dienst verarbeitet.",
          duplicateReceiptId
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Extraktionsfehler";
      const fallback = createEmptyDraft();
      storePendingExtraction(db, {
        id: extractionId,
        model: extractor.model,
        provider: extractor.provider,
        status: "failed",
        rawResult: null,
        uncertaintyFields: [],
        validationErrors: [message]
      });
      return response.status(201).json({
        draft: fallback,
        attachment,
        extraction: {
          id: extractionId,
          provider: extractor.provider,
          model: extractor.model,
          status: "failed",
          disclosure: "Die automatische Auswertung ist fehlgeschlagen. Das Bild wurde beibehalten; alle Daten können manuell erfasst werden.",
          duplicateReceiptId
        },
        extractionError: message
      });
    }
  } catch (error) {
    next(error);
  }
});

app.post("/api/imports/chatgpt", upload.single("receipt"), (request, response, next) => {
  try {
    const { content } = chatGptImportRequestSchema.parse(request.body);
    const { draft, rawResult } = parsePastedReceiptJson(content);
    const storedImage = request.file ? storeReceiptImage(request.file) : null;
    const extractionId = crypto.randomUUID();

    storePendingExtraction(db, {
      id: extractionId,
      model: null,
      provider: "chatgpt-paste",
      status: "completed",
      rawResult,
      uncertaintyFields: draft.uncertaintyFields,
      validationErrors: []
    });

    response.status(201).json({
      draft,
      attachment: storedImage?.attachment ?? null,
      extraction: {
        id: extractionId,
        provider: "chatgpt-paste",
        model: null,
        status: "completed",
        disclosure: "JSON wurde aus einem ChatGPT-Chat importiert. Itemly hat keine externe KI-API aufgerufen.",
        duplicateReceiptId: storedImage?.duplicateReceiptId ?? null
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/receipts", (request, response, next) => {
  try {
    const parsed = saveReceiptSchema.parse(request.body);
    if (parsed.attachment) {
      const filePath = join(uploadDir, parsed.attachment.token);
      if (!existsSync(filePath)) return response.status(400).json({ error: "Das Originalbild ist nicht mehr verfügbar." });
    }
    const id = saveReceipt(db, parsed);
    response.status(201).json({ id, receipt: getReceipt(db, id) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/receipts", (request, response) => {
  response.json({ receipts: listReceipts(db, typeof request.query.q === "string" ? request.query.q : "") });
});

app.get("/api/receipts/:id", (request, response) => {
  const receipt = getReceipt(db, request.params.id);
  if (!receipt) return response.status(404).json({ error: "Einkauf nicht gefunden." });
  response.json({ receipt });
});

app.get("/api/receipts/:id/export.json", (request, response) => {
  const receipt = getReceipt(db, request.params.id);
  if (!receipt) return response.status(404).json({ error: "Einkauf nicht gefunden." });
  response.setHeader("Content-Disposition", `attachment; filename=receipt-${request.params.id}.json`);
  response.type("application/json").send(JSON.stringify({ exportedAt: new Date().toISOString(), receipt }, null, 2));
});

app.get("/api/receipts/:id/export.bundle.json", (request, response) => {
  const receipt = getReceipt(db, request.params.id);
  if (!receipt) return response.status(404).json({ error: "Einkauf nicht gefunden." });
  const image = receipt.attachment
    ? {
        fileName: String(receipt.attachment.originalName),
        mimeType: String(receipt.attachment.mimeType),
        sha256: String(receipt.attachment.sha256),
        dataBase64: readFileSync(join(uploadDir, String(receipt.attachment.token))).toString("base64")
      }
    : null;
  response.setHeader("Content-Disposition", `attachment; filename=receipt-${request.params.id}-bundle.json`);
  response.type("application/json").send(JSON.stringify({ schemaVersion: "1.0", exportedAt: new Date().toISOString(), receipt, image }, null, 2));
});

app.get("/api/backup", (_request, response) => {
  db.exec("PRAGMA wal_checkpoint(FULL)");
  response.setHeader("Content-Disposition", `attachment; filename=itemly-backup-${new Date().toISOString().slice(0, 10)}.json`);
  response.type("application/json").send(JSON.stringify(createBackupPayload(databasePath, uploadDir)));
});

const distDir = join(projectRoot, "dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("/{*path}", (_request, response) => response.sendFile(join(distDir, "index.html")));
}

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof UnsupportedReceiptImageError) {
    response.status(415).json({ error: error.message });
    return;
  }
  if (error instanceof ReceiptImportError || (error instanceof Error && error.name === "ReceiptImportError")) {
    response.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof ZodError) {
    response.status(400).json({ error: "Die übermittelten Daten sind ungültig.", details: error.issues });
    return;
  }
  if (error instanceof ReceiptConflictError) {
    response.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof multer.MulterError) {
    response.status(413).json({ error: "Das Bild ist zu groß oder konnte nicht verarbeitet werden." });
    return;
  }
  console.error(error);
  response.status(500).json({ error: "Ein interner Fehler ist aufgetreten. Der Entwurf bleibt erhalten." });
};
app.use(errorHandler);

const port = Number(process.env.PORT || 8787);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`Itemly API listening on http://localhost:${port}`));
}

function normalizeMimeType(value: string): "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif" | null {
  const normalized = value.toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  if (["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(normalized)) {
    return normalized as ReturnType<typeof normalizeMimeType>;
  }
  return null;
}

function extensionForMime(mime: string): string {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" } as Record<string, string>)[mime];
}

function sanitizeOriginalName(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 180);
  return safe || "receipt-image";
}

function storeReceiptImage(file: Express.Multer.File) {
  const mimeType = normalizeMimeType(file.mimetype);
  if (!mimeType) throw new UnsupportedReceiptImageError("Unterstützt werden JPEG, PNG, WebP, HEIC und HEIF.");

  const sha256 = createHash("sha256").update(file.buffer).digest("hex");
  const extension = extensionForMime(mimeType);
  const token = `${sha256}.${extension}`;
  const target = join(uploadDir, token);
  if (!existsSync(target)) writeFileSync(target, file.buffer, { flag: "wx" });

  return {
    attachment: attachmentTokenSchema.parse({
      token,
      mimeType,
      sha256,
      originalName: sanitizeOriginalName(file.originalname),
      imageUrl: `/uploads/${token}`
    }),
    duplicateReceiptId: findDuplicateByHash(db, sha256)
  };
}

export { app, db };
