import { describe, expect, it } from 'vitest';
import { requestPath, tabLabel } from '../../src/renderer/src/lib/tabLabel';

describe('requestPath', () => {
  it('extracts path and query from a full URL', () => {
    expect(requestPath('https://api.example.com/users/42?page=2')).toBe('/users/42?page=2');
  });

  it('returns / for bare hosts', () => {
    expect(requestPath('https://api.example.com')).toBe('/');
    expect(requestPath('https://api.example.com/')).toBe('/');
  });

  it('keeps relative URLs as-is', () => {
    expect(requestPath('api.example.com/users')).toBe('/users');
    expect(requestPath('/users')).toBe('/users');
  });

  it('works with template variables', () => {
    expect(requestPath('{{base_url}}/users?x=1')).toBe('/users?x=1');
  });

  it('drops the hash fragment', () => {
    expect(requestPath('https://x.io/page#section')).toBe('/page');
  });

  it('returns "" for empty input', () => {
    expect(requestPath('')).toBe('');
    expect(requestPath('   ')).toBe('');
  });
});

describe('tabLabel', () => {
  it('shows the URL path for auto-named requests', () => {
    expect(tabLabel({ name: 'New Request', url: 'https://api.example.com/users/42' })).toBe(
      '/users/42'
    );
    expect(tabLabel({ name: 'New Request 3', url: 'https://api.example.com/orders?page=1' })).toBe(
      '/orders?page=1'
    );
  });

  it('keeps explicit user names', () => {
    expect(tabLabel({ name: 'Login flow', url: 'https://api.example.com/login' })).toBe(
      'Login flow'
    );
  });

  it('falls back to the raw URL when no path is extractable', () => {
    expect(tabLabel({ name: 'New Request', url: '{{base_url}}' })).toBe('{{base_url}}');
  });

  it('keeps the name when there is no URL yet', () => {
    expect(tabLabel({ name: 'New Request', url: '' })).toBe('New Request');
  });
});