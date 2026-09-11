import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const pkg = (name: string): string =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url))

// Tauri drives the dev server, so the port is fixed and failure must be loud:
// silently moving to 1421 would leave the window pointed at nothing.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  resolve: {
    // The packages are consumed as TypeScript source; there is no build step
    // between them and the app.
    alias: {
      '@lblr/core': pkg('core'),
      '@lblr/tspl': pkg('tspl'),
      '@lblr/zpl': pkg('zpl'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome110',
    sourcemap: true,
  },
})
