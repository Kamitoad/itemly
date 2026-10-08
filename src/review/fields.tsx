import { formatMoney } from "../../shared/receipt.js";
import { UNKNOWN_CURRENCY } from "../../shared/currency.js";
import { useMoneyInput } from "../money-input.js";

export function Field({ label, value, onChange, placeholder, type = "text", wide = false, inputMode }: {
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

export function MoneyField({ label, value, currency, onChange }: { label: string; value: number | null; currency: string; onChange: (value: number | null) => void }) {
  const { inputProps, error } = useMoneyInput(value, onChange);
  return <label className="field money-field"><span>{label}</span><div><input {...inputProps} placeholder="0,00" /><b>{currency === UNKNOWN_CURRENCY ? "—" : currency}</b></div>{error && <small className="money-input-error" role="alert">{error}</small>}</label>;
}

export function SummaryMoney({ label, value, currency, onChange, readOnly = false, emphasized = false }: { label: string; value: number | null; currency: string; onChange?: (value: number | null) => void; readOnly?: boolean; emphasized?: boolean }) {
  return <div className={emphasized ? "emphasized" : ""}><span>{label}</span>{readOnly ? <strong>{formatMoney(value, currency)}</strong> : <MoneyInline label={label} value={value} currency={currency} onChange={onChange!} />}</div>;
}

function MoneyInline({ label, value, currency, onChange }: { label: string; value: number | null; currency: string; onChange: (value: number | null) => void }) {
  const { inputProps, error } = useMoneyInput(value, onChange);
  return <div className="money-inline-field"><label className="money-inline"><input {...inputProps} aria-label={label} placeholder="—" /><b>{currency === UNKNOWN_CURRENCY ? "—" : currency}</b></label>{error && <small className="money-input-error" role="alert">{error}</small>}</div>;
}
