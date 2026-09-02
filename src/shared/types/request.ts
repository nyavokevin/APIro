export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'TRACE';

export type RequestBodyType =
  | 'none'
  | 'json'
  | 'xml'
  | 'text'
  | 'form-data'
  | 'urlencoded'
  | 'binary'
  | 'graphql';

export type AuthType =
  | 'none'
  | 'api-key'
  | 'bearer'
  | 'basic'
  | 'digest'
  | 'oauth2'
  | 'oauth1'
  | 'hawk'
  | 'aws-sigv4'
  | 'ntlm'
  | 'kerberos';

export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export interface AuthConfig {
  type: AuthType;
  apiKey?: { key: string; value: string; in: 'header' | 'query' };
  bearer?: { token: string };
  basic?: { username: string; password: string };
  digest?: { username: string; password: string; realm?: string; nonce?: string };
  oauth2?: {
    tokenUrl?: string;
    clientId?: string;
    clientSecret?: string;
    scope?: string;
    grantType?: string;
    accessToken?: string;
    [key: string]: unknown;
  };
  oauth1?: {
    consumerKey?: string;
    consumerSecret?: string;
    token?: string;
    tokenSecret?: string;
    signatureMethod?: string;
    realm?: string;
    [key: string]: unknown;
  };
  hawk?: {
    id?: string;
    key?: string;
    algorithm?: string;
    user?: string;
    nonce?: string;
    timestamp?: string;
    [key: string]: unknown;
  };
  awsSigV4?: {
    accessKey?: string;
    secretKey?: string;
    region?: string;
    service?: string;
    sessionToken?: string;
    [key: string]: unknown;
  };
  ntlm?: { username?: string; password?: string; domain?: string; workstation?: string };
  kerberos?: { principal?: string; service?: string; realm?: string; keytab?: string };
}

export interface RequestData {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: KeyValuePair[];
  params: KeyValuePair[];
  bodyType: RequestBodyType;
  body: string;
  auth: AuthConfig;
  preRequestScript?: string;
  testScript?: string;
  collectionId?: string;
  parentId?: string;
}

export interface ResponseData {
  id: string;
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  responseTime: number;
  size: number;
  timeline: ResponseTimeline;
  cookies: CookieData[];
  error?: string;
  testResults?: TestResult[];
}

export interface ResponseTimeline {
  dns: number;
  tcp: number;
  tls: number;
  ttfb: number;
  download: number;
  total: number;
}

export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  type: 'folder' | 'request';
  data?: RequestData;
  children?: Collection[];
  variables?: EnvironmentVariable[];
  auth?: AuthConfig;
  headers?: KeyValuePair[];
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export type VariableType = 'string' | 'number' | 'secret' | 'dynamic' | 'boolean';

export interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
  type: VariableType;
  enabled?: boolean;
  description?: string;
}

export interface EnvironmentMeta {
  id: string;
  created: string;
  modified: string;
  source: 'native' | 'imported' | 'migrated';
  imported_from?: 'postman' | 'insomnia' | 'dotenv' | 'openapi' | 'json' | 'csv' | 'manual';
  exported_at?: string;
  exported_by?: string;
}

export interface Environment {
  id: string;
  name: string;
  description?: string;
  color?: string;
  schema_version?: string;
  meta?: EnvironmentMeta;
  variables: EnvironmentVariable[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ImportedFormat = 'postman' | 'insomnia' | 'dotenv' | 'openapi' | 'json' | 'csv' | 'native';
export type ExportFormat = 'yaml' | 'postman' | 'dotenv' | 'json' | 'csv';
export type SecretExportMode = 'encrypted' | 'plaintext' | 'omit';

export interface ScannedEndpoint {
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: KeyValuePair[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
  auth?: AuthConfig;
}

export interface ScanResult {
  url: string;
  detectedSpec: 'openapi' | 'swagger' | 'graphql' | 'trpc' | 'inferred' | 'none';
  endpoints: ScannedEndpoint[];
  raw?: unknown;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs?: number;
}

export type PdfExportFormat = 'pdf' | 'markdown' | 'html' | 'openapi-yaml';

export interface PdfExportOptions {
  title?: string;
  version?: string;
  format: PdfExportFormat;
  primaryColor?: string;
  logoPath?: string;
}

export type MockMode = 'mock' | 'proxy' | 'record';

export interface MockVariant {
  name: string;
  status: number;
  body: string;
  headers?: Record<string, string>;
  trigger?: string | null;
}

export interface MockStateConfig {
  scope: string;
  operation: 'create' | 'read' | 'list' | 'update' | 'delete' | 'none';
  keyFrom: string;
}

export interface MockRoute {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'TRACE' | 'GRAPHQL';
  path: string;
  status: number;
  body: string;
  delay: number;
  delayMs?: number;
  headers?: Record<string, string>;
  variants?: MockVariant[];
  state?: MockStateConfig | null;
}

export interface MockHit {
  id: string;
  method: string;
  path: string;
  status: number;
  timestamp: number;
  latencyMs?: number;
  matchedRoute?: string | null;
  mode?: string;
}

export interface MockServer {
  id: string;
  name: string;
  port: number;
  running: boolean;
  routes: MockRoute[];
  history: MockHit[];
  mode?: MockMode;
  targetUrl?: string | null;
  stateEnabled?: boolean;
  mocksDir?: string | null;
  latencyMs?: number;
  graphqlEnabled?: boolean;
}

export interface MockGenerationResult {
  routes: MockRoute[];
  warnings: string[];
  specTitle?: string | null;
  specVersion?: string | null;
  writtenFiles?: string[];
}

export interface MockDiffResult {
  added: string[];
  removed: string[];
  changed: string[];
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface McpResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

export type AIChannel = 'error' | 'tests' | 'explain';

export interface AIAnalyzePayload {
  channel: AIChannel;
  data: unknown;
}

export interface AIAnalyzeResult {
  suggestion: string;
  raw?: string;
}
