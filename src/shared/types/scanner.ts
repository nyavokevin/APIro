// no cross import to avoid circular


export type BackendFramework =
  | 'Express' | 'Fastify' | 'NestJS' | 'Hapi' | 'Koa'
  | 'Flask' | 'FastAPI' | 'Django' | 'Tornado'
  | 'Laravel' | 'Symfony' | 'Slim' | 'CodeIgniter'
  | 'SpringBoot' | 'JAXRS' | 'SparkJava'
  | 'AspNetCore'
  | 'Gin' | 'Echo' | 'Fiber' | 'GorillaMux'
  | 'Rails' | 'Sinatra'
  | 'Actix' | 'Axum' | 'Rocket'
  | 'Unknown';

export type ScannerLanguage = 'javascript' | 'python' | 'php' | 'java' | 'csharp' | 'go' | 'ruby' | 'rust' | 'unknown';

export interface FrameworkDetection {
  framework: BackendFramework;
  language: ScannerLanguage;
  confidence: number;
  rootFiles: string[];
  routeFiles: string[];
}

export type ParamLocation = 'path' | 'query' | 'body' | 'header' | 'cookie';

export interface RouteParam {
  name: string;
  paramType: string;
  required: boolean;
  description?: string | null;
  location?: ParamLocation | null;
}

export interface ScannedRoute {
  method: string; // HttpMethod as string, allows "*"
  path: string;
  handler: string;
  middlewares: string[];
  file: string;
  line: number;
  params: RouteParam[];
  description?: string | null;
  authRequired: boolean;
  bodySchema?: string | null;
  responseSchemas: string[];
}

export interface ScanWarning {
  severity: 'info' | 'warn' | 'error';
  file?: string | null;
  message: string;
}

export interface SourceScanResult {
  framework: BackendFramework;
  language: ScannerLanguage;
  confidence: number;
  totalFiles: number;
  totalRoutes: number;
  routes: ScannedRoute[];
  warnings: (string | ScanWarning)[];
}

export interface SourceScanOptions {
  includeComments?: boolean;
  includeTests?: boolean;
  maxFiles?: number;
  forcedFramework?: BackendFramework;
}
