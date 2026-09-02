import type { Collection } from '@shared/types/request';
import type { CreateCollectionPayload } from '../services/api';
import { useWorkspaceStore } from './workspaceStore';

// Backward-compat wrapper: collection state is now owned by workspaceStore (YAML authoritative).
// This alias preserves existing imports (`useCollectionStore`) while keeping total Zustand stores = 3
// (UI, Workspace, Request) per spec. No separate persistence — collections live only as YAML on disk.
function toCollectionState(ws: ReturnType<typeof useWorkspaceStore.getState>): CollectionState {
  return {
    collections: ws.collections,
    loading: ws.loading,
    load: ws.loadCollections,
    create: ws.createCollection,
    update: ws.updateCollection,
    remove: ws.removeCollection,
    upsertRequest: async (collection: Collection) => {
      const existing = ws.getCollectionById(collection.id);
      if (existing) await ws.updateCollection(collection.id, { data: collection.data } as Partial<CreateCollectionPayload>);
      else
        await ws.createCollection({
          name: collection.name,
          type: 'request',
          parentId: collection.parentId,
          data: collection.data,
        });
    },
    getById: ws.getCollectionById,
    createCollection: ws.createCollection,
  };
}

export const useCollectionStore: {
  (): CollectionState;
  <U>(selector: (s: CollectionState) => U, equalityFn?: (a: U, b: U) => boolean): U;
  getState(): CollectionState;
  setState: (partial: Partial<CollectionState> | ((s: CollectionState) => Partial<CollectionState>)) => void;
  subscribe: (listener: (s: CollectionState, prev: CollectionState) => void) => () => void;
  getInitialState(): CollectionState;
  destroy(): void;
} = Object.assign(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <U>(selector?: (s: CollectionState) => U, equalityFn?: (a: U, b: U) => boolean): U | CollectionState => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return useWorkspaceStore(
      (ws) => {
        const cs = toCollectionState(ws as unknown as ReturnType<typeof useWorkspaceStore.getState>);
        return selector ? selector(cs) : (cs as unknown as U);
      },
      equalityFn as unknown as (a: unknown, b: unknown) => boolean
    ) as unknown as U | CollectionState;
  },
  {
    getState: () => toCollectionState(useWorkspaceStore.getState()),
    setState: useWorkspaceStore.setState as unknown as (partial: Partial<CollectionState> | ((s: CollectionState) => Partial<CollectionState>)) => void,
    subscribe: (listener: (s: CollectionState, prev: CollectionState) => void) =>
      useWorkspaceStore.subscribe((ws, prevWs) => listener(toCollectionState(ws as unknown as ReturnType<typeof useWorkspaceStore.getState>), toCollectionState(prevWs as unknown as ReturnType<typeof useWorkspaceStore.getState>))),
    getInitialState: () => toCollectionState(useWorkspaceStore.getState()),
    destroy: () => {},
  }
) as unknown as typeof useCollectionStore;

interface CollectionState {
  collections: Collection[];
  loading: boolean;
  load: () => Promise<void>;
  create: (payload: CreateCollectionPayload) => Promise<Collection>;
  update: (id: string, patch: Partial<CreateCollectionPayload>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  upsertRequest: (collection: Collection) => Promise<void>;
  getById: (id: string) => Collection | undefined;
  createCollection: (payload: CreateCollectionPayload) => Promise<Collection>;
}
