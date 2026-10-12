import type { RequestData, ResponseData, EnvironmentVariable, KeyValuePair } from '@shared/types/request';
import type { SecurityFinding } from '../../stores/securityStore';
import { api } from '../../services/api';

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function kv(key: string, value: string): KeyValuePair {
  return { id: uid(), key, value, enabled: true };
}

function finding(
  request: RequestData,
  partial: Omit<SecurityFinding, 'id' | 'requestId' | 'timestamp'>
): SecurityFinding {
  return {
    id: `${partial.ruleId}-${uid()}`,
    requestId: request.id,
    timestamp: Date.now(),
    ...partial,
  };
}

/** Executes a request clone and returns the response. Injectable for tests. */
export type Executor = (req: RequestData, vars: EnvironmentVariable[]) => Promise<ResponseData>;

const defaultExecutor: Executor = (req, vars) => api.requests.execute(req, vars);

/** Execute a request clone through an engine, swallowing transport errors into a 0-status response. */
async function run(req: RequestData, vars: EnvironmentVariable[], exec: Executor): Promise<ResponseData> {
  try {
    return await exec(req, vars);
  } catch (e) {
    return {
      id: 'err',
      statusCode: 0,
      statusText: 'Network Error',
      headers: {},
      body: e instanceof Error ? e.message : String(e),
      contentType: 'text/plain',
      responseTime: 0,
      size: 0,
      timeline: { dns: 0, tcp: 0, tls: 0, ttfb: 0, download: 0, total: 0 },
      cookies: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

const is2xx = (s: number) => s >= 200 && s < 300;

function hasConfiguredAuth(request: RequestData): boolean {
  const a = request.auth;
  if (!a || a.type === 'none') {
    // also treat an explicit Authorization header as auth
    return request.headers.some((h) => h.enabled && h.key.toLowerCase() === 'authorization');
  }
  return true;
}

function stripAuth(request: RequestData): RequestData {
  return {
    ...request,
    auth: { type: 'none' },
    headers: request.headers.filter((h) => h.key.toLowerCase() !== 'authorization'),
  };
}

function tamperAuth(request: RequestData): RequestData {
  const bogus = 'invalid-token-apiforge-probe';
  const headers = request.headers.filter((h) => h.key.toLowerCase() !== 'authorization');
  headers.push(kv('Authorization', `Bearer ${bogus}`));
  return { ...request, auth: { type: 'bearer', bearer: { token: bogus } }, headers };
}

// ── Authentication / authorization enforcement ───────────────────────────────

/**
 * Broken-authentication test (OWASP API2:2023).
 * Replays the request with no credentials and with a tampered token.
 * A 2xx on either variant means the endpoint does not enforce auth.
 */
export async function runAuthTest(
  request: RequestData,
  variables: EnvironmentVariable[],
  exec: Executor = defaultExecutor
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  if (!request.url?.trim()) return findings;

  if (!hasConfiguredAuth(request)) {
    findings.push(
      finding(request, {
        ruleId: 'AUTH-NO-CREDENTIALS-CONFIGURED',
        title: 'No authentication configured on request',
        description:
          'This request carries no credentials. If the endpoint returns protected data, it may be unauthenticated. Add auth and re-test to confirm enforcement.',
        severity: 'info',
        category: 'auth',
        owasp: 'API2:2023',
        remediation: 'Configure Bearer/Basic/API-key auth, then re-run this test to confirm the endpoint rejects unauthenticated calls.',
      })
    );
    return findings;
  }

  const [noAuth, tampered] = await Promise.all([
    run(stripAuth(request), variables, exec),
    run(tamperAuth(request), variables, exec),
  ]);

  if (is2xx(noAuth.statusCode)) {
    findings.push(
      finding(request, {
        ruleId: 'AUTH-ACCESSIBLE-WITHOUT-CREDENTIALS',
        title: 'Endpoint accessible without authentication',
        description: `Removing all credentials still returned ${noAuth.statusCode} ${noAuth.statusText}. The endpoint does not enforce authentication.`,
        severity: 'high',
        category: 'auth',
        owasp: 'API2:2023',
        evidence: `No-auth response: ${noAuth.statusCode} ${noAuth.statusText} (${noAuth.size}B)`,
        remediation: 'Require and validate credentials server-side before returning protected data.',
      })
    );
  }

  if (is2xx(tampered.statusCode)) {
    findings.push(
      finding(request, {
        ruleId: 'AUTH-ACCEPTS-INVALID-TOKEN',
        title: 'Endpoint accepts an invalid token',
        description: `A bogus bearer token returned ${tampered.statusCode} ${tampered.statusText}. Token signature/validity is not being verified.`,
        severity: 'critical',
        category: 'auth',
        owasp: 'API2:2023',
        evidence: `Invalid-token response: ${tampered.statusCode} ${tampered.statusText}`,
        remediation: 'Verify token signature, issuer and expiry on every request; reject unknown tokens with 401.',
      })
    );
  }

  return findings;
}

// ── Injection (SQLi / reflected XSS) ─────────────────────────────────────────

const SQL_PAYLOADS = ["' OR '1'='1", "1' OR '1'='1'--", "'; DROP TABLE users;--", '"'];
const SQL_ERROR_SIGNATURES =
  /SQL syntax|mysql_fetch|ORA-\d{5}|PostgreSQL.*ERROR|SQLite3?::|SQLSTATE|Unclosed quotation mark|quoted string not properly terminated|syntax error at or near|you have an error in your sql/i;
const XSS_PAYLOAD = '<script>apiforge_xss_probe</script>';

function withParamValue(request: RequestData, param: KeyValuePair, value: string): RequestData {
  const params = request.params.map((p) => (p.id === param.id ? { ...p, value } : p));
  return { ...request, params };
}

/**
 * Active injection probe (OWASP API3:2023 / Injection).
 * Injects SQLi payloads and a reflected-XSS payload into each enabled query param,
 * then looks for DB error signatures, 5xx triggered by the payload, or unencoded reflection.
 */
export async function runInjectionTest(
  request: RequestData,
  variables: EnvironmentVariable[],
  exec: Executor = defaultExecutor
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  if (!request.url?.trim()) return findings;

  const targets = request.params.filter((p) => p.enabled && p.key.trim());
  if (targets.length === 0) {
    findings.push(
      finding(request, {
        ruleId: 'INJECTION-NO-PARAMS',
        title: 'No query parameters to fuzz',
        description: 'This request has no enabled query parameters, so the injection probe had nothing to inject into. Add parameters or test the body manually.',
        severity: 'info',
        category: 'injection',
        owasp: 'API3:2023',
        remediation: 'N/A — informational.',
      })
    );
    return findings;
  }

  const baseline = await run(request, variables, exec);

  for (const param of targets) {
    // SQL injection
    for (const payload of SQL_PAYLOADS) {
      const res = await run(withParamValue(request, param, payload), variables, exec);
      const errorLeak = SQL_ERROR_SIGNATURES.test(res.body ?? '');
      const newServerError = res.statusCode >= 500 && baseline.statusCode < 500;
      if (errorLeak || newServerError) {
        findings.push(
          finding(request, {
            ruleId: 'INJECTION-SQL',
            title: `Possible SQL injection in "${param.key}"`,
            description: errorLeak
              ? `Payload in "${param.key}" surfaced a database error in the response — the input reaches a SQL query unsanitized.`
              : `Payload in "${param.key}" caused ${res.statusCode} (baseline ${baseline.statusCode}). The input may break a SQL query.`,
            severity: 'critical',
            category: 'injection',
            owasp: 'API3:2023',
            evidence: `param ${param.key}=${payload} → ${res.statusCode}. ${errorLeak ? 'DB error: ' + (res.body ?? '').slice(0, 160) : ''}`,
            remediation: 'Use parameterized queries / prepared statements; never concatenate input into SQL. Validate and reject unexpected input.',
          })
        );
        break; // one SQLi finding per param is enough
      }
    }

    // Reflected XSS
    const xssRes = await run(withParamValue(request, param, XSS_PAYLOAD), variables, exec);
    if ((xssRes.body ?? '').includes(XSS_PAYLOAD)) {
      findings.push(
        finding(request, {
          ruleId: 'INJECTION-XSS-REFLECTED',
          title: `Reflected input in "${param.key}" returned unencoded`,
          description: `The payload for "${param.key}" was reflected verbatim in the response body. If rendered in a browser this is a reflected-XSS vector.`,
          severity: 'high',
          category: 'injection',
          owasp: 'API3:2023',
          evidence: `param ${param.key}=${XSS_PAYLOAD} reflected unencoded`,
          remediation: 'Context-encode all output; set a response Content-Type that is not HTML for API data; add CSP.',
        })
      );
    }
  }

  if (findings.length === 0) {
    findings.push(
      finding(request, {
        ruleId: 'INJECTION-CLEAN',
        title: 'No injection detected',
        description: `Fuzzed ${targets.length} parameter(s) with SQLi and XSS payloads — no DB errors, 5xx, or unencoded reflection observed.`,
        severity: 'info',
        category: 'injection',
        owasp: 'API3:2023',
        remediation: 'N/A — informational.',
      })
    );
  }

  return findings;
}

// ── Rate limiting / DoS resilience ───────────────────────────────────────────

/**
 * Rate-limit test (OWASP API4:2023 — Unrestricted Resource Consumption).
 * Fires a burst of requests and checks for 429s or rate-limit headers.
 */
export async function runRateLimitTest(
  request: RequestData,
  variables: EnvironmentVariable[],
  exec: Executor = defaultExecutor,
  burst = 15
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  if (!request.url?.trim()) return findings;

  const results = await Promise.all(Array.from({ length: burst }, () => run(request, variables, exec)));
  const sent = results.filter((r) => r.statusCode !== 0);
  const throttled = sent.filter((r) => r.statusCode === 429);
  const hasRateLimitHeaders = sent.some((r) => {
    const h = Object.keys(r.headers ?? {}).map((k) => k.toLowerCase());
    return h.some((k) => k === 'retry-after' || k.startsWith('x-ratelimit') || k.startsWith('ratelimit'));
  });

  if (sent.length === 0) {
    return findings; // all transport errors — nothing to conclude
  }

  if (throttled.length === 0 && !hasRateLimitHeaders) {
    findings.push(
      finding(request, {
        ruleId: 'RATE-LIMIT-ABSENT',
        title: 'No rate limiting observed',
        description: `Sent ${sent.length} rapid requests with no 429 and no rate-limit headers (Retry-After / X-RateLimit-*). The endpoint may be vulnerable to brute-force and resource-exhaustion abuse.`,
        severity: 'medium',
        category: 'auth',
        owasp: 'API4:2023',
        evidence: `${sent.length}/${burst} requests returned, statuses: ${[...new Set(sent.map((r) => r.statusCode))].join(', ')}`,
        remediation: 'Add per-client rate limiting / throttling and return 429 with Retry-After once limits are exceeded.',
      })
    );
  } else {
    findings.push(
      finding(request, {
        ruleId: 'RATE-LIMIT-PRESENT',
        title: 'Rate limiting detected',
        description: throttled.length
          ? `${throttled.length}/${sent.length} burst requests were throttled (429).`
          : 'Rate-limit headers (Retry-After / X-RateLimit-*) are present.',
        severity: 'info',
        category: 'auth',
        owasp: 'API4:2023',
        evidence: `429s: ${throttled.length}, rate-limit headers: ${hasRateLimitHeaders}`,
        remediation: 'N/A — informational.',
      })
    );
  }

  return findings;
}

// ── JWT attacks (alg:none, weak secret, token in URL) ────────────────────────

const WEAK_JWT_SECRETS = ['secret', 'password', '123456', 'changeme', 'jwt', 'key', 'admin', 'test', 'your-256-bit-secret', ''];
const HMAC_HASH: Record<string, string> = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };

function b64urlFromString(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToString(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  try {
    return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)));
  } catch {
    return '';
  }
}

