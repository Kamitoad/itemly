import { useMemo, useRef, useState } from "react";
import { calculateReceipt, createEmptyItem, formatMoney, type ReceiptDraft, type ReceiptItem } from "../../shared/receipt.js";
import { replaceReceiptItems } from "../../shared/receipt-edit.js";
import { confirmCurrency, isKnownCurrency, needsCurrencyReview, UNKNOWN_CURRENCY } from "../../shared/currency.js";
import { AlertIcon, ArrowIcon, BasketIcon, CalculatorIcon, CardIcon, CheckIcon, ReceiptIcon, StoreIcon } from "../components/icons.js";
import StatusPill from "../components/StatusPill.js";
import ItemCard from "./ItemCard.js";
import { Field, SummaryMoney } from "./fields.js";

export default function ReviewScreen({
  draft,
  imageUrl,
  onChange,
  onNext,
  onSaveDraft,
  saving,
  editing,
  onCancel,
  focusedItemId
}: {
  draft: ReceiptDraft;
  imageUrl: string | null;
  onChange: (draft: ReceiptDraft) => void;
  onNext: () => void;
  onSaveDraft: () => void;
  saving: boolean;
  editing: boolean;
  onCancel: () => void;
  focusedItemId: string | null;
}) {
  const [showImage, setShowImage] = useState(false);
  const reviewRef = useRef<HTMLElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(focusedItemId ?? draft.items[0]?.id ?? null);
  const [removed, setRemoved] = useState<{ item: ReceiptItem; index: number; snapshot: ReceiptDraft } | null>(null);
  const calculations = useMemo(() => calculateReceipt(draft), [draft]);

  function proceed(action: () => void) {
    const inputs = reviewRef.current?.querySelectorAll<HTMLInputElement>("input[data-money-input]") ?? [];
    for (const input of inputs) if (!input.reportValidity()) return;
    action();
  }

  function field<K extends keyof ReceiptDraft>(key: K, value: ReceiptDraft[K]) {
    if (key === "currency") {
      onChange(confirmCurrency(draft, value as string));
    } else {
      onChange({ ...draft, [key]: value, fieldSources: { ...draft.fieldSources, [key]: "user_entered" } });
    }
  }

  function updateItem(id: string, item: ReceiptItem) {
    onChange({ ...draft, items: draft.items.map((current) => current.id === id ? item : current) });
  }

  function removeItem(id: string) {
    const index = draft.items.findIndex((item) => item.id === id);
    if (index < 0) return;
    setRemoved({ item: draft.items[index], index, snapshot: draft });
    onChange(replaceReceiptItems(draft, draft.items.filter((item) => item.id !== id)));
    setExpandedId(null);
  }

  function undoRemove() {
    if (!removed) return;
    const next = [...draft.items];
    next.splice(removed.index, 0, removed.item);
    onChange(replaceReceiptItems(draft, next, removed.snapshot));
    setRemoved(null);
  }

  function addItem() {
    const item = createEmptyItem(draft.items.length + 1);
    onChange({ ...draft, items: [...draft.items, item] });
    setExpandedId(item.id);
  }

  return (
    <section ref={reviewRef} className="page review-page" inert={saving}>
      <div className="review-heading">
        <div><div className="eyebrow">{editing ? "Gespeicherten Beleg ändern" : "Ergebnis kontrollieren"}</div><h1>{editing ? "Beleg bearbeiten" : "Einkauf prüfen"}</h1></div>
        {imageUrl && <button className="button ghost" onClick={() => setShowImage(!showImage)}><ReceiptIcon /> {showImage ? "Bon ausblenden" : "Originalbon"}</button>}
      </div>

      {editing && <div className="edit-notice"><p>Du bearbeitest den bestehenden Beleg. Originalbild und ursprüngliche Auswertung bleiben erhalten.</p><button className="text-button" onClick={onCancel}>Bearbeitung abbrechen</button></div>}

      <StatusPill calculations={calculations} uncertaintyCount={draft.uncertaintyFields.length} currencyNeedsReview={needsCurrencyReview(draft)} />
      {showImage && imageUrl && <div className="receipt-image-panel"><img src={imageUrl} alt="Originaler Kassenbon" /></div>}

      <section className="section-card metadata-card">
        <div className="section-title"><div className="section-icon"><StoreIcon /></div><div><h2>Bonangaben</h2><p>Tippe in ein Feld, um es zu korrigieren.</p></div></div>
        <div className="field-grid">
          <CurrencyField draft={draft} onConfirm={(currency) => field("currency", currency)} />
          <Field label="Händler" value={draft.merchantName} placeholder="Unbekannt" onChange={(value) => field("merchantName", value)} />
          <Field label="Filiale" value={draft.storeName} placeholder="Unbekannt" onChange={(value) => field("storeName", value)} />
          <Field label="Adresse" value={draft.addressText} placeholder="Unbekannt" wide onChange={(value) => field("addressText", value)} />
          <Field label="Datum" type="date" value={draft.purchasedDate} placeholder="Unbekannt" onChange={(value) => field("purchasedDate", value)} />
          <Field label="Uhrzeit" type="time" value={draft.purchasedTime} placeholder="Unbekannt" onChange={(value) => field("purchasedTime", value)} />
          <Field label="Bonnummer" value={draft.receiptNumber} placeholder="Unbekannt" onChange={(value) => field("receiptNumber", value)} />
          <Field label="Transaktions-ID" value={draft.transactionId} placeholder="Unbekannt" onChange={(value) => field("transactionId", value)} />
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
        <button className="button ghost" disabled={saving} onClick={() => proceed(onSaveDraft)}>Als Entwurf</button>
        <button className="button primary" onClick={() => proceed(onNext)}>Weiter <ArrowIcon /></button>
      </div>
    </section>
  );
}

function CurrencyField({ draft, onConfirm }: { draft: ReceiptDraft; onConfirm: (currency: string) => void }) {
  const pending = needsCurrencyReview(draft);
  const known = isKnownCurrency(draft.currency);
  const options = [...new Set(["CAD", "EUR", "USD", "GBP", ...(known ? [draft.currency] : [])])];
  return <div className={`field wide currency-field ${pending ? "needs-review" : ""}`}>
    <label htmlFor="receipt-currency">Währung{pending ? " · Bitte prüfen" : ""}</label>
    <div className="currency-controls">
      <select id="receipt-currency" value={draft.currency} aria-describedby={pending ? "currency-hint" : undefined} aria-invalid={pending} onChange={(event) => onConfirm(event.target.value)}>
        <option value={UNKNOWN_CURRENCY}>Bitte Währung wählen</option>
        {options.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
      </select>
      {pending && known && <button className="button secondary compact" onClick={() => onConfirm(draft.currency)}>{draft.currency} bestätigen</button>}
    </div>
    {pending && <p id="currency-hint" role="status">{known ? `Die Währung wurde nicht sicher erkannt. ${draft.currency} ist vorbelegt – bitte bestätigen oder ändern.` : "Die Währung fehlt oder wurde nicht erkannt. Bitte auswählen; dein JSON musst du dafür nicht ändern."}</p>}
  </div>;
}
