import type { SecurityFinding, SecuritySeverity, ScanRecord, FindingStatus } from '../../stores/securityStore';

export interface ReportMeta {
  title: string;
  target: string | null;
  environment: string | null;
  generatedAt: number;
}

export interface ReportModel {
  meta: ReportMeta;
  findings: SecurityFinding[];
  scans: ScanRecord[];
  severityCounts: Record<SecuritySeverity, number>;
  owaspCounts: Record<string, number>;
  riskScore: number;
  riskLabel: 'Critical' | 'High' | 'Medium' | 'Low' | 'Clean';
  total: number;
}

const SEVERITY_ORDER: Record<SecuritySeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const SEVERITY_WEIGHT: Record<SecuritySeverity, number> = { critical: 40, high: 20, medium: 8, low: 2, info: 0 };
const SEVERITY_HEX: Record<SecuritySeverity, string> = {
  critical: '#DC2626',
  high: '#EA580C',
  medium: '#D97706',
  low: '#6B7280',
  info: '#2563EB',
};

function statusOf(f: SecurityFinding): FindingStatus {
  return f.status ?? (f.dismissed ? 'ignored' : 'open');
}

/** Build the report model from open findings only (ignored/resolved are excluded from the risk picture). */
export function buildReportModel(
  findings: SecurityFinding[],
  scans: ScanRecord[],
  meta: ReportMeta
): ReportModel {
  const open = findings.filter((f) => statusOf(f) === 'open');
  const severityCounts: Record<SecuritySeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const owaspCounts: Record<string, number> = {};
  let riskScore = 0;
  for (const f of open) {
    severityCounts[f.severity] += 1;
    riskScore += SEVERITY_WEIGHT[f.severity];
    if (f.owasp) owaspCounts[f.owasp] = (owaspCounts[f.owasp] ?? 0) + 1;
  }
  const riskLabel: ReportModel['riskLabel'] =
    severityCounts.critical > 0 ? 'Critical'
    : severityCounts.high > 0 ? 'High'
    : severityCounts.medium > 0 ? 'Medium'
    : severityCounts.low > 0 ? 'Low'
    : 'Clean';

  const sorted = [...open].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.endpoint ?? '').localeCompare(b.endpoint ?? '')
  );

  return {
    meta,
    findings: sorted,
    scans,
    severityCounts,
    owaspCounts,
    riskScore,
    riskLabel,
    total: open.length,
  };
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