interface DecodedJwt {
  header: Record<string, unknown>;
  payloadSeg: string;
  payloadObj: Record<string, unknown>;
}

function extractJwt(request: RequestData): string | null {
  const b = request.auth?.bearer?.token;
  const candidates: string[] = [];
  if (b) candidates.push(b);
  const authHeader = request.headers.find((h) => h.enabled && h.key.toLowerCase() === 'authorization')?.value;
  if (authHeader) candidates.push(authHeader.replace(/^Bearer\s+/i, ''));
  const urlMatch = request.url.match(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/);
  if (urlMatch) candidates.push(urlMatch[0]);
  for (const c of candidates) {
    const t = c.replace(/^Bearer\s+/i, '').trim();
    if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(t)) return t;
  }
  return null;
}

function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const header = JSON.parse(b64urlToString(parts[0]));
    const payloadObj = JSON.parse(b64urlToString(parts[1]));
    return { header, payloadSeg: parts[1], payloadObj };
  } catch {
    return null;
  }
}

async function hmacSign(alg: string, secret: string, data: string): Promise<Uint8Array> {
  const hash = HMAC_HASH[alg] ?? 'SHA-256';
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return new Uint8Array(sig);
}

function withToken(request: RequestData, token: string): RequestData {
  const headers = request.headers.filter((h) => h.key.toLowerCase() !== 'authorization');
  headers.push(kv('Authorization', `Bearer ${token}`));
  return { ...request, auth: { type: 'bearer', bearer: { token } }, headers };
}

