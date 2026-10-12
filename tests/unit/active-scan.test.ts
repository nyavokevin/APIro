import { describe, it, expect, vi } from 'vitest';

// Prevent the Tauri bridge (pulled in transitively by services/api) from loading under node.
vi.mock('../../src/renderer/src/services/api', () => ({
  api: { requests: { execute: vi.fn() } },
}));

import {
  runAuthTest,
  runInjectionTest,
  runRateLimitTest,
  runJwtTest,
  runMassAssignmentTest,
  runBolaTest,
  type Executor,
} from '../../src/renderer/src/lib/security/activeScan';
import type { RequestData, ResponseData, KeyValuePair } from '../../src/shared/types/request';

function res(over: Partial<ResponseData> = {}): ResponseData {
  return {
    id: 'r',
    statusCode: 200,
    statusText: 'OK',
    headers: {},
    body: '',
    contentType: 'application/json',
    responseTime: 10,
    size: 0,
    timeline: { dns: 0, tcp: 0, tls: 0, ttfb: 0, download: 0, total: 10 },
    cookies: [],
    ...over,
  };
}

function req(over: Partial<RequestData> = {}): RequestData {
  return {
    id: 'req1',
    name: 'test',
    method: 'GET',
    url: 'https://api.example.com/users/1',
    headers: [],
    params: [],
    bodyType: 'none',
    body: '',
    auth: { type: 'none' },
    ...over,
  };
}

const param = (key: string, value = 'x'): KeyValuePair => ({ id: key, key, value, enabled: true });

describe('runAuthTest', () => {
  it('flags an endpoint reachable without credentials', async () => {
    const r = req({ auth: { type: 'bearer', bearer: { token: 'real' } } });
    const exec: Executor = async () => res({ statusCode: 200 });
    const findings = await runAuthTest(r, [], exec);
    const ids = findings.map((f) => f.ruleId);
    expect(ids).toContain('AUTH-ACCESSIBLE-WITHOUT-CREDENTIALS');
    expect(ids).toContain('AUTH-ACCEPTS-INVALID-TOKEN');
    expect(findings.find((f) => f.ruleId === 'AUTH-ACCEPTS-INVALID-TOKEN')?.severity).toBe('critical');
  });

  it('does not flag when auth is enforced (401)', async () => {
    const r = req({ auth: { type: 'bearer', bearer: { token: 'real' } } });
    const exec: Executor = async () => res({ statusCode: 401, statusText: 'Unauthorized' });
    const findings = await runAuthTest(r, [], exec);
    expect(findings.filter((f) => f.severity !== 'info')).toHaveLength(0);
  });

  it('returns an info note when no auth is configured', async () => {
    const r = req({ auth: { type: 'none' } });
    const findings = await runAuthTest(r, [], async () => res());
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('AUTH-NO-CREDENTIALS-CONFIGURED');
    expect(findings[0].severity).toBe('info');
  });
});

describe('runInjectionTest', () => {
  it('detects SQL injection via DB error signature', async () => {
    const r = req({ params: [param('search')] });
    const exec: Executor = async (sent) => {
      const val = sent.params.find((p) => p.key === 'search')?.value ?? '';
      if (val.includes("'")) return res({ body: 'You have an error in your SQL syntax near ...', statusCode: 200 });
      return res({ body: '[]' });
    };
    const findings = await runInjectionTest(r, [], exec);
    expect(findings.map((f) => f.ruleId)).toContain('INJECTION-SQL');
    expect(findings.find((f) => f.ruleId === 'INJECTION-SQL')?.severity).toBe('critical');
  });

  it('detects reflected XSS when payload echoes unencoded', async () => {
    const r = req({ params: [param('q')] });
    const exec: Executor = async (sent) => {
      const val = sent.params.find((p) => p.key === 'q')?.value ?? '';
      return res({ body: `results for ${val}` });
    };
    const findings = await runInjectionTest(r, [], exec);
    expect(findings.map((f) => f.ruleId)).toContain('INJECTION-XSS-REFLECTED');
  });

  it('reports clean when nothing reflects or errors', async () => {
    const r = req({ params: [param('id', '1')] });
    const exec: Executor = async () => res({ body: '{"ok":true}' });
    const findings = await runInjectionTest(r, [], exec);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('INJECTION-CLEAN');
  });

  it('notes when there are no params to fuzz', async () => {
    const findings = await runInjectionTest(req(), [], async () => res());
    expect(findings[0].ruleId).toBe('INJECTION-NO-PARAMS');
  });
});

