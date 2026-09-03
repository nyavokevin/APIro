import type { RequestData, ResponseData } from '@shared/types/request';
import type { SecurityFinding, SecuritySeverity } from '../../stores/securityStore';

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

interface Rule {
  id: string;
  title: string;
  severity: SecuritySeverity;
  category: SecurityFinding['category'];
  check: (req: RequestData, res: ResponseData, headersLower: Record<string, string>) => { evidence?: string; description: string } | null;
  remediation: string;
}

const RULES: Rule[] = [
  {
    id: 'SEC-CSP',
    title: 'Missing Content-Security-Policy header',
    severity: 'medium',
    category: 'headers',
    remediation: 'Add Content-Security-Policy header, e.g. default-src \'self\'.',
    check: (_req, _res, h) => {
      if (!h['content-security-policy']) return { description: 'Response does not include Content-Security-Policy. Missing CSP allows XSS and injection attacks.' };
      return null;
    },
  },
  {
    id: 'SEC-XFO',
    title: 'Missing X-Frame-Options header',
    severity: 'low',
    category: 'headers',
    remediation: 'Add X-Frame-Options: DENY or SAMEORIGIN to prevent clickjacking.',
    check: (_req, _res, h) => {
      if (!h['x-frame-options'] && !h['content-security-policy']?.includes('frame-ancestors')) return { description: 'No clickjacking protection (X-Frame-Options or CSP frame-ancestors).' };
      return null;
    },
  },
  {
    id: 'SEC-XCTO',
    title: 'Missing X-Content-Type-Options header',
    severity: 'low',
    category: 'headers',
    remediation: 'Add X-Content-Type-Options: nosniff.',
    check: (_req, _res, h) => {
      if (!h['x-content-type-options']) return { description: 'X-Content-Type-Options not set. Browsers may MIME-sniff responses.' };
      return null;
    },
  },
  {
    id: 'SEC-HSTS',
    title: 'Missing Strict-Transport-Security header',
    severity: 'medium',
    category: 'transport',
    remediation: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains.',
    check: (req, _res, h) => {
      const isHttps = req.url.startsWith('https://');
      if (isHttps && !h['strict-transport-security']) return { description: 'HTTPS response without HSTS. Downgrade attacks possible.' };
      return null;
    },
  },
  {
    id: 'SEC-REFPOL',
    title: 'Missing Referrer-Policy header',
    severity: 'info',
    category: 'headers',
    remediation: 'Add Referrer-Policy: strict-origin-when-cross-origin or stricter.',
    check: (_req, _res, h) => {
      if (!h['referrer-policy']) return { description: 'Referrer-Policy not set. Referrer may leak to third parties.' };
      return null;
    },
  },
  {
    id: 'SEC-PERMPOL',
    title: 'Missing Permissions-Policy header',
    severity: 'info',
    category: 'headers',
    remediation: 'Add Permissions-Policy to disable unused browser features.',
    check: (_req, _res, h) => {
      if (!h['permissions-policy'] && !h['feature-policy']) return { description: 'Permissions-Policy not present.' };
      return null;
    },
  },
  {
    id: 'SEC-CORS-WILDCARD',
    title: 'CORS wildcard origin',
    severity: 'high',
    category: 'auth',
    remediation: 'Restrict Access-Control-Allow-Origin to explicit origins.',
    check: (_req, _res, h) => {
      if (h['access-control-allow-origin'] === '*') return { evidence: h['access-control-allow-origin'], description: 'Access-Control-Allow-Origin is *. Any origin can read this response.' };
      return null;
    },
  },
  {
    id: 'SEC-CORS-CREDS',
    title: 'CORS allows credentials with wildcard',
    severity: 'critical',
    category: 'auth',
    remediation: 'Do not combine Access-Control-Allow-Credentials: true with wildcard origin.',
    check: (_req, _res, h) => {
      if (h['access-control-allow-credentials'] === 'true' && h['access-control-allow-origin'] === '*') return { description: 'CORS misconfiguration: credentials true + wildcard origin.' };
      return null;
    },
  },
  {
    id: 'SEC-SERVER-LEAK',
    title: 'Server header leaks implementation',
    severity: 'info',
    category: 'exposure',
    remediation: 'Strip or obscure Server header.',
    check: (_req, _res, h) => {
      if (h['server']) return { evidence: h['server'], description: `Server header exposes: ${h['server']}` };
      return null;
    },
  },
  {
    id: 'SEC-POWEREDBY',
    title: 'X-Powered-By header present',
    severity: 'info',
    category: 'exposure',
    remediation: 'Remove X-Powered-By header.',
    check: (_req, _res, h) => {
      if (h['x-powered-by']) return { evidence: h['x-powered-by'], description: `X-Powered-By: ${h['x-powered-by']}` };
      return null;
    },
  },
  {
    id: 'SEC-COOKIE-SECURE',
    title: 'Cookie without Secure flag',
    severity: 'high',
    category: 'transport',
    remediation: 'Set Secure flag on all cookies, especially on HTTPS.',
    check: (_req, res, _h) => {
      const hit = res.cookies?.find((c) => !c.secure);
      if (hit) return { evidence: hit.name, description: `Cookie "${hit.name}" missing Secure flag.` };
      // also check set-cookie raw header fallback
      const raw = res.headers['set-cookie'] ?? res.headers['Set-Cookie'] ?? '';
      if (raw && /set-cookie/i.test(JSON.stringify(res.headers)) && !/;\s*secure/i.test(raw)) {
        // only flag if we have cookies but secure missing
        if (res.cookies.length === 0 && raw) return { evidence: raw.slice(0, 80), description: 'Set-Cookie without Secure flag.' };
      }
      return null;
    },
  },
  {
    id: 'SEC-COOKIE-HTTPONLY',
    title: 'Cookie without HttpOnly flag',
    severity: 'medium',
    category: 'headers',
    remediation: 'Set HttpOnly on cookies that do not need JS access.',
    check: (_req, res, _h) => {
      const hit = res.cookies?.find((c) => !c.httpOnly);
      if (hit) return { evidence: hit.name, description: `Cookie "${hit.name}" missing HttpOnly flag.` };
      return null;
    },
  },
  {
    id: 'SEC-COOKIE-SAMESITE',
    title: 'Cookie without SameSite attribute',
    severity: 'low',
    category: 'headers',
    remediation: 'Set SameSite=Lax or Strict.',
    check: (_req, res, _h) => {
      const hit = res.cookies?.find((c) => !c.sameSite);
      if (hit) return { evidence: hit.name, description: `Cookie "${hit.name}" missing SameSite.` };
      const raw = (res.headers['set-cookie'] ?? '') as string;
      if (raw && !/samesite/i.test(raw) && res.cookies.length === 0) return { description: 'Set-Cookie without SameSite.' };
      return null;
    },
  },
  {
    id: 'SEC-STACKTRACE',
    title: 'Response body may contain stack trace',
    severity: 'high',
    category: 'exposure',
    remediation: 'Do not expose stack traces in production responses.',
    check: (_req, res, _h) => {
      const body = res.body ?? '';
      if (/\.java:\d+|Traceback \(most recent call|at .*\(.*:\d+:\d+\)|Exception in thread|stackTrace/i.test(body)) {
        return { evidence: body.slice(0, 200), description: 'Body appears to contain a stack trace or verbose error.' };
      }
      return null;
    },
  },
  {
    id: 'SEC-SENSITIVE-LEAK',
    title: 'Potential sensitive data in response',
    severity: 'medium',
    category: 'exposure',
    remediation: 'Review response for PII/secrets; mask or omit.',
    check: (_req, res, _h) => {
      const body = res.body ?? '';
      if (/\b(AKIA[0-9A-Z]{16}|sk_live_[0-9a-z]+|-----BEGIN (RSA )?PRIVATE KEY-----)/i.test(body)) {
        return { evidence: body.match(/AKIA[0-9A-Z]{16}|sk_live_[0-9a-z]+|-----BEGIN (RSA )?PRIVATE KEY-----/i)?.[0], description: 'Possible secret / private key found in body.' };
      }
      return null;
    },
  },
  {
    id: 'SEC-IDOR-HINT',
    title: 'URL contains object identifier — test for BOLA',
    severity: 'info',
    category: 'auth',
    remediation: 'Verify authorization: object IDs must be scoped to the authenticated user. Test with a second identity.',
    check: (req, _res, _h) => {
      if (/\/\d+(\/|$|\?)|\/users\/[^/]+|\/accounts\/[^/]+|\{\{id\}\}|\/\{\{.*\}\}/i.test(req.url) || /\/(id|userId|accountId)=/i.test(req.url)) {
        return { evidence: req.url, description: `URL ${req.url} contains an object identifier. Consider testing BOLA/IDOR with another identity.` };
      }
      return null;
    },
  },
];

export function runPassiveScan(request: RequestData, response: ResponseData): SecurityFinding[] {
  const headersLower: Record<string, string> = {};
  for (const [k, v] of Object.entries(response.headers ?? {})) {
    headersLower[k.toLowerCase()] = String(v);
  }

  const now = Date.now();
  const findings: SecurityFinding[] = [];

  for (const rule of RULES) {
    const hit = rule.check(request, response, headersLower);
    if (hit) {
      findings.push({
        id: `${rule.id}-${uid()}`,
        requestId: request.id,
        ruleId: rule.id,
        title: rule.title,
        description: hit.description,
        severity: rule.severity,
        category: rule.category,
        remediation: rule.remediation,
        evidence: hit.evidence,
        timestamp: now,
      });
    }
  }

  return findings;
}
