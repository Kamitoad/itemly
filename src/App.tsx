import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  calculateReceipt,
  createEmptyDraft,
  createEmptyItem,
  createUuid,
  formatMoney,
  type AttachmentToken,
  type ReceiptDraft,
  type ReceiptItem
} from "../shared/receipt";
import { chatGptReceiptPrompt } from "../shared/receipt-import";
import { copyText } from "./clipboard";
import { groupHistoryEntries } from "./history";
import {
  extractReceipt,
  importChatGptReceipt,
  loadConfig,
  loadHistory,
  loadReceipt,
  saveReceipt,
  type AppConfig,
  type HistoryEntry,
  type StoredReceipt
} from "./api";

type Screen = "capture" | "json-import" | "extracting" | "review" | "save" | "history" | "detail";
type Notice = { tone: "success" | "warning" | "error"; message: string } | null;
type Theme = "light" | "dark";

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const [screen, setScreen] = useState<Screen>("history");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft>(() => createEmptyDraft());
  const [attachment, setAttachment] = useState<AttachmentToken | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [clientMutationId, setClientMutationId] = useState(() => createUuid());
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<StoredReceipt | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig).catch((error: Error) => setNotice({ tone: "error", message: error.message }));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("itemly-theme", theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0a1117" : "#176b4d");
  }, [theme]);

  useEffect(() => () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function navigate(next: Screen) {
    setNotice(null);
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetCapture() {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setDraft(createEmptyDraft());
    setAttachment(null);
    setExtractionId(null);
    setClientMutationId(createUuid());
    setSelectedReceipt(null);
    navigate("capture");
  }

  function chooseFile(selected: File | null) {
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setNotice({ tone: "error", message: "Bitte wähle eine Bilddatei aus." });
      return;
    }
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setNotice(null);
  }

  async function analyze() {
    if (!file) return;
    navigate("extracting");
    try {
      const result = await extractReceipt(file);
      setDraft(result.draft);
      setAttachment(result.attachment);
      setExtractionId(result.extraction.id);
      setPreviewUrl(result.attachment?.imageUrl ?? previewUrl);
      if (result.extraction.duplicateReceiptId) {
        setNotice({ tone: "warning", message: "Dieses Bonbild wurde bereits gespeichert. Du kannst die vorhandene Version im Verlauf öffnen." });
      } else if (result.extraction.status === "failed") {
        setNotice({ tone: "warning", message: "Die automatische Auswertung ist fehlgeschlagen. Das Bild bleibt erhalten; bitte erfasse die Werte manuell." });
      } else if (result.extraction.status === "manual") {
        setNotice({ tone: "warning", message: "Kein KI-Dienst ist eingerichtet. Das Bild ist bereit für die manuelle Erfassung." });
      } else {
        setNotice({ tone: "success", message: "Scan abgeschlossen. Bitte prüfe alle erkannten Angaben." });
      }
      navigateKeepingNotice("review");
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Die Analyse ist fehlgeschlagen." });
      setScreen("capture");
    }
  }

  async function importFromChatGpt(content: string) {
    const result = await importChatGptReceipt(content, file);
    setDraft(result.draft);
    setAttachment(result.attachment);
    setExtractionId(result.extraction.id);
    setPreviewUrl(result.attachment?.imageUrl ?? previewUrl);
    setNotice(result.extraction.duplicateReceiptId
      ? { tone: "warning", message: "Dieses Bonbild wurde bereits gespeichert. Prüfe den importierten Entwurf, bevor du fortfährst." }
      : { tone: "success", message: "ChatGPT-JSON wurde geprüft und übernommen. Bitte kontrolliere jetzt alle Angaben." });
    navigateKeepingNotice("review");
  }

  function navigateKeepingNotice(next: Screen) {
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startManual() {
    setDraft(createEmptyDraft());
    setAttachment(null);
    setExtractionId(null);
    setNotice({ tone: "warning", message: "Manuelle Erfassung: Unbekannte Angaben können leer bleiben." });
    navigateKeepingNotice("review");
  }

  async function persist(status: "draft" | "confirmed") {
    setSaving(true);
    setNotice(null);
    try {
      const result = await saveReceipt({ clientMutationId, status, draft, attachment, extractionId });
      setSelectedReceipt(result.receipt);
      setNotice({ tone: "success", message: status === "confirmed" ? "Einkauf wurde sicher gespeichert." : "Entwurf wurde gespeichert." });
      navigateKeepingNotice("detail");
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Speichern fehlgeschlagen. Dein Entwurf bleibt erhalten." });
    } finally {
      setSaving(false);
    }
  }

  async function openReceipt(id: string) {
    try {
      const result = await loadReceipt(id);
      setSelectedReceipt(result.receipt);
      navigate("detail");
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Einkauf konnte nicht geladen werden." });
    }
  }

  const activeStep = screen === "capture" || screen === "json-import" || screen === "extracting" ? 0 : screen === "review" ? 1 : 2;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate("history")} aria-label="Zur Übersicht">
          <span className="brand-mark"><ReceiptIcon /></span>
          <span><strong>Itemly</strong><small>Deine Einkäufe, klar erfasst.</small></span>
        </button>
        <div className="topbar-actions">
          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "Hellen Modus aktivieren" : "Dunklen Modus aktivieren"}
            aria-pressed={theme === "dark"}
            title={theme === "dark" ? "Heller Modus" : "Dunkler Modus"}
          >
            <span className="theme-toggle-track"><span>{theme === "dark" ? <MoonIcon /> : <SunIcon />}</span></span>
            <small>{theme === "dark" ? "Dunkel" : "Hell"}</small>
          </button>
          {screen !== "history" && <button className="history-link" onClick={() => navigate("history")}><HistoryIcon /> Einkäufe</button>}
        </div>
      </header>

      <main>
        {screen !== "history" && screen !== "detail" && <Progress active={activeStep} />}
        {notice && <NoticeBanner notice={notice} onClose={() => setNotice(null)} />}
        {screen === "capture" && (
          <CaptureScreen
            file={file}
            previewUrl={previewUrl}
            config={config}
            onChoose={chooseFile}
            onAnalyze={analyze}
            onJsonImport={() => navigate("json-import")}
            onManual={startManual}
          />
        )}
        {screen === "json-import" && (
          <JsonImportScreen
            file={file}
            previewUrl={previewUrl}
            onChoose={chooseFile}
            onBack={() => navigate("capture")}
            onImport={importFromChatGpt}
          />
        )}
        {screen === "extracting" && <ExtractingScreen previewUrl={previewUrl} />}
        {screen === "review" && (
          <ReviewScreen
            draft={draft}
            imageUrl={previewUrl}
            onChange={setDraft}
            onNext={() => navigate("save")}
            onSaveDraft={() => persist("draft")}
            saving={saving}
          />
        )}
        {screen === "save" && (
          <SaveScreen
            draft={draft}
            imageUrl={previewUrl}
            onBack={() => navigate("review")}
            onSave={persist}
            saving={saving}
          />
        )}
        {screen === "history" && <HistoryScreen onOpen={openReceipt} onNew={resetCapture} />}
        {screen === "detail" && selectedReceipt && (
          <DetailScreen receipt={selectedReceipt} onBack={() => navigate("history")} onNew={resetCapture} />
        )}
      </main>
    </div>
  );
}

