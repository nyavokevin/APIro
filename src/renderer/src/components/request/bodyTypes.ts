import type { RequestBodyType } from '@shared/types/request';

export const BODY_TYPES: RequestBodyType[] = [
  'none',
  'json',
  'xml',
  'text',
  'form-data',
  'urlencoded',
  'binary',
  'graphql',
];
