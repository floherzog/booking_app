// One-time: a self-signed code-signing certificate for `npm run dist`.
//
// Why: Electron keeps the key that encrypts the mail passwords in the login
// keychain ("Booking Safe Storage"), and the keychain lets in whichever app
// matches the signature that was allowed. An ad-hoc signature is a hash of
// the build itself, so every update was a stranger and macOS asked again. A
// signature made with the same certificate every time reads "this app id,
// signed with this certificate", the same for every update: allowed once
// ("Always Allow"), it stays allowed.
//
// It changes nothing for Gatekeeper (still an unidentified developer; the
// xattr step in the release notes stays) and isn't notarization.
//
// The certificate and its key live in a keychain of their own under
// ~/.booking-signing, outside the repo and iCloud, unlocked with the password
// stored next to it. Keep that folder: a new certificate means one more
// prompt after the next update. Run again, it does nothing.
//
//   npm run signing:setup
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'

export const SIGN_DIR = process.env.BOOKING_SIGN_DIR || join(homedir(), '.booking-signing')
export const KEYCHAIN = join(SIGN_DIR, 'signing.keychain-db')
export const PASSWORD_FILE = join(SIGN_DIR, 'password')
export const IDENTITY = 'Booking self-signed (floherzog)'

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString()

if (existsSync(KEYCHAIN) && existsSync(PASSWORD_FILE)) {
  console.log(`Already set up: ${KEYCHAIN}`)
  process.exit(0)
}

mkdirSync(SIGN_DIR, { recursive: true, mode: 0o700 })
const password = randomBytes(24).toString('hex')
const work = join(tmpdir(), `booking-signing-${process.pid}`)
mkdirSync(work, { recursive: true, mode: 0o700 })
try {
  writeFileSync(join(work, 'cert.cnf'), [
    '[req]', 'distinguished_name=dn', 'x509_extensions=ext', 'prompt=no',
    '[dn]', `CN=${IDENTITY}`,
    '[ext]', 'basicConstraints=critical,CA:false', 'keyUsage=critical,digitalSignature', 'extendedKeyUsage=critical,codeSigning',
  ].join('\n'))
  // 30 years: the certificate must outlive every update.
  run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '10950',
    '-keyout', join(work, 'key.pem'), '-out', join(work, 'cert.pem'), '-config', join(work, 'cert.cnf')])
  // -legacy: the Mac's `security` reads only the older PKCS#12 encryption.
  const p12 = ['pkcs12', '-export', '-inkey', join(work, 'key.pem'), '-in', join(work, 'cert.pem'), '-out', join(work, 'id.p12'), '-passout', `pass:${password}`]
  try { run('openssl', [...p12, '-legacy']) } catch { run('openssl', p12) }

  run('security', ['create-keychain', '-p', password, KEYCHAIN])
  // No auto-lock in the middle of a build.
  run('security', ['set-keychain-settings', KEYCHAIN])
  run('security', ['unlock-keychain', '-p', password, KEYCHAIN])
  run('security', ['import', join(work, 'id.p12'), '-k', KEYCHAIN, '-P', password, '-T', '/usr/bin/codesign'])
  // Lets codesign use the key without a dialog.
  run('security', ['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', password, KEYCHAIN])
  writeFileSync(PASSWORD_FILE, password, { mode: 0o600 })
  chmodSync(PASSWORD_FILE, 0o600)
} finally {
  rmSync(work, { recursive: true, force: true })
}
console.log(`Signing certificate "${IDENTITY}" created in ${KEYCHAIN}`)
console.log(run('security', ['find-identity', '-p', 'codesigning', KEYCHAIN]))
