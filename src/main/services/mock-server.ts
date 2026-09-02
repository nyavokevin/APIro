import http from 'http';
import { getDatabase } from './storage/database';

export interface MockRoute {
  method: string;
  path: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  delayMs?: number;
}

export interface MockConfig {
  id: string;
  name: string;
  port: number;
  routes: MockRoute[];
}

export interface MockHit {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
  timestamp: number;
  responseStatus: number;
}

interface MockRow {
  id: string;
  name: string;
  port: number;
  routes: string;
  is_running: number;
  created_at: number;
}

interface RunningMock {
  config: MockConfig;
  server: http.Server;
}

const running = new Map<string, RunningMock>();
const hitHistory = new Map<string, MockHit[]>();

const MAX_HITS = 200;

function normalizePath(incoming: string): string {
  const idx = incoming.indexOf('?');
  return idx === -1 ? incoming : incoming.slice(0, idx);
}

function rowToConfig(row: MockRow): MockConfig {
  return {
    id: row.id,
    name: row.name,
    port: row.port,
    routes: JSON.parse(row.routes) as MockRoute[],
  };
}

/** Persists a mock server configuration to the database (insert or replace). */
export function createMock(config: MockConfig): void {
  const db = getDatabase();
  const ts = Date.now();
  db.prepare(
    `INSERT INTO mock_servers (id, name, port, routes, is_running, created_at)
     VALUES (?, ?, ?, ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, port = excluded.port, routes = excluded.routes`
  ).run(config.id, config.name, config.port, JSON.stringify(config.routes), ts);
}

/** Returns the list of all stored mock server configurations. */
export function listMocks(): MockConfig[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM mock_servers ORDER BY created_at DESC').all() as MockRow[];
  return rows.map(rowToConfig);
}

function matchRoute(config: MockConfig, method: string, path: string): MockRoute | undefined {
  const m = method.toUpperCase();
  return config.routes.find(
    (r) => r.method.toUpperCase() === m && normalizePath(r.path) === normalizePath(path)
  );
}

/** Starts the HTTP server for a previously created mock configuration. */
export async function startMock(id: string): Promise<void> {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM mock_servers WHERE id = ?').get(id) as MockRow | undefined;
  if (!row) throw new Error(`Mock server not found: ${id}`);
  if (running.has(id)) return;

  const config = rowToConfig(row);

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const method = req.method ?? 'GET';
      const path = req.url ?? '/';
      const route = matchRoute(config, method, path);
      const fallback = config.routes.find((r) => r.path === '*');
      const matched = route ?? fallback;

      const record: MockHit = {
        method,
        path,
        headers: flattenReqHeaders(req.headers),
        body,
        timestamp: Date.now(),
        responseStatus: matched ? matched.statusCode : 404,
      };
      const hits = hitHistory.get(id) ?? [];
      hits.unshift(record);
      if (hits.length > MAX_HITS) hits.length = MAX_HITS;
      hitHistory.set(id, hits);

      const respond = (): void => {
        if (matched) {
          res.writeHead(matched.statusCode, matched.headers);
          res.end(matched.body ?? '');
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No matching mock route', method, path }));
        }
      };

      const delay = matched?.delayMs ?? 0;
      if (delay > 0) setTimeout(respond, delay);
      else respond();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, () => resolve());
  });

  running.set(id, { config, server });
  db.prepare('UPDATE mock_servers SET is_running = 1 WHERE id = ?').run(id);
}

/** Stops a running mock server, if it is running. */
export function stopMock(id: string): void {
  const db = getDatabase();
  const entry = running.get(id);
  if (!entry) {
    db.prepare('UPDATE mock_servers SET is_running = 0 WHERE id = ?').run(id);
    return;
  }
  entry.server.close();
  running.delete(id);
  db.prepare('UPDATE mock_servers SET is_running = 0 WHERE id = ?').run(id);
}

/** Returns the recent request history for a mock server. */
export function getMockHistory(id: string): MockHit[] {
  return hitHistory.get(id) ?? [];
}

function flattenReqHeaders(h: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return out;
}
