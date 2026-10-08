import { formatMoney, type ReceiptItem } from "../../shared/receipt.js";
import { AlertIcon, CheckIcon, ChevronIcon } from "../components/icons.js";
import { Field, MoneyField } from "./fields.js";

export default function ItemCard({ item, index, currency, expanded, onToggle, onChange, onRemove }: {
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

function decimalOrPrevious(value: string | null, previous: string | null): string | null {
  if (value === null) return null;
  const normalized = value.replace(",", ".");
  return /^\d+(?:\.\d{0,6})?$/.test(normalized) ? normalized : previous;
}
