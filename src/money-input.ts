import { useEffect, useState, type ChangeEvent } from "react";

export type MoneyInputState = { text: string; editing: boolean };

export function formatMoneyInput(value: number | null): string {
  return value === null ? "" : (value / 100).toFixed(2).replace(".", ",");
}

export function parseMoneyInput(value: string): number | null | undefined {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^-?\d+(?:\.\d{0,2})?$/.test(normalized)) return undefined;
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, decimal = ""] = unsigned.split(".");
  const minor = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) return undefined;
  return negative ? -minor : minor;
}

export function syncMoneyInput(state: MoneyInputState, value: number | null): MoneyInputState {
  // Parent updates keep totals current, but must not rewrite the focused input.
  return state.editing ? state : { text: formatMoneyInput(value), editing: false };
}

export function finishMoneyInput(state: MoneyInputState): MoneyInputState {
  const parsed = parseMoneyInput(state.text);
  return { text: parsed === undefined ? state.text : formatMoneyInput(parsed), editing: false };
}

export function useMoneyInput(value: number | null, onChange: (value: number | null) => void) {
  const [state, setState] = useState<MoneyInputState>(() => ({ text: formatMoneyInput(value), editing: false }));
  useEffect(() => setState((current) => syncMoneyInput(current, value)), [value]);
  const invalid = parseMoneyInput(state.text) === undefined;
  const error = invalid && !state.editing ? "Bitte einen gültigen Betrag mit höchstens zwei Nachkommastellen eingeben." : null;
  return {
    error,
    inputProps: {
      value: state.text,
      inputMode: "decimal" as const,
      "data-money-input": true,
      "aria-invalid": invalid,
      ref: (input: HTMLInputElement | null) => {
        input?.setCustomValidity(invalid ? "Bitte einen gültigen Betrag mit höchstens zwei Nachkommastellen eingeben." : "");
      },
      onFocus: () => setState((current) => ({ ...current, editing: true })),
      onBlur: () => setState((current) => finishMoneyInput(current)),
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const text = event.target.value;
        setState({ text, editing: true });
        // Never keep a previous valid price hidden behind invalid visible text.
        onChange(parseMoneyInput(text) ?? null);
      }
    }
  };
}
