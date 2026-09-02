export {};

declare global {
  interface Window {
    api?: {
      invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
      on: (channel: string, callback: (...args: unknown[]) => void) => void;
    };
    __TAURI__?: unknown;
  }
}
