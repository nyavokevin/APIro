/**
 * Categorized HTTP header presets used for autocomplete and the "Presets"
 * menu in the Headers tab. `example` is inserted as the row value when a
 * preset is picked; `description` documents when the header applies.
 */
export interface HeaderPreset {
  name: string;
  example?: string;
  description?: string;
}

export interface HeaderCategory {
  name: string;
  headers: HeaderPreset[];
}

export const HEADER_CATEGORIES: HeaderCategory[] = [
  {
    name: 'Content & Body',
    headers: [
      { name: 'Content-Type', example: 'application/json', description: 'Media type of the request body' },
      { name: 'Content-Length', example: '1024', description: 'Size of the request body in bytes' },
      { name: 'Content-Encoding', example: 'gzip', description: 'Encoding applied to the body' },
      { name: 'Content-Disposition', example: 'attachment; filename="report.pdf"', description: 'Inline/attachment hints' },
    ],
  },
  {
    name: 'Authentication & Authorization',
    headers: [
      { name: 'Authorization', example: 'Bearer <token>', description: 'Credentials (Bearer, Basic, Digest, …)' },
      { name: 'Cookie', example: 'session=abc123', description: 'Stored cookies for the domain' },
      { name: 'WWW-Authenticate', example: 'Bearer realm="example"', description: 'Usually a response header (auth challenge)' },
      { name: 'Proxy-Authorization', example: 'Basic <base64>', description: 'Credentials for a proxy' },
    ],
  },
  {
    name: 'Caching',
    headers: [
      { name: 'Cache-Control', example: 'no-cache', description: 'Caching directives (max-age, no-store, …)' },
      { name: 'Pragma', example: 'no-cache', description: 'Legacy HTTP/1.0 cache directive' },
      { name: 'Expires', example: 'Wed, 21 Oct 2026 07:28:00 GMT', description: 'Legacy expiry date' },
      { name: 'ETag', example: '"33a64df5"', description: 'Resource version identifier' },
      { name: 'If-Match', example: '"33a64df5"', description: 'Conditional request: must match ETag' },
      { name: 'If-None-Match', example: '"33a64df5"', description: 'Conditional request: must NOT match ETag' },
      { name: 'If-Modified-Since', example: 'Wed, 21 Oct 2026 07:28:00 GMT', description: 'Conditional request by date' },
      { name: 'If-Unmodified-Since', example: 'Wed, 21 Oct 2026 07:28:00 GMT', description: 'Conditional request by date' },
    ],
  },
  {
    name: 'Client / Request Info',
    headers: [
      { name: 'User-Agent', example: 'APIForge/0.1.0', description: 'Client application identifier' },
      { name: 'Accept', example: 'application/json', description: 'Acceptable response media types' },
      { name: 'Accept-Encoding', example: 'gzip, deflate, br', description: 'Acceptable response encodings' },
      { name: 'Accept-Language', example: 'en-US,en;q=0.9', description: 'Preferred response languages' },
      { name: 'Accept-Charset', example: 'utf-8', description: 'Preferred character sets (legacy)' },
      { name: 'Host', example: 'api.example.com', description: 'Target host and port' },
      { name: 'Referer', example: 'https://example.com/page', description: 'Address of the referring page' },
      { name: 'Origin', example: 'https://example.com', description: 'Origin of the request (CORS)' },
    ],
  },
  {
    name: 'CORS',
    headers: [
      { name: 'Access-Control-Request-Method', example: 'POST', description: 'Sent in CORS preflight requests' },
      { name: 'Access-Control-Request-Headers', example: 'Content-Type', description: 'Sent in CORS preflight requests' },
      { name: 'Access-Control-Allow-Origin', example: '*', description: 'Usually a response header' },
    ],
  },
  {
    name: 'Connection & Transfer',
    headers: [
      { name: 'Connection', example: 'keep-alive', description: 'Connection persistence control' },
      { name: 'Keep-Alive', example: 'timeout=5, max=1000', description: 'Persistent connection parameters' },
      { name: 'Transfer-Encoding', example: 'chunked', description: 'Framing of the body' },
      { name: 'TE', example: 'trailers', description: 'Transfer encodings the client accepts' },
    ],
  },
  {
    name: 'Custom / Other',
    headers: [
      { name: 'X-Requested-With', example: 'XMLHttpRequest', description: 'Marks Ajax requests' },
      { name: 'X-API-Key', example: '<your-api-key>', description: 'Common custom API key header' },
      { name: 'X-Forwarded-For', example: '203.0.113.195', description: 'Original client IP via proxies' },
      { name: 'X-Forwarded-Host', example: 'example.com', description: 'Original Host via proxies' },
      { name: 'X-Correlation-ID', example: '<correlation-id>', description: 'Request tracing across services' },
    ],
  },
];

/** Flat list of every known header name (for key-input autocomplete). */
export const ALL_HEADER_NAMES: string[] = HEADER_CATEGORIES.flatMap((c) =>
  c.headers.map((h) => h.name)
);