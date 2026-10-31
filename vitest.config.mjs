import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Components use the automatic JSX runtime (no `import React`), as in the app builds.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@core': resolve(process.cwd(), 'src/core'),
      '@platform': resolve(process.cwd(), 'src/renderer/src/platform/electron.js'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'src/core/__tests__/**/*.test.js',
      'src/main/__tests__/**/*.test.js',
      'src/renderer/src/**/__tests__/**/*.test.js',
    ],
  },
})
