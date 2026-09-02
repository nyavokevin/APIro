import { Collection, RequestData, ScannedEndpoint } from '../../shared/types/request';
import { parseOpenAPI } from './route-scanner';
import { genId } from '../../shared/lib/id';

interface ScanInput {
  endpoints: ScannedEndpoint[];
  url?: string;
}

function now(): number {
  return Date.now();
}

function endpointToRequest(ep: ScannedEndpoint, collectionId: string, folderId: string): Collection {
  const reqData: RequestData = {
    id: genId(),
    name: ep.summary || `${ep.method} ${ep.path}`,
    method: ep.method,
    url: ep.path,
    headers: [],
    params: ep.parameters ?? [],
    bodyType: 'none',
    body: '',
    auth: ep.auth ?? { type: 'none' },
    collectionId,
    parentId: folderId,
  };
  return {
    id: genId(),
    name: reqData.name,
    type: 'request',
    data: reqData,
    createdAt: now(),
    updatedAt: now(),
  };
}

/** Builds a Collection tree from a scan result, grouping endpoints by their first tag. */
export function generateCollection(scan: ScanInput): Collection {
  const root: Collection = {
    id: genId(),
    name: 'Imported Collection',
    description: scan.url,
    type: 'folder',
    children: [],
    createdAt: now(),
    updatedAt: now(),
  };

  const folders = new Map<string, Collection>();
  for (const ep of scan.endpoints) {
    const tag = ep.tags && ep.tags.length > 0 ? ep.tags[0] : 'General';
    let folder = folders.get(tag);
    if (!folder) {
      folder = {
        id: genId(),
        name: tag,
        type: 'folder',
        children: [],
        createdAt: now(),
        updatedAt: now(),
      };
      folders.set(tag, folder);
      root.children!.push(folder);
    }
    folder.children!.push(endpointToRequest(ep, root.id, folder.id));
  }

  return root;
}

/** Imports an OpenAPI/Swagger spec object directly into a Collection. */
export function importOpenAPI(spec: unknown): Collection {
  const endpoints = parseOpenAPI(spec);
  return generateCollection({ endpoints });
}
