import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['workers/test/**/*.test.ts'], environment: 'node' } });
