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
      const vars = useWorkspaceStore.getState().variables();
      const response = await api.requests.execute(tab.request, vars);
      if (response.testResults) set({ testResults: response.testResults });
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === id ? { ...t, response, loading: false } : t
        ),
      }));
    } catch (err) {
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                loading: false,
                response: {
                  id: 'error',
                  statusCode: 0,
                  statusText: 'Error',
                  headers: {},
                  body: err instanceof Error ? err.message : String(err),
                  contentType: 'text/plain',
                  responseTime: 0,
                  size: 0,
                  timeline: { dns: 0, tcp: 0, tls: 0, ttfb: 0, download: 0, total: 0 },
                  cookies: [],
                  error: err instanceof Error ? err.message : String(err),
                },
              }
            : t
        ),
      }));
    }
  },
  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId);
  },
  addTab: (request) => get().openRequest(request),
}));
