import type { ReceiptDraft, ReceiptItem } from "./receipt.js";

// Provenance paths refer to array indices, while edits identify items by UUID.
// Keep warnings attached to the same item when removing or restoring a row.
export function replaceReceiptItems(draft: ReceiptDraft, items: ReceiptItem[], restoredFrom?: ReceiptDraft): ReceiptDraft {
  function remap(path: string, source: ReceiptDraft, restoring: boolean): string | null {
    const match = /^(items\[(\d+)\]|items\.(\d+)|\/items\/(\d+))(?=\.|\/|$)/.exec(path);
    if (!match) return restoring ? null : path;
    const oldIndex = Number(match[2] ?? match[3] ?? match[4]);
    const id = source.items[oldIndex]?.id;
    if (!id || (restoring && draft.items.some((item) => item.id === id))) return null;
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const prefix = match[2] !== undefined ? `items[${index}]` : match[3] !== undefined ? `items.${index}` : `/items/${index}`;
    return prefix + path.slice(match[0].length);
  }
  const sources = [{ draft, restoring: false }, ...(restoredFrom ? [{ draft: restoredFrom, restoring: true }] : [])];
  const fieldSources: ReceiptDraft["fieldSources"] = {};
  const uncertaintyFields = new Set<string>();
  for (const source of sources) {
    for (const [path, value] of Object.entries(source.draft.fieldSources)) {
      const mapped = remap(path, source.draft, source.restoring);
      if (mapped !== null) fieldSources[mapped] = value;
    }
    for (const path of source.draft.uncertaintyFields) {
      const mapped = remap(path, source.draft, source.restoring);
      if (mapped !== null) uncertaintyFields.add(mapped);
    }
  }
  return { ...draft, items, fieldSources, uncertaintyFields: [...uncertaintyFields].slice(0, 100) };
}
