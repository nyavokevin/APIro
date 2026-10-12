import { useCallback, useEffect, useState } from 'react';
import { isTauri } from '../services/tauri';

export type Tier = 'free' | 'pro' | 'team';

export interface UsageStat {
  current: number;
  max: number | null;
}

export interface UsageSummary {
  tier: Tier;
  collections: UsageStat;
  environments: UsageStat;
  aiAssistant: UsageStat;
  mockServerEnabled: boolean;
  graphqlEnabled: boolean;
  grpcEnabled: boolean;
  ciCliEnabled: boolean;
  teamSharingEnabled: boolean;
  advancedEnvironmentsEnabled: boolean;
  flowVisualizerEnabled: boolean;
  pdfExportBranding: boolean;
  maxSeats: number | null;
}

export type GateAction =
  | 'CreateCollection'
  | 'CreateEnvironment'
  | 'AddAssertion'
  | 'UseMockServer'
  | 'UseGraphQL'
  | 'UseGrpc'
  | 'RunCiCli'
  | 'UseAiAssistant'
  | 'ExportBrandedPdf'
  | 'OpenFlowVisualizer'
  | 'InviteTeamMember'
  | 'SyncSharedSecrets';

export type DenyReason =
  | { type: 'collectionLimitReached'; current: number; max: number }
  | { type: 'environmentLimitReached'; current: number; max: number }
  | { type: 'assertionLimitReached'; current: number; max: number }
  | { type: 'featureNotInTier'; feature: string }
  | { type: 'aiQuotaExhausted'; used: number; quota: number; resetsAt: string }
  | { type: 'seatLimitReached'; current: number; max: number };

export type GateResult =
  | { type: 'Allowed' }
  | { type: 'Denied'; reason: DenyReason; currentTier: Tier; upgradeHint: string };

