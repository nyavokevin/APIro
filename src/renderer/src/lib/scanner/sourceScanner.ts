// TS fallback for source scanner (browser mode without Tauri)
// Mirrors Rust detector + parsers with regex only. Used via webBridge / tauri fallback.

import type { BackendFramework, RouteParam, ScannedRoute, SourceScanOptions, SourceScanResult, ScannerLanguage } from '@shared/types/scanner';

function frameworkLanguage(fw: BackendFramework): ScannerLanguage {
  switch (fw) {
    case 'Express': case 'Fastify': case 'NestJS': case 'Hapi': case 'Koa': return 'javascript';
    case 'Flask': case 'FastAPI': case 'Django': case 'Tornado': return 'python';
    case 'Laravel': case 'Symfony': case 'Slim': case 'CodeIgniter': return 'php';
    case 'SpringBoot': case 'JAXRS': case 'SparkJava': return 'java';
    case 'AspNetCore': return 'csharp';
    case 'Gin': case 'Echo': case 'Fiber': case 'GorillaMux': return 'go';
    case 'Rails': case 'Sinatra': return 'ruby';
    case 'Actix': case 'Axum': case 'Rocket': return 'rust';
    default: return 'unknown';
  }
}

function detectFromFiles(files: Map<string,string>): { framework: BackendFramework; confidence: number; rootFiles: string[] } {
  const has = (name: string) => [...files.keys()].some(p => p.endsWith('/'+name) || p.endsWith('\\'+name) || p === name);
  const get = (name: string) => {
    const k = [...files.keys()].find(p => p.endsWith('/'+name) || p === name);
    return k ? files.get(k) ?? '' : '';
  };

  if (has('package.json')) {
    const content = get('package.json');
    try {
      const j = JSON.parse(content);
      const deps = { ...(j.dependencies||{}), ...(j.devDependencies||{}) };
      if (deps['express']) return { framework: 'Express', confidence: 0.85, rootFiles: ['package.json'] };
      if (deps['fastify']) return { framework: 'Fastify', confidence: 0.85, rootFiles: ['package.json'] };
      if (deps['@nestjs/core']) return { framework: 'NestJS', confidence: 0.85, rootFiles: ['package.json'] };
      if (deps['@hapi/hapi'] || deps['hapi']) return { framework: 'Hapi', confidence: 0.85, rootFiles: ['package.json'] };
      if (deps['koa']) return { framework: 'Koa', confidence: 0.85, rootFiles: ['package.json'] };
    } catch {}
  }
  if (has('requirements.txt') || has('pyproject.toml') || has('setup.py') || has('Pipfile')) {
    const content = (get('requirements.txt') + get('pyproject.toml') + get('setup.py') + get('Pipfile')).toLowerCase();
    if (content.includes('fastapi')) return { framework: 'FastAPI', confidence: 0.8, rootFiles: ['requirements.txt'] };
    if (content.includes('flask')) return { framework: 'Flask', confidence: 0.8, rootFiles: ['requirements.txt'] };
    if (content.includes('django')) return { framework: 'Django', confidence: 0.8, rootFiles: ['requirements.txt'] };
    // check python file imports fallback
    for (const [p,c] of files) if (p.endsWith('.py') && c.includes('from fastapi')) return { framework: 'FastAPI', confidence: 0.6, rootFiles: [p] };
  }
  if (has('composer.json')) {
    const c = get('composer.json');
    if (c.includes('laravel/framework')) return { framework: 'Laravel', confidence: 0.85, rootFiles: ['composer.json'] };
    if (c.includes('symfony')) return { framework: 'Symfony', confidence: 0.8, rootFiles: ['composer.json'] };
    if (c.includes('slim/slim')) return { framework: 'Slim', confidence: 0.8, rootFiles: ['composer.json'] };
  }
  if (has('pom.xml')) {
    const c = get('pom.xml');
    if (c.includes('spring-boot')) return { framework: 'SpringBoot', confidence: 0.85, rootFiles: ['pom.xml'] };
    if (c.includes('jax-rs') || c.includes('javax.ws.rs')) return { framework: 'JAXRS', confidence: 0.8, rootFiles: ['pom.xml'] };
  }
  if (has('build.gradle')) {
    const c = get('build.gradle');
    if (c.includes('spring-boot')) return { framework: 'SpringBoot', confidence: 0.8, rootFiles: ['build.gradle'] };
  }
  // csproj
  const csproj = [...files.keys()].find(p => p.endsWith('.csproj'));
  if (csproj) {
    const c = files.get(csproj) ?? '';
    if (c.includes('Microsoft.AspNetCore')) return { framework: 'AspNetCore', confidence: 0.85, rootFiles: [csproj] };
    return { framework: 'AspNetCore', confidence: 0.6, rootFiles: [csproj] };
  }
  if (has('go.mod')) {
    const c = get('go.mod');
    if (c.includes('gin-gonic/gin')) return { framework: 'Gin', confidence: 0.85, rootFiles: ['go.mod'] };
    if (c.includes('labstack/echo')) return { framework: 'Echo', confidence: 0.85, rootFiles: ['go.mod'] };
    if (c.includes('gofiber/fiber')) return { framework: 'Fiber', confidence: 0.85, rootFiles: ['go.mod'] };
    if (c.includes('gorilla/mux')) return { framework: 'GorillaMux', confidence: 0.85, rootFiles: ['go.mod'] };
  }
  const gem = has('Gemfile') ? get('Gemfile') : '';
  if (gem) {
    if (gem.includes('rails')) return { framework: 'Rails', confidence: 0.8, rootFiles: ['Gemfile'] };
    if (gem.includes('sinatra')) return { framework: 'Sinatra', confidence: 0.8, rootFiles: ['Gemfile'] };
  } else if ([...files.keys()].some(p => p.endsWith('config/routes.rb'))) {
    return { framework: 'Rails', confidence: 0.9, rootFiles: ['config/routes.rb'] };
  }
  if (has('Cargo.toml')) {
    const c = get('Cargo.toml');
    if (c.includes('actix-web')) return { framework: 'Actix', confidence: 0.85, rootFiles: ['Cargo.toml'] };
    if (c.includes('axum')) return { framework: 'Axum', confidence: 0.85, rootFiles: ['Cargo.toml'] };
    if (c.includes('rocket')) return { framework: 'Rocket', confidence: 0.85, rootFiles: ['Cargo.toml'] };
  }
  return { framework: 'Unknown', confidence: 0, rootFiles: [] };
}

