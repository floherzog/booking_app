# Releasing

The app does not update itself. **Booking → Check for Updates…** asks GitHub for
the latest release of `floherzog/booking_app`, compares its tag with the
running version, and offers to open the download page. So "shipping an update"
means: bump the version, build, and publish a GitHub release whose tag is that
version.

The repo is public, so the update check needs no token.

The repo was called `booking_app_mac` until 0.7.1, and copies up to that version
still ask for that name; GitHub redirects them. **Never create a new repository
named `booking_app_mac`** — it would replace the redirect, and those copies
would stop finding updates.

**Which commits need a release.** This repository also builds the web app, which
deploys itself on push (docs/WEB.md). A commit needs a Mac release when it
changes what the Mac app ships: `src/core`, `src/main`, `src/preload`,
`src/renderer` (except `src/renderer/src/platform/web.js`), `resources/`,
`package.json` or the build config. A commit that only touches the web side —
`web/`, `platform/web.js`, `vite.web.config.mjs`, `.github/workflows/`,
`scripts/update-geo-cache.mjs`, docs — goes out with the web deploy alone.

## 1. Commit and push

Everything the release contains has to be on `main` first:

```sh
git status --short          # clean
git push
```

## 2. Bump the version

`package.json` → `"version"`. The tag you publish must match it, or the update
check will compare the wrong things. Nothing else needs touching:
`app.getVersion()` reads this field, and `electron-builder.yml`'s
`artifactName` interpolates it.

```sh
git commit -am "Release 0.2.0"
```

## 3. Build

```sh
npm test && npm run build && npm run dist
```

`npm run build` also compiles `resources/helpers/article-helper` with `swiftc`
(the on-device model that resolves German noun gender). If the Xcode Command Line
Tools are missing it prints a warning and carries on — but then the release ships
**without** the helper and the German-article feature reports itself unavailable
on every Mac. Check the build log says `article-helper built (universal)` before
publishing.

The artifacts are temporary: step 7 deletes them once the release is up.

Artifacts land **outside the repo**, in `~/Builds/booking_app_mac/` — this repo
lives in iCloud Drive, whose extended attributes make `codesign` refuse to sign
the bundle (see the comment in `electron-builder.yml`). The rest of this file
assumes:

```sh
export BUILD=~/Builds/booking_app_mac
```

This produces, in `$BUILD`:

- `Booking-0.2.0-arm64.dmg` — Apple Silicon
- `Booking-0.2.0-x64.dmg` — Intel
- `Booking-0.2.0-arm64.zip`

## 4. Check the signature before anyone else does

This is the step that prevents the "file is damaged" report. A build with no
signature at all is rejected outright by macOS once it carries a quarantine
flag; `scripts/adhoc-sign.cjs` prevents that, and this verifies it worked.

```sh
codesign -dv --verbose=4 "$BUILD/mac-arm64/Booking.app" 2>&1 | grep Signature
#   expect: Signature=adhoc

codesign --verify --deep --strict "$BUILD/mac-arm64/Booking.app"
#   expect: no output

spctl -a -vv "$BUILD/mac-arm64/Booking.app"
#   expect: "rejected (the code is valid but does not seem to be an app)" or
#   "source=no usable signature" — an unnotarised app is *supposed* to fail this.
```

Then simulate the hand-off locally, which is the only way to see what the
recipient sees without involving a second Mac:

```sh
rm -rf /tmp/Booking.app
cp -R "$BUILD/mac-arm64/Booking.app" /tmp/Booking.app
xattr -w com.apple.quarantine "0081;00000000;Safari;" /tmp/Booking.app
open /tmp/Booking.app
```

It must **not** say "damaged". The expected result is the "Apple could not
verify…" dialog, which *System Settings → Privacy & Security → Open Anyway*
gets past. (Right-click → Open no longer works: Apple removed that bypass in
macOS 15.)

## 5. Publish

```sh
git tag v0.2.0 && git push --tags

gh release create v0.2.0 \
  "$BUILD"/Booking-0.2.0-arm64.dmg \
  "$BUILD"/Booking-0.2.0-x64.dmg \
  "$BUILD"/Booking-0.2.0-arm64.zip \
  --title "Booking 0.2.0" \
  --notes "$(cat <<'EOF'
What changed…

**Installing.** Download the arm64 .dmg (Apple Silicon) or the x64 .dmg (Intel).
Before installing, run this on the downloaded file:

    xattr -dr com.apple.quarantine ~/Downloads/Booking-<version>-arm64.dmg

Then open the DMG and drag Booking into Applications, replacing the old copy.

That command matters. Booking is ad-hoc signed but not notarised, so the first
launch of a quarantined copy makes macOS ask Apple about a notarisation ticket
that does not exist — and when that lookup cannot complete quickly, macOS waits
rather than failing fast. That has meant **twenty minutes of bouncing in the Dock**
on one machine. Stripping the flag skips the check. It applies to every update,
because each build is a new app to macOS.

Strip it from the **.dmg, before installing** — running `xattr` on an app already
in /Applications fails on macOS 14+ ("Privacy & Security has prevented Terminal
from modifying Booking.app"), and `sudo` does not help.

Without Terminal: install normally, double-click, let it be blocked by "Apple
could not verify…", then *System Settings → Privacy & Security* → **Open Anyway**,
and expect the wait. (Right-click → Open stopped working in macOS 15.)
EOF
)"
```

## 6. Confirm the update path

From the *previously installed* copy of the app, use **Check for Updates…**. It
should report the new version and open the release page.

## 7. Clean up the build directory — always

Each build is ~340 MB across the three artifacts plus the unpacked apps, and once
the release is published GitHub holds the copy that matters (the app downloads
from there). So the last step of every release is:

```sh
npm run clean:build          # add --dry-run first if you want to see the list
```

`scripts/clean-build.mjs` only removes entries in `~/Builds/booking_app_mac/`
whose names match what electron-builder writes — `Booking-<version>-<arch>.dmg`
/`.zip`/`.blockmap`, the `mac*` unpacked directories, `builder-debug.yml`,
`latest-mac.yml`, `.icon-*`. Anything else is listed as *left alone* and never
touched, and the directory itself is removed only when it ends up empty.

Do not run it before `gh release create` has finished uploading.
