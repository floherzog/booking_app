import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.js') },
      },
    },
    resolve: {
      alias: { '@core': resolve(__dirname, 'src/core') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.js') },
        // A sandboxed preload must be CommonJS — Electron cannot load an ESM one.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@core': resolve(__dirname, 'src/core'),
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        // The Mac side of the platform seam; vite.web.config.mjs points it at web.js.
        '@platform': resolve(__dirname, 'src/renderer/src/platform/electron.js'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
})
