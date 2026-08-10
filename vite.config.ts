import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  // 'iife' (worker classico autosufficiente), non 'es': un module worker caricato da un
  // Blob URL su file:// viene bloccato in silenzio da Chromium (origine opaca, nessun
  // errore visibile) — verificato con Playwright durante lo sviluppo. Con ?worker&inline il
  // bundle è comunque autosufficiente (nessun import esterno a runtime), quindi non serve il
  // formato modulo.
  worker: {
    format: 'iife',
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
