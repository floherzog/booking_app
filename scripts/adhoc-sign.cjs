// electron-builder afterPack hook.
//
// `npm run dist` sets CSC_IDENTITY_AUTO_DISCOVERY=false, so electron-builder
// leaves the .app with no signature at all. macOS treats a completely unsigned
// app that carries a com.apple.quarantine flag (which every download gets) as
// *damaged* and refuses to open it, with no override in the UI — which is
// exactly the error a shared build produced. An ad-hoc signature ("-") is enough
// for Gatekeeper to fall back to the normal "unidentified developer" prompt that
// the recipient can allow.
//
// With the self-signed certificate from `npm run signing:setup` the signature
// is made with that instead: the same identity on every build, so the
// keychain's "Always Allow" for the mail passwords ("Booking Safe Storage")
// holds across updates. Gatekeeper sees no difference. Without it, ad-hoc as
// before — and macOS asks for the keychain again after every update.
//
// This is not a substitute for notarization: `npm run dist:signed` still does
// the real thing, and this hook stands aside for it.
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')
const { existsSync, readFileSync } = require('node:fs')
const { homedir } = require('node:os')

const SIGN_DIR = process.env.BOOKING_SIGN_DIR || join(homedir(), '.booking-signing')
const KEYCHAIN = join(SIGN_DIR, 'signing.keychain-db')
const PASSWORD_FILE = join(SIGN_DIR, 'password')
const IDENTITY = 'Booking self-signed (floherzog)'

// → ['--sign', <hash>, '--keychain', <path>] for the stable identity, or the
// ad-hoc ['--sign', '-'] when it isn't set up.
function signingArgs() {
  if (!existsSync(KEYCHAIN) || !existsSync(PASSWORD_FILE)) {
    console.warn('  • adhoc-sign      no ~/.booking-signing (npm run signing:setup): ad-hoc, so the keychain will ask again after this update')
    return { args: ['--sign', '-'], label: 'ad-hoc signature' }
  }
  const password = readFileSync(PASSWORD_FILE, 'utf8').trim()
  execFileSync('security', ['unlock-keychain', '-p', password, KEYCHAIN])
  const found = execFileSync('security', ['find-identity', '-p', 'codesigning', KEYCHAIN]).toString()
  const hash = found.split('\n').find(l => l.includes(`"${IDENTITY}"`))?.match(/\b([0-9A-F]{40})\b/)?.[1]
  if (!hash) throw new Error(`adhoc-sign: "${IDENTITY}" is not in ${KEYCHAIN}`)
  return { args: ['--sign', hash, '--keychain', KEYCHAIN], label: `signature by "${IDENTITY}"` }
}

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  // dist:signed → electron-builder signs properly right after this hook; adding
  // an ad-hoc signature first would only be thrown away.
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY !== 'false' || process.env.CSC_LINK) {
    console.log('  • adhoc-sign      skipped (a real signing identity is in play)')
    return
  }

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  if (!existsSync(appPath)) throw new Error(`adhoc-sign: no app at ${appPath}`)

  const entitlements = join(__dirname, '..', 'resources', 'entitlements.mac.plist')

  // This repo lives in iCloud Drive, which decorates files with extended
  // attributes. codesign refuses to sign a bundle carrying them
  // ("resource fork, Finder information, or similar detritus not allowed"), so
  // strip them first.
  execFileSync('xattr', ['-cr', appPath], { stdio: 'inherit' })

  const signing = signingArgs()
  execFileSync('codesign', [
    '--force',
    '--deep',
    ...signing.args,
    // Keep the hardened runtime and the Apple Events entitlement the Mail
    // automation fallback needs; without these the prompt never appears.
    '--options', 'runtime',
    '--entitlements', entitlements,
    '--timestamp=none',        // no timestamp server for these signatures
    appPath,
  ], { stdio: 'inherit' })

  // Fail the build rather than ship something that will be called damaged.
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  console.log(`  • adhoc-sign      ${signing.label} applied to ${appPath}`)
}
