import { describe, it, expect } from 'vitest';
import { buildReportModel, toReportHtml, toReportMarkdown } from '../../src/renderer/src/lib/security/securityReport';
import type { SecurityFinding } from '../../src/renderer/src/stores/securityStore';

function f(over: Partial<SecurityFinding> = {}): SecurityFinding {
  return {
    id: Math.random().toString(36).slice(2),
    requestId: 'r1',
    ruleId: 'RULE',
    title: 'Finding',
    description: 'desc',
    severity: 'medium',
    category: 'headers',
    timestamp: 1700000000000,
    status: 'open',
    ...over,
  };
}

const meta = { title: 'Audit', target: 'https://api.example.com', environment: 'Staging', generatedAt: 1700000000000 };

describe('buildReportModel', () => {
  it('counts only open findings and sorts by severity', () => {
    const findings = [
      f({ severity: 'low' }),
      f({ severity: 'critical', owasp: 'API2:2023' }),
      f({ severity: 'high', owasp: 'API2:2023' }),
      f({ severity: 'medium', status: 'ignored' }), // excluded
      f({ severity: 'info', status: 'resolved' }), // excluded
    ];
    const m = buildReportModel(findings, [], meta);
    expect(m.total).toBe(3);
    expect(m.severityCounts.critical).toBe(1);
    expect(m.severityCounts.high).toBe(1);
    expect(m.severityCounts.medium).toBe(0);
    expect(m.findings[0].severity).toBe('critical'); // sorted
    expect(m.owaspCounts['API2:2023']).toBe(2);
    expect(m.riskLabel).toBe('Critical');
    expect(m.riskScore).toBe(40 + 20 + 2);
  });

  it('reports Clean when there are no open findings', () => {
    const m = buildReportModel([f({ status: 'resolved' })], [], meta);
    expect(m.total).toBe(0);
    expect(m.riskLabel).toBe('Clean');
    expect(m.riskScore).toBe(0);
  });
});

describe('toReportHtml', () => {
  it('produces a standalone document with the findings and escapes HTML', () => {
    const m = buildReportModel([f({ title: '<script>x</script>', severity: 'high', remediation: 'Fix it' })], [], meta);
    const html = toReportHtml(m);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('API Security Audit');
    expect(html).toContain('&lt;script&gt;'); // escaped, not raw
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('Recommended fix');
  });

  it('shows a clean state when nothing is open', () => {
    const html = toReportHtml(buildReportModel([], [], meta));
    expect(html).toContain('No open security findings');
  });
});

describe('toReportMarkdown', () => {
  it('includes summary table and findings', () => {
    const md = toReportMarkdown(buildReportModel([f({ severity: 'high', title: 'Broken auth', remediation: 'Validate tokens' })], [], meta));
    expect(md).toContain('# Audit');
    expect(md).toContain('| Severity | Count |');
    expect(md).toContain('[HIGH] Broken auth');
    expect(md).toContain('Validate tokens');
  });
});