function routeFilesForFramework(framework: BackendFramework, language: ScannerLanguage, allPaths: string[]): string[] {
  const matchExt = (exts: string[]) => allPaths.filter(p => exts.some(e => p.endsWith(e)))
    .filter(p => !p.includes('node_modules/') && !p.includes('vendor/') && !p.includes('.git/') && !p.includes('dist/') && !p.includes('build/') && !p.includes('target/'))
  switch (framework) {
    case 'Express': case 'Fastify': case 'NestJS': case 'Hapi': case 'Koa':
      return matchExt(['.js','.ts','.mjs']);
    case 'Flask': case 'FastAPI': case 'Django': case 'Tornado':
      return matchExt(['.py']);
    case 'Laravel': case 'Symfony': case 'Slim': case 'CodeIgniter':
      return matchExt(['.php']);
    case 'SpringBoot': case 'JAXRS': case 'SparkJava':
      return matchExt(['.java']);
    case 'AspNetCore':
      return matchExt(['.cs']);
    case 'Gin': case 'Echo': case 'Fiber': case 'GorillaMux':
      return matchExt(['.go']);
    case 'Rails': case 'Sinatra':
      return matchExt(['.rb']);
    case 'Actix': case 'Axum': case 'Rocket':
      return matchExt(['.rs']);
    default:
      if (language === 'javascript') return matchExt(['.js','.ts']);
      if (language === 'python') return matchExt(['.py']);
      if (language === 'php') return matchExt(['.php']);
      if (language === 'java') return matchExt(['.java']);
      if (language === 'csharp') return matchExt(['.cs']);
      if (language === 'go') return matchExt(['.go']);
      if (language === 'ruby') return matchExt(['.rb']);
      if (language === 'rust') return matchExt(['.rs']);
      return allPaths.filter(p => p.includes('route') || p.includes('controller') || p.includes('handler')).slice(0, 200);
  }
}

