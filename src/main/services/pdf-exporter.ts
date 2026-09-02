import { Collection, RequestData, KeyValuePair } from '../../shared/types/request';
import yaml from 'yaml';

export type PDFExportFormat = 'pdf' | 'markdown' | 'html' | 'openapi-yaml';

export interface PDFOptions {
  title: string;
  version: string;
  logoPath?: string;
  primaryColor?: string;
  format: PDFExportFormat;
}

export type CodeLanguage = 'curl' | 'javascript' | 'python' | 'go' | 'java' | 'php' | 'ruby';

export interface EndpointView {
  method: string;
  path: string;
  name: string;
  description?: string;
  headers: KeyValuePair[];
  params: KeyValuePair[];
  body?: string;
  bodyType?: string;
  auth?: unknown;
  responseExample?: string;
  requestExample?: string;
}

function flattenRequests(collection: Collection): EndpointView[] {
  const out: EndpointView[] = [];

  const walk = (node: Collection, prefix: string): void => {
    const pathPrefix = prefix ? `${prefix} / ${node.name}` : node.name;
    if (node.type === 'request' && node.data) {
      const d = node.data;
      out.push({
        method: d.method,
        path: d.url,
        name: d.name || pathPrefix,
        description: collection.description,
        headers: d.headers.filter((h) => h.enabled),
        params: d.params.filter((p) => p.enabled),
        body: d.body,
        bodyType: d.bodyType,
        auth: d.auth,
        requestExample: d.body,
      });
    }
    if (node.children) {
      for (const child of node.children) walk(child, pathPrefix);
    }
  };

  walk(collection, '');
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Concrete colors for standalone exported documents (CSS vars don't resolve there).
// Mirrors the Atomic Dark Flat Black method palette.
const METHOD_HEX: Record<string, string> = {
  GET: '#3fd68f',
  POST: '#ffb224',
  PUT: '#4d9fff',
  PATCH: '#bb9af7',
  DELETE: '#ff4d4f',
  HEAD: '#bb9af7',
  OPTIONS: '#4d9fff',
  TRACE: '#bb9af7',
};

function colorForMethod(method: string): string {
  return METHOD_HEX[method.toUpperCase()] ?? '#bb9af7';
}

function tableRows(pairs: KeyValuePair[]): string {
  if (pairs.length === 0) {
    return '<tr><td colspan="3" class="muted">None</td></tr>';
  }
  return pairs
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.key)}</td><td>${escapeHtml(p.value)}</td><td>${
          p.description ? escapeHtml(p.description) : ''
        }</td></tr>`
    )
    .join('');
}

function authSummary(auth: unknown): string {
  if (!auth || typeof auth !== 'object') return 'None';
  const a = auth as { type?: string };
  if (!a.type || a.type === 'none') return 'None';
  return escapeHtml(a.type);
}

export function generateCodeSnippet(endpoint: EndpointView, language: CodeLanguage): string {
  const url = endpoint.path || '';
  const method = (endpoint.method || 'GET').toUpperCase();
  const headerLines = endpoint.headers
    .filter((h) => h.key)
    .map((h) => `  ${JSON.stringify(h.key)}: ${JSON.stringify(h.value)}`);
  const body = endpoint.body && endpoint.bodyType !== 'none' ? endpoint.body : '';

  switch (language) {
    case 'curl': {
      const lines = [`curl -X ${method} "${url}"`];
      for (const h of endpoint.headers.filter((h) => h.key)) {
        lines.push(`  -H "${h.key}: ${h.value}"`);
      }
      if (body) {
        const compact = body.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        lines.push(`  -d '${compact}'`);
      }
      return lines.join(' \\\n');
    }
    case 'javascript': {
      const headers = headerLines.length ? `{\n${headerLines.join(',\n')}\n}` : '{}';
      const bodyField = body ? `,\n  body: ${JSON.stringify(body)}` : '';
      return `fetch("${url}", {\n  method: "${method}",\n  headers: ${headers}${bodyField}\n})\n  .then((r) => r.json())\n  .then((data) => console.log(data));`;
    }
    case 'python': {
      const headerDict = endpoint.headers
        .filter((h) => h.key)
        .map((h) => `    "${h.key}": "${h.value}",`)
        .join('\n');
      const importLine = body ? 'import json\nimport requests\n' : 'import requests\n';
      const bodyLine = body
        ? `\nresponse = requests.${method.toLowerCase()}("${url}", headers=headers, data=json.dumps(${JSON.stringify(
            safeParse(body)
          )}))`
        : `\nresponse = requests.${method.toLowerCase()}("${url}", headers=headers)`;
      return `${importLine}\nheaders = {\n${headerDict}\n}${bodyLine}\nprint(response.json())`;
    }
    case 'go': {
      const bodyLine = body
        ? `    body := strings.NewReader(\`${body.replace(/`/g, '` + "`" + `')}\`)\n    req, _ := http.NewRequest("${method}", "${url}", body)`
        : `    req, _ := http.NewRequest("${method}", "${url}", nil)`;
      const headerLines2 = endpoint.headers
        .filter((h) => h.key)
        .map((h) => `    req.Header.Set("${h.key}", "${h.value}")`)
        .join('\n');
      return `package main

import (
    "fmt"
    "net/http"
    "strings"
)

func main() {
${bodyLine}
${headerLines2}
    client := &http.Client{}
    resp, _ := client.Do(req)
    fmt.Println(resp.Status)
}`;
    }
    case 'java': {
      const headerLines2 = endpoint.headers
        .filter((h) => h.key)
        .map((h) => `            .header("${h.key}", "${h.value}")`)
        .join('\n');
      const bodyLine = body
        ? `\n            .method("${method}", HttpRequest.BodyPublishers.ofString(${JSON.stringify(body)}))`
        : `\n            .method("${method}", HttpRequest.BodyPublishers.noBody())`;
      return `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class Main {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("${url}"))
${headerLines2}
${bodyLine}
            .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println(response.body());
    }
}`;
    }
    case 'php': {
      const headerArr = endpoint.headers
        .filter((h) => h.key)
        .map((h) => `  '${h.key}: ${h.value}',`)
        .join('\n');
      const bodyLine = body
        ? `\n  CURLOPT_POSTFIELDS => ${varExport(body)},`
        : '';
      return `<?php
$client = curl_init();
curl_setopt_array($client, [
  CURLOPT_URL => "${url}",
  CURLOPT_CUSTOMREQUEST => "${method}",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
${headerArr}
  ]${bodyLine}
]);
$response = curl_exec($client);
echo $response;`;
    }
    case 'ruby': {
      const headerHash = endpoint.headers
        .filter((h) => h.key)
        .map((h) => `  "${h.key}" => "${h.value}"`)
        .join(",\n");
      const bodyLine = body ? `,\n  body: ${JSON.stringify(body)}` : '';
      return `require "net/http"
require "uri"

uri = URI.parse("${url}")
request = Net::HTTP::${rubyClass(method)}.new(uri)
request["${endpoint.headers[0]?.key ?? 'Accept'}"] = "${
        endpoint.headers[0]?.value ?? '*/*'
      }"
headers = {
${headerHash}
}
${bodyLine ? `request.body = ${JSON.stringify(body)}` : ''}
response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") do |http|
  http.request(request)
end
puts response.body`;
    }
    default:
      return '';
  }
}

