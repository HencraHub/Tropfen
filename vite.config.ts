import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@sim': fileURLToPath(new URL('./src/sim', import.meta.url)),
      '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
    },
  },
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 2000 },
});
