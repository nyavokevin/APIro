import { describe, it, expect } from 'vitest';
import { resolveVariables } from '../../src/main/services/variable-resolver';
import type { EnvironmentVariable } from '../../src/shared/types/request';

const vars = (entries: Record<string, string>): EnvironmentVariable[] =>
  Object.entries(entries).map(([key, value]) => ({
    id: key,
    key,
    value,
    type: 'string',
  }));

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('variable-resolver: simple substitution', () => {
  it('resolves {{var}} from the variable list', () => {
    const out = resolveVariables('Hello {{name}}!', vars({ name: 'world' }));
    expect(out).toBe('Hello world!');
  });

  it('leaves unknown variables untouched', () => {
    const out = resolveVariables('{{missing}}', vars({}));
    expect(out).toBe('{{missing}}');
  });
});

describe('variable-resolver: dynamic functions', () => {
  it('{{$randomEmail}} produces a valid email', () => {
    const out = resolveVariables('{{$randomEmail}}', []);
    expect(out).toContain('@');
    expect(out).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });

  it('{{$uuid}} produces a v4 uuid', () => {
    const out = resolveVariables('{{$uuid}}', []);
    expect(out).toMatch(UUID_V4);
  });

  it('{{$timestamp}} produces a numeric timestamp', () => {
    const out = resolveVariables('{{$timestamp}}', []);
    expect(out).toMatch(/^\d+$/);
    expect(Number(out)).toBeGreaterThan(0);
  });

  it('{{$isoTimestamp}} produces an ISO string', () => {
    const out = resolveVariables('{{$isoTimestamp}}', []);
    expect(() => new Date(out)).not.toThrow();
    expect(new Date(out).toISOString()).toBe(out);
  });

  it('{{$randomInt(1,10)}} stays in range', () => {
    for (let i = 0; i < 50; i++) {
      const out = resolveVariables('{{$randomInt(1,10)}}', []);
      const n = Number(out);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(10);
    }
  });

  it('{{$randomString(8)}} has length 8', () => {
    const out = resolveVariables('{{$randomString(8)}}', []);
    expect(out).toHaveLength(8);
  });
});

describe('variable-resolver: nested & multiple', () => {
  it('resolves multiple variables in one template', () => {
    const out = resolveVariables('{{greeting}} {{name}}', vars({ greeting: 'Hi', name: 'Kito' }));
    expect(out).toBe('Hi Kito');
  });

  it('mixes dynamic functions and variables', () => {
    const out = resolveVariables('{{$uuid}} for {{user}}', vars({ user: 'admin' }));
    expect(out.endsWith(' for admin')).toBe(true);
    expect(out.replace(' for admin', '').trim()).toMatch(UUID_V4);
  });
});
