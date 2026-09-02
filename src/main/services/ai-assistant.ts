import { RequestData, ResponseData } from '../../shared/types/request';

export type AIAnalysisChannel = 'error' | 'tests' | 'explain';

interface KnowledgeEntry {
  title: string;
  suggestion: string;
}

const STATUS_KB: Record<number, KnowledgeEntry> = {
  400: {
    title: 'Bad Request',
    suggestion:
      'The server rejected the request due to malformed syntax. Validate the request body against the expected schema, check required fields, and ensure JSON is well-formed and properly encoded.',
  },
  401: {
    title: 'Unauthorized',
    suggestion:
      'Authentication is missing or invalid. Verify the Authorization header (Bearer token / API key / Basic) is present and not expired. If using a JWT, decode it to check expiry.',
  },
  403: {
    title: 'Forbidden',
    suggestion:
      'The credentials are valid but the principal is not allowed to perform this action. Confirm the API key / token has the required scopes or role for this resource.',
  },
  404: {
    title: 'Not Found',
    suggestion:
      'The resource or endpoint does not exist. Double-check the URL path, base URL / environment variable, and whether the route requires a trailing slash or a path parameter you omitted.',
  },
  405: {
    title: 'Method Not Allowed',
    suggestion:
      'The endpoint does not support this HTTP method. Check the API docs for the correct verb (e.g. use POST instead of GET) or verify a proxy/router is not rewriting the method.',
  },
  409: {
    title: 'Conflict',
    suggestion:
      'The request conflicts with the current state of the resource (e.g. duplicate creation, version mismatch). Use a unique identifier or fetch the latest state before retrying.',
  },
  422: {
    title: 'Unprocessable Entity',
    suggestion:
      'The server understood the request but semantic validation failed. Inspect the body for invalid values, missing enumerations, or out-of-range fields; the response body often lists the exact errors.',
  },
  429: {
    title: 'Too Many Requests',
    suggestion:
      'You are being rate limited. Implement exponential backoff, honor the Retry-After header, and reduce request frequency or request a higher quota.',
  },
  500: {
    title: 'Internal Server Error',
    suggestion:
      'The server encountered an unexpected condition. This is a server-side fault — retry with backoff, and report the issue with the request id / correlation id from the response if present.',
  },
  502: {
    title: 'Bad Gateway',
    suggestion:
      'The server acted as a gateway and received an invalid response from the upstream. The upstream service may be down — check its health and retry with backoff.',
  },
  503: {
    title: 'Service Unavailable',
    suggestion:
      'The server is temporarily unable to handle the request, often due to maintenance or overload. Retry with backoff and check the service status page.',
  },
  504: {
    title: 'Gateway Timeout',
    suggestion:
      'The upstream service timed out. Increase client timeout, check the upstream latency, and consider retrying idempotent requests with backoff.',
  },
};

const LOCAL_NOTE =
  'This is a local heuristic analysis based on the status code and response body. ' +
  'No data was sent to any cloud provider. If you configure an API key (e.g. OPENAI_API_KEY) ' +
  'a cloud model could be used instead for deeper reasoning.';

function bodySample(body: string, max = 4000): string {
  if (!body) return '';
  return body.length > max ? body.slice(0, max) + '…' : body;
}

/**
 * Returns an offline, rule-based set of suggestions for a failing response.
 */
export async function analyzeError(response: ResponseData, request: RequestData): Promise<string> {
  const lines: string[] = [];
  lines.push('# Local Error Analysis');
  lines.push('');
  lines.push(
    `Analyzed \`${request.method} ${request.url}\` → **${response.statusCode} ${
      response.statusText || ''
    }** (${response.responseTime} ms)`
  );
  lines.push('');

  if (response.error) {
    lines.push(`**Transport error:** ${response.error}`);
    lines.push(
      'This is a connection-level failure (DNS, TLS, refused, or timeout), not an HTTP response. ' +
        'Verify the host is reachable, the port is correct, and any proxy/certificate configuration.'
    );
    lines.push('');
    lines.push(LOCAL_NOTE);
    return lines.join('\n');
  }

  const entry = STATUS_KB[response.statusCode];
  if (entry) {
    lines.push(`**${entry.title}** — ${entry.suggestion}`);
    lines.push('');
  } else if (response.statusCode >= 400 && response.statusCode < 500) {
    lines.push(
      `**Client error (${response.statusCode}).** The request was rejected by the server. ` +
        'Check authentication, parameters, headers, and request body.'
    );
    lines.push('');
  } else if (response.statusCode >= 500) {
    lines.push(
      `**Server error (${response.statusCode}).** The failure is on the server side. ` +
        'Retry with backoff; if it persists, report it with the correlation id.'
    );
    lines.push('');
  } else {
    lines.push('The response indicates success. No error analysis needed.');
    lines.push('');
    lines.push(LOCAL_NOTE);
    return lines.join('\n');
  }

  // Body-derived hints.
  const sample = bodySample(response.body).toLowerCase();
  if (sample.includes('expired')) {
    lines.push('- The response body mentions an **expired** token or session. Re-authenticate.');
  }
  if (sample.includes('unauthorized') || sample.includes('invalid token')) {
    lines.push('- The body reports an **invalid or unauthorized** token. Check credentials.');
  }
  if (sample.includes('rate limit') || sample.includes('too many')) {
    lines.push('- The body references **rate limiting**. Slow down and respect Retry-After.');
  }
  if (sample.includes('not found')) {
    lines.push('- The body says the resource was **not found**. Verify the identifier/path.');
  }
  if (sample.includes('required') || sample.includes('missing')) {
    lines.push('- The body flags **missing required** fields. Validate the request payload.');
  }

  lines.push('');
  lines.push(LOCAL_NOTE);
  return lines.join('\n');
}

