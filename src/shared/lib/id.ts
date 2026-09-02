/**
 * Platform-agnostic unique id generator.
 * Uses the Web Crypto `crypto.randomUUID()` when available (browsers and
 * Node >= 19), falling back to a Math.random based id otherwise. This lets
 * the same service code run in the Electron main process and in a browser
 * (via the renderer web-bridge) without importing Node's `crypto` module.
 */
export function genId(): string {
  const c: Crypto | undefined = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
