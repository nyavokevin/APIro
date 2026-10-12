// Calm, specific copy for gate denials — no dark patterns.
import type { GateResult, DenyReason } from '../hooks/useTierGate';

export function describeReason(reason: DenyReason): string {
  switch (reason.type) {
    case 'collectionLimitReached':
      return `You've used ${reason.current}/${reason.max} collections on the Free plan.`;
    case 'environmentLimitReached':
      return `You've used ${reason.current}/${reason.max} environments on the Free plan.`;
    case 'assertionLimitReached':
      return `You've used ${reason.current}/${reason.max} assertions for this request on the Free plan.`;
    case 'featureNotInTier': {
      const map: Record<string, string> = {
        mock_server: 'Mock Server is a Pro feature.',
        graphql: 'GraphQL is a Pro feature.',
        grpc: 'gRPC is a Pro feature.',
        ci_cli: 'CI CLI is a Pro feature.',
        pdf_branding: 'Branded PDF export is a Pro feature.',
        flow_visualizer: 'Flow Visualizer is a Pro feature.',
        team_sharing: 'Team sharing is a Team feature.',
        shared_secrets: 'Shared secrets require a Team plan.',
        ai_assistant: 'AI Assistant is a Pro feature.',
      };
      return map[reason.feature] ?? `${reason.feature} is not included in your plan.`;
    }
    case 'aiQuotaExhausted': {
      const quota = reason.quota;
      const used = reason.used;
      if (quota === 0) return 'AI Assistant is a Pro feature.';
      const date = reason.resetsAt ? new Date(reason.resetsAt).toLocaleDateString() : '';
      return `AI Assistant quota used (${used}/${quota}).${date ? ` Resets ${date}.` : ''}`;
    }
    case 'seatLimitReached':
      return `Seat limit reached (${reason.current}/${reason.max}).`;
    default:
      return 'This action requires a higher plan.';
  }
}

export function isDenied(result: GateResult | null | undefined): boolean {
  return !!result && (result as any).type === 'Denied';
}