function rubyClass(method: string): string {
  const map: Record<string, string> = {
    GET: 'Get',
    POST: 'Post',
    PUT: 'Put',
    PATCH: 'Patch',
    DELETE: 'Delete',
    HEAD: 'Head',
    OPTIONS: 'Options',
  };
  return map[method] ?? 'Get';
}

function safeParse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function varExport(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return `json_encode(${JSON.stringify(value)})`;
  }
}

function snippetForLanguage(endpoint: EndpointView): Record<CodeLanguage, string> {
  return {
    curl: generateCodeSnippet(endpoint, 'curl'),
    javascript: generateCodeSnippet(endpoint, 'javascript'),
    python: generateCodeSnippet(endpoint, 'python'),
    go: generateCodeSnippet(endpoint, 'go'),
    java: generateCodeSnippet(endpoint, 'java'),
    php: generateCodeSnippet(endpoint, 'php'),
    ruby: generateCodeSnippet(endpoint, 'ruby'),
  };
}

function endpointSection(endpoint: EndpointView, primaryColor: string): string {
  const color = colorForMethod(endpoint.method);
  const snippets = snippetForLanguage(endpoint);
  const snippetBlocks = (Object.keys(snippets) as CodeLanguage[])
    .map(
      (lang) =>
        `<div class="snippet"><div class="snippet-lang">${lang}</div><pre><code>${escapeHtml(
          snippets[lang]
        )}</code></pre></div>`
    )
    .join('\n');

  const requestBody = endpoint.body && endpoint.bodyType !== 'none'
    ? `<h3>Request Body</h3><pre><code>${escapeHtml(endpoint.body)}</code></pre>`
    : '';

  return `
    <section class="endpoint" id="${slugify(endpoint.name)}">
      <h2><span class="badge" style="background:${color}">${escapeHtml(
    endpoint.method
  )}</span> ${escapeHtml(endpoint.path)}</h2>
      <p class="endpoint-name">${escapeHtml(endpoint.name)}</p>
      ${endpoint.description ? `<p>${escapeHtml(endpoint.description)}</p>` : ''}
      <h3>Headers</h3>
      <table><thead><tr><th>Key</th><th>Value</th><th>Description</th></tr></thead><tbody>${tableRows(
        endpoint.headers
      )}</tbody></table>
      <h3>Query Parameters</h3>
      <table><thead><tr><th>Key</th><th>Value</th><th>Description</th></tr></thead><tbody>${tableRows(
        endpoint.params
      )}</tbody></table>
      ${requestBody}
      <h3>Authentication</h3>
      <p>${authSummary(endpoint.auth)}</p>
      <h3>Code Samples</h3>
      ${snippetBlocks}
    </section>`;
}