function Progress({ active }: { active: number }) {
  return (
    <nav className="progress" aria-label="Fortschritt">
      {["Scan", "Prüfen", "Speichern"].map((label, index) => (
        <div key={label} className={`progress-step ${index <= active ? "active" : ""}`}>
          <span>{index < active ? <CheckIcon /> : index + 1}</span>
          <small>{label}</small>
        </div>
      ))}
    </nav>
  );
}

function NoticeBanner({ notice, onClose }: { notice: Exclude<Notice, null>; onClose: () => void }) {
  return (
    <div className={`notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
      <span>{notice.tone === "success" ? <CheckIcon /> : <AlertIcon />}</span>
      <p>{notice.message}</p>
      <button onClick={onClose} aria-label="Hinweis schließen">×</button>
    </div>
  );
}

function CaptureScreen({
  file,
  previewUrl,
  config,
  onChoose,
  onAnalyze,
  onJsonImport,
  onManual
}: {
  file: File | null;
  previewUrl: string | null;
  config: AppConfig | null;
  onChoose: (file: File | null) => void;
  onAnalyze: () => void;
  onJsonImport: () => void;
  onManual: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  return (
    <section className="capture page narrow">
      <div className="eyebrow">Neuer Einkauf</div>
      <h1>Neuen Bon erfassen</h1>
      <p className="lead">Fotografiere deinen Kassenbon. Du kontrollierst jeden erkannten Wert, bevor etwas gespeichert wird.</p>

      <input ref={cameraRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => onChoose(event.target.files?.[0] ?? null)} />
      <input ref={galleryRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => onChoose(event.target.files?.[0] ?? null)} />

      {previewUrl ? (
        <div className="capture-preview">
          <img src={previewUrl} alt="Vorschau des ausgewählten Kassenbons" />
          <div className="preview-meta"><CheckIcon /><span><strong>{file?.name}</strong><small>Bereit zur Analyse</small></span></div>
        </div>
      ) : (
        <div className="scan-illustration" aria-hidden="true">
          <div className="scan-corners"><ReceiptLargeIcon /><span /></div>
        </div>
      )}

      <div className="capture-actions">
        <button className="button primary large" onClick={() => cameraRef.current?.click()}><CameraIcon /> Foto aufnehmen</button>
        <button className="button secondary large" onClick={() => galleryRef.current?.click()}><ImageIcon /> Bild aus Galerie wählen</button>
      </div>

      {previewUrl && (
        <div className="consent-card">
          <div><ShieldIcon /></div>
          <p><strong>Vor dem Analysieren</strong><span>{config?.disclosure ?? "Konfiguration wird geladen …"}</span></p>
          <button className="button primary" onClick={onAnalyze}>Bon jetzt analysieren <ArrowIcon /></button>
        </div>
      )}

      <button className="button chatgpt-import-button" onClick={onJsonImport}><CodeIcon /> ChatGPT-JSON importieren</button>
      <button className="text-button" onClick={onManual}>Ohne Bild manuell erfassen</button>
      <p className="privacy-note"><LockIcon /> Erst nach „Bon jetzt analysieren“ wird ein Bild verarbeitet.</p>
    </section>
  );
}

function JsonImportScreen({ file, previewUrl, onChoose, onBack, onImport }: {
  file: File | null;
  previewUrl: string | null;
  onChoose: (file: File | null) => void;
  onBack: () => void;
  onImport: (content: string) => Promise<void>;
}) {
  const imageRef = useRef<HTMLInputElement>(null);
  const promptDetailsRef = useRef<HTMLDetailsElement>(null);
  const promptTextRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyPrompt() {
    if (await copyText(chatGptReceiptPrompt)) {
      setCopyState("copied");
      return;
    }

    setCopyState("failed");
    if (promptDetailsRef.current) promptDetailsRef.current.open = true;
    requestAnimationFrame(() => {
      promptTextRef.current?.focus();
      promptTextRef.current?.select();
    });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await onImport(content);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Das JSON konnte nicht importiert werden.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page narrow json-import-page">
      <button className="text-button back" onClick={onBack}>← Zurück</button>
      <div className="eyebrow">Ohne API-Schlüssel</div>
      <h1>ChatGPT-JSON importieren</h1>
      <p className="lead">Lass deinen Bon in einem normalen ChatGPT-Chat auslesen und füge das Ergebnis hier ein. Itemly prüft die Struktur, bevor du jeden Wert kontrollierst.</p>

      <section className="import-step-card">
        <div className="import-step-heading"><span>1</span><div><h2>Vorlage kopieren</h2><p>Füge diese Anweisung zusammen mit deinem Bonbild in ChatGPT ein.</p></div></div>
        <details ref={promptDetailsRef} className="prompt-preview">
          <summary>Vorlage anzeigen</summary>
          <textarea
            ref={promptTextRef}
            aria-label="ChatGPT-Vorlage"
            readOnly
            value={chatGptReceiptPrompt}
            onFocus={(event) => event.currentTarget.select()}
          />
        </details>
        <button className="button secondary" onClick={copyPrompt}><CodeIcon /> {copyState === "copied" ? "Vorlage kopiert" : "Vorlage kopieren"}</button>
        {copyState === "failed" && <p className="inline-error">Direktes Kopieren wurde vom Browser blockiert. Die Vorlage ist markiert – halte den Text gedrückt und tippe auf „Kopieren“.</p>}
      </section>

      <section className="import-step-card">
        <div className="import-step-heading"><span>2</span><div><h2>Originalbon lokal ablegen</h2><p>Optional, aber empfohlen. Das Bild wird von Itemly nicht an ChatGPT gesendet.</p></div></div>
        <input ref={imageRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => onChoose(event.target.files?.[0] ?? null)} />
        {previewUrl && <div className="import-image-preview"><img src={previewUrl} alt="Vorschau des Originalbons" /><span>{file?.name ?? "Originalbon ausgewählt"}</span></div>}
        <button className="button ghost" onClick={() => imageRef.current?.click()}><ImageIcon /> {file ? "Anderes Bild wählen" : "Bonbild auswählen"}</button>
      </section>

      <section className="import-step-card">
        <div className="import-step-heading"><span>3</span><div><h2>JSON einfügen</h2><p>Ein reiner JSON-Block oder ein mit ```json markierter Block wird akzeptiert.</p></div></div>
        <label className="json-input-label">
          <span>Antwort aus ChatGPT</span>
          <textarea
            rows={14}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={'{\n  "merchantName": "…",\n  "currency": "EUR",\n  "items": []\n}'}
            spellCheck={false}
          />
        </label>
        {error && <div className="import-error" role="alert"><AlertIcon /><span>{error}</span></div>}
        <button className="button primary large" disabled={submitting || content.trim().length === 0} onClick={submit}>
          {submitting ? "JSON wird geprüft …" : "JSON prüfen und übernehmen"} {!submitting && <ArrowIcon />}
        </button>
      </section>

      <p className="privacy-note"><ShieldIcon /> Importierte Angaben gelten als ungeprüft und werden niemals automatisch bestätigt.</p>
    </section>
  );
}

function ExtractingScreen({ previewUrl }: { previewUrl: string | null }) {
  return (
    <section className="page narrow extraction-screen">
      <div className="eyebrow">Analyse</div>
      <h1>Kassenbon wird analysiert</h1>
      <p className="lead">Artikel, Summen und Zahlungsinformationen werden strukturiert. Fehlende Angaben bleiben bewusst leer.</p>
      <div className="analysis-visual">
        {previewUrl && <img src={previewUrl} alt="Kassenbon während der Analyse" />}
        <div className="scan-line" />
      </div>
      <div className="analysis-status"><span className="spinner" /><strong>Bild wird ausgewertet …</strong></div>
    </section>
  );
}

function ReviewScreen({
  draft,
  imageUrl,
  onChange,
  onNext,
  onSaveDraft,
  saving
}: {
  draft: ReceiptDraft;
  imageUrl: string | null;
  onChange: (draft: ReceiptDraft) => void;
  onNext: () => void;
  onSaveDraft: () => void;
  saving: boolean;
}) {
  const [showImage, setShowImage] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(draft.items[0]?.id ?? null);
  const [removed, setRemoved] = useState<{ item: ReceiptItem; index: number } | null>(null);
  const calculations = useMemo(() => calculateReceipt(draft), [draft]);

  function field<K extends keyof ReceiptDraft>(key: K, value: ReceiptDraft[K]) {
    onChange({ ...draft, [key]: value, fieldSources: { ...draft.fieldSources, [key]: "user_entered" } });
  }

  function updateItem(id: string, item: ReceiptItem) {
    onChange({ ...draft, items: draft.items.map((current) => current.id === id ? item : current) });
  }

  function removeItem(id: string) {
    const index = draft.items.findIndex((item) => item.id === id);
    if (index < 0) return;
    setRemoved({ item: draft.items[index], index });
    onChange({ ...draft, items: draft.items.filter((item) => item.id !== id) });
    setExpandedId(null);
  }

  function undoRemove() {
    if (!removed) return;
    const next = [...draft.items];
    next.splice(removed.index, 0, removed.item);
    onChange({ ...draft, items: next });
    setRemoved(null);
  }

  function addItem() {
    const item = createEmptyItem(draft.items.length + 1);
    onChange({ ...draft, items: [...draft.items, item] });
    setExpandedId(item.id);
  }

  return (
    <section className="page review-page">
      <div className="review-heading">
        <div><div className="eyebrow">Ergebnis kontrollieren</div><h1>Einkauf prüfen</h1></div>
        {imageUrl && <button className="button ghost" onClick={() => setShowImage(!showImage)}><ReceiptIcon /> {showImage ? "Bon ausblenden" : "Originalbon"}</button>}
      </div>

      <StatusPill calculations={calculations} uncertaintyCount={draft.uncertaintyFields.length} />
      {showImage && imageUrl && <div className="receipt-image-panel"><img src={imageUrl} alt="Originaler Kassenbon" /></div>}

      <section className="section-card metadata-card">
        <div className="section-title"><div className="section-icon"><StoreIcon /></div><div><h2>Bonangaben</h2><p>Tippe in ein Feld, um es zu korrigieren.</p></div></div>
        <div className="field-grid">
          <Field label="Händler" value={draft.merchantName} placeholder="Unbekannt" onChange={(value) => field("merchantName", value)} />
          <Field label="Filiale" value={draft.storeName} placeholder="Unbekannt" onChange={(value) => field("storeName", value)} />
          <Field label="Adresse" value={draft.addressText} placeholder="Unbekannt" wide onChange={(value) => field("addressText", value)} />
          <Field label="Datum" type="date" value={draft.purchasedDate} placeholder="Unbekannt" onChange={(value) => field("purchasedDate", value)} />
          <Field label="Uhrzeit" type="time" value={draft.purchasedTime} placeholder="Unbekannt" onChange={(value) => field("purchasedTime", value)} />
          <Field label="Bonnummer" value={draft.receiptNumber} placeholder="Unbekannt" onChange={(value) => field("receiptNumber", value)} />
          <Field label="Transaktions-ID" value={draft.transactionId} placeholder="Unbekannt" onChange={(value) => field("transactionId", value)} />
          <label className="field"><span>Währung</span><select value={draft.currency} onChange={(event) => field("currency", event.target.value.toUpperCase())}><option>CAD</option><option>EUR</option><option>USD</option><option>GBP</option></select></label>
        </div>
      </section>

      <section className="items-section">
        <div className="items-header"><div><h2>Artikel</h2><p>{calculations.positionCount} Positionen · {draft.items.filter((item) => item.verified).length} geprüft</p></div><button className="button secondary compact" onClick={addItem}>＋ Artikel</button></div>
        <div className="item-list">
          {draft.items.length === 0 && <div className="empty-card"><BasketIcon /><h3>Noch keine Artikel</h3><p>Füge die erste Position manuell hinzu.</p><button className="button primary" onClick={addItem}>Artikel hinzufügen</button></div>}
          {draft.items.map((item, index) => (
            <ItemCard
              key={item.id}
              item={item}
              index={index}
              currency={draft.currency}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onChange={(changed) => updateItem(item.id, changed)}
              onRemove={() => removeItem(item.id)}
            />
          ))}
        </div>
        {removed && <div className="undo-bar"><span>„{removed.item.normalizedName || "Artikel"}“ entfernt</span><button onClick={undoRemove}>Rückgängig</button></div>}
      </section>

      <section className="section-card metadata-card">
        <div className="section-title"><div className="section-icon"><CardIcon /></div><div><h2>Zahlung</h2><p>Es werden nur sichtbare Kartendaten gespeichert.</p></div></div>
        <div className="field-grid">
          <Field label="Zahlungsart" value={draft.paymentMethod} placeholder="Unbekannt" onChange={(value) => field("paymentMethod", value)} />
          <Field label="Kartenmarke" value={draft.cardBrand} placeholder="Unbekannt" onChange={(value) => field("cardBrand", value)} />
          <Field label="Letzte 4 Ziffern" value={draft.displayedLast4} placeholder="Unbekannt" onChange={(value) => field("displayedLast4", value && /^\d{0,4}$/.test(value) ? value : draft.displayedLast4)} />
        </div>
      </section>

      <section className={`summary-card ${calculations.isBalanced ? "balanced" : "warning"}`}>
        <div className="summary-heading"><div><span className="section-icon"><CalculatorIcon /></span><h2>Bonabgleich</h2></div><span className="balance-badge">{calculations.isBalanced ? <><CheckIcon /> Stimmt überein</> : <><AlertIcon /> Prüfung nötig</>}</span></div>
        <div className="summary-rows">
          <SummaryMoney label="Summe der Positionen" value={calculations.itemsTotalMinor} currency={draft.currency} readOnly />
          <SummaryMoney label="Gedruckte Zwischensumme" value={draft.subtotalMinor} currency={draft.currency} onChange={(value) => field("subtotalMinor", value)} />
          <SummaryMoney label="Rabatte auf den Gesamtbon" value={draft.receiptDiscountMinor} currency={draft.currency} onChange={(value) => field("receiptDiscountMinor", value)} />
          <SummaryMoney label="Steuern (GST/PST)" value={draft.taxTotalMinor} currency={draft.currency} onChange={(value) => field("taxTotalMinor", value)} />
          <SummaryMoney label="Gedruckter Gesamtbetrag" value={draft.totalMinor} currency={draft.currency} onChange={(value) => field("totalMinor", value)} emphasized />
          <SummaryMoney label="Aus Daten berechnet" value={calculations.calculatedTotalMinor} currency={draft.currency} readOnly emphasized />
        </div>
        {!calculations.isBalanced && (
          <div className="difference-row">
            <span>Differenz</span><strong>{formatMoney(calculations.differenceMinor, draft.currency)}</strong>
            <small>{calculations.missingPriceCount > 0 ? `${calculations.missingPriceCount} Position(en) ohne Preis.` : "Prüfe Rabatte, Steuern oder zusätzliche Gebühren."}</small>
          </div>
        )}
      </section>

      <section className="section-card notes-card">
        <label><span>Weitere Informationen</span><textarea rows={4} value={draft.notes} placeholder="Optionale persönliche Notizen …" onChange={(event) => field("notes", event.target.value)} /></label>
      </section>

      <div className="sticky-actions">
        <button className="button ghost" disabled={saving} onClick={onSaveDraft}>Als Entwurf</button>
        <button className="button primary" onClick={onNext}>Weiter <ArrowIcon /></button>
      </div>
    </section>
  );
}

function ItemCard({ item, index, currency, expanded, onToggle, onChange, onRemove }: {
  item: ReceiptItem;
  index: number;
  currency: string;
  expanded: boolean;
  onToggle: () => void;
  onChange: (item: ReceiptItem) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof ReceiptItem>(key: K, value: ReceiptItem[K]) => onChange({ ...item, [key]: value, source: "user_entered" });
  return (
    <article className={`item-card ${expanded ? "expanded" : ""} ${item.uncertainties.length ? "uncertain" : ""}`}>
      <div className="item-overview">
        <button className={`verify-box ${item.verified ? "checked" : ""}`} aria-label={item.verified ? "Als ungeprüft markieren" : "Als geprüft markieren"} onClick={() => set("verified", !item.verified)}>{item.verified && <CheckIcon />}</button>
        <button className="item-main" onClick={onToggle}>
          <span className="item-number">{String(index + 1).padStart(2, "0")}</span>
          <span className="item-copy">
            <strong>{item.normalizedName || "Unbenannter Artikel"}</strong>
            <small>{[item.quantity && `${item.quantity} ${item.quantityUnit ?? ""}`, item.packageSize && `${item.packageSize} ${item.packageUnit ?? ""}`].filter(Boolean).join(" · ") || "Menge unbekannt"}</small>
            {item.uncertainties.length > 0 && <em><AlertIcon /> Unsichere Erkennung</em>}
          </span>
          <span className="item-price">{formatMoney(item.lineTotalMinor, currency)}<small>{expanded ? "Schließen" : "Bearbeiten"} <ChevronIcon up={expanded} /></small></span>
        </button>
      </div>
      {expanded && (
        <div className="item-editor">
          {item.rawName && <div className="raw-label"><span>Original auf dem Bon</span><code>{item.rawName}</code></div>}
          <div className="field-grid">
            <Field label="Produktname" value={item.normalizedName} placeholder="Produktname" onChange={(value) => set("normalizedName", value ?? "")} wide />
            <Field label="Beschreibung" value={item.description} placeholder="Optional" onChange={(value) => set("description", value)} wide />
            <Field label="Menge" inputMode="decimal" value={item.quantity} placeholder="Unbekannt" onChange={(value) => set("quantity", decimalOrPrevious(value, item.quantity))} />
            <Field label="Mengeneinheit" value={item.quantityUnit} placeholder="z. B. Stück" onChange={(value) => set("quantityUnit", value)} />
            <Field label="Packungsgröße" inputMode="decimal" value={item.packageSize} placeholder="Unbekannt" onChange={(value) => set("packageSize", decimalOrPrevious(value, item.packageSize))} />
            <Field label="Packungseinheit" value={item.packageUnit} placeholder="z. B. g" onChange={(value) => set("packageUnit", value)} />
            <MoneyField label="Stückpreis" value={item.unitPriceMinor} currency={currency} onChange={(value) => set("unitPriceMinor", value)} />
            <MoneyField label="Positionssumme" value={item.lineTotalMinor} currency={currency} onChange={(value) => set("lineTotalMinor", value)} />
            <Field label="Kategorie" value={item.category} placeholder="Optional" onChange={(value) => set("category", value)} />
            <Field label="SKU / Produktcode" value={item.sku} placeholder="Optional" onChange={(value) => set("sku", value)} />
            <Field label="Notiz" value={item.notes} placeholder="Optional" onChange={(value) => set("notes", value)} wide />
          </div>
          <p className="verification-help">Das Häkchen markiert nur deine Prüfung. Der Artikel zählt unabhängig davon zur Summe.</p>
          <div className="editor-actions"><button className="danger-link" onClick={onRemove}>Artikel entfernen</button><button className="button primary compact" onClick={onToggle}>Fertig</button></div>
        </div>
      )}
    </article>
  );
}

function SaveScreen({ draft, imageUrl, onBack, onSave, saving }: {
  draft: ReceiptDraft;
  imageUrl: string | null;
  onBack: () => void;
  onSave: (status: "draft" | "confirmed") => void;
  saving: boolean;
}) {
  const calculations = calculateReceipt(draft);
  return (
    <section className="page narrow save-page">
      <div className="eyebrow">Letzte Kontrolle</div>
      <h1>Einkauf speichern</h1>
      <p className="lead">Erst nach erfolgreicher Speicherung erscheint der Einkauf im Verlauf.</p>
      <div className="final-card">
        {imageUrl ? <img src={imageUrl} alt="Originalbon" /> : <div className="final-placeholder"><ReceiptLargeIcon /></div>}
        <div className="final-merchant"><small>{draft.purchasedDate ?? "Datum unbekannt"}</small><h2>{draft.merchantName ?? "Händler unbekannt"}</h2><p>{calculations.positionCount} Positionen · {draft.paymentMethod ?? "Zahlung unbekannt"}</p></div>
        <div className="final-total"><span>Gesamtbetrag</span><strong>{formatMoney(draft.totalMinor, draft.currency)}</strong></div>
        <StatusPill calculations={calculations} uncertaintyCount={draft.uncertaintyFields.length} compact />
      </div>
      {!calculations.isBalanced && <div className="save-warning"><AlertIcon /><p><strong>Noch nicht ausgeglichen</strong><span>Du kannst diesen Einkauf als Entwurf speichern und später ergänzen. Bestätigen ist erst bei übereinstimmenden Beträgen möglich.</span></p></div>}
      <div className="save-facts"><span><DatabaseIcon /> SQLite-Datensatz</span><span><ImageIcon /> Originalbild</span><span><DownloadIcon /> Portable JSON-Exporte</span></div>
      <div className="save-buttons">
        <button className="button ghost" onClick={onBack} disabled={saving}>Zurück zur Prüfung</button>
        {!calculations.isBalanced && <button className="button secondary" onClick={() => onSave("draft")} disabled={saving}>{saving ? "Speichert …" : "Als Entwurf speichern"}</button>}
        <button className="button primary large" onClick={() => onSave("confirmed")} disabled={saving || !calculations.isBalanced}>{saving ? "Speichert …" : "Einkauf speichern"} {!saving && <CheckIcon />}</button>
      </div>
    </section>
  );
}

function HistoryScreen({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(() => groupHistoryEntries(entries), [entries]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setLoading(true);
      loadHistory(search).then((result) => { setEntries(result.receipts); setError(null); }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(handle);
  }, [search]);

  return (
    <section className="page history-page">
      <div className="history-heading">
        <div>
          <div className="eyebrow">Übersicht</div>
          <h1>Deine Bons</h1>
          <p className="lead">Alle Einkäufe auf einen Blick – die neuesten stehen oben.</p>
        </div>
        <div className="history-summary" aria-live="polite">
          <strong>{loading ? "…" : entries.length}</strong>
          <span>{search ? "Treffer" : entries.length === 1 ? "gespeicherter Bon" : "gespeicherte Bons"}</span>
        </div>
      </div>
      <label className="search-box"><SearchIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Händler, Produkt oder Kategorie suchen" /></label>
      {error && <div className="notice error"><AlertIcon /><p>{error}</p></div>}
      {loading ? <div className="loading-list"><span className="spinner" /> Einkäufe werden geladen …</div> : entries.length === 0 ? (
        <div className="empty-card history-empty"><ReceiptLargeIcon /><h2>{search ? "Keine Treffer" : "Noch keine Bons"}</h2><p>{search ? "Versuche einen anderen Suchbegriff." : "Tippe unten rechts auf „Neuer Bon“, um deinen ersten Einkauf zu erfassen."}</p></div>
      ) : (
        <div className="history-groups">
          {groups.map((group) => (
            <section className="history-group" key={group.key} aria-labelledby={`history-date-${group.key}`}>
              <div className="history-date-heading">
                <h2 id={`history-date-${group.key}`}>{group.label}</h2>
                <span>{group.entries.length} {group.entries.length === 1 ? "Bon" : "Bons"}</span>
              </div>
              <div className="history-list">
                {group.entries.map((entry) => (
                  <button className="history-card" key={entry.id} onClick={() => onOpen(entry.id)}>
                    <span className="merchant-avatar">{(entry.merchantName ?? "?").slice(0, 1).toUpperCase()}</span>
                    <span className="history-copy"><strong>{entry.merchantName ?? "Händler unbekannt"}</strong><small>{formatHistoryTime(entry.purchasedTime, entry.scannedAt)} · {entry.positionCount} {entry.positionCount === 1 ? "Position" : "Positionen"}</small><em className={entry.validationState}>{statusText(entry.validationState, entry.status)}</em></span>
                    <span className="history-total"><strong>{formatMoney(entry.totalMinor, entry.currency)}</strong><ChevronIcon /></span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <a className="backup-link" href="/api/backup"><DownloadIcon /> Vollständiges Backup herunterladen</a>
      <button className="receipt-fab" onClick={onNew} aria-label="Neuen Bon hinzufügen"><span aria-hidden="true">＋</span><strong>Neuer Bon</strong></button>
    </section>
  );
}

function DetailScreen({ receipt, onBack, onNew }: { receipt: StoredReceipt; onBack: () => void; onNew: () => void }) {
  const { draft, calculations } = receipt;
  return (
    <section className="page detail-page">
      <div className="detail-toolbar"><button className="text-button back" onClick={onBack}>← Zum Verlauf</button><button className="button primary compact" onClick={onNew}>＋ Neuer Bon</button></div>
      <div className="detail-hero">
        <div><div className="eyebrow">Gespeicherter Einkauf</div><h1>{draft.merchantName ?? "Händler unbekannt"}</h1><p>{draft.purchasedDate ?? "Datum unbekannt"}{draft.purchasedTime ? ` · ${draft.purchasedTime}` : ""}</p></div>
        <div className="detail-amount"><span>Gesamt</span><strong>{formatMoney(draft.totalMinor, draft.currency)}</strong></div>
      </div>
      <StatusPill calculations={calculations} uncertaintyCount={draft.uncertaintyFields.length} />
      <div className="detail-grid">
        {receipt.attachment && <div className="detail-image"><img src={receipt.attachment.imageUrl} alt="Gespeicherter Originalbon" /></div>}
        <div className="detail-facts section-card">
          <h2>Bonangaben</h2>
          <dl>
            <DetailRow label="Filiale" value={draft.storeName} />
            <DetailRow label="Adresse" value={draft.addressText} />
            <DetailRow label="Bonnummer" value={draft.receiptNumber} />
            <DetailRow label="Transaktion" value={draft.transactionId} />
            <DetailRow label="Zahlung" value={[draft.paymentMethod, draft.cardBrand, draft.displayedLast4 && `•••• ${draft.displayedLast4}`].filter(Boolean).join(" · ") || null} />
            <DetailRow label="Status" value={receipt.status === "confirmed" ? "Bestätigt" : "Entwurf"} />
          </dl>
        </div>
      </div>
      <section className="detail-items"><div className="items-header"><div><h2>Artikel</h2><p>{calculations.positionCount} Positionen</p></div></div>
        <div className="saved-items">{draft.items.filter((item) => !item.excluded).map((item, index) => <div className="saved-item" key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><p><strong>{item.normalizedName || item.rawName || "Unbenannter Artikel"}</strong><small>{item.quantity ? `${item.quantity} ${item.quantityUnit ?? ""}` : "Menge unbekannt"}{item.category ? ` · ${item.category}` : ""}</small></p><b>{formatMoney(item.lineTotalMinor, draft.currency)}</b></div>)}</div>
      </section>
      <section className="summary-card balanced detail-summary"><div className="summary-rows"><div><span>Positionen</span><strong>{formatMoney(calculations.itemsTotalMinor, draft.currency)}</strong></div><div><span>Steuern</span><strong>{formatMoney(draft.taxTotalMinor, draft.currency)}</strong></div><div className="emphasized"><span>Gesamt</span><strong>{formatMoney(draft.totalMinor, draft.currency)}</strong></div></div></section>
      {draft.notes && <section className="section-card detail-notes"><h2>Weitere Informationen</h2><p>{draft.notes}</p></section>}
      <div className="export-actions"><a className="button secondary" href={`/api/receipts/${receipt.id}/export.json`}><CodeIcon /> JSON exportieren</a><a className="button primary" href={`/api/receipts/${receipt.id}/export.bundle.json`}><DownloadIcon /> Daten + Bonbild</a></div>
    </section>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", wide = false, inputMode }: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  type?: string;
  wide?: boolean;
  inputMode?: "decimal";
}) {
  return <label className={`field ${wide ? "wide" : ""}`}><span>{label}</span><input type={type} inputMode={inputMode} value={value ?? ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value || null)} /></label>;
}

function MoneyField({ label, value, currency, onChange }: { label: string; value: number | null; currency: string; onChange: (value: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : (value / 100).toFixed(2));
  useEffect(() => setText(value === null ? "" : (value / 100).toFixed(2)), [value]);
  return <label className="field money-field"><span>{label}</span><div><input inputMode="decimal" value={text} placeholder="0,00" onChange={(event) => { setText(event.target.value); const parsed = parseMoney(event.target.value); if (parsed !== undefined) onChange(parsed); }} /><b>{currency}</b></div></label>;
}

function SummaryMoney({ label, value, currency, onChange, readOnly = false, emphasized = false }: { label: string; value: number | null; currency: string; onChange?: (value: number | null) => void; readOnly?: boolean; emphasized?: boolean }) {
  return <div className={emphasized ? "emphasized" : ""}><span>{label}</span>{readOnly ? <strong>{formatMoney(value, currency)}</strong> : <MoneyInline value={value} currency={currency} onChange={onChange!} />}</div>;
}

function MoneyInline({ value, currency, onChange }: { value: number | null; currency: string; onChange: (value: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : (value / 100).toFixed(2));
  useEffect(() => setText(value === null ? "" : (value / 100).toFixed(2)), [value]);
  return <label className="money-inline"><input aria-label="Betrag" inputMode="decimal" value={text} placeholder="—" onChange={(event) => { setText(event.target.value); const parsed = parseMoney(event.target.value); if (parsed !== undefined) onChange(parsed); }} /><b>{currency}</b></label>;
}

function StatusPill({ calculations, uncertaintyCount, compact = false }: { calculations: ReturnType<typeof calculateReceipt>; uncertaintyCount: number; compact?: boolean }) {
  const tone = calculations.isBalanced ? "success" : calculations.missingPriceCount > 0 ? "incomplete" : "warning";
  return <div className={`status-pill ${tone} ${compact ? "compact" : ""}`}>{calculations.isBalanced ? <CheckIcon /> : <AlertIcon />}<span><strong>{calculations.isBalanced ? "Beträge stimmen überein" : calculations.missingPriceCount > 0 ? "Unvollständige Daten" : "Prüfung erforderlich"}</strong>{!compact && <small>{uncertaintyCount ? `${uncertaintyCount} unsichere Felder` : calculations.isBalanced ? "Bereit zum Speichern" : "Gedruckte und berechnete Summe unterscheiden sich"}</small>}</span></div>;
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return <div><dt>{label}</dt><dd className={!value ? "unknown" : ""}>{value || "Unbekannt"}</dd></div>;
}

function parseMoney(value: string): number | null | undefined {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^-?\d+(?:\.\d{0,2})?$/.test(normalized)) return undefined;
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, decimal = ""] = unsigned.split(".");
  const minor = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return negative ? -minor : minor;
}

function decimalOrPrevious(value: string | null, previous: string | null): string | null {
  if (value === null) return null;
  const normalized = value.replace(",", ".");
  return /^\d+(?:\.\d{0,6})?$/.test(normalized) ? normalized : previous;
}

function statusText(validation: HistoryEntry["validationState"], status: HistoryEntry["status"]) {
  if (status === "draft") return "Entwurf";
  if (validation === "balanced") return "Geprüft";
  if (validation === "discrepancy") return "Abweichung";
  return "Unvollständig";
}

function formatHistoryTime(purchasedTime: string | null, scannedAt: string): string {
  if (purchasedTime && /^\d{2}:\d{2}(?::\d{2})?$/.test(purchasedTime)) return `${purchasedTime.slice(0, 5)} Uhr`;
  const scanned = new Date(scannedAt);
  if (Number.isNaN(scanned.getTime())) return "Uhrzeit unbekannt";
  return `${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(scanned)} Uhr`;
}

function Icon({ children, viewBox = "0 0 24 24" }: { children: ReactNode; viewBox?: string }) {
  return <svg viewBox={viewBox} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}
const ReceiptIcon = () => <Icon><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/></Icon>;
const ReceiptLargeIcon = () => <Icon><path d="M6 2.5h12v19l-2-1.5-2 1.5-2-1.5-2 1.5L8 20l-2 1.5v-19Z"/><path d="M9 8h6M9 12h6M9 16h3"/></Icon>;
const CameraIcon = () => <Icon><path d="M4 8h3l2-3h6l2 3h3v11H4V8Z"/><circle cx="12" cy="13" r="3.5"/></Icon>;
const ImageIcon = () => <Icon><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 2-2 5 5"/></Icon>;
const CheckIcon = () => <Icon><path d="m5 12 4 4L19 6"/></Icon>;
const AlertIcon = () => <Icon><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4M12 17h.01"/></Icon>;
const ArrowIcon = () => <Icon><path d="M5 12h14M14 7l5 5-5 5"/></Icon>;
const ShieldIcon = () => <Icon><path d="M12 3 5 6v5c0 4.6 2.8 8.2 7 10 4.2-1.8 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></Icon>;
const LockIcon = () => <Icon><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></Icon>;
const HistoryIcon = () => <Icon><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></Icon>;
const StoreIcon = () => <Icon><path d="m4 10 1-6h14l1 6M5 10v10h14V10M9 20v-6h6v6"/><path d="M3 10c0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0"/></Icon>;
const BasketIcon = () => <Icon><path d="M4 9h16l-2 11H6L4 9ZM8 9l4-6 4 6M9 13v3M15 13v3"/></Icon>;
const CardIcon = () => <Icon><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></Icon>;
const CalculatorIcon = () => <Icon><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 5h8v4H8zM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"/></Icon>;
const ChevronIcon = ({ up = false }: { up?: boolean }) => <Icon><path d={up ? "m7 15 5-5 5 5" : "m7 9 5 5 5-5"}/></Icon>;
const DatabaseIcon = () => <Icon><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></Icon>;
const DownloadIcon = () => <Icon><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></Icon>;
const SearchIcon = () => <Icon><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></Icon>;
const CodeIcon = () => <Icon><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></Icon>;
const SunIcon = () => <Icon><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></Icon>;
const MoonIcon = () => <Icon><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/></Icon>;