/**
 * JWT attack suite (OWASP API2:2023).
 * - alg:none forgery: strips the signature and claims the token is unsigned.
 * - Weak-secret brute force: re-signs a tampered payload with common secrets.
 */
export async function runJwtTest(
  request: RequestData,
  variables: EnvironmentVariable[],
  exec: Executor = defaultExecutor
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  if (!request.url?.trim()) return findings;

  const token = extractJwt(request);
  if (!token) {
    findings.push(
      finding(request, {
        ruleId: 'JWT-NONE-PRESENT',
        title: 'No JWT found on request',
        description: 'No bearer JWT was found in the auth config, Authorization header or URL, so JWT attacks could not be tested.',
        severity: 'info',
        category: 'auth',
        owasp: 'API2:2023',
        remediation: 'N/A — informational.',
      })
    );
    return findings;
  }

  const decoded = decodeJwt(token);
  if (!decoded) {
    findings.push(
      finding(request, {
        ruleId: 'JWT-NONE-PRESENT',
        title: 'Token is not a decodable JWT',
        description: 'A bearer token was found but could not be parsed as a JWT, so JWT attacks were skipped.',
        severity: 'info',
        category: 'auth',
        owasp: 'API2:2023',
        remediation: 'N/A — informational.',
      })
    );
    return findings;
  }

  // 1. alg:none forgery — keep claims, drop the signature.
  const noneHeader = b64urlFromString(JSON.stringify({ ...decoded.header, alg: 'none' }));
  const noneToken = `${noneHeader}.${decoded.payloadSeg}.`;
  const noneRes = await run(withToken(request, noneToken), variables, exec);
  if (is2xx(noneRes.statusCode)) {
    findings.push(
      finding(request, {
        ruleId: 'JWT-ALG-NONE',
        title: 'JWT "alg: none" accepted',
        description: `An unsigned token (alg: none) returned ${noneRes.statusCode}. The server does not require a valid signature — claims (roles, user id) can be forged freely.`,
        severity: 'critical',
        category: 'auth',
        owasp: 'API2:2023',
        evidence: `alg:none token accepted → ${noneRes.statusCode} ${noneRes.statusText}`,
        remediation: 'Pin the expected algorithm server-side (e.g. HS256/RS256) and reject "none" and algorithm-confusion tokens.',
      })
    );
  }

  // 2. Weak-secret brute force (HMAC only) — re-sign a tampered payload with common secrets.
  const alg = String(decoded.header.alg ?? '');
  if (HMAC_HASH[alg]) {
    const tamperedPayload = b64urlFromString(JSON.stringify({ ...decoded.payloadObj, apiforge_jwt_probe: 1 }));
    const header = b64urlFromString(JSON.stringify(decoded.header));
    for (const secret of WEAK_JWT_SECRETS) {
      const signingInput = `${header}.${tamperedPayload}`;
      let forged: string;
      try {
        const sig = await hmacSign(alg, secret, signingInput);
        forged = `${signingInput}.${b64urlFromBytes(sig)}`;
      } catch {
        continue;
      }
      const res = await run(withToken(request, forged), variables, exec);
      if (is2xx(res.statusCode)) {
        findings.push(
          finding(request, {
            ruleId: 'JWT-WEAK-SECRET',
            title: 'JWT signed with a weak/guessable secret',
            description: `A token re-signed with the secret "${secret || '(empty)'}" was accepted (${res.statusCode}). The signing key is guessable, so any token can be forged.`,
            severity: 'critical',
            category: 'auth',
            owasp: 'API2:2023',
            evidence: `Forged token signed with "${secret || '(empty)'}" accepted → ${res.statusCode}`,
            remediation: 'Use a long, random, high-entropy signing secret (or asymmetric RS256 keys) stored in a secret manager; rotate it.',
          })
        );
        break;
      }
    }
  }

  if (findings.length === 0) {
    findings.push(
      finding(request, {
        ruleId: 'JWT-CLEAN',
        title: 'No JWT weaknesses detected',
        description: 'The token rejected alg:none and was not forgeable with common weak secrets.',
        severity: 'info',
        category: 'auth',
        owasp: 'API2:2023',
        remediation: 'N/A — informational.',
      })
    );
  }

  return findings;
}

