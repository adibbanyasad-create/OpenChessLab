import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(manifest.version) },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['localhost', '.e2b.app'],
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  build: { outDir: 'dist/client', emptyOutDir: true, sourcemap: true },
  worker: {
    format: 'iife' as const,
    // Force a .js suffix: browsers refuse to execute workers served with a
    // non-JavaScript MIME type, and some servers mislabel the raw .ts name.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/engine-worker-[hash].js',
        chunkFileNames: 'assets/engine-worker-[hash].js',
      },
    },
  },
});
