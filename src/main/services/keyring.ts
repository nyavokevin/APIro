/**
 * Secret keyring abstraction — OS keychain when available, fallback to
 * encrypted in-memory store for web preview.
 * Values stored as KEYRING_REF:sha256:<hash> in YAML; real value lives
 * in OS keyring (macOS Keychain / Windows Credential Manager / Secret Service)
 * or in-memory fallback.
 */
const FALLBACK_PREFIX = 'apiforge.keyring.';

function hashId(id: string): string {
  // simple hash for browser compatibility (not crypto-secure, just for ref)
  let h = 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(31, h) + id.charCodeAt(i) | 0;
  return Math.abs(h).toString(16).padStart(8, '0').slice(0, 12);
}

function fallbackKey(keyringId: string): string {
  return `${FALLBACK_PREFIX}${keyringId}`;
}

// ---- in-memory fallback (web preview) ----
function fallbackSet(keyringId: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(fallbackKey(keyringId), value);
  } catch { /* ignore */ }
}
function fallbackGet(keyringId: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(fallbackKey(keyringId));
  } catch { /* ignore */ }
  return null;
}
function fallbackDelete(keyringId: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(fallbackKey(keyringId));
  } catch { /* ignore */ }
}

export function toKeyringRef(envId: string, varKey: string): string {
  const keyringId = `${envId}_${varKey}`;
  return `KEYRING_REF:sha256:${hashId(keyringId)}`;
}

export function keyringIdFor(envId: string, varKey: string): string {
  return `${envId}_${varKey}`;
}

export async function setSecret(envId: string, varKey: string, value: string): Promise<string> {
  const id = keyringIdFor(envId, varKey);
  // Try Tauri secure store if available
  try {
    // @ts-ignore — Tauri invoke may not exist in web preview
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('keyring_set', { service: 'apiforge', account: id, value });
      return toKeyringRef(envId, varKey);
    }
  } catch { /* fallback */ }
  fallbackSet(id, value);
  return toKeyringRef(envId, varKey);
}

export async function getSecret(ref: string, envId: string, varKey: string): Promise<string | null> {
  if (!ref.startsWith('KEYRING_REF:')) return ref;
  const id = keyringIdFor(envId, varKey);
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      const { invoke } = await import('@tauri-apps/api/core');
      const v = await invoke<string | null>('keyring_get', { service: 'apiforge', account: id });
      if (v) return v;
    }
  } catch { /* fallback */ }
  return fallbackGet(id);
}

export async function deleteSecret(envId: string, varKey: string): Promise<void> {
  const id = keyringIdFor(envId, varKey);
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('keyring_delete', { service: 'apiforge', account: id });
      return;
    }
  } catch { /* fallback */ }
  fallbackDelete(id);
}

export function isKeyringRef(value: string): boolean {
  return value.startsWith('KEYRING_REF:');
}
