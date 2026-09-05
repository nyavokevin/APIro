import { create } from 'zustand';
import type { RequestData, ResponseData, TestResult } from '@shared/types/request';
import { api } from '../services/api';
import { newRequestData } from './workspaceStore';
import { useWorkspaceStore } from './workspaceStore';

export interface RequestTab {
  id: string;
  request: RequestData;
  response: ResponseData | null;
  loading: boolean;
}

interface RequestState {
  tabs: RequestTab[];
  activeTabId: string | null;
  testResults: TestResult[];
  openRequest: (request?: RequestData) => string;
  newTab: () => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateRequest: (id: string, patch: Partial<RequestData>) => void;
  send: (id: string) => Promise<void>;
  getActiveTab: () => RequestTab | undefined;
  addTab: (request: RequestData) => string;
  setTestResults: (results: TestResult[]) => void;
}

function makeTab(request?: RequestData, name?: string): RequestTab {
  const req = request ?? newRequestData(name);
  return { id: req.id, request: req, response: null, loading: false };
}

export const useRequestStore = create<RequestState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  testResults: [],
  setTestResults: (results) => set({ testResults: results }),
  openRequest: (request) => {
    // Focus the existing tab instead of duplicating when the same request
    // (e.g. one from a collection) is already open.
    if (request) {
      const existing = get().tabs.find((t) => t.id === request.id);
      if (existing) {
        set({ activeTabId: existing.id });
        return existing.id;
      }
    }
    const tab = makeTab(request);
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
    return tab.id;
  },
  newTab: () => {
    // Number untitled tabs like a browser names new windows.
    const untitled = get().tabs.filter((t) => /^New Request( \d+)?$/.test(t.request.name)).length;
    const tab = makeTab(undefined, untitled > 0 ? `New Request ${untitled + 1}` : undefined);
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
    return tab.id;
  },
  closeTab: (id) => {
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === id);
      const tabs = state.tabs.filter((t) => t.id !== id);
      const activeTabId =
        state.activeTabId === id ? (tabs[Math.min(idx, tabs.length - 1)]?.id ?? null) : state.activeTabId;
      return { tabs, activeTabId };
    });
  },
  setActiveTab: (id) => set({ activeTabId: id }),
  updateRequest: (id, patch) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, request: { ...t.request, ...patch } } : t
      ),
    }));
  },
  send: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, loading: true } : t)),
    }));
    try {
      let vars = useWorkspaceStore.getState().variables();
      let effectiveReq = tab.request;
      // auto-seed if enabled (Phase2) — applied before pre-request
      if ((effectiveReq as unknown as { autoSeed?: boolean }).autoSeed) {
        try {
          const { generateBulkSeed } = await import('@main/services/seed-generator');
          if (effectiveReq.body && effectiveReq.body.trim()) {
            const strategy = (effectiveReq as unknown as { seedStrategy?: string }).seedStrategy || 'emptyOnly';
            const seeded = generateBulkSeed(effectiveReq.body, { strategy: strategy as never });
            effectiveReq = { ...effectiveReq, body: seeded };
          }
        } catch {}
      }
      // pre-request script zero-npm
      if (effectiveReq.preRequestScript && effectiveReq.preRequestScript.trim()) {
        try {
          const { runPreRequestBrowser } = await import('../lib/testExecutor');
          const pre = runPreRequestBrowser(effectiveReq.preRequestScript, effectiveReq, vars);
          effectiveReq = pre.request;
          vars = pre.variables;
        } catch {}
      }
      const response = await api.requests.execute(effectiveReq, vars);
      // run tests via browser executor if script present and no testResults from backend
      let testResults = response.testResults;
      if ((!testResults || testResults.length===0) && tab.request.testScript && tab.request.testScript.trim()) {
        try {
          const { runTestsBrowser } = await import('../lib/testExecutor');
          testResults = runTestsBrowser(effectiveReq, response, tab.request.testScript, vars);
          (response as unknown as { testResults: typeof testResults }).testResults = testResults;
        } catch {}
      }
      if (testResults) set({ testResults });
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === id ? { ...t, request: effectiveReq, response, loading: false } : t
        ),
      }));
      // toasts
      try {
        const { useNotificationStore } = await import('./notificationStore');
        const addToast = useNotificationStore.getState().addToast;
        if (response.error || response.statusCode===0) {
          addToast({ variant:'error', title:'Request failed', description: response.error || `Status ${response.statusCode}` });
        } else if (testResults && testResults.some(r=>!r.passed)) {
          addToast({ variant:'error', title:`${response.statusCode} ${response.statusText}`, description:`${testResults.filter(r=>!r.passed).length} tests failed`, actionLabel:'View Results', onAction:()=>{ /* stay on workspace results tab */ } });
        } else if (response.statusCode>=400) {
          addToast({ variant:'warning', title:`${response.statusCode} ${response.statusText}`, description:`${response.responseTime}ms` });
        } else {
          addToast({ variant:'success', title:`${response.statusCode} ${response.statusText}`, description:`${response.responseTime}ms · ${response.size}B` });
        }
        // snapshot seed if autoSeed
        if ((tab.request as unknown as { autoSeed?:boolean }).autoSeed) {
          try { const { pushSeedSnapshot } = await import('../lib/seedHistory'); pushSeedSnapshot(tab.request.id, effectiveReq.body); } catch {}
        }
      } catch {}
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const isInvalidUrl = /Invalid URL|Failed to parse URL/i.test(raw);
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                loading: false,
                response: {
                  id: 'error',
                  statusCode: 0,
                  statusText: isInvalidUrl ? 'Invalid URL' : 'Network Error',
                  headers: {},
                  body: raw,
                  contentType: 'text/plain',
                  responseTime: 0,
                  size: 0,
                  timeline: { dns: 0, tcp: 0, tls: 0, ttfb: 0, download: 0, total: 0 },
                  cookies: [],
                  error: raw,
                },
              }
            : t
        ),
      }));
      try {
        const { useNotificationStore } = await import('./notificationStore');
        useNotificationStore.getState().addToast({ variant:'error', title: isInvalidUrl ? 'Invalid URL' : 'Request failed', description: raw.slice(0, 220) });
      } catch {}
    }
  },
  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId);
  },
  addTab: (request) => get().openRequest(request),
}));
