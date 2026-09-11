import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const resolvePackage = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@lblr/core': resolvePackage('core'),
      '@lblr/tspl': resolvePackage('tspl'),
      '@lblr/zpl': resolvePackage('zpl'),
      '@lblr/transport': resolvePackage('transport'),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts'],
    environment: 'node',
  },
})
