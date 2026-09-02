import type { HttpMethod } from '../types/request';

export const HTTP_METHODS: HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'TRACE',
];

export const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'var(--method-get)',
  POST: 'var(--method-post)',
  PUT: 'var(--method-put)',
  PATCH: 'var(--method-patch)',
  DELETE: 'var(--method-delete)',
  HEAD: 'var(--method-patch)',
  OPTIONS: 'var(--method-put)',
  TRACE: 'var(--syntax-boolean)',
};

export const CONTENT_TYPES = {
  JSON: 'application/json',
  XML: 'application/xml',
  FORM_DATA: 'multipart/form-data',
  URL_ENCODED: 'application/x-www-form-urlencoded',
  TEXT: 'text/plain',
  HTML: 'text/html',
  BINARY: 'application/octet-stream',
};

export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent': 'APIForge/0.1.0',
};

export const STATUS_CODE_COLORS = {
  success: 'var(--success)', // 2xx
  redirect: 'var(--warning)', // 3xx
  clientError: 'var(--danger)', // 4xx
  serverError: 'var(--danger)', // 5xx
};

export const SHORTCUTS = {
  commandPalette: 'Ctrl+K',
  newRequest: 'Ctrl+N',
  sendRequest: 'Ctrl+Enter',
  saveRequest: 'Ctrl+S',
  closeTab: 'Ctrl+W',
  switchTab1: 'Ctrl+1',
  switchTab2: 'Ctrl+2',
  switchTab3: 'Ctrl+3',
  toggleSidebar: 'Ctrl+B',
  toggleTheme: 'Ctrl+T',
};
