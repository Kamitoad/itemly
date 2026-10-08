import type { ReceiptCalculations } from "../../shared/receipt.js";
import { AlertIcon, CheckIcon } from "./icons.js";

export default function StatusPill({ calculations, uncertaintyCount, currencyNeedsReview = false, compact = false }: { calculations: ReceiptCalculations; uncertaintyCount: number; currencyNeedsReview?: boolean; compact?: boolean }) {
  const ready = calculations.isBalanced && !currencyNeedsReview;
  const tone = ready ? "success" : calculations.missingPriceCount > 0 ? "incomplete" : "warning";
  const title = calculations.isBalanced ? currencyNeedsReview ? "Währung prüfen" : "Beträge stimmen überein" : calculations.missingPriceCount > 0 ? "Unvollständige Daten" : "Prüfung erforderlich";
  const hint = currencyNeedsReview ? "Währung auswählen oder bestätigen" : uncertaintyCount ? `${uncertaintyCount} unsichere Felder` : calculations.isBalanced ? "Bereit zum Speichern" : "Gedruckte und berechnete Summe unterscheiden sich";
  return <div className={`status-pill ${tone} ${compact ? "compact" : ""}`}>{ready ? <CheckIcon /> : <AlertIcon />}<span><strong>{title}</strong>{!compact && <small>{hint}</small>}</span></div>;
}
