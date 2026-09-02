import { EnvironmentVariable } from '../../shared/types/request';
import { faker } from '@faker-js/faker';
import { genId } from '../../shared/lib/id';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomString(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

const DYNAMIC_FN_REGEX = /\{\{\s*\$([a-zA-Z]+)(?:\(([^)]*)\))?\s*\}\}/g;

function resolveDynamicFunctions(template: string): string {
  return template.replace(DYNAMIC_FN_REGEX, (match, fn: string, argsStr?: string) => {
    const args = argsStr ? argsStr.split(',').map((a: string) => a.trim()) : [];
    switch (fn) {
      case 'randomEmail':
        return faker.internet.email();
      case 'timestamp':
      case 'unixTimestamp':
        return String(Math.floor(Date.now() / 1000));
      case 'isoTimestamp':
        return new Date().toISOString();
      case 'uuid':
        return genId();
      case 'randomInt': {
        const min = args[0] !== undefined ? Number(args[0]) : 0;
        const max = args[1] !== undefined ? Number(args[1]) : 100;
        if (Number.isNaN(min) || Number.isNaN(max)) return match;
        return String(randomInt(min, max));
      }
      case 'randomString': {
        const len = args[0] !== undefined ? Number(args[0]) : 10;
        if (Number.isNaN(len)) return match;
        return randomString(len);
      }
      default:
        return match;
    }
  });
}

const VARIABLE_REGEX = /\{\{\s*([^$\s{}][^}]*?)\s*\}\}/g;

/**
 * Resolve `{{var}}` references and `{{$dynamic}}` functions inside a template string.
 * Dynamic functions are resolved first, then environment variables.
 */
export function resolveVariables(template: string, variables: EnvironmentVariable[]): string {
  if (typeof template !== 'string' || template.length === 0) return template;

  const varMap = new Map<string, string>();
  for (const v of variables) {
    if (v.enabled === false) continue;
    varMap.set(v.key, v.value);
  }

  let result = resolveDynamicFunctions(template);
  result = result.replace(VARIABLE_REGEX, (match, name: string) => {
    const key = name.trim();
    if (varMap.has(key)) return varMap.get(key) as string;
    return match;
  });
  return result;
}
