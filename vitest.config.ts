import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    server: {
      deps: {
        external: ['node:sqlite', 'better-sqlite3'],
      },
    },
  },
  ssr: {
    external: ['node:sqlite', 'better-sqlite3'],
  },
  resolve: {
    alias: { '@shared': path.join(__dirname, 'src/shared') },
  },
});
