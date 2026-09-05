import { create } from 'zustand';
import type { RequestData, ResponseData } from '@shared/types/request';
import { runPassiveScan } from '../lib/security/passiveScan';

export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type SecurityCategory = 'headers' | 'auth' | 'transport' | 'exposure' | 'injection';

export type FindingStatus = 'open' | 'ignored' | 'resolved';
export type ScanType = 'passive' | 'bola' | 'rate-limit' | 'zap';

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
  status?: FindingStatus;
  // OWASP API Top 10 mapping, e.g. "API1:2023"
  owasp?: string;
  // enriched fields for detail drawer
  endpoint?: string;
  method?: string;
  evidenceRequest?: string;
  evidenceResponse?: string;
  whyMatters?: string;
}

export interface ScanRecord {
  id: string;
  type: ScanType;
  timestamp: number;
  environment: string | null;
  requestCount: number;
  findingCount: number;
  severityCounts: Record<SecuritySeverity, number>;
  findingIds: string[];
  requestIds: string[];
  label?: string;
}

interface SecurityState {
  findings: SecurityFinding[];
  scans: ScanRecord[];
  selectedRequestId: string | null;
  selectedScanId: string | null;
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
  setSelectedScanId: (id: string | null) => void;
  runPassiveScanForRequest: (request: RequestData, response: ResponseData | null) => SecurityFinding[];
  recordScan: (type: ScanType, requestIds: string[], findings: SecurityFinding[], environment: string | null) => ScanRecord;
  deleteScan: (id: string) => void;
  clearScans: () => void;
  updateFindingStatus: (id: string, status: FindingStatus, reason?: string) => void;
  // for SecurityPage global filter
  filteredFindings: () => SecurityFinding[];
}

function isActiveFinding(f: SecurityFinding): boolean {
  if (f.dismissed) return false;
  const s = f.status ?? 'open';
  return s === 'open';
}

export const useSecurityStore = create<SecurityState>((set, get) => ({
  findings: [],
  scans: [],
  selectedRequestId: null,
  selectedScanId: null,

  getFindingsForRequest: (requestId) =>
    get().findings.filter((f) => f.requestId === requestId && isActiveFinding(f)),

  getFindingCountForRequest: (requestId) =>
    get().findings.filter((f) => f.requestId === requestId && isActiveFinding(f)).length,

  getActiveFindingsForRequest: (requestId) =>
    get().findings.filter((f) => f.requestId === requestId && isActiveFinding(f)),

  addFindings: (newFindings) =>
    set((s) => {
      const withStatus = newFindings.map((f) => ({ ...f, status: (f.status ?? 'open') as FindingStatus }));
      const remaining = s.findings.filter(
        (f) => !withStatus.some((n) => n.requestId === f.requestId && n.ruleId === f.ruleId)
      );
      return { findings: [...remaining, ...withStatus] };
    }),

  dismissFinding: (id) =>
    set((s) => ({
      findings: s.findings.map((f) => (f.id === id ? { ...f, dismissed: true, status: 'ignored' as FindingStatus } : f)),
    })),

  undismissFinding: (id) =>
    set((s) => ({
      findings: s.findings.map((f) => (f.id === id ? { ...f, dismissed: false, status: 'open' as FindingStatus } : f)),
    })),

  clearForRequest: (requestId) =>
    set((s) => ({
      findings: s.findings.filter((f) => f.requestId !== requestId),
    })),

  clearAll: () => set({ findings: [], scans: [], selectedScanId: null }),

  setSelectedRequestId: (id) => set({ selectedRequestId: id }),
  setSelectedScanId: (id) => set({ selectedScanId: id }),

  runPassiveScanForRequest: (request, response) => {
    if (!response || response.statusCode === 0) return [];
    const fresh = runPassiveScan(request, response);
    const withMeta = fresh.map((f) => ({
      ...f,
      status: (f.status ?? 'open') as FindingStatus,
      owasp: (f as any).owasp ?? mapCategoryToOwasp(f.category, f.ruleId),
      endpoint: `${request.method} ${request.url}`,
      method: request.method,
    }));
    const { findings } = get();
    const kept = findings.filter((f) => f.requestId !== request.id);
    set({ findings: [...kept, ...withMeta] });
    // auto-record scan for history
    const env = (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useEnvironmentStore } = require('./environmentStore');
        const active = useEnvironmentStore.getState().environments.find((e: any) => e.id === useEnvironmentStore.getState().activeId);
        return active?.name ?? null;
      } catch {
        return null;
      }
    })();
    get().recordScan('passive', [request.id], withMeta, env);
    return withMeta;
  },

  recordScan: (type, requestIds, findings, environment) => {
    const now = Date.now();
    const severityCounts: Record<SecuritySeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) severityCounts[f.severity] = (severityCounts[f.severity] ?? 0) + 1;
    const rec: ScanRecord = {
      id: `scan-${now}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      timestamp: now,
      environment,
      requestCount: requestIds.length,
      findingCount: findings.length,
      severityCounts,
      findingIds: findings.map((f) => f.id),
      requestIds: [...requestIds],
      label: `Scan #${get().scans.length + 1} · ${type}`,
    };
    set((s) => ({ scans: [rec, ...s.scans].slice(0, 50) }));
    return rec;
  },

  deleteScan: (id) => set((s) => ({ scans: s.scans.filter((sc) => sc.id !== id), selectedScanId: s.selectedScanId === id ? null : s.selectedScanId })),
  clearScans: () => set({ scans: [], selectedScanId: null }),

  updateFindingStatus: (id, status, _reason) =>
    set((s) => ({
      findings: s.findings.map((f) => (f.id === id ? { ...f, status, dismissed: status === 'ignored' } : f)),
    })),

  filteredFindings: () => {
    const { findings, selectedRequestId, selectedScanId } = get();
    let active = findings.filter(isActiveFinding);
    if (selectedScanId) {
      const scan = get().scans.find((sc) => sc.id === selectedScanId);
      if (scan) active = active.filter((f) => scan.findingIds.includes(f.id));
    } else if (selectedRequestId) {
      active = active.filter((f) => f.requestId === selectedRequestId);
    }
    return active;
  },
}));

function mapCategoryToOwasp(category: SecurityCategory, ruleId: string): string {
  if (ruleId.includes('BOLA') || ruleId.includes('IDOR')) return 'API1:2023';
  if (category === 'auth') return 'API2:2023';
  if (category === 'exposure') return 'API7:2023';
  if (category === 'injection') return 'API3:2023';
  if (category === 'transport') return 'API8:2023';
  if (category === 'headers') return 'API8:2023';
  return 'API10:2023';
}
