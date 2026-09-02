import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Collection, Environment, EnvironmentVariable } from '@shared/types/request';
import { api, type CreateCollectionPayload } from '../services/api';
import { uid } from '../lib/id';

interface WorkspaceState {
  workspacePath: string | null;
  collections: Collection[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  loading: boolean;
  // workspace
  setWorkspacePath: (path: string) => void;
  loadWorkspace: () => Promise<void>;
  // collections
  loadCollections: () => Promise<void>;
  createCollection: (payload: CreateCollectionPayload) => Promise<Collection>;
  updateCollection: (id: string, patch: Partial<CreateCollectionPayload>) => Promise<void>;
  removeCollection: (id: string) => Promise<void>;
  // environments
  loadEnvironments: () => Promise<void>;
  createEnvironment: (name: string, variables?: EnvironmentVariable[], opts?: { color?: string; description?: string }) => Promise<void>;
  updateEnvironment: (id: string, patch: { name?: string; variables?: EnvironmentVariable[]; color?: string; description?: string }) => Promise<void>;
  removeEnvironment: (id: string) => Promise<void>;
  setActiveEnvironment: (id: string) => Promise<void>;
  variables: () => EnvironmentVariable[];
  getCollectionById: (id: string) => Collection | undefined;
}

function findNode(nodes: Collection[], id: string): Collection | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspacePath: null,
      collections: [],
      environments: [],
      activeEnvironmentId: null,
      loading: false,

      setWorkspacePath: (path) => set({ workspacePath: path }),
      loadWorkspace: async () => {
        set({ loading: true });
        try {
          const cols = await api.collections.list();
          const envs = await api.environments.list();
          const active = envs.find((e) => e.isActive) ?? null;
          set({
            collections: cols,
            environments: envs,
            activeEnvironmentId: active?.id ?? null,
            loading: false,
          });
        } catch {
          set({ loading: false });
        }
      },

      loadCollections: async () => {
        set({ loading: true });
        const collections = await api.collections.list();
        set({ collections, loading: false });
      },
      createCollection: async (payload) => {
        const created = await api.collections.create(payload);
        set((state) => ({ collections: [...state.collections, created] }));
        return created;
      },
      updateCollection: async (id, patch) => {
        const updated = await api.collections.update(id, patch);
        if (!updated) return;
        set((state) => {
          const replace = (nodes: Collection[]): Collection[] =>
            nodes.map((n) => {
              if (n.id === id) return updated;
              if (n.children) return { ...n, children: replace(n.children) };
              return n;
            });
          return { collections: replace(state.collections) };
        });
      },
      removeCollection: async (id) => {
        await api.collections.delete(id);
        set((state) => {
          const remove = (nodes: Collection[]): Collection[] =>
            nodes
              .filter((n) => n.id !== id)
              .map((n) => (n.children ? { ...n, children: remove(n.children) } : n));
          return { collections: remove(state.collections) };
        });
      },

      loadEnvironments: async () => {
        set({ loading: true });
        const environments = await api.environments.list();
        const active = environments.find((e) => e.isActive) ?? null;
        set({ environments, activeEnvironmentId: active?.id ?? null, loading: false });
      },
      createEnvironment: async (name, variables = [], opts) => {
        const env = await api.environments.create({ name, variables, color: opts?.color, description: opts?.description });
        set((state) => ({ environments: [...state.environments, env] }));
      },
      updateEnvironment: async (id, patch) => {
        const updated = await api.environments.update(id, patch as any);
        if (!updated) return;
        set((state) => ({
          environments: state.environments.map((e) => (e.id === id ? updated : e)),
        }));
      },
      removeEnvironment: async (id) => {
        await api.environments.delete(id);
        set((state) => {
          const environments = state.environments.filter((e) => e.id !== id);
          const activeEnvironmentId = state.activeEnvironmentId === id ? null : state.activeEnvironmentId;
          return { environments, activeEnvironmentId };
        });
      },
      setActiveEnvironment: async (id) => {
        const environments = await api.environments.setActive(id);
        set({
          environments,
          activeEnvironmentId: environments.find((e) => e.isActive)?.id ?? null,
        });
      },
      variables: () => {
        const { environments, activeEnvironmentId } = get();
        return environments.find((e) => e.id === activeEnvironmentId)?.variables ?? [];
      },
      getCollectionById: (id) => findNode(get().collections, id),
    }),
    {
      name: 'apiforge-workspace',
      partialize: (state) => ({ workspacePath: state.workspacePath }),
    }
  )
);

export function newRequestData(name = 'New Request'): import('@shared/types/request').RequestData {
  return {
    id: uid(),
    name,
    method: 'GET',
    url: '',
    headers: [],
    params: [],
    bodyType: 'none',
    body: '',
    auth: { type: 'none' },
    preRequestScript: '',
    testScript: '',
  };
}
