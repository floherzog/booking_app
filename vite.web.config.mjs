import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

// The web build of the same renderer the Mac app ships (src/renderer). Only the
// platform seam differs: `@platform` resolves to web.js instead of electron.js.
//
//   npm run dev:web     local dev server (no PHP: settings fall back to localStorage)
//   npm run build:web   → dist-web/, deployed by .github/workflows/deploy-web.yml
//
// WEB_BASE is the folder on the host (default /booking_app/); the staging deploy
// sets /booking_app_next/.
const root = resolve(__dirname, 'web')
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'))

export default defineConfig({
  root,
  base: process.env.WEB_BASE || '/booking_app/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@platform': resolve(__dirname, 'src/renderer/src/platform/web.js'),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss({ config: resolve(__dirname, 'tailwind.config.js') }), autoprefixer()],
    },
  },
  server: {
    // The entry lives in src/renderer, outside the web/ root.
    fs: { allow: [__dirname] },
  },
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
  },
})