// ── Mass assignment ──────────────────────────────────────────────────────────

const PRIVILEGED_FIELDS: Record<string, unknown> = {
  role: 'admin',
  isAdmin: true,
  is_admin: true,
  admin: true,
  verified: true,
  isVerified: true,
  permissions: ['admin'],
  accountBalance: 999999,
};

/**
 * Mass-assignment probe (OWASP API6:2023 / API3:2019).
 * Adds privileged fields to a JSON body and flags when the server accepts/echoes them.
 */
export async function runMassAssignmentTest(
  request: RequestData,
  variables: EnvironmentVariable[],
  exec: Executor = defaultExecutor
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  if (!request.url?.trim()) return findings;

  let obj: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(request.body || '');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed as Record<string, unknown>;
  } catch {
    obj = null;
  }

  if (!obj) {
    findings.push(
      finding(request, {
        ruleId: 'MASS-ASSIGNMENT-NO-BODY',
        title: 'No JSON object body to test',
        description: 'Mass assignment needs a JSON object request body (e.g. a POST/PUT/PATCH payload) to inject extra fields into.',
        severity: 'info',
        category: 'exposure',
        owasp: 'API6:2023',
        remediation: 'N/A — informational.',
      })
    );
    return findings;
  }

  const injected = Object.keys(PRIVILEGED_FIELDS).filter((k) => !(k in obj!));
  const mutated = { ...obj, ...PRIVILEGED_FIELDS };
  const res = await run({ ...request, body: JSON.stringify(mutated) }, variables, exec);

  const body = res.body ?? '';
  const echoed = injected.filter((k) => {
    const val = PRIVILEGED_FIELDS[k];
    if (Array.isArray(val)) return body.includes(`"${k}"`);
    return new RegExp(`"${k}"\\s*:\\s*${JSON.stringify(val)}`).test(body);
  });

  if (is2xx(res.statusCode) && echoed.length > 0) {
    findings.push(
      finding(request, {
        ruleId: 'MASS-ASSIGNMENT',
        title: 'Possible mass assignment — privileged fields accepted',
        description: `The server returned ${res.statusCode} and echoed injected field(s): ${echoed.join(', ')}. It may bind client input directly to internal objects, enabling privilege escalation.`,
        severity: 'high',
        category: 'exposure',
        owasp: 'API6:2023',
        evidence: `Injected ${injected.join(', ')} → ${res.statusCode}; echoed: ${echoed.join(', ')}`,
        remediation: 'Allow-list bindable fields (DTOs / explicit field mapping); never bind request bodies straight to ORM models.',
      })
    );
  } else {
    findings.push(
      finding(request, {
        ruleId: 'MASS-ASSIGNMENT-CLEAN',
        title: 'No mass assignment detected',
        description: `Injected ${injected.length} privileged field(s); the server did not echo them back (status ${res.statusCode}). Confirm server-side that they were ignored, not silently stored.`,
        severity: 'info',
        category: 'exposure',
        owasp: 'API6:2023',
        remediation: 'N/A — informational.',
      })
    );
  }

  return findings;
}

