import type {
  Collection,
  Environment,
  EnvironmentVariable,
  RequestData,
  ResponseData,
  ScanResult,
  PdfExportOptions,
  MockServer,
  MockRoute,
  AIAnalyzePayload,
  AIAnalyzeResult,
} from '@shared/types/request';
import type {
  FrameworkDetection,
  SourceScanResult,
  SourceScanOptions,
} from '@shared/types/scanner';
import { createWebBridge } from './webBridge';
import { isTauri, tauriInvokeMapped } from './tauri';

let webBridge: ReturnType<typeof createWebBridge> | null = null;
function getWebBridge() {
  if (!webBridge) webBridge = createWebBridge();
  return webBridge;
}

export function isBridgeAvailable(): boolean {
  return isTauri() || (typeof window !== 'undefined' && !!window.api);
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (isTauri()) {
    try {
      const res = await tauriInvokeMapped<T>(channel, args);
      // If Tauri stub returns null/undefined for channels we handle in JS, fallback to webBridge
      if (res == null && ['environments:import','environments:export','collections:importRaw','collections:export'].includes(channel)) {
        return getWebBridge().invoke(channel, ...args) as Promise<T>;
      }
      return res;
    } catch {
      if (['environments:import','environments:export','collections:importRaw','collections:export'].includes(channel)) {
        return getWebBridge().invoke(channel, ...args) as Promise<T>;
      }
      throw new Error(`Unhandled Tauri channel ${channel}`);
    }
  }
  if (typeof window !== 'undefined' && window.api) {
    return window.api.invoke<T>(channel, ...args);
  }
  // Browser preview fallback (no Tauri, no Electron): use localStorage bridge
  // Collections in this mode are ephemeral (never persisted to YAML), but allows Vite preview.
  return getWebBridge().invoke(channel, ...args) as Promise<T>;
}

export interface HistoryItem {
  id: string;
  requestId: string | null;
  method: string;
  url: string;
  statusCode: number | null;
  responseTime: number | null;
  requestHeaders: string;
  responseHeaders: string;
  responseBody: string;
  error: string | null;
  timestamp: number;
  requestParams?: string;
  requestBody?: string;
  requestBodyType?: string;
}

export interface CreateCollectionPayload {
  name: string;
  type: 'folder' | 'request';
  description?: string;
  parentId?: string;
  data?: RequestData;
}

