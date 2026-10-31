// Renders resources/icon.svg into the Mac app icon (resources/icon.icns) and
// the web app's icons (web/public). Run after changing the SVG:
//
//   npm i --no-save playwright-core && npx playwright-core install chromium
//   node scripts/build-icon.mjs
//
// Chromium draws the SVG, sips scales it and iconutil packs the .icns, so it
// needs macOS but no Xcode. CHROMIUM=/path/to/chrome uses a browser you have.
import { readFileSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'resources/icon.svg'), 'utf8')
let chromium
try {
  ({ chromium } = await import('playwright-core'))
} catch {
  console.error('playwright-core is needed: npm i --no-save playwright-core && npx playwright-core install chromium')
  process.exit(1)
}

const work = join(tmpdir(), `booking-icon-${process.pid}`)
mkdirSync(work, { recursive: true })
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
// `crop` renders only the body (no transparent margin): web icons are square
// and the platform rounds them itself.
async function render(out, { crop = false } = {}) {
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`)
  const clip = crop ? { x: 100, y: 100, width: 824, height: 824 } : { x: 0, y: 0, width: 1024, height: 1024 }
  if (crop) await page.evaluate(() => document.querySelector('#body').setAttribute('rx', '0'))
  await page.screenshot({ path: out, omitBackground: true, clip })
}
const full = join(work, 'full.png')
const square = join(work, 'square.png')
await render(full)
await render(square, { crop: true })
await browser.close()

const resize = (src, px, out) => execFileSync('sips', ['-z', String(px), String(px), src, '--out', out], { stdio: 'ignore' })

const iconset = join(work, 'icon.iconset')
mkdirSync(iconset)
for (const size of [16, 32, 128, 256, 512]) {
  resize(full, size, join(iconset, `icon_${size}x${size}.png`))
  resize(full, size * 2, join(iconset, `icon_${size}x${size}@2x.png`))
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(root, 'resources/icon.icns')])

const pub = join(root, 'web/public')
resize(square, 180, join(pub, 'apple-touch-icon.png'))
resize(square, 192, join(pub, 'icon-192.png'))
resize(full, 32, join(pub, 'favicon-32x32.png'))
resize(full, 16, join(pub, 'favicon-16x16.png'))

rmSync(work, { recursive: true, force: true })
console.log('Wrote resources/icon.icns and the web icons in web/public.')
