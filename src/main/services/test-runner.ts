import vm from 'vm';
import { RequestData, ResponseData, EnvironmentVariable } from '../../shared/types/request';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface PreRequestResult {
  request: RequestData;
  variables: EnvironmentVariable[];
}

function getByPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

class AssertionError extends Error {}

function buildExpect(actual: unknown) {
  const ok = (cond: boolean, message: string): void => {
    if (!cond) throw new AssertionError(message);
  };
  return {
    to: {
      equal(expected: unknown): void {
        ok(
          actual === expected,
          `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`
        );
      },
      eql(expected: unknown): void {
        ok(
          JSON.stringify(actual) === JSON.stringify(expected),
          `Expected ${JSON.stringify(actual)} to deep-equal ${JSON.stringify(expected)}`
        );
      },
      be: {
        a(type: string): void {
          ok(typeof actual === type, `Expected ${JSON.stringify(actual)} to be a ${type}`);
        },
        true(): void {
          ok(actual === true, `Expected ${JSON.stringify(actual)} to be true`);
        },
        false(): void {
          ok(actual === false, `Expected ${JSON.stringify(actual)} to be false`);
        },
        null(): void {
          ok(actual === null, `Expected ${JSON.stringify(actual)} to be null`);
        },
        undefined(): void {
          ok(actual === undefined, `Expected ${JSON.stringify(actual)} to be undefined`);
        },
        below(n: number): void {
          ok(typeof actual === 'number' && actual < n, `Expected ${JSON.stringify(actual)} to be below ${n}`);
        },
        above(n: number): void {
          ok(typeof actual === 'number' && actual > n, `Expected ${JSON.stringify(actual)} to be above ${n}`);
        },
        lessThan(n: number): void {
          this.below(n);
        },
        greaterThan(n: number): void {
          this.above(n);
        },
      },
      match(regex: RegExp | string): void {
        const re = regex instanceof RegExp ? regex : new RegExp(regex);
        ok(
          typeof actual === 'string' && re.test(actual),
          `Expected ${JSON.stringify(actual)} to match ${re}`
        );
      },
      include(sub: unknown): void {
        if (typeof actual === 'string' && typeof sub === 'string') {
          ok(actual.includes(sub), `Expected "${actual}" to include "${sub}"`);
        } else if (Array.isArray(actual)) {
          ok(actual.includes(sub as never), `Expected array to include ${JSON.stringify(sub)}`);
        } else {
          throw new AssertionError('include() used on unsupported type');
        }
      },
      have: {
        property(name: string): void {
          ok(
            actual !== null &&
              actual !== undefined &&
              typeof actual === 'object' &&
              name in (actual as Record<string, unknown>),
            `Expected object to have property "${name}"`
          );
        },
        length(n: number): void {
          const len =
            typeof actual === 'string' || Array.isArray(actual)
              ? (actual as { length: number }).length
              : actual && typeof actual === 'object'
                ? Object.keys(actual as object).length
                : -1;
          ok(len === n, `Expected length ${len} to equal ${n}`);
        },
      },
    },
  };
}

function buildPm(
  response: ResponseData | null,
  request: RequestData | null,
  envMap: Map<string, string>,
  results: TestResult[]
): Record<string, unknown> {
  const responseJson = (): unknown => {
    if (!response) return undefined;
    try {
      return JSON.parse(response.body || 'null');
    } catch {
      return undefined;
    }
  };

  const pm: Record<string, unknown> = {
    test(name: string, fn: () => void): void {
      try {
        fn();
        results.push({ name, passed: true });
      } catch (err) {
        results.push({
          name,
          passed: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    expect(actual: unknown) {
      return buildExpect(actual);
    },
    environment: {
      set(key: string, value: string): void {
        envMap.set(key, String(value));
      },
      get(key: string): string | undefined {
        return envMap.get(key);
      },
      has(key: string): boolean {
        return envMap.has(key);
      },
      unset(key: string): void {
        envMap.delete(key);
      },
    },
    variables: {
      set(key: string, value: string): void {
        envMap.set(key, String(value));
      },
      get(key: string): string | undefined {
        return envMap.get(key);
      },
    },
  };

  if (response) {
    pm.response = {
      code: response.statusCode,
      status: response.statusText,
      responseTime: response.responseTime,
      headers: response.headers,
      body: response.body,
      json: responseJson,
      text: (): string => response.body,
      to: {
        have: {
          status(code: number): void {
            if (response.statusCode !== code) {
              throw new AssertionError(
                `Expected response status ${code} but got ${response.statusCode}`
              );
            }
          },
          header(name: string): void {
            const key = Object.keys(response.headers).find(
              (k) => k.toLowerCase() === name.toLowerCase()
            );
            if (!key) {
              throw new AssertionError(`Expected response to have header "${name}"`);
            }
          },
          jsonBody(path: string, value?: unknown): void {
            const data = responseJson();
            const got = getByPath(data, path);
            if (got === undefined) {
              throw new AssertionError(`Expected response json body to have path "${path}"`);
            }
            if (value !== undefined && JSON.stringify(got) !== JSON.stringify(value)) {
              throw new AssertionError(
                `Expected response json body "${path}" to equal ${JSON.stringify(
                  value
                )} but got ${JSON.stringify(got)}`
              );
            }
          },
        },
      },
    };
  }

  if (request) {
    pm.request = request;
  }

  return pm;
}

function runScript(
  script: string,
  pm: Record<string, unknown>
): void {
  if (!script || !script.trim()) return;
  const sandbox = { pm, console, JSON, RegExp, Date, Math, setTimeout };
  vm.createContext(sandbox);
  try {
    vm.runInContext(script, sandbox, { timeout: 5000 });
  } catch (err) {
    // A top-level throw (outside pm.test) is recorded as a single failure.
    throw err;
  }
}

/**
 * Runs a Postman-style test script against a captured response.
 * Assertions are made via the `pm` object available in the script scope.
 */
export function runTests(
  request: RequestData,
  response: ResponseData,
  script: string,
  variables: EnvironmentVariable[]
): TestResult[] {
  const envMap = new Map<string, string>(variables.map((v) => [v.key, v.value]));
  const results: TestResult[] = [];
  const pm = buildPm(response, request, envMap, results);
  try {
    runScript(script, pm);
  } catch (err) {
    results.push({
      name: 'Script execution',
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return results;
}

/**
 * Runs a pre-request script (before sending). The script may mutate
 * `pm.request` and set environment variables; the modified copies are returned.
 */
export function runPreRequestScript(
  script: string,
  request: RequestData,
  variables: EnvironmentVariable[]
): PreRequestResult {
  const envMap = new Map<string, string>(variables.map((v) => [v.key, v.value]));
  const requestCopy: RequestData = JSON.parse(JSON.stringify(request));
  const results: TestResult[] = [];
  const pm = buildPm(null, requestCopy, envMap, results);
  try {
    runScript(script, pm);
  } catch (err) {
    // Pre-request failures are non-fatal; the original request still proceeds.
    // eslint-disable-next-line no-console
    console.warn(`[test-runner] pre-request script error: ${(err as Error).message}`);
  }
  const updatedVars: EnvironmentVariable[] = variables.map((v) => ({
    ...v,
    value: envMap.get(v.key) ?? v.value,
  }));
  // Any newly-set variables not already present are appended.
  for (const [k, v] of envMap.entries()) {
    if (!variables.some((vv) => vv.key === k)) {
      updatedVars.push({ id: k, key: k, value: v, type: 'string' });
    }
  }
  return { request: requestCopy, variables: updatedVars };
}
