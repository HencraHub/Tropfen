import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], testTimeout: 120000 },
  resolve: { alias: { '@sim': fileURLToPath(new URL('./src/sim', import.meta.url)), '@data': fileURLToPath(new URL('./src/data', import.meta.url)) } },
});