// ── Parsers (mirroring Rust logic) ──────────────────────────────────────────

function extractParamsFromPath(path: string, location: 'path'='path'): RouteParam[] {
  const params: RouteParam[] = [];
  // :param  and {param} and {param?}
  const re = /[:{]([a-zA-Z_][a-zA-Z0-9_]*)\}?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path))) params.push({ name: m[1], paramType: 'string', required: !path.includes(`${m[1]}?`), description: null, location });
  // dedup
  const seen = new Set<string>();
  return params.filter(p => !seen.has(p.name) && seen.add(p.name));
}



function parseExpress(file: string, content: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  const re = /(?:(?:app|router)\.(get|post|put|delete|patch|head|options|all))\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const method = m[1].toUpperCase() === 'ALL' ? 'GET' : m[1].toUpperCase();
    const path = m[2];
    const start = m.index;
    const line = content.slice(0, start).split('\n').length;
    // handler after
    const tail = content.slice(m.index + m[0].length, m.index + m[0].length + 800);
    const hm = /\s*,\s*(?:async\s+)?(?:function\s+)?([a-zA-Z_$][a-zA-Z0-9_$\.]*)?/.exec(tail);
    const handler = hm && hm[1] && !['req','res','next'].includes(hm[1]) ? hm[1] : 'anonymous';
    const auth = content.slice(Math.max(0,start-600), start).toLowerCase().includes('auth');
    routes.push({
      method, path, handler, middlewares: auth?['auth']:[],
      file, line, params: extractParamsFromPath(path), description: null, authRequired: auth, bodySchema: null, responseSchemas: []
    });
  }
  // .route('/path') chain
  const routeRe = /\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((m = routeRe.exec(content))) {
    const base = m[1];
    const after = content.slice(m.index + m[0].length, m.index + m[0].length + 600);
    const chainRe = /\.(get|post|put|delete|patch|head|options)\s*\(/gi;
    let c2: RegExpExecArray | null;
    while ((c2 = chainRe.exec(after))) {
      routes.push({
        method: c2[1].toUpperCase(), path: base, handler: 'chained', middlewares: [],
        file, line: content.slice(0,m.index).split('\n').length, params: extractParamsFromPath(base), description: null, authRequired: false, bodySchema: null, responseSchemas: []
      });
    }
  }
  return routes;
}

