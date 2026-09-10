import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, frontendRoot, 'VITE_');
  const apiUrl = process.env.VITE_API_URL || (mode === 'production' ? 'https://miriaxone-api.nahom-cloud.workers.dev/api' : env.VITE_API_URL || '/api');
  const proxy = {
    '/api': {
      target: process.env.VITE_PROXY_TARGET || env.VITE_PROXY_TARGET || 'http://127.0.0.1:7576',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ''),
    },
  };
  return {
    root: frontendRoot,
    envDir: frontendRoot,
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl) },
    plugins: [react()],
    server: { host: '127.0.0.1', port: 5174, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 4174, strictPort: true, proxy },
    build: { outDir: 'dist', sourcemap: true },
  };
});