/**
 * Generates a starter Postman-style test script from the response shape.
 */
export async function generateTests(response: ResponseData): Promise<string> {
  const lines: string[] = [];
  lines.push(`// Auto-generated tests (local heuristic) for ${response.statusCode}`);
  lines.push('pm.test("Status code is ' + response.statusCode + '", function () {');
  lines.push('  pm.response.to.have.status(' + response.statusCode + ');');
  lines.push('});');
  lines.push('');

  const serverHeader = Object.keys(response.headers).find(
    (k) => k.toLowerCase() === 'content-type'
  );
  if (serverHeader) {
    lines.push('pm.test("Has Content-Type header", function () {');
    lines.push('  pm.response.to.have.header("' + serverHeader + '");');
    lines.push('});');
    lines.push('');
  }

  try {
    const json = JSON.parse(response.body || 'null');
    if (json && typeof json === 'object') {
      const keys = Array.isArray(json)
        ? Object.keys(json[0] ?? {})
        : Object.keys(json);
      if (keys.length > 0) {
        lines.push('pm.test("Response has expected shape", function () {');
        lines.push('  var data = pm.response.json();');
        for (const k of keys.slice(0, 5)) {
          lines.push('  pm.expect(data).to.have.property("' + k + '");');
        }
        lines.push('});');
        lines.push('');
      }
      lines.push('pm.test("Response is valid JSON", function () {');
      lines.push('  pm.response.json();');
      lines.push('});');
    }
  } catch {
    // Non-JSON body; skip JSON shape tests.
  }

  lines.push('pm.test("Response time is acceptable", function () {');
  lines.push('  pm.expect(pm.response.responseTime).to.be.below(2000);');
  lines.push('});');
  lines.push('');
  lines.push('// ' + LOCAL_NOTE);

  return lines.join('\n');
}

/**
 * Produces a human-readable explanation of a response.
 */
export async function explainResponse(response: ResponseData): Promise<string> {
  const lines: string[] = [];
  lines.push('# Response Explanation (local heuristic)');
  lines.push('');

  const cls =
    response.statusCode >= 500
      ? 'server error'
      : response.statusCode >= 400
        ? 'client error'
        : response.statusCode >= 300
          ? 'redirect'
          : response.statusCode >= 200 && response.statusCode < 300
            ? 'success'
            : 'informational';

  lines.push(
    `The server returned **${response.statusCode} ${response.statusText || ''}** (${cls}), ` +
      `took ${response.responseTime} ms and delivered ${response.size} bytes.`
  );
  lines.push('');

  const ct = response.headers['content-type'] || response.headers['Content-Type'];
  if (ct) {
    lines.push(`- **Content-Type:** ${ct}`);
  }
  lines.push(`- **Headers:** ${Object.keys(response.headers).length} present`);
  if (response.cookies.length > 0) {
    lines.push(`- **Set-Cookie:** ${response.cookies.length} cookie(s) returned`);
  }
  lines.push('');

  let kind = 'a non-JSON payload';
  try {
    const json = JSON.parse(response.body || 'null');
    if (json && typeof json === 'object') {
      const n = Array.isArray(json) ? json.length : Object.keys(json).length;
      kind = Array.isArray(json)
        ? `a JSON array with ${n} item(s)`
        : `a JSON object with ${n} field(s)`;
    }
  } catch {
    if (ct && ct.includes('html')) kind = 'an HTML document';
    else if (ct && ct.includes('xml')) kind = 'an XML document';
  }
  lines.push(`The body appears to be ${kind}.`);
  lines.push('');
  lines.push(LOCAL_NOTE);

  return lines.join('\n');
}

/**
 * Routes an IPC analysis request to the appropriate local generator.
 */
export async function analyze(
  channel: AIAnalysisChannel,
  payload: { response: ResponseData; request?: RequestData }
): Promise<string> {
  const response = payload.response;
  const request = payload.request ?? ({ method: 'GET', url: '' } as RequestData);
  switch (channel) {
    case 'error':
      return analyzeError(response, request);
    case 'tests':
      return generateTests(response);
    case 'explain':
      return explainResponse(response);
    default:
      return 'Unknown analysis channel.';
  }
}
