/**
 * Pure helpers for the request-history view: dedupe by method+URL (same
 * endpoint merges into one row showing its hit count) and case-insensitive
 * search across URL, method and status code.
 */

export interface HistoryEntry {
  id: string;
  method: string;
  url: string;
  statusCode: number | null;
  responseTime: number | null;
  error: string | null;
  timestamp: number;
}

export interface DedupedEntry extends HistoryEntry {
  /** How many raw history rows merged into this entry. */
  hits: number;
  /** Last non-null error seen among the merged rows, if any. */
  lastError: string | null;
}

/** Merge entries sharing method+URL; keeps the newest row's data. */
export function dedupeHistory(entries: HistoryEntry[]): DedupedEntry[] {
  const map = new Map<string, DedupedEntry>();
  for (const e of [...entries].sort((a, b) => b.timestamp - a.timestamp)) {
    const key = `${e.method.toUpperCase()} ${e.url}`;
    const existing = map.get(key);
    if (existing) {
      existing.hits += 1;
      if (existing.lastError === null && e.error) existing.lastError = e.error;
    } else {
      map.set(key, { ...e, hits: 1, lastError: e.error });
    }
  }
  return [...map.values()].sort((a, b) => b.timestamp - a.timestamp);
}

/** Case-insensitive search across URL, method and status code. */
export function filterHistory(entries: DedupedEntry[], query: string): DedupedEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) =>
      e.url.toLowerCase().includes(q) ||
      e.method.toLowerCase().includes(q) ||
      String(e.statusCode ?? '').includes(q)
  );
}

/** "just now" / "5m ago" / "3h ago" / "2d ago" / absolute date, oldest first. */
export function relativeTime(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}