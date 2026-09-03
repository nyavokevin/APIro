import { create } from 'zustand';
import type { TestResult } from '@shared/types/request';

export interface TestRunRow {
  id: string;
  name: string;
  method: string;
  url: string;
  status: number | null;
  ok: boolean;
  error?: string;
  tests: TestResult[];
  durationMs?: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
}

export type RunStatus = 'running' | 'done' | 'cancelled' | 'error';

export interface TestRun {
  id: string;
  collectionId: string;
  collectionName: string;
  status: RunStatus;
  mode: 'sequential' | 'parallel';
  concurrency: number;
  total: number;
  progress: number;
  rows: TestRunRow[];
  startedAt: number;
  finishedAt?: number;
  error?: string;
  // snapshot of variables at start for chaining
  flakyMap?: Record<string, { pass: number; total: number }>;
}

interface TestingState {
  runs: TestRun[];
  activeRunId: string | null;
  currentRows: TestRunRow[];
  currentProgress: number;
  isRunning: boolean;
  abortController: AbortController | null;
  startRun: (run: Omit<TestRun, 'startedAt' | 'status' | 'progress' | 'rows'> & { total: number }) => string;
  updateRow: (runId: string, idx: number, row: TestRunRow) => void;
  setProgress: (runId: string, progress: number) => void;
  completeRun: (runId: string, status: RunStatus) => void;
  cancelRun: (runId: string) => void;
  setAbortController: (c: AbortController | null) => void;
  getActiveRun: () => TestRun | undefined;
  getRun: (id: string) => TestRun | undefined;
}

function genRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useTestingStore = create<TestingState>((set, get) => ({
  runs: [],
  activeRunId: null,
  currentRows: [],
  currentProgress: 0,
  isRunning: false,
  abortController: null,

  startRun: (partial) => {
    const id = partial.id || genRunId();
    const run: TestRun = {
      id,
      collectionId: partial.collectionId,
      collectionName: partial.collectionName,
      mode: partial.mode,
      concurrency: partial.concurrency,
      total: partial.total,
      status: 'running',
      progress: 0,
      rows: Array.from({ length: partial.total }, () => ({ id: '', name: '', method: '', url: '', status: null, ok: false, tests: [] } as TestRunRow)),
      startedAt: Date.now(),
    };
    set((s) => ({
      runs: [run, ...s.runs].slice(0, 20),
      activeRunId: id,
      currentRows: run.rows,
      currentProgress: 0,
      isRunning: true,
    }));
    return id;
  },

  updateRow: (runId, idx, row) =>
    set((s) => {
      const runs = s.runs.map((r) => {
        if (r.id !== runId) return r;
        const rows = [...r.rows];
        rows[idx] = row;
        return { ...r, rows };
      });
      const active = runs.find((r) => r.id === runId);
      return {
        runs,
        currentRows: s.activeRunId === runId && active ? active.rows : s.currentRows,
      };
    }),

  setProgress: (runId, progress) =>
    set((s) => {
      const runs = s.runs.map((r) => (r.id === runId ? { ...r, progress } : r));
      return {
        runs,
        currentProgress: s.activeRunId === runId ? progress : s.currentProgress,
      };
    }),

  completeRun: (runId, status) =>
    set((s) => ({
      runs: s.runs.map((r) => (r.id === runId ? { ...r, status, finishedAt: Date.now() } : r)),
      isRunning: s.activeRunId === runId ? false : s.isRunning,
      abortController: s.activeRunId === runId ? null : s.abortController,
    })),

  cancelRun: (runId) => {
    const c = get().abortController;
    if (c && get().activeRunId === runId) c.abort();
    set((s) => ({
      runs: s.runs.map((r) => (r.id === runId ? { ...r, status: 'cancelled' as const, finishedAt: Date.now() } : r)),
      isRunning: false,
      abortController: null,
    }));
  },

  setAbortController: (c) => set({ abortController: c }),

  getActiveRun: () => {
    const { runs, activeRunId } = get();
    return runs.find((r) => r.id === activeRunId);
  },

  getRun: (id) => get().runs.find((r) => r.id === id),
}));
