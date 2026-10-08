import { describe, expect, it } from "vitest";
import { finishMoneyInput, formatMoneyInput, parseMoneyInput, syncMoneyInput, type MoneyInputState } from "../src/money-input.js";

describe("money input editing", () => {
  it.each([",", "."])("keeps partial %s input through parent updates when changing 1.29 to 1.32", (separator) => {
    let state: MoneyInputState = { text: "1,29", editing: true };
    for (const text of [`1${separator}`, `1${separator}3`, `1${separator}32`]) {
      state = { ...state, text };
      state = syncMoneyInput(state, parseMoneyInput(text)!);
      expect(state.text).toBe(text);
    }
    expect(parseMoneyInput(state.text)).toBe(132);
    expect(finishMoneyInput(state)).toEqual({ text: "1,32", editing: false });
  });

  it("allows deletion and replacement without restoring the previous price", () => {
    const cleared = syncMoneyInput({ text: "", editing: true }, null);
    expect(cleared.text).toBe("");
    expect(finishMoneyInput(cleared).text).toBe("");
    const replacement = syncMoneyInput({ text: "3", editing: true }, 300);
    expect(replacement.text).toBe("3");
    expect(finishMoneyInput(replacement).text).toBe("3,00");
  });

  it("keeps invalid text visible on blur rather than substituting a previous amount", () => {
    const invalid = syncMoneyInput({ text: "1,302", editing: true }, null);
    expect(parseMoneyInput(invalid.text)).toBeUndefined();
    expect(finishMoneyInput(invalid)).toEqual({ text: "1,302", editing: false });
  });

  it("accepts external value changes after editing finishes", () => {
    const finished = finishMoneyInput({ text: "1,3", editing: true });
    expect(syncMoneyInput(finished, 245)).toEqual({ text: "2,45", editing: false });
  });

  it("stores exact safe integer minor units and rejects excess precision", () => {
    expect(parseMoneyInput("0,29")).toBe(29);
    expect(parseMoneyInput("-1.32")).toBe(-132);
    expect(parseMoneyInput(" 12, ")).toBe(1200);
    expect(parseMoneyInput("-")).toBeUndefined();
    expect(parseMoneyInput("1,302")).toBeUndefined();
    expect(parseMoneyInput("9007199254740992")).toBeUndefined();
    expect(formatMoneyInput(0)).toBe("0,00");
  });
});
