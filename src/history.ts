export interface DatedHistoryEntry {
  purchasedDate: string | null;
  purchasedTime: string | null;
  scannedAt: string;
}

export interface HistoryDateGroup<T> {
  key: string;
  label: string;
  entries: T[];
}

function validDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function dateKey(entry: DatedHistoryEntry): string {
  if (validDate(entry.purchasedDate)) return entry.purchasedDate;
  const scannedDate = entry.scannedAt.slice(0, 10);
  return validDate(scannedDate) ? scannedDate : "unknown";
}

function sortKey(entry: DatedHistoryEntry): string {
  if (validDate(entry.purchasedDate)) {
    const time = /^\d{2}:\d{2}(?::\d{2})?$/.test(entry.purchasedTime ?? "")
      ? entry.purchasedTime!.padEnd(8, ":00")
      : "00:00:00";
    return `${entry.purchasedDate}T${time}`;
  }
  return Number.isNaN(new Date(entry.scannedAt).getTime()) ? "" : entry.scannedAt;
}

export function formatHistoryGroupDate(key: string, now = new Date()): string {
  if (!validDate(key)) return "Datum unbekannt";
  const date = new Date(`${key}T12:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  const includeYear = date.getFullYear() !== now.getFullYear();
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" } : {})
  }).format(date);
}

export function groupHistoryEntries<T extends DatedHistoryEntry>(entries: T[]): HistoryDateGroup<T>[] {
  const sorted = [...entries].sort((left, right) => {
    const byPurchaseMoment = sortKey(right).localeCompare(sortKey(left));
    return byPurchaseMoment || right.scannedAt.localeCompare(left.scannedAt);
  });
  const groups = new Map<string, T[]>();
  for (const entry of sorted) {
    const key = dateKey(entry);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return [...groups].map(([key, groupedEntries]) => ({
    key,
    label: formatHistoryGroupDate(key),
    entries: groupedEntries
  }));
}