async function invokeGate<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args as any);
  }
  // Web fallback — approximate from localStorage so preview doesn't crash.
  if (cmd === 'license_get_usage_summary') {
    let tier: Tier = 'free';
    try {
      const raw = localStorage.getItem('apiro.license');
      if (raw) {
        const p = JSON.parse(raw);
        const state = p.state as string;
        if (state === 'activated' || state === 'pending_sync') {
          const t = (p.payload?.tier as string) ?? 'pro';
          tier = t === 'team' ? 'team' : 'pro';
        }
      }
    } catch {}
    const isFree = tier === 'free';
    let collections = 0;
    let environments = 0;
    try {
      const c = localStorage.getItem('apiforge.web.collections');
      if (c) collections = JSON.parse(c).length;
      const e = localStorage.getItem('apiforge.web.environments');
      if (e) environments = JSON.parse(e).length;
    } catch {}
    return {
      tier,
      collections: { current: collections, max: isFree ? 3 : null },
      environments: { current: environments, max: isFree ? 2 : null },
      aiAssistant: { current: 0, max: isFree ? 0 : tier === 'team' ? 500 : 100 },
      mockServerEnabled: !isFree,
      graphqlEnabled: !isFree,
      grpcEnabled: !isFree,
      ciCliEnabled: !isFree,
      teamSharingEnabled: tier === 'team',
      advancedEnvironmentsEnabled: tier === 'team',
      flowVisualizerEnabled: !isFree,
      pdfExportBranding: !isFree,
      maxSeats: isFree ? 1 : tier === 'team' ? null : 1,
    } as unknown as T;
  }
  if (cmd === 'license_check_gate' || cmd === 'license_check_gate_typed') {
    const action = args?.action as GateAction;
    const assertionCount = (args?.assertion_count as number) ?? (args?.assertionCount as number) ?? 0;
    // Reuse summary to decide
    const summary = await invokeGate<UsageSummary>('license_get_usage_summary');
    const limits: Record<Tier, any> = {
      free: { collections: 3, envs: 2, assertions: 5, mock: false, gql: false, grpc: false, ci: false, ai: 0, pdf: false, flow: false, team: false },
      pro: { collections: null, envs: null, assertions: null, mock: true, gql: true, grpc: true, ci: true, ai: 100, pdf: true, flow: true, team: false },
      team: { collections: null, envs: null, assertions: null, mock: true, gql: true, grpc: true, ci: true, ai: 500, pdf: true, flow: true, team: true },
    };
    const lim = limits[summary.tier];
    const denied = (reason: DenyReason, hint: string): GateResult => ({ type: 'Denied', reason, currentTier: summary.tier, upgradeHint: hint });
    switch (action) {
      case 'CreateCollection':
        if (lim.collections != null && summary.collections.current >= lim.collections)
          return denied({ type: 'collectionLimitReached', current: summary.collections.current, max: lim.collections }, 'Upgrade to Pro for unlimited collections') as unknown as T;
        break;
      case 'CreateEnvironment':
        if (lim.envs != null && summary.environments.current >= lim.envs)
          return denied({ type: 'environmentLimitReached', current: summary.environments.current, max: lim.envs }, 'Upgrade to Pro for unlimited environments') as unknown as T;
        break;
      case 'AddAssertion':
        if (lim.assertions != null && assertionCount >= lim.assertions)
          return denied({ type: 'assertionLimitReached', current: assertionCount, max: lim.assertions }, 'Upgrade to Pro for unlimited assertions') as unknown as T;
        break;
      case 'UseMockServer':
        if (!lim.mock) return denied({ type: 'featureNotInTier', feature: 'mock_server' }, 'Mock Server is a Pro feature') as unknown as T;
        break;
      case 'UseGraphQL':
        if (!lim.gql) return denied({ type: 'featureNotInTier', feature: 'graphql' }, 'GraphQL is a Pro feature') as unknown as T;
        break;
      case 'UseGrpc':
        if (!lim.grpc) return denied({ type: 'featureNotInTier', feature: 'grpc' }, 'gRPC is a Pro feature') as unknown as T;
        break;
      case 'RunCiCli':
        if (!lim.ci) return denied({ type: 'featureNotInTier', feature: 'ci_cli' }, 'CI CLI is a Pro feature') as unknown as T;
        break;
      case 'UseAiAssistant':
        if (lim.ai === 0) return denied({ type: 'aiQuotaExhausted', used: 0, quota: 0, resetsAt: new Date().toISOString() }, 'AI Assistant is a Pro feature') as unknown as T;
        break;
      case 'ExportBrandedPdf':
        if (!lim.pdf) return denied({ type: 'featureNotInTier', feature: 'pdf_branding' }, 'Branded PDF export is a Pro feature') as unknown as T;
        break;
      case 'OpenFlowVisualizer':
        if (!lim.flow) return denied({ type: 'featureNotInTier', feature: 'flow_visualizer' }, 'Flow Visualizer is a Pro feature') as unknown as T;
        break;
      case 'InviteTeamMember':
      case 'SyncSharedSecrets':
        if (!lim.team) return denied({ type: 'featureNotInTier', feature: action === 'InviteTeamMember' ? 'team_sharing' : 'shared_secrets' }, 'Team sharing is a Team feature') as unknown as T;
        break;
    }
    return { type: 'Allowed' } as unknown as T;
  }
  throw new Error(`license command not available in web preview: ${cmd}`);
}

export function useTierGate() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  const refresh = useCallback(async () => {
    try {
      const u = await invokeGate<UsageSummary>('license_get_usage_summary');
      setUsage(u);
    } catch {
      // keep previous
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const checkGate = useCallback(
    async (action: GateAction, opts?: { assertionCount?: number }): Promise<GateResult> => {
      try {
        const result = await invokeGate<GateResult>('license_check_gate', {
          action,
          assertion_count: opts?.assertionCount ?? null,
          dir: null,
        });
        if ((result as any).type === 'Denied') void refresh();
        return result;
      } catch {
        // On error, fall back to web logic via typed variant
        try {
          const r = await invokeGate<GateResult>('license_check_gate_typed', {
            action: action as any,
            assertion_count: opts?.assertionCount ?? null,
            dir: null,
          } as any);
          if ((r as any).type === 'Denied') void refresh();
          return r;
        } catch {
          return { type: 'Allowed' };
        }
      }
    },
    [refresh]
  );

  const consumeAiQuota = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('license_consume_ai_quota');
        void refresh();
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: String(e?.message ?? e) };
      }
    }
    // Web: no quota tracking, just allow
    return { ok: true };
  }, [refresh]);

  return { usage, checkGate, refresh, consumeAiQuota };
}
