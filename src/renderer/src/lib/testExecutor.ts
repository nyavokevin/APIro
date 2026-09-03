import type { RequestData, ResponseData, EnvironmentVariable, TestResult } from '@shared/types/request';

function getByPath(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[p];
    else return undefined;
  }
  return cur;
}

class AssertionError extends Error {}

function buildExpect(actual: unknown) {
  const ok = (cond: boolean, msg: string) => { if (!cond) throw new AssertionError(msg); };
  return {
    to: {
      equal(expected: unknown) { ok(actual === expected, `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`); },
      eql(expected: unknown) { ok(JSON.stringify(actual) === JSON.stringify(expected), `Expected ${JSON.stringify(actual)} to deep-equal ${JSON.stringify(expected)}`); },
      be: {
        a(type: string) { ok(typeof actual === type, `Expected ${JSON.stringify(actual)} to be a ${type}`); },
        true() { ok(actual === true, `Expected ${JSON.stringify(actual)} to be true`); },
        false() { ok(actual === false, `Expected ${JSON.stringify(actual)} to be false`); },
        null() { ok(actual === null, `Expected ${JSON.stringify(actual)} to be null`); },
        undefined() { ok(actual === undefined, `Expected ${JSON.stringify(actual)} to be undefined`); },
        below(n: number) { ok(typeof actual === 'number' && actual < n, `Expected ${JSON.stringify(actual)} to be below ${n}`); },
        above(n: number) { ok(typeof actual === 'number' && actual > n, `Expected ${JSON.stringify(actual)} to be above ${n}`); },
        lessThan(n: number) { (this as unknown as { below: (n:number)=>void }).below(n); },
        greaterThan(n: number) { (this as unknown as { above: (n:number)=>void }).above(n); },
      },
      match(regex: RegExp | string) {
        const re = regex instanceof RegExp ? regex : new RegExp(regex);
        ok(typeof actual === 'string' && re.test(actual), `Expected ${JSON.stringify(actual)} to match ${re}`);
      },
      include(sub: unknown) {
        if (typeof actual === 'string' && typeof sub === 'string') ok(actual.includes(sub), `Expected "${actual}" to include "${sub}"`);
        else if (Array.isArray(actual)) ok((actual as unknown[]).includes(sub as never), `Expected array to include ${JSON.stringify(sub)}`);
        else throw new AssertionError('include() used on unsupported type');
      },
      have: {
        property(name: string) { ok(actual != null && typeof actual === 'object' && name in (actual as Record<string,unknown>), `Expected object to have property "${name}"`); },
        length(n: number) {
          const len = typeof actual === 'string' || Array.isArray(actual) ? (actual as {length:number}).length : actual && typeof actual === 'object' ? Object.keys(actual as object).length : -1;
          ok(len === n, `Expected length ${len} to equal ${n}`);
        },
      },
    },
  };
}

function buildPm(response: ResponseData | null, request: RequestData | null, envMap: Map<string,string>, results: TestResult[]) {
  const responseJson = (): unknown => {
    if (!response) return undefined;
    try { return JSON.parse(response.body || 'null'); } catch { return undefined; }
  };
  const pm: Record<string, unknown> = {
    test(name: string, fn: () => void) {
      try { fn(); results.push({ name, passed: true }); }
      catch (err) { results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) }); }
    },
    expect(actual: unknown) { return buildExpect(actual); },
    environment: {
      set(k:string,v:string){ envMap.set(k, String(v)); },
      get(k:string){ return envMap.get(k); },
      has(k:string){ return envMap.has(k); },
      unset(k:string){ envMap.delete(k); },
    },
    variables: {
      set(k:string,v:string){ envMap.set(k, String(v)); },
      get(k:string){ return envMap.get(k); },
    },
  };
  if (response) {
    (pm as Record<string,unknown>).response = {
      code: response.statusCode,
      status: response.statusText,
      responseTime: response.responseTime,
      headers: response.headers,
      body: response.body,
      json: responseJson,
      text: () => response.body,
      to: {
        have: {
          status(code:number){ if(response.statusCode!==code) throw new AssertionError(`Expected response status ${code} but got ${response.statusCode}`); },
          header(name:string){
            const key = Object.keys(response.headers).find(k=>k.toLowerCase()===name.toLowerCase());
            if(!key) throw new AssertionError(`Expected response to have header "${name}"`);
          },
          jsonBody(path:string, value?:unknown){
            const data = responseJson();
            const got = getByPath(data, path);
            if(got===undefined) throw new AssertionError(`Expected response json body to have path "${path}"`);
            if(value!==undefined && JSON.stringify(got)!==JSON.stringify(value)) throw new AssertionError(`Expected response json body "${path}" to equal ${JSON.stringify(value)} but got ${JSON.stringify(got)}`);
          },
        },
      },
    };
  }
  if (request) (pm as Record<string,unknown>).request = request;
  return pm;
}

