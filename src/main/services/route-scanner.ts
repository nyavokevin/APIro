import axios from 'axios';
import { HttpMethod, ScanResult, ScannedEndpoint, KeyValuePair } from '../../shared/types/request';
import crypto from 'crypto';

const SWAGGER_PATHS = [
  '/swagger.json',
  '/openapi.json',
  '/api-docs',
  '/v3/api-docs',
  '/swagger/v1/swagger.json',
];

const GRAPHQL_INTROSPECTION = `query IntrospectionQuery {
  __schema {
    queryType { name fields { name } }
    mutationType { name fields { name } }
  }
}`;

function hostUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  try {
    const u = new URL(trimmed);
    let pathname = u.pathname.replace(/\/$/, '');
    if (pathname.toLowerCase().endsWith('/graphql')) {
      pathname = pathname.slice(0, -'/graphql'.length);
    }
    const origin = u.origin;
    if (!pathname || pathname === '/') return origin;
    return origin + pathname.replace(/\/$/, '');
  } catch {
    let url = trimmed.replace(/\/$/, '');
    if (url.toLowerCase().endsWith('/graphql')) url = url.slice(0, -'/graphql'.length);
    return url.replace(/\/$/, '');
  }
}

interface OpenApiPathItem {
  parameters?: any[];
  [method: string]: any;
}

function parseOpenAPI(spec: any): ScannedEndpoint[] {
  const endpoints: ScannedEndpoint[] = [];
  const paths: Record<string, OpenApiPathItem> = spec?.paths ?? {};
  const isV2 = !!spec?.swagger;

  const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue;
    const globalParams: any[] = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const m of methods) {
      const op = (pathItem as any)[m.toLowerCase()];
      if (!op) continue;

      const parameters: KeyValuePair[] = [];
      const allParams = [...globalParams, ...(Array.isArray(op.parameters) ? op.parameters : [])];
      for (const p of allParams) {
        if (!p || typeof p.name !== 'string') continue;
        parameters.push({
          id: crypto.randomUUID(),
          key: p.name,
          value: p.default !== undefined ? String(p.default) : '',
          enabled: true,
          description: p.description,
        });
      }

      let requestBody: unknown;
      if (isV2) {
        const bodyParam = (op.parameters || []).find((p: any) => p.in === 'body');
        requestBody = bodyParam ? bodyParam.schema : undefined;
      } else {
        requestBody = op.requestBody;
      }

      endpoints.push({
        method: m,
        path: pathStr,
        summary: op.summary,
        description: op.description,
        tags: Array.isArray(op.tags) ? op.tags : [],
        parameters,
        requestBody,
        responses: op.responses,
      });
    }
  }
  return endpoints;
}

async function trySpecs(baseUrl: string): Promise<ScanResult | null> {
  const base = hostUrl(baseUrl);
  for (const path of SWAGGER_PATHS) {
    try {
      const res = await axios.get(base + path, {
        timeout: 5000,
        validateStatus: () => true,
      });
      const data = res.data;
      if (
        res.status === 200 &&
        data &&
        typeof data === 'object' &&
        (data.openapi || data.swagger || data.paths)
      ) {
        const isOpenApi = !!data.openapi;
        return {
          url: base,
          detectedSpec: isOpenApi ? 'openapi' : 'swagger',
          endpoints: parseOpenAPI(data),
          raw: data,
        };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function tryGraphQL(baseUrl: string): Promise<ScannedEndpoint[]> {
  const url = hostUrl(baseUrl) + '/graphql';
  try {
    const res = await axios.post(
      url,
      { query: GRAPHQL_INTROSPECTION },
      { timeout: 5000, validateStatus: () => true }
    );
    const schema = res.data?.data?.__schema;
    if (!schema) return [];

    const endpoints: ScannedEndpoint[] = [];
    const processType = (type: any) => {
      if (!type || !Array.isArray(type.fields)) return;
      for (const field of type.fields) {
        endpoints.push({
          method: 'POST',
          path: '/graphql',
          summary: String(field.name),
          tags: ['graphql'],
          parameters: [],
        });
      }
    };
    processType(schema.queryType);
    processType(schema.mutationType);
    return endpoints;
  } catch {
    return [];
  }
}

/** Scans a backend for OpenAPI/Swagger specs and GraphQL introspection. */
export async function scanBackend(baseUrl: string): Promise<ScanResult> {
  const specResult = await trySpecs(baseUrl);
  if (specResult) return specResult;

  const graphqlEndpoints = await tryGraphQL(baseUrl);
  if (graphqlEndpoints.length > 0) {
    return { url: hostUrl(baseUrl), detectedSpec: 'graphql', endpoints: graphqlEndpoints };
  }

  return { url: hostUrl(baseUrl), detectedSpec: 'none', endpoints: [] };
}

export { parseOpenAPI };