export function generateHTML(collection: Collection, options: PDFOptions): string {
  const primary = options.primaryColor ?? '#6366f1';
  const endpoints = flattenRequests(collection);
  const date = new Date().toISOString().slice(0, 10);
  const toc = endpoints
    .map(
      (e) =>
        `<li><a href="#${slugify(e.name)}"><span class="badge" style="background:${colorForMethod(
          e.method
        )}">${escapeHtml(e.method)}</span> ${escapeHtml(e.path)}</a></li>`
    )
    .join('\n');
  const sections = endpoints.map((e) => endpointSection(e, primary)).join('\n');
  const logo = options.logoPath
    ? `<img class="logo" src="${escapeAttr(options.logoPath)}" alt="logo" />`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5; margin: 0; }
  .cover { padding: 80px 40px; border-bottom: 4px solid ${primary}; }
  .cover h1 { font-size: 38px; margin: 0 0 8px; }
  .cover .meta { color: #6b7280; }
  .logo { max-height: 64px; margin-bottom: 24px; }
  .badge { color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 700; margin-right: 6px; }
  .toc { padding: 40px; }
  .toc ul { list-style: none; padding: 0; }
  .toc li { padding: 6px 0; border-bottom: 1px solid #e5e7eb; }
  .toc a { color: #111827; text-decoration: none; }
  .endpoint { padding: 40px; border-bottom: 1px solid #e5e7eb; page-break-before: always; }
  .endpoint h2 { font-size: 22px; }
  .endpoint-name { color: #6b7280; font-style: italic; }
  h3 { color: ${primary}; margin-top: 24px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; font-size: 13px; }
  th { background: #f3f4f6; }
  .muted { color: #9ca3af; }
  pre { background: #0f172a; color: #e2e8f0; padding: 14px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
  .snippet { margin: 12px 0; }
  .snippet-lang { font-weight: 700; text-transform: uppercase; font-size: 11px; color: ${primary}; margin-bottom: 4px; }
  @media print { .endpoint { page-break-before: always; } }
</style>
</head>
<body>
  <div class="cover">
    ${logo}
    <h1>${escapeHtml(options.title)}</h1>
    <div class="meta">Version ${escapeHtml(options.version)} &middot; Generated ${date}</div>
  </div>
  <div class="toc">
    <h2>Table of Contents</h2>
    <ul>${toc}</ul>
  </div>
  ${sections}
</body>
</html>`;
}

export function generateMarkdown(collection: Collection, options: PDFOptions): string {
  const endpoints = flattenRequests(collection);
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# ${options.title}`);
  lines.push('');
  lines.push(`**Version:** ${options.version}`);
  lines.push(`**Generated:** ${date}`);
  lines.push('');
  lines.push('## Table of Contents');
  lines.push('');
  for (const e of endpoints) {
    lines.push(`- [${e.method} ${e.path}](#${slugify(e.name)})`);
  }
  lines.push('');
  for (const e of endpoints) {
    lines.push(`## ${e.method} ${e.path}`);
    lines.push('');
    lines.push(`*${e.name}*`);
    if (e.description) {
      lines.push('');
      lines.push(e.description);
    }
    lines.push('');
    lines.push('### Headers');
    lines.push('');
    lines.push('| Key | Value | Description |');
    lines.push('| --- | --- | --- |');
    if (e.headers.length === 0) lines.push('| _None_ | | |');
    for (const h of e.headers) lines.push(`| ${h.key} | ${h.value} | ${h.description ?? ''} |`);
    lines.push('');
    lines.push('### Query Parameters');
    lines.push('');
    lines.push('| Key | Value | Description |');
    lines.push('| --- | --- | --- |');
    if (e.params.length === 0) lines.push('| _None_ | | |');
    for (const p of e.params) lines.push(`| ${p.key} | ${p.value} | ${p.description ?? ''} |`);
    lines.push('');
    if (e.body && e.bodyType !== 'none') {
      lines.push('### Request Body');
      lines.push('');
      lines.push('```json');
      lines.push(e.body);
      lines.push('```');
      lines.push('');
    }
    lines.push('### Authentication');
    lines.push('');
    lines.push(authSummary(e.auth));
    lines.push('');
    const snippets = snippetForLanguage(e);
    for (const lang of Object.keys(snippets) as CodeLanguage[]) {
      lines.push(`#### ${lang}`);
      lines.push('');
      lines.push('```' + (lang === 'javascript' ? 'js' : lang === 'python' ? 'python' : lang));
      lines.push(snippets[lang]);
      lines.push('```');
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function generateOpenAPIYAML(collection: Collection): string {
  const endpoints = flattenRequests(collection);
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of endpoints) {
    const path = e.path || '/';
    const method = (e.method || 'GET').toLowerCase();
    if (!paths[path]) paths[path] = {};
    const params = e.params.map((p) => ({ name: p.key, in: 'query', required: false, schema: { type: 'string' } }));
    const headers = e.headers.map((h) => ({ name: h.key, in: 'header', schema: { type: 'string' } }));
    const op: Record<string, unknown> = {
      summary: e.name,
      operationId: slugify(e.name),
      parameters: [...params, ...headers],
      responses: { '200': { description: 'Successful response' } },
    };
    if (e.body && e.bodyType !== 'none') {
      op.requestBody = {
        content: { 'application/json': { schema: { type: 'object' } } },
      };
    }
    paths[path][method] = op;
  }
  const doc = {
    openapi: '3.0.3',
    info: { title: collection.name, version: '1.0.0' },
    paths,
  };
  return yaml.stringify(doc);
}

export async function generatePDF(
  collection: Collection,
  options: PDFOptions
): Promise<Buffer> {
  const html = generateHTML(collection, options);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const puppeteer = (await import('puppeteer')).default;
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });
    await browser.close();
    return Buffer.from(buffer);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[pdf-exporter] Puppeteer unavailable, returning HTML fallback. Reason: ${
        (err as Error).message
      }`
    );
    return Buffer.from(html, 'utf8');
  }
}
