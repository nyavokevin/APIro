import { useEffect, useState, useCallback } from 'react';
import { isTauri } from '../services/tauri';

export type LicenseState =
  | 'activated'
  | 'pending_sync'
  | 'grace_period_over'
  | 'revoked'
  | 'expired';

export interface LicenseStatus {
  state: LicenseState;
  tier?: 'pro' | 'team';
  seats?: number;
  licenseId?: string;
  isPro: boolean;
  expiresAt?: string | null;
  lastVerifiedAt?: string | null;
  activationId?: string | null;
}

const FALLBACK_FREE: LicenseStatus = {
  state: 'grace_period_over',
  isPro: false,
};

async function invokeLicense<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args as any);
  }
  // Web fallback — localStorage mirror of Rust store
  if (cmd === 'license_get_status') {
    try {
      const raw = localStorage.getItem('apiro.license');
      if (raw) {
        const parsed = JSON.parse(raw);
        // normalize snake_case -> camelCase
        const stateRaw = parsed.state as string;
        const mapState = (s: string): LicenseState => {
          if (s === 'activated') return 'activated';
          if (s === 'pending_sync' || s === 'pendingSync') return 'pending_sync';
          if (s === 'grace_period_over') return 'grace_period_over';
          if (s === 'revoked') return 'revoked';
          if (s === 'expired') return 'expired';
          return 'grace_period_over';
        };
        return {
          state: mapState(stateRaw),
          tier: parsed.payload?.tier,
          seats: parsed.payload?.seats,
          licenseId: parsed.payload?.license_id,
          isPro: stateRaw === 'activated' || stateRaw === 'pending_sync',
          expiresAt: parsed.payload?.expires_at ?? null,
          lastVerifiedAt: parsed.last_verified_at ?? null,
          activationId: parsed.activation_id ?? null,
        } as unknown as T;
      }
    } catch {}
    return FALLBACK_FREE as unknown as T;
  }
  if (cmd === 'license_verify_offline') {
    // In web preview we cannot Ed25519 verify without JS lib — just accept format APIRO- and return mock
    const key = (args as any)?.key as string;
    if (!key || !key.toUpperCase().startsWith('APIRO-')) throw new Error('Invalid format');
    return { license_id: 'lic_web_preview', tier: 'pro', seats: 1, issued_at: new Date().toISOString() } as unknown as T;
  }
  throw new Error('license command not available in web preview');
}

export function useLicense() {
  const [status, setStatus] = useState<LicenseStatus>(FALLBACK_FREE);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await invokeLicense<LicenseStatus>('license_get_status');
      setStatus(s);
    } catch {
      setStatus(FALLBACK_FREE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isPro = status.isPro;

  const activate = useCallback(async (key: string) => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      const next = await invoke<LicenseStatus>('license_activate', { key });
      setStatus(next);
      return next;
    }
    // Web fallback: store as pending_sync in localStorage (offline grace)
    const fake = {
      key,
      payload: { license_id: 'lic_web_' + Math.random().toString(36).slice(2, 8), tier: 'pro', seats: 1, issued_at: new Date().toISOString(), expires_at: null },
      state: 'pending_sync',
      last_verified_at: new Date().toISOString(),
      activation_id: null,
    };
    localStorage.setItem('apiro.license', JSON.stringify(fake));
    const next: LicenseStatus = { state: 'pending_sync', tier: 'pro', seats: 1, licenseId: fake.payload.license_id, isPro: true, expiresAt: null, lastVerifiedAt: fake.last_verified_at, activationId: null };
    setStatus(next);
    return next;
  }, []);

  const deactivate = useCallback(async () => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('license_deactivate');
    } else {
      localStorage.removeItem('apiro.license');
    }
    setStatus(FALLBACK_FREE);
  }, []);

  const revalidate = useCallback(async () => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      const next = await invoke<LicenseStatus>('license_revalidate');
      setStatus(next);
      return next;
    }
    return status;
  }, [status]);

  return { status, loading, isPro, refresh, activate, deactivate, revalidate };
}
