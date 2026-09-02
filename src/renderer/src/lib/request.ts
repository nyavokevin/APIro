import type { RequestData } from '@shared/types/request';

import { uid } from './id';

export function createEmptyRequest(name = 'New Request'): RequestData {
  return {
    id: uid(),
    name,
    method: 'GET',
    url: '',
    headers: [],
    params: [],
    bodyType: 'none',
    body: '',
    auth: { type: 'none' },
    preRequestScript: '',
    testScript: '',
  };
}
