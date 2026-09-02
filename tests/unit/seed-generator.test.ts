import { describe, it, expect } from 'vitest';
import { generateFieldValue, generateBulkSeed } from '../../src/main/services/seed-generator';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('seed-generator: generateFieldValue', () => {
  it('email contains an @ sign', () => {
    expect(generateFieldValue('email')).toContain('@');
  });

  it('password has length >= 8', () => {
    expect(generateFieldValue('password').length).toBeGreaterThanOrEqual(8);
    expect(generateFieldValue('pwd').length).toBeGreaterThanOrEqual(8);
  });

  it('uuid yields a v4 uuid', () => {
    expect(generateFieldValue('uuid')).toMatch(UUID_V4);
  });

  it('id yields a v4 uuid', () => {
    expect(generateFieldValue('id')).toMatch(UUID_V4);
  });

  it('date yields a valid ISO date', () => {
    const out = generateFieldValue('date');
    expect(() => new Date(out)).not.toThrow();
    expect(new Date(out).toISOString()).toBe(out);
  });
});

describe('seed-generator: generateBulkSeed', () => {
  it('fills a flat object with realistic values', () => {
    const out = generateBulkSeed('{"email":"","name":"","age":0}');
    const parsed = JSON.parse(out) as { email: string; name: string; age: number };
    expect(parsed.email).toContain('@');
    expect(parsed.name.length).toBeGreaterThan(0);
    expect(typeof parsed.age).toBe('number');
    expect(parsed.age).toBeGreaterThanOrEqual(1);
    expect(parsed.age).toBeLessThanOrEqual(1000);
  });

  it('fills nested objects', () => {
    const out = generateBulkSeed('{"user":{"email":"","name":""},"count":0}');
    const parsed = JSON.parse(out) as { user: { email: string; name: string }; count: number };
    expect(parsed.user.email).toContain('@');
    expect(parsed.user.name.length).toBeGreaterThan(0);
    expect(typeof parsed.count).toBe('number');
  });

  it('returns the original string when JSON is invalid', () => {
    expect(generateBulkSeed('not json')).toBe('not json');
  });
});
