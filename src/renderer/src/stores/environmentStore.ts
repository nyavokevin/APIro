import type { Environment, EnvironmentVariable } from '@shared/types/request';
import { useWorkspaceStore } from './workspaceStore';

interface EnvironmentState {
  environments: Environment[];
  activeId: string | null;
  loading: boolean;
  load: () => Promise<void>;
  create: (name: string, variables?: EnvironmentVariable[]) => Promise<void>;
  update: (id: string, patch: { name?: string; variables?: EnvironmentVariable[] }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string) => Promise<void>;
  variables: () => EnvironmentVariable[];
  createEnvironment: (name: string, variables?: EnvironmentVariable[]) => Promise<void>;
  updateEnvironment: (id: string, patch: { name?: string; variables?: EnvironmentVariable[] }) => Promise<void>;
}

function toEnvState(ws: ReturnType<typeof useWorkspaceStore.getState>): EnvironmentState {
  return {
    environments: ws.environments,
    activeId: ws.activeEnvironmentId,
    loading: ws.loading,
    load: ws.loadEnvironments,
    create: ws.createEnvironment,
    update: ws.updateEnvironment,
    remove: ws.removeEnvironment,
    setActive: ws.setActiveEnvironment,
    variables: ws.variables,
    createEnvironment: ws.createEnvironment,
    updateEnvironment: ws.updateEnvironment,
  };
}

export const useEnvironmentStore: {
  (): EnvironmentState;
  <U>(selector: (s: EnvironmentState) => U, equalityFn?: (a: U, b: U) => boolean): U;
  getState(): EnvironmentState;
  setState: (partial: Partial<EnvironmentState> | ((s: EnvironmentState) => Partial<EnvironmentState>)) => void;
  subscribe: (listener: (s: EnvironmentState, prev: EnvironmentState) => void) => () => void;
  getInitialState(): EnvironmentState;
  destroy(): void;
} = Object.assign(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <U>(selector?: (s: EnvironmentState) => U, equalityFn?: (a: U, b: U) => boolean): U | EnvironmentState => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return useWorkspaceStore(
      (ws) => {
        const es = toEnvState(ws as unknown as ReturnType<typeof useWorkspaceStore.getState>);
        return selector ? selector(es) : (es as unknown as U);
      },
      equalityFn as unknown as (a: unknown, b: unknown) => boolean
    ) as unknown as U | EnvironmentState;
  },
  {
    getState: () => toEnvState(useWorkspaceStore.getState()),
    setState: useWorkspaceStore.setState as unknown as (partial: Partial<EnvironmentState> | ((s: EnvironmentState) => Partial<EnvironmentState>)) => void,
    subscribe: (listener: (s: EnvironmentState, prev: EnvironmentState) => void) =>
      useWorkspaceStore.subscribe((ws, prevWs) => listener(toEnvState(ws as unknown as ReturnType<typeof useWorkspaceStore.getState>), toEnvState(prevWs as unknown as ReturnType<typeof useWorkspaceStore.getState>))),
    getInitialState: () => toEnvState(useWorkspaceStore.getState()),
    destroy: () => {},
  }
) as unknown as typeof useEnvironmentStore;