export const api = {
  collections: {
    create: (payload: CreateCollectionPayload) => invoke<Collection>('collections:create', payload),
    read: (id: string) => invoke<Collection | null>('collections:read', id),
    update: (id: string, patch: Partial<CreateCollectionPayload>) =>
      invoke<Collection | null>('collections:update', id, patch),
    delete: (id: string) => invoke<{ success: boolean }>('collections:delete', id),
    list: () => invoke<Collection[]>('collections:list'),
    import: (payload: { text: string; format?: string }) =>
      invoke<Collection>('collections:import', payload),
  },
  requests: {
    execute: (request: RequestData, variables: EnvironmentVariable[] = []) =>
      invoke<ResponseData>('requests:execute', request, variables),
    history: (limit = 100) => invoke<HistoryItem[]>('requests:history', limit),
  },
  environments: {
    list: () => invoke<Environment[]>('environments:list'),
    create: (payload: { name: string; variables?: EnvironmentVariable[]; color?: string; description?: string }) =>
      invoke<Environment>('environments:create', payload),
    update: (id: string, patch: { name?: string; variables?: EnvironmentVariable[]; color?: string; description?: string }) =>
      invoke<Environment | null>('environments:update', id, patch),
    delete: (id: string) => invoke<{ success: boolean }>('environments:delete', id),
    setActive: (id: string) => invoke<Environment[]>('environments:setActive', id),
  },
  scanner: {
    scan: (baseUrl: string) => invoke<ScanResult>('route-scanner:scan', baseUrl),
    generate: (input: ScanResult) => invoke<Collection>('route-scanner:generate', input),
    // Source scanner (multi-language)
    detectFramework: (projectPath: string) => invoke<FrameworkDetection>('scanner:detectFramework', projectPath),
    scanSource: (projectPath: string, options?: SourceScanOptions) =>
      invoke<SourceScanResult>('scanner:scanSource', projectPath, options),
    generateFromSource: (scanResult: SourceScanResult, baseUrl: string, apiVersion?: string, outputPath?: string, collectionName?: string) =>
      invoke<string>('scanner:generateCollection', scanResult, baseUrl, apiVersion, outputPath, collectionName),
    quickScan: (projectPath: string, baseUrl: string, collectionName?: string) =>
      invoke<string>('scanner:quickScan', projectPath, baseUrl, collectionName),
  },
  seed: {
    generate: (fieldName: string) => invoke<string>('seed-generator:generate', fieldName),
    bulk: (body: string) => invoke<string>('seed-generator:bulk', body),
  },
  auth: {
    decodeJWT: (token: string) => invoke<unknown>('auth:decodeJWT', token),
  },
  pdfExport: {
    generate: (collection: Collection, options: PdfExportOptions) =>
      invoke<{ format: string; content: string }>('pdf-export:generate', { collection, options }),
  },
  workspace: {
    info: () => invoke<{ path: string; isGitRepo: boolean; branch: string | null }>('workspace:info'),
  },
  git: {
    status: (dir: string) => invoke<string[]>('git:status', dir),
    diff: (dir: string, path?: string) => invoke<string>('git:diff', dir, path),
  },
  mockServer: {
    create: (payload: { name: string; port: number; routes?: MockRoute[]; mode?: string; targetUrl?: string | null; stateEnabled?: boolean; mocksDir?: string | null; graphqlEnabled?: boolean }) =>
      invoke<MockServer>('mock-server:create', payload),
    start: (id: string) => invoke<MockServer>('mock-server:start', id),
    stop: (id: string) => invoke<MockServer>('mock-server:stop', id),
    list: () => invoke<MockServer[]>('mock-server:list'),
    // v2
    listV2: () => invoke<MockServer[]>('mock:list', undefined as unknown as void),
    update: (server: MockServer) => invoke<MockServer>('mock:update', server),
    delete: (id: string) => invoke<{ success: boolean }>('mock:delete', id),
    clearHits: (id: string) => invoke<{ success: boolean }>('mock:clearHits', id),
    exportHits: (id: string) => invoke<string>('mock:exportHits', id),
    stateSnapshot: (id: string) => invoke<Record<string, unknown>>('mock:stateSnapshot', id),
    stateSet: (id: string, key: string, value: unknown) => invoke<{ success: boolean }>('mock:stateSet', id, key, value),
    stateClear: (id: string) => invoke<{ success: boolean }>('mock:stateClear', id),
    listRoutes: (id: string) => invoke<MockRoute[]>('mock:listRoutes', id),
    createRoute: (serverId: string, route: MockRoute) => invoke<MockRoute>('mock:createRoute', serverId, route),
    updateRoute: (serverId: string, route: MockRoute) => invoke<MockRoute>('mock:updateRoute', serverId, route),
    deleteRoute: (serverId: string, routeId: string) => invoke<{ success: boolean }>('mock:deleteRoute', serverId, routeId),
    generateFromOpenapi: (spec: string, baseUrl?: string, generateVariants?: boolean, outputDir?: string) =>
      invoke<import('@shared/types/request').MockGenerationResult>('mock:generateFromOpenapi', spec, baseUrl, generateVariants, outputDir),
    diffSpecs: (oldSpec: string, newSpec: string) => invoke<import('@shared/types/request').MockDiffResult>('mock:diffSpecs', oldSpec, newSpec),
    mcpListTools: () => invoke<import('@shared/types/request').McpTool[]>('mock:mcpListTools'),
    mcpCall: (tool: string, args: unknown) => invoke<import('@shared/types/request').McpResult>('mock:mcpCall', tool, args),
  },
  environmentsImport: {
    importRaw: (payload: { content: string; filename?: string; format?: string; encryptSecrets?: boolean }) =>
      invoke<Environment>('environments:import', payload),
    importPostman: (content: string) => invoke<Environment>('environments:import', { content, format: 'postman' }),
  },
  environmentsExport: {
    export: (payload: { envId: string; format: string; secretMode?: string }) =>
      invoke<{ content: string; filename: string }>('environments:export', payload),
  },
  collectionsImport: {
    importRaw: (payload: { content: string; filename?: string; format?: string }) =>
      invoke<Collection>('collections:importRaw', payload),
  },
  collectionsExport: {
    export: (payload: { collectionId: string; format: string }) =>
      invoke<{ content: string; filename: string }>('collections:export', payload),
  },
  ai: {
    analyze: (payload: AIAnalyzePayload) =>
      invoke<AIAnalyzeResult>('ai-assistant:analyze', payload),
  },
};
