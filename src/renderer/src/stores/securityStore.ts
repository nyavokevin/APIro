import { create } from 'zustand';
import type { RequestData, ResponseData } from '@shared/types/request';
import { runPassiveScan } from '../lib/security/passiveScan';

export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type SecurityCategory = 'headers' | 'auth' | 'transport' | 'exposure' | 'injection';

export interface SecurityFinding {
  id: string;
  requestId: string;
  ruleId: string;
  title: string;
  description: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  remediation?: string;
  evidence?: string;
  timestamp: number;
  dismissed?: boolean;
}

interface SecurityState {
  findings: SecurityFinding[];
  selectedRequestId: string | null;
  // actions
  getFindingsForRequest: (requestId: string) => SecurityFinding[];
  getFindingCountForRequest: (requestId: string) => number;
  getActiveFindingsForRequest: (requestId: string) => SecurityFinding[];
  addFindings: (findings: SecurityFinding[]) => void;
  dismissFinding: (id: string) => void;
  undismissFinding: (id: string) => void;
  clearForRequest: (requestId: string) => void;
  clearAll: () => void;
  setSelectedRequestId: (id: string | null) => void;
  runPassiveScanForRequest: (request: RequestData, response: ResponseData | null) => SecurityFinding[];
  // for SecurityPage global filter
  filteredFindings: () => SecurityFinding[];
}

export const useSecurityStore = create<SecurityState>((set, get) => ({
  findings: [],
  selectedRequestId: null,

  getFindingsForRequest: (requestId) =>
    get().findings.filter((f) => f.requestId === requestId && !f.dismissed),

  getFindingCountForRequest: (requestId) =>
    get().findings.filter((f) => f.requestId === requestId && !f.dismissed).length,

  getActiveFindingsForRequest: (requestId) =>
    get().findings.filter((f) => f.requestId === requestId && !f.dismissed),

  addFindings: (newFindings) =>
    set((s) => {
      // de-duplicate by ruleId+requestId+title? Keep latest: replace previous with same ruleId for same request
      const remaining = s.findings.filter(
        (f) => !newFindings.some((n) => n.requestId === f.requestId && n.ruleId === f.ruleId)
      );
      return { findings: [...remaining, ...newFindings] };
    }),

  dismissFinding: (id) =>
    set((s) => ({
      findings: s.findings.map((f) => (f.id === id ? { ...f, dismissed: true } : f)),
    })),

  undismissFinding: (id) =>
    set((s) => ({
      findings: s.findings.map((f) => (f.id === id ? { ...f, dismissed: false } : f)),
    })),

  clearForRequest: (requestId) =>
    set((s) => ({
      findings: s.findings.filter((f) => f.requestId !== requestId),
    })),

  clearAll: () => set({ findings: [] }),

  setSelectedRequestId: (id) => set({ selectedRequestId: id }),

  runPassiveScanForRequest: (request, response) => {
    if (!response || response.statusCode === 0) return [];
    // remove previous findings for this request before adding new ones
    const fresh = runPassiveScan(request, response);
    const { findings } = get();
    const kept = findings.filter((f) => f.requestId !== request.id);
    set({ findings: [...kept, ...fresh] });
    return fresh;
  },

  filteredFindings: () => {
    const { findings, selectedRequestId } = get();
    const active = findings.filter((f) => !f.dismissed);
    if (selectedRequestId) return active.filter((f) => f.requestId === selectedRequestId);
    return active;
  },
}));