function runScript(script: string, pm: Record<string, unknown>) {
  if (!script || !script.trim()) return;
  // Use Function instead of Node vm for browser/Tauri compatibility. Timeout via Promise.race handled by caller.
  const fn = new Function('pm', 'console', 'JSON', 'RegExp', 'Date', 'Math', script);
  fn(pm, console, JSON, RegExp, Date, Math);
}

export function runTestsBrowser(request: RequestData, response: ResponseData, script: string, variables: EnvironmentVariable[]): TestResult[] {
  const envMap = new Map<string,string>(variables.map(v=>[v.key, v.value]));
  const results: TestResult[] = [];
  const pm = buildPm(response, request, envMap, results);
  try { runScript(script, pm); }
  catch (err) { results.push({ name: 'Script execution', passed: false, error: err instanceof Error ? err.message : String(err) }); }
  return results;
}

export function runPreRequestBrowser(script: string, request: RequestData, variables: EnvironmentVariable[]): { request: RequestData; variables: EnvironmentVariable[] } {
  const envMap = new Map<string,string>(variables.map(v=>[v.key, v.value]));
  const requestCopy: RequestData = JSON.parse(JSON.stringify(request));
  const results: TestResult[] = [];
  const pm = buildPm(null, requestCopy, envMap, results);
  try { runScript(script, pm); }
  catch (err) { console.warn(`[testExecutor] pre-request error: ${(err as Error).message}`); }
  const updatedVars: EnvironmentVariable[] = variables.map(v=>({ ...v, value: envMap.get(v.key) ?? v.value }));
  for (const [k,v] of envMap.entries()) if(!variables.some(vv=>vv.key===k)) updatedVars.push({ id:k, key:k, value:v, type:'string', enabled:true } as EnvironmentVariable);
  return { request: requestCopy, variables: updatedVars };
}

export function inferSchema(value: unknown): Record<string, unknown> {
  if (value === null) return { type:'null' };
  if (Array.isArray(value)) return { type:'array', items: value.length>0 ? inferSchema(value[0]) : { type:'unknown' } };
  if (typeof value === 'object') {
    const props: Record<string,unknown> = {};
    for (const [k,v] of Object.entries(value as Record<string,unknown>)) props[k]=inferSchema(v);
    return { type:'object', properties: props, required:Object.keys(props) };
  }
  return { type: typeof value };
}

export function diffSchemas(a: unknown, b: unknown, path=''): Array<{path:string; type:string; expected?:unknown; actual?:unknown}> {
  const diffs: Array<{path:string; type:string; expected?:unknown; actual?:unknown}> = [];
  const sa = a as Record<string,unknown>;
  const sb = b as Record<string,unknown>;
  if (!sa || !sb) return diffs;
  if (sa.type !== sb.type) diffs.push({ path, type:'typeChanged', expected: sa.type, actual: sb.type });
  if (sa.type === 'object' && sb.type === 'object') {
    const pa = (sa.properties as Record<string,unknown>) || {};
    const pb = (sb.properties as Record<string,unknown>) || {};
    for (const k of Object.keys(pa)) if(!(k in pb)) diffs.push({ path: path?`${path}.${k}`:k, type:'removed', expected: pa[k] });
    for (const k of Object.keys(pb)) if(!(k in pa)) diffs.push({ path: path?`${path}.${k}`:k, type:'added', actual: pb[k] });
    for (const k of Object.keys(pa).filter(k=>k in pb)) diffs.push(...diffSchemas(pa[k], pb[k], path?`${path}.${k}`:k));
  }
  if (sa.type==='array' && sb.type==='array') diffs.push(...diffSchemas(sa.items, sb.items, `${path}[]`));
  return diffs;
}

export function structuralDiff(a: unknown, b: unknown, path=''): Array<{path:string; type:'added'|'removed'|'changed'; expected?:unknown; actual?:unknown}> {
  const diffs: Array<{path:string; type:'added'|'removed'|'changed'; expected?:unknown; actual?:unknown}> = [];
  if (a === b) return diffs;
  if (typeof a !== typeof b || a===null || b===null || typeof a !== 'object') {
    diffs.push({ path: path||'/', type:'changed', expected:a, actual:b });
    return diffs;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const max = Math.max(a.length, b.length);
    for(let i=0;i<max;i++){
      const p = `${path}[${i}]`;
      if(i>=a.length) diffs.push({ path:p, type:'added', actual:(b as unknown[])[i] });
      else if(i>=b.length) diffs.push({ path:p, type:'removed', expected:(a as unknown[])[i] });
      else diffs.push(...structuralDiff((a as unknown[])[i], (b as unknown[])[i], p));
    }
    return diffs;
  }
  const ao = a as Record<string,unknown>;
  const bo = b as Record<string,unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for(const k of keys){
    const p = path ? `${path}.${k}` : k;
    if(!(k in ao)) diffs.push({ path:p, type:'added', actual:bo[k] });
    else if(!(k in bo)) diffs.push({ path:p, type:'removed', expected:ao[k] });
    else diffs.push(...structuralDiff(ao[k], bo[k], p));
  }
  return diffs;
}
