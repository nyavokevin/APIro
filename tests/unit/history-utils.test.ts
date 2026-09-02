import { describe, expect, it } from 'vitest';
import {
  dedupeHistory,
  filterHistory,
  relativeTime,
  type HistoryEntry,
} from '../../src/renderer/src/lib/history';

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: Math.random().toString(36).slice(2),
    method: 'GET',
    url: 'https://api.example.com/users',
    statusCode: 200,
    responseTime: 42,
    error: null,
    timestamp: 1000,
    ...overrides,
  };
}

describe('dedupeHistory', () => {
  it('merges rows with the same method+url, keeping the newest data', () => {
    const merged = dedupeHistory([
      entry({ id: 'old', timestamp: 1000, statusCode: 200 }),
      entry({ id: 'new', timestamp: 3000, statusCode: 500 }),
      entry({ id: 'mid', timestamp: 2000, statusCode: 200 }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'new', statusCode: 500, hits: 3 });
  });

  it('treats different methods or urls as separate entries', () => {
    const merged = dedupeHistory([
      entry({ id: 'a', method: 'GET', url: 'https://x.io/a' }),
      entry({ id: 'b', method: 'POST', url: 'https://x.io/a' }),
      entry({ id: 'c', method: 'GET', url: 'https://x.io/b' }),
    ]);
    expect(merged).toHaveLength(3);
  });

  it('sorts newest first regardless of input order', () => {
    const merged = dedupeHistory([
      entry({ id: 'old', url: 'https://x.io/old', timestamp: 1000 }),
      entry({ id: 'new', url: 'https://x.io/new', timestamp: 9000 }),
    ]);
    expect(merged.map((e) => e.id)).toEqual(['new', 'old']);
  });

  it('surfaces the last error seen among merged rows', () => {
    const merged = dedupeHistory([
      entry({ id: 'a', timestamp: 1000 }),
      entry({ id: 'b', timestamp: 2000, error: 'DNS lookup failed' }),
      entry({ id: 'c', timestamp: 3000 }),
    ]);
    expect(merged[0].lastError).toBe('DNS lookup failed');
    expect(merged[0].error).toBeNull(); // newest row itself succeeded
  });

  it('handles an empty list', () => {
    expect(dedupeHistory([])).toEqual([]);
  });
});

describe('filterHistory', () => {
  const rows = dedupeHistory([
    entry({ id: '1', method: 'GET', url: 'https://api.example.com/users', statusCode: 200 }),
    entry({ id: '2', method: 'POST', url: 'https://api.example.com/orders', statusCode: 404 }),
    entry({ id: '3', method: 'GET', url: 'https://other.io/health', statusCode: 500 }),
  ]);

  it('matches urls case-insensitively', () => {
    expect(filterHistory(rows, 'ORDERS').map((r) => r.id)).toEqual(['2']);
  });

  it('matches the method', () => {
    expect(filterHistory(rows, 'post').map((r) => r.id)).toEqual(['2']);
  });

  it('matches the status code', () => {
    expect(filterHistory(rows, '500').map((r) => r.id)).toEqual(['3']);
  });

  it('returns everything for blank queries', () => {
    expect(filterHistory(rows, '  ')).toHaveLength(3);
  });
});

describe('relativeTime', () => {
  const now = 1_000_000_000;

  it('formats recent timestamps', () => {
    expect(relativeTime(now - 10_000, now)).toBe('just now');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5m ago');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2d ago');
  });

  it('falls back to a date beyond a week', () => {
    expect(relativeTime(now - 30 * 86_400_000, now)).not.toMatch(/ago/);
  });

  it('clamps future timestamps to just now', () => {
    expect(relativeTime(now + 60_000, now)).toBe('just now');
  });
});