/** Professional, print-friendly standalone HTML report (light theme). */
export function toReportHtml(model: ReportModel): string {
  const { meta, findings, severityCounts, owaspCounts, riskScore, riskLabel, total } = model;

  const sevChip = (sev: SecuritySeverity) => {
    const n = severityCounts[sev];
    return `<div class="stat" style="--c:${SEVERITY_HEX[sev]}">
      <div class="stat-n">${n}</div>
      <div class="stat-l">${sev}</div>
    </div>`;
  };

  const owaspRows = Object.entries(owaspCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`)
    .join('') || '<tr><td colspan="2" class="muted">No OWASP-mapped findings</td></tr>';

  const findingCards = findings.length
    ? findings
        .map((f, i) => {
          const c = SEVERITY_HEX[f.severity];
          return `<section class="finding" style="--c:${c}">
            <div class="f-head">
              <span class="f-num">${i + 1}</span>
              <span class="sev" style="background:${c}">${f.severity.toUpperCase()}</span>
              ${f.owasp ? `<span class="owasp">${esc(f.owasp)}</span>` : ''}
              <span class="cat">${esc(f.category)}</span>
              <h3>${esc(f.title)}</h3>
            </div>
            ${f.endpoint ? `<div class="endpoint">${esc(f.endpoint)}</div>` : ''}
            <p class="desc">${esc(f.description)}</p>
            ${f.evidence ? `<div class="block"><div class="block-l">Evidence</div><pre>${esc(f.evidence)}</pre></div>` : ''}
            ${f.whyMatters ? `<div class="block"><div class="block-l">Why it matters</div><p>${esc(f.whyMatters)}</p></div>` : ''}
            ${f.remediation ? `<div class="fix"><div class="block-l">Recommended fix</div><p>${esc(f.remediation)}</p></div>` : ''}
          </section>`;
        })
        .join('')
    : `<div class="clean">✓ No open security findings. Nothing to remediate at the time of this report.</div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(meta.title)}</title>
<style>
  :root { --ink:#111827; --muted:#6B7280; --line:#E5E7EB; --bg:#FFFFFF; --soft:#F9FAFB; --brand:#7C3AED; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:var(--soft); line-height:1.55; }
  .page { max-width:860px; margin:0 auto; padding:40px 32px 64px; background:var(--bg); }
  header.cover { border-bottom:3px solid var(--brand); padding-bottom:20px; margin-bottom:28px; }
  .kicker { font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--brand); font-weight:700; }
  h1 { font-size:28px; margin:6px 0 10px; letter-spacing:-.02em; }
  .meta { font-size:13px; color:var(--muted); display:flex; flex-wrap:wrap; gap:4px 20px; }
  .meta b { color:var(--ink); font-weight:600; }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:34px 0 14px; padding-bottom:8px; border-bottom:1px solid var(--line); }
  .risk { display:flex; align-items:center; gap:16px; padding:16px 18px; border:1px solid var(--line); border-left:4px solid var(--rc); background:var(--soft); }
  .risk .label { font-size:22px; font-weight:800; color:var(--rc); }
  .risk .score { font-size:13px; color:var(--muted); }
  .stats { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin:14px 0; }
  .stat { border:1px solid var(--line); border-top:3px solid var(--c); padding:12px; text-align:center; }
  .stat-n { font-size:26px; font-weight:800; color:var(--c); font-variant-numeric:tabular-nums; }
  .stat-l { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
  td.num,th.num { text-align:right; font-variant-numeric:tabular-nums; }
  .muted { color:var(--muted); }
  .finding { border:1px solid var(--line); border-left:4px solid var(--c); margin:14px 0; padding:16px 18px; page-break-inside:avoid; }
  .f-head { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
  .f-head h3 { font-size:16px; margin:6px 0 0; width:100%; }
  .f-num { width:22px; height:22px; border-radius:999px; background:var(--ink); color:#fff; font-size:12px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; }
  .sev { color:#fff; font-size:11px; font-weight:700; padding:2px 8px; letter-spacing:.04em; }
  .owasp,.cat { font-size:11px; padding:2px 7px; border:1px solid var(--line); color:var(--muted); font-family:ui-monospace,Menlo,Consolas,monospace; }
  .endpoint { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; color:var(--ink); background:var(--soft); padding:6px 8px; border:1px solid var(--line); margin:10px 0; word-break:break-all; }
  .desc { font-size:14px; margin:10px 0; }
  .block,.fix { margin:10px 0; }
  .block-l { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); font-weight:700; margin-bottom:4px; }
  pre { background:#0f172a; color:#e2e8f0; padding:10px 12px; border-radius:4px; font-size:12px; overflow:auto; white-space:pre-wrap; word-break:break-all; margin:0; }
  .fix { background:#F5F3FF; border:1px solid #DDD6FE; border-left:4px solid var(--brand); padding:10px 12px; }
  .fix p { margin:0; font-size:13px; }
  .clean { padding:24px; text-align:center; border:1px solid var(--line); background:var(--soft); color:#059669; font-weight:600; }
  footer { margin-top:40px; padding-top:16px; border-top:1px solid var(--line); font-size:12px; color:var(--muted); text-align:center; }
  @media print { body{background:#fff;} .page{padding:0;} .finding{break-inside:avoid;} }
</style></head>
<body><div class="page">
  <header class="cover">
    <div class="kicker">API Security Audit</div>
    <h1>${esc(meta.title)}</h1>
    <div class="meta">
      ${meta.target ? `<span><b>Target:</b> ${esc(meta.target)}</span>` : ''}
      <span><b>Environment:</b> ${esc(meta.environment ?? 'Local')}</span>
      <span><b>Generated:</b> ${esc(fmtDate(meta.generatedAt))}</span>
      <span><b>Findings:</b> ${total} open</span>
    </div>
  </header>

  <div class="risk" style="--rc:${riskLabel === 'Clean' ? '#059669' : SEVERITY_HEX[(riskLabel.toLowerCase() as SecuritySeverity)] ?? '#059669'}">
    <div class="label">${riskLabel}</div>
    <div class="score">Overall risk · weighted score ${riskScore}<br/>Higher scores mean more / more severe open issues.</div>
  </div>

  <h2>Summary</h2>
  <div class="stats">
    ${(['critical', 'high', 'medium', 'low', 'info'] as SecuritySeverity[]).map(sevChip).join('')}
  </div>

  <h2>OWASP API Top 10 coverage</h2>
  <table><thead><tr><th>Category</th><th class="num">Findings</th></tr></thead><tbody>${owaspRows}</tbody></table>

  <h2>Findings</h2>
  ${findingCards}

  <footer>Generated by APIro — local-first API security auditing. This report reflects open findings at generation time.</footer>
</div></body></html>`;
}

/** Markdown report — good for PRs, issues and wikis. */
export function toReportMarkdown(model: ReportModel): string {
  const { meta, findings, severityCounts, owaspCounts, riskLabel, riskScore, total } = model;
  const lines: string[] = [];
  lines.push(`# ${meta.title}`, '');
  lines.push(`> **API Security Audit** — generated ${fmtDate(meta.generatedAt)}`, '');
  if (meta.target) lines.push(`- **Target:** ${meta.target}`);
  lines.push(`- **Environment:** ${meta.environment ?? 'Local'}`);
  lines.push(`- **Overall risk:** ${riskLabel} (weighted score ${riskScore})`);
  lines.push(`- **Open findings:** ${total}`, '');

  lines.push('## Summary', '');
  lines.push('| Severity | Count |', '| --- | --- |');
  for (const s of ['critical', 'high', 'medium', 'low', 'info'] as SecuritySeverity[]) {
    lines.push(`| ${s} | ${severityCounts[s]} |`);
  }
  lines.push('');

  if (Object.keys(owaspCounts).length) {
    lines.push('## OWASP API Top 10 coverage', '');
    lines.push('| Category | Findings |', '| --- | --- |');
    for (const [k, v] of Object.entries(owaspCounts).sort((a, b) => b[1] - a[1])) lines.push(`| ${k} | ${v} |`);
    lines.push('');
  }

  lines.push('## Findings', '');
  if (!findings.length) {
    lines.push('_No open security findings._', '');
  } else {
    findings.forEach((f, i) => {
      lines.push(`### ${i + 1}. [${f.severity.toUpperCase()}] ${f.title}`, '');
      const tags = [f.owasp, f.category].filter(Boolean).join(' · ');
      if (tags) lines.push(`\`${tags}\``, '');
      if (f.endpoint) lines.push(`**Endpoint:** \`${f.endpoint}\``, '');
      lines.push(f.description, '');
      if (f.evidence) lines.push('**Evidence:**', '', '```', f.evidence, '```', '');
      if (f.whyMatters) lines.push(`**Why it matters:** ${f.whyMatters}`, '');
      if (f.remediation) lines.push(`**Recommended fix:** ${f.remediation}`, '');
      lines.push('');
    });
  }

  lines.push('---', '_Generated by APIro — local-first API security auditing._');
  return lines.join('\n');
}