// ── BOLA / IDOR through the real engine ──────────────────────────────────────

export interface BolaIdentityResult {
  status: number;
  statusText: string;
  body: string;
}

export interface BolaOutcome {
  a: BolaIdentityResult;
  b: BolaIdentityResult;
  suspected: boolean;
}

function withBearer(request: RequestData, token: string): RequestData {
  const normalized = token.startsWith('Bearer ') ? token.slice(7) : token;
  const headers = request.headers.filter((h) => h.key.toLowerCase() !== 'authorization');
  return { ...request, auth: { type: 'bearer', bearer: { token: normalized } }, headers };
}

/**
 * Runs the current request with two identities through the real engine so URL
 * variables, body and every auth type are honored. Same 2xx body for both
 * identities (and not a 401/403) suggests the object isn't ownership-scoped.
 */
export async function runBolaTest(
  request: RequestData,
  variables: EnvironmentVariable[],
  tokenA: string,
  tokenB: string,
  exec: Executor = defaultExecutor
): Promise<BolaOutcome> {
  const [ra, rb] = await Promise.all([
    run(withBearer(request, tokenA), variables, exec),
    run(withBearer(request, tokenB), variables, exec),
  ]);
  const a: BolaIdentityResult = { status: ra.statusCode, statusText: ra.statusText, body: (ra.body ?? '').slice(0, 2000) };
  const b: BolaIdentityResult = { status: rb.statusCode, statusText: rb.statusText, body: (rb.body ?? '').slice(0, 2000) };
  const suspected = is2xx(a.status) && is2xx(b.status) && a.body === b.body && a.status !== 401 && a.status !== 403;
  return { a, b, suspected };
}

export function bolaFinding(request: RequestData, outcome: BolaOutcome): SecurityFinding {
  return finding(request, {
    ruleId: 'BOLA-SAME-RESPONSE',
    title: 'Possible BOLA/IDOR — object not ownership-scoped',
    description: 'Two different identities received the same 2xx response for the same object. The API may not verify that the object belongs to the caller.',
    severity: 'critical',
    category: 'auth',
    owasp: 'API1:2023',
    evidence: `Identity A: ${outcome.a.status} · Identity B: ${outcome.b.status} · bodies identical`,
    remediation: 'Enforce object-level authorization: check that the authenticated user owns or may access the requested object.',
  });
}