describe('runRateLimitTest', () => {
  it('flags absence of throttling', async () => {
    const exec: Executor = async () => res({ statusCode: 200 });
    const findings = await runRateLimitTest(req(), [], exec, 10);
    expect(findings[0].ruleId).toBe('RATE-LIMIT-ABSENT');
    expect(findings[0].owasp).toBe('API4:2023');
  });

  it('recognizes 429 throttling', async () => {
    let n = 0;
    const exec: Executor = async () => {
      n += 1;
      return n > 3 ? res({ statusCode: 429, statusText: 'Too Many Requests' }) : res();
    };
    const findings = await runRateLimitTest(req(), [], exec, 10);
    expect(findings[0].ruleId).toBe('RATE-LIMIT-PRESENT');
  });

  it('recognizes rate-limit headers', async () => {
    const exec: Executor = async () => res({ headers: { 'X-RateLimit-Remaining': '42' } });
    const findings = await runRateLimitTest(req(), [], exec, 5);
    expect(findings[0].ruleId).toBe('RATE-LIMIT-PRESENT');
  });
});

function jwt(header: object, payload: object, sig = 'AAAA'): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b(header)}.${b(payload)}.${sig}`;
}
const sigOf = (token: string) => token.split('.')[2];

describe('runJwtTest', () => {
  const r = () => req({ auth: { type: 'bearer', bearer: { token: jwt({ alg: 'HS256', typ: 'JWT' }, { sub: '1', role: 'user' }) } } });

  it('flags alg:none acceptance', async () => {
    // Accept only the unsigned (empty-signature) token.
    const exec: Executor = async (sent) => (sigOf(sent.auth.bearer!.token) === '' ? res({ statusCode: 200 }) : res({ statusCode: 401 }));
    const findings = await runJwtTest(r(), [], exec);
    expect(findings.map((f) => f.ruleId)).toContain('JWT-ALG-NONE');
    expect(findings.find((f) => f.ruleId === 'JWT-ALG-NONE')?.severity).toBe('critical');
  });

  it('flags a weak signing secret', async () => {
    // Accept any re-signed (non-empty signature) token but reject alg:none.
    const exec: Executor = async (sent) => (sigOf(sent.auth.bearer!.token) !== '' ? res({ statusCode: 200 }) : res({ statusCode: 401 }));
    const findings = await runJwtTest(r(), [], exec);
    expect(findings.map((f) => f.ruleId)).toContain('JWT-WEAK-SECRET');
  });

  it('reports clean when every forged token is rejected', async () => {
    const exec: Executor = async () => res({ statusCode: 401, statusText: 'Unauthorized' });
    const findings = await runJwtTest(r(), [], exec);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('JWT-CLEAN');
  });

  it('notes when no JWT is present', async () => {
    const findings = await runJwtTest(req({ auth: { type: 'none' } }), [], async () => res());
    expect(findings[0].ruleId).toBe('JWT-NONE-PRESENT');
  });
});

describe('runMassAssignmentTest', () => {
  it('flags when injected privileged fields are echoed', async () => {
    const r = req({ method: 'POST', bodyType: 'json', body: '{"name":"bob"}' });
    const exec: Executor = async (sent) => res({ statusCode: 200, body: sent.body });
    const findings = await runMassAssignmentTest(r, [], exec);
    expect(findings.map((f) => f.ruleId)).toContain('MASS-ASSIGNMENT');
    expect(findings.find((f) => f.ruleId === 'MASS-ASSIGNMENT')?.severity).toBe('high');
  });

  it('reports clean when fields are not echoed', async () => {
    const r = req({ method: 'POST', bodyType: 'json', body: '{"name":"bob"}' });
    const exec: Executor = async () => res({ statusCode: 200, body: '{"name":"bob"}' });
    const findings = await runMassAssignmentTest(r, [], exec);
    expect(findings[0].ruleId).toBe('MASS-ASSIGNMENT-CLEAN');
  });

  it('notes when there is no JSON object body', async () => {
    const findings = await runMassAssignmentTest(req(), [], async () => res());
    expect(findings[0].ruleId).toBe('MASS-ASSIGNMENT-NO-BODY');
  });
});

describe('runBolaTest', () => {
  it('suspects BOLA when both identities get identical 2xx bodies', async () => {
    const exec: Executor = async () => res({ statusCode: 200, body: '{"id":1,"owner":"alice"}' });
    const out = await runBolaTest(req(), [], 'tokA', 'tokB', exec);
    expect(out.suspected).toBe(true);
  });

  it('does not suspect when the attacker is rejected', async () => {
    let first = true;
    const exec: Executor = async () => {
      if (first) { first = false; return res({ statusCode: 200, body: 'data' }); }
      return res({ statusCode: 403, statusText: 'Forbidden', body: 'denied' });
    };
    const out = await runBolaTest(req(), [], 'tokA', 'tokB', exec);
    expect(out.suspected).toBe(false);
  });
});