function parseFastAPI(file: string, content: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  const re = /@(?:app|router)\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const method = m[1].toUpperCase();
    const path = m[2];
    const start = m.index;
    const end = m.index + m[0].length;
    const tail = content.slice(end, end+2500);
    const funcRe = /\n(?:\s*@.*\n)*\s*(?:async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)/;
    const fm = funcRe.exec(tail);
    const handler = fm ? (fm[1]) : 'anonymous';
    const deco = content.slice(start, end);
    const auth = deco.includes('Depends') || deco.includes('Security');
    // docstring
    const docRe = /(?:async\s+)?def\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)\s*(?:->[^:]+)?\s*:\s*\n\s*['"]{3}([^'"]{3,}?)['"]{3}/;
    const docM = docRe.exec(tail);
    const description = docM ? docM[1].trim().split('\n')[0] : null;
    // params: path {param} + Query (search directly in tail to handle nested Query(...))
    const params: RouteParam[] = [];
    for (const pm of path.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)) params.push({ name: pm[1], paramType: 'string', required: true, description: null, location: 'path' });
    // Directly find all  `name: type = Query(...)` occurrences in the function tail (handles nested parens)
    const qre = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([^=\n,()]+?)\s*=\s*Query\s*\(([^)]*)\)/g;
    let qm: RegExpExecArray | null;
    while ((qm = qre.exec(tail))) {
      params.push({ name: qm[1], paramType: qm[2].trim(), required: !qm[3].includes('None'), description: null, location: 'query' });
    }
    const body = /([A-Z][a-zA-Z0-9_]*)\s*=\s*Body/.exec(tail)?.[2] ?? null;
    routes.push({ method, path, handler, middlewares: [], file, line: content.slice(0,start).split('\n').length, params, description, authRequired: auth, bodySchema: body, responseSchemas: (deco.match(/response_model\s*=\s*([A-Z][a-zA-Z0-9_]*)/)?.[1] ? [RegExp.$1] : []) });
  }
  const re2 = /@(?:app|router)\.api_route\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*methods\s*=\s*\[([^\]]+)\]/g;
  while ((m = re2.exec(content))) {
    const path = m[1];
    const methodsRaw = m[2];
    const start = m.index;
    const end = m.index + m[0].length;
    const tail = content.slice(end, end+2000);
    const fm = /(?:async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)/.exec(tail);
    const handler = fm ? fm[1] : 'anonymous';
    for (const raw of methodsRaw.split(',')) {
      const method = raw.trim().replace(/['"]/g,'').toUpperCase();
      if (!method) continue;
      routes.push({ method, path, handler, middlewares: [], file, line: content.slice(0,start).split('\n').length, params: extractParamsFromPath(path), description: null, authRequired: false, bodySchema: null, responseSchemas: [] });
    }
  }
  return routes;
}

function parseLaravel(file: string, content: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  const prefixMatch = /Route::group\s*\(\s*\[\s*['"]prefix['"]\s*=>\s*['"`]([^'"`]+)['"`]/.exec(content);
  const prefix = prefixMatch ? prefixMatch[1] : '';
  const re = /Route::(get|post|put|patch|delete|options|head|any|match)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const method = m[1].toUpperCase()==='ANY'?'GET':m[1].toUpperCase();
    const p = m[2];
    const full = prefix ? `${prefix.replace(/\/$/, '')}/${p.replace(/^\//,'')}` : p;
    const start = m.index;
    const tail = content.slice(m.index + m[0].length, m.index + m[0].length + 600);
    let handler = 'closure';
    const hm1 = /\[\s*[A-Za-z0-9_\\]+::class\s*,\s*['"`]([^'"`]+)['"`]\s*\]/.exec(tail);
    if (hm1) handler = hm1[1];
    else {
      const hm2 = /['"`]([A-Za-z0-9_@\\]+)['"`]/.exec(tail);
      if (hm2) handler = hm2[1];
    }
    const auth = content.slice(Math.max(0,start-800), start).toLowerCase().includes('auth');
    routes.push({ method, path: full, handler, middlewares: [], file, line: content.slice(0,start).split('\n').length, params: extractParamsFromPath(full), description: null, authRequired: auth, bodySchema: null, responseSchemas: [] });
  }
  const resRe = /Route::(?:resource|apiResource)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z0-9_\\:]+)/g;
  while ((m = resRe.exec(content))) {
    const resource = m[1];
    const ctrl = m[2];
    const base = prefix ? `${prefix.replace(/\/$/,'')}/${resource}` : `/${resource}`;
    const items: [string,string,string][] = [
      ['GET', base, 'index'],
      ['GET', `${base}/create`, 'create'],
      ['POST', base, 'store'],
      ['GET', `${base}/{id}`, 'show'],
      ['GET', `${base}/{id}/edit`, 'edit'],
      ['PUT', `${base}/{id}`, 'update'],
      ['PATCH', `${base}/{id}`, 'update'],
      ['DELETE', `${base}/{id}`, 'destroy'],
    ];
    for (const [method, path, act] of items) routes.push({ method, path, handler: `${ctrl}@${act}`, middlewares: [], file, line: content.slice(0,m.index).split('\n').length, params: path.includes('{id}')?[{ name:'id', paramType:'int', required:true, description:null, location:'path'}]:[], description: null, authRequired: false, bodySchema: null, responseSchemas: [] });
  }
  return routes;
}

function parseSpring(file: string, content: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  const classMap = /@RequestMapping\s*\(\s*(?:value\s*=\s*)?['"`]([^'"`]+)['"`]\s*\)/.exec(content)?.[1] ?? '';
  // Support both @GetMapping("/path") and @GetMapping without args (maps to class path)
  const re = /@(?:Get|Post|Put|Delete|Patch|Request)Mapping(?:\s*\(\s*(?:value\s*=\s*)?['"`]([^'"`]+)['"`][^)]*\))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const ann = m[0];
    const path = m[1] ?? '';
    const method = ann.includes('GetMapping')?'GET':ann.includes('PostMapping')?'POST':ann.includes('PutMapping')?'PUT':ann.includes('DeleteMapping')?'DELETE':ann.includes('PatchMapping')?'PATCH':'GET';
    const normPath = path || '';
    const full = classMap ? `${classMap.replace(/\/$/,'')}${normPath ? (normPath.startsWith('/')? normPath : '/' + normPath) : ''}` : (normPath || classMap || '/');
    const start = m.index;
    const end = m.index + m[0].length;
    const tail = content.slice(end, end+2500);
    const hm = /\s*(?:public|private|protected)?\s*(?:[A-Z][a-zA-Z0-9_<>\[\]]*\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(tail);
    const handler = hm ? hm[1] : 'unknown';
    const auth = ann.includes('Secured') || content.includes('@PreAuthorize');
    const params: RouteParam[] = [];
    for (const pm of full.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)) params.push({ name: pm[1], paramType:'string', required:true, description:null, location:'path' });
    routes.push({ method, path: full, handler, middlewares: [], file, line: content.slice(0,start).split('\n').length, params, description: null, authRequired: auth, bodySchema: null, responseSchemas: [] });
  }
  return routes;
}

function parseAspNet(file: string, content: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  const ctrlRoute = /\[Route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\]/.exec(content)?.[1] ?? '';
  const ctrlName = /class\s+([A-Za-z0-9_]+)Controller/.exec(content)?.[1] ?? '';
  const re = /\[(?:Http)?(Get|Post|Put|Delete|Patch|Head|Options)(?:\s*\(\s*['"`]([^'"`]*)['"`]\s*\))?\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const method = m[1].toUpperCase();
    const p = m[2] ?? '';
    let full = ctrlRoute.replace('[controller]', ctrlName.toLowerCase());
    if (!full) full = `api/${ctrlName.toLowerCase()}`;
    if (p) full = `${full.replace(/\/$/,'')}/${p.replace(/^\//,'')}`;
    if (!full.startsWith('/')) full = '/' + full;
    const start = m.index;
    const tail = content.slice(m.index + m[0].length, m.index + m[0].length + 2500);
    const hm = /\b(?:public|private|protected)?\s*(?:async\s+)?(?:[A-Za-z0-9_<>\[\]]+\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(tail);
    const handler = hm ? hm[1] : 'unknown';
    const auth = content.slice(Math.max(0,start-1500), start).includes('[Authorize]');
    routes.push({ method, path: full, handler, middlewares: [], file, line: content.slice(0,start).split('\n').length, params: extractParamsFromPath(full), description: null, authRequired: auth, bodySchema: null, responseSchemas: [] });
  }
  return routes;
}

function parseGin(file: string, content: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  const groups: { pos:number; prefix:string }[] = [];
  for (const m of content.matchAll(/(?:r|router|api)\s*:=\s*(?:r|router|api)\.Group\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) groups.push({ pos: m.index!, prefix: m[1] });
  const re = /(?:r|router|api|v\d+|group)\.(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|Any)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const method = m[1].toUpperCase()==='ANY'?'GET':m[1].toUpperCase();
    const path = m[2];
    const handler = m[3];
    const start = m.index;
    // closest prefix
    let prefix = '';
    let bestDist = Infinity;
    for (const g of groups) if (g.pos < start && start - g.pos < bestDist) { bestDist = start - g.pos; prefix = g.prefix; }
    if (!prefix) {
      const head = content.slice(Math.max(0,start-1200), start);
      const lm = [...head.matchAll(/Group\s*\(\s*['"`]([^'"`]+)['"`]/g)].pop();
      if (lm) prefix = lm[1];
    }
    const full = prefix ? `${prefix.replace(/\/$/,'')}${path}` : path;
    const auth = content.slice(Math.max(0,start-800), start).toLowerCase().includes('auth');
    routes.push({ method, path: full, handler, middlewares: [], file, line: content.slice(0,start).split('\n').length, params: extractParamsFromPath(full), description: null, authRequired: auth, bodySchema: null, responseSchemas: [] });
  }
  return routes;
}

function parseGeneric(file: string, content: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  const re = /\b(get|post|put|delete|patch|head|options)\b[^'"`]*['"`](\/[^'"`]*?)['"`]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const method = m[1].toUpperCase();
    const path = m[2];
    if (path.startsWith('.') || path.length>120 || !path.startsWith('/')) continue;
    routes.push({ method, path, handler:'handler', middlewares:[], file, line: content.slice(0,m.index).split('\n').length, params: extractParamsFromPath(path), description: null, authRequired: content.slice(Math.max(0,m.index-500), m.index).toLowerCase().includes('auth'), bodySchema:null, responseSchemas:[] });
    if (routes.length > 500) break;
  }
  return routes;
}

const parsers: Record<string, (f:string,c:string)=>ScannedRoute[]> = {
  Express: parseExpress, Fastify: parseExpress, NestJS: parseExpress, Hapi: parseExpress, Koa: parseExpress,
  FastAPI: parseFastAPI, Flask: parseFastAPI, Django: parseFastAPI, Tornado: parseFastAPI,
  Laravel: parseLaravel, Symfony: parseLaravel, Slim: parseLaravel, CodeIgniter: parseLaravel,
  SpringBoot: parseSpring, JAXRS: parseSpring, SparkJava: parseSpring,
  AspNetCore: parseAspNet,
  Gin: parseGin, Echo: parseGin, Fiber: parseGin, GorillaMux: parseGin,
  Generic: parseGeneric,
};

export function parseFile(framework: string, file: string, content: string): ScannedRoute[] {
  const fn = parsers[framework] ?? parsers['Generic'];
  try { return fn(file, content); } catch { return []; }
}

export function detectFrameworkFromFiles(files: Map<string,string>): { framework: BackendFramework; language: ScannerLanguage; confidence: number; rootFiles: string[] } {
  const { framework, confidence, rootFiles } = detectFromFiles(files);
  return { framework: framework as BackendFramework, language: frameworkLanguage(framework as BackendFramework), confidence, rootFiles };
}

export function scanFiles(
  files: Map<string,string>,
  framework: BackendFramework,
  options?: SourceScanOptions
): SourceScanResult {
  const language = frameworkLanguage(framework);
  const allPaths = [...files.keys()];
  const routeFiles = routeFilesForFramework(framework, language, allPaths);
  const includeTests = options?.includeTests ?? false;
  const maxFiles = options?.maxFiles ?? 2000;
  const filtered = routeFiles.filter(p => includeTests || !/(?:__tests__|\/test\/|\.test\.|\.spec\.|\/tests\/)/i.test(p)).slice(0, maxFiles);
  const routes: ScannedRoute[] = [];
  const warnings: string[] = [];
  for (const fp of filtered) {
    const content = files.get(fp) ?? '';
    if (!content) { warnings.push(`Could not read ${fp}`); continue; }
    routes.push(...parseFile(framework, fp, content));
  }
  // dedup
  const seen = new Set<string>();
  const uniq: ScannedRoute[] = [];
  for (const r of routes) {
    const key = `${r.method}:${r.path}`;
    if (!seen.has(key)) { seen.add(key); uniq.push(r); }
  }
  uniq.sort((a,b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return { framework, language, confidence: 0.8, totalFiles: filtered.length, totalRoutes: uniq.length, routes: uniq, warnings };
}

export function generateCollectionNode(scan: SourceScanResult, baseUrl: string, apiVersion?: string) {
  // Returns Collection tree (compatible with APIForge Collection) — used to create YAML via generator helper
  // Simplified: group by folder
  const map = new Map<string, ScannedRoute[]>();
  for (const r of scan.routes) {
    const folder = extractFolderName(r.path);
    const arr = map.get(folder) ?? [];
    arr.push(r);
    map.set(folder, arr);
  }
  const folders = [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([name, routes]) => ({
    name, requests: routes.sort((a,b)=>a.path.localeCompare(b.path)).map(r => routeToRequest(r, baseUrl, apiVersion))
  }));
  return { name: `${scan.framework} API`, description: `Auto-generated from ${scan.language} ${scan.framework} codebase. ${scan.totalRoutes} routes in ${scan.totalFiles} files.`, folders };
}

function extractFolderName(path: string): string {
  const segs = path.split('/').filter(s => s && !s.startsWith('{') && !s.startsWith(':') && !s.startsWith('<'));
  if (!segs.length) return 'Root';
  const skip = segs.findIndex(s => !s.startsWith('v') && isNaN(Number(s)) && s !== 'api');
  const name = segs[skip >=0 ? skip : 0] ?? segs[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function routeToRequest(route: ScannedRoute, baseUrl: string, apiVersion?: string) {
  const url = apiVersion ? `${baseUrl.replace(/\/$/,'')}/${apiVersion.replace(/^\/|\/$/g,'')}${route.path}` : `${baseUrl.replace(/\/$/,'')}${route.path}`;
  const headers: { key:string; value:string }[] = [];
  if (route.authRequired) headers.push({ key:'Authorization', value:'Bearer {{authToken}}' });
  const params = route.params.filter(p => p.location !== 'path').map(p => ({ key: p.name, value: exampleForType(p.paramType), description: p.description ?? undefined }));
  let body = '';
  let bodyType: string = 'none';
  if (['POST','PUT','PATCH'].includes(route.method)) {
    bodyType = 'json';
    if (route.path.includes('login') || route.path.includes('auth')) body = JSON.stringify({ email:'user@example.com', password:'secret123' }, null, 2);
    else if (route.bodySchema) body = JSON.stringify({ [`${route.bodySchema.toLowerCase()}_field`]: 'value' }, null, 2);
    else body = '{}';
  }
  const name = route.handler && route.handler!=='anonymous' ? route.handler : `${route.method} ${route.path}`;
  return { name, method: route.method, url, headers, params, bodyType, body, description: route.description ?? undefined };
}

function exampleForType(t: string): string {
  switch (t.toLowerCase()) {
    case 'int': case 'integer': case 'number': case 'i32': case 'i64': return '42';
    case 'float': case 'double': case 'decimal': return '3.14';
    case 'bool': case 'boolean': return 'true';
    case 'uuid': case 'guid': return '{{$randomUUID}}';
    case 'email': return 'user@example.com';
    default: return 'example';
  }
}
