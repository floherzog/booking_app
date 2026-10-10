# Booking

A Mac app for running music-venue booking outreach. It reads and writes one
semicolon-delimited CSV of venues, works out who is due to be contacted, and
creates personalised drafts in Apple Mail.

It is a port of an internal React web app, rebuilt so it runs on any Mac without
the private repositories, tokens and servers the original depended on.

## Download

**[Download the latest release →](https://github.com/floherzog/booking_app_mac/releases/latest)**

Take `Booking-<version>-arm64.dmg` for Apple Silicon or `Booking-<version>-x64.dmg`
for an Intel Mac. **Before you install it, run this on the downloaded file:**

```sh
xattr -dr com.apple.quarantine ~/Downloads/Booking-<version>-arm64.dmg
```

Then open the DMG and drag Booking into Applications. That one command is worth
the detour: it is what makes the app open *immediately* and without a warning.

> **Why.** Every download is flagged with `com.apple.quarantine`. The first time
> you open a quarantined app, macOS asks Apple whether that exact build has been
> notarised. Booking is ad-hoc signed but **not** notarised, so there is no answer
> to find — and when that lookup cannot complete quickly (a DNS filter, a VPN, a
> school or office network), macOS does not give up fast. It waits. On one Mac
> this took **twenty minutes of bouncing in the Dock**, with no window and a
> beachball, before the app finally opened. Stripping the flag skips the check
> entirely. It happens again on **every update**, because each new build is a new
> app as far as macOS is concerned.
>
> Strip it from the **`.dmg`, before installing** — not from the installed app.
> `xattr` on `/Applications/Booking.app` fails on macOS 14 and later with
> *"Privacy & Security has prevented Terminal from modifying Booking.app"*: an app
> may not modify another installed app, and `sudo` does not help. Quarantine
> propagates from a disk image to whatever you drag out of it, so cleaning the DMG
> is enough.

> **If you would rather not use Terminal**, install normally and approve it by
> hand: double-click Booking, let it be blocked with *"Apple could not verify…"*,
> then open **System Settings → Privacy & Security**, scroll to the bottom and
> press **Open Anyway**. Expect the wait described above the first time.
> (Right-click → Open used to do this in one step, but Apple removed that bypass
> in macOS 15.)

> **Already installed and stuck?** Let it finish opening once — macOS caches the
> verdict, so that build launches instantly from then on. To clean it up without
> re-downloading: in *Finder*, drag `Booking.app` out of Applications onto the
> Desktop, run `xattr -dr com.apple.quarantine ~/Desktop/Booking.app`, and drag it
> back. Finder is allowed to move apps, so nothing blocks it.

Afterwards, **Booking → Check for Updates…** tells you when there is a newer one.

## What an update keeps

Updating means replacing `Booking.app` in Applications. Nothing you own lives
inside the app bundle, so nothing is lost:

- **Your CSV** is wherever you put it. Untouched.
- **`settings.json`** — rules, bands, templates options, mail settings, storage
  choice — lives in `~/Library/Application Support/Booking/` and is read by the
  new version. New settings appear with their defaults; old ones are kept.
- **Templates and their images** live in the same folder.
- **The GitHub token and mail password** stay in the keychain. Because the app is
  ad-hoc signed, each build is a *different* app as far as the keychain is
  concerned, so macOS may ask once after an update whether Booking may use them —
  answer **Always Allow**. (A Developer ID signature would remove that prompt.)

## What it does

- **Classifies every venue** — Send, Follow-up due, Waiting, Recently played,
  On hold, Festival (not now), Missing info, Dead — from the dates and notes in
  your CSV, and picks the next batch to contact.
- **Every rule is editable.** The thresholds that decide all of the above are
  yours to change, and the app re-classifies as you change them — the **Logic**
  button both draws the decision tree and lets you edit the numbers behind it.
- **Email templates per band and language**, with light rich text, inline
  images, and `{{placeholders}}` filled in per venue.
- **German articles worked out for you.** Write `in {{article}} {{venue}}` and it
  becomes “in der Kulturfabrik” but “im Kulturzentrum”. See below.
- **Drafts straight into Apple Mail**, one venue at a time or in bulk — or send
  for real over SMTP, now or at a scheduled time, with the `Auto` column
  deciding per venue.
- **Keeps `Last emailed` and the reply status honest** by reading the mail
  account itself, and always as edits you approve.
- **Map view** of your venues, with offline-seeded coordinates.

## Building it yourself

Requires Node 20+ and macOS.

```sh
npm install
npm run dev      # run the app with hot reload
npm run test     # unit tests
npm run build    # compile main, preload and renderer into out/
npm run dist     # build ad-hoc signed .dmg (arm64 + Intel) and .zip
                 # into ~/Builds/booking_app_mac (outside iCloud — see below)
```

Other scripts:

```sh
npm run clean:build   # delete the built .dmg/.zip once a release is published
npm run check:drift   # diff src/core against the original web app (informational)
npm run verify:csv    # prove the CSV format is still byte-compatible with it
npm run bench:core    # time the load pipeline at 250 / 1000 / 3000 venues
npm run build:helper  # compile just the Swift on-device-model helper
```

`npm run build` compiles a small Swift executable (`resources/helpers/`) that
reaches Apple's on-device model — see *German articles* below. It needs the Xcode
Command Line Tools; without them the build still succeeds and the feature simply
reports itself unavailable.

On first launch the app asks where your venue list lives.

## Where your data lives

The CSV is the only file that matters — it is the interchange format, and it
stays byte-compatible with the original web app and the booking scripts:
semicolon-delimited, one header row, `\n` line endings, 22 fixed columns.

Everything else sits in `~/Library/Application Support/Booking/`:

| File | What it holds |
| --- | --- |
| `settings.json` | storage choice, rules, bands, languages, mail settings, draft log |
| `secrets.json` | GitHub token and mail password, encrypted (see below) |
| `schedule.json` | scheduled bulk runs, with their rendered messages |
| `geo_cache.json` | city → coordinates, seeded from the bundled snapshot |
| `article_cache.json` | venue name → German grammatical gender, plus your corrections |
| `secrets.json` (keychain-encrypted) | one mail password per account, plus the GitHub token |
| `templates/` | `templates.json` plus `assets/` for inline images |

### Storage adapters

**Local CSV file** (default) — pick any file with the native picker. Put it in
iCloud Drive to have it on all your Macs.

> Importing a CSV only fills the table; the file you imported is not
> automatically the file the app saves to. When you import as *Replace the
> table*, tick **"Use this file as my CSV from now on"** to point Storage at it —
> then Save writes back to that file and the app reloads from it next time.

> **iCloud Drive caveat.** Do not edit the same file in two places at once.
> The app records the file's modification time when it loads and refuses to save
> over a file that changed underneath, offering an explicit *Overwrite anyway* —
> but it cannot merge. If iCloud has not finished downloading the file, open it
> in Finder once first.

**GitHub** (optional) — point the app at a repository and path, and give it a
personal access token with `repo` scope. Useful if you also run the web app or
the batch scripts against the same list. The token is stored in your keychain,
never in `settings.json`, and never bundled into the app.

### Multi-band mode

For booking several bands at the same venue. Turn it on in **Settings ▸ General
▸ Multi-band mode** (local CSV only). The CSV is split into one file per band
plus one for venues without a band, all in the same folder:

```
booking-Band A.csv
booking-Band B.csv
booking-unassigned.csv
booking.before-multiband-2026-10-01.csv   ← the original, renamed, no longer used
```

The app still shows one list. A venue booked for several bands is one row, with
a line per band in the band-specific columns; the venue dialog has a tab per
band and **+ Add band…**.

- **Shared across bands:** Venue, Type, City, Country, Contact, Email, Website,
  Time Frame. Editing these on one band edits them on all of them.
- **Per band:** everything else (dates, reply status, notes, outreach text,
  Auto-draft/Auto-send, email counts).
- **Same venue:** same name and city in different band files. Renaming a venue
  in only one file outside the app splits it into two venues. The duplicate
  detector then flags them, and Merge joins them again.
- **Stats chips** count band entries: a venue whose two bands are both due
  counts twice, because that is two emails.
- **Mail sync** matches each band to its own mail account. Bands sharing one
  account are told apart by the band's name in the subject, so put `{{band}}`
  in your subjects. A message that names no band counts for all of them.

**Band files on another Mac, or starting over.** The list of band files lives
in this Mac's settings, so another Mac has to be shown the set once. All of
these are labelled *Multi-band mode* and switch it on if it is off, after
showing what they will do:

- **Open band files…** (start screen, or Settings ▸ Data & storage): pick any one
  file of an existing set. The rest of the set is found in its folder, and each
  file's band is read from its `Band` column, so band names may contain dashes.
- **Import band files…** (Data & storage): add the venues of several band files
  to your list, each to its own band, staged until Save. If the mode is off,
  your current CSV is split first. Files without the app's columns go through
  **Import CSV…** instead.
- **New set of band files…** (Data & storage): empty band files, one per band,
  in a folder and under a name you pick. The current files are not touched.
- Switching the mode on while band files already sit in the folder offers to
  use those instead.

Switching it off merges everything back into one CSV, with one line per band
for a venue that has several. The band files are moved into a
`booking-bands-backup-<date>/` folder. Nothing is ever overwritten in either
direction.

> The booking scripts and the web app only know the single CSV. They don't see
> changes made while this mode is on.

### Secrets

The GitHub token and the mail password are encrypted with Electron's
`safeStorage`, which is backed by the macOS keychain. The renderer never
receives a secret value — only whether one is set. Everything that uses a secret
runs in the main process.

> **Bundle identity caveat.** `safeStorage` keys off the app's identity, so a
> build with a different `appId` (or a differently signed build) cannot decrypt
> secrets written by the previous one. They read as "not set" and have to be
> entered again. Nothing else is lost.

## Rules

**Settings → Rules.** The defaults reproduce the original web app exactly, so a
fresh install classifies identically.

| Rule | Default | Effect |
| --- | --- | --- |
| Default re-contact window | 30 days | Used when a venue has no Frequency of its own |
| Recently played | 365 days | A gig this recent (or upcoming) removes a venue from outreach |
| Hold expires after | 365 days | A hold keyword stops blocking once you last emailed this long ago |
| Festival: too soon if within | 3 months | A festival is bookable only further out than this… |
| Festival: still fresh for | 2 months | …or already further past than this |
| Next batch size | 10 | How many action-needed venues the batch picks |
| Next batch sorted by | Country → City → Venue | Up to three columns, applied in order |
| Hold keywords | 35 German/English phrases | A Note containing one puts the venue On Hold |

"Advanced: date colours" holds the ten thresholds behind the coloured relative
dates in the table. They change how dates are *tinted*, never who gets picked.

The ⓘ **Logic** modal draws the actual decision tree with your current numbers
in it, so it can never fall out of step with the code.

## What the row colours mean

The **status badge** says what to do next. The **row tint** says something
different and independent: how this venue has responded so far. Worst to best,
red → orange → yellow → green.

| Tint | Means | When |
| --- | --- | --- |
| 🔴 red | **Never replied** | Emailed at least once, no answer of any kind |
| 🟠 orange | **Auto-reply only** | Only an out-of-office or autoresponder came back |
| 🟡 yellow | **Replied** | Someone actually wrote back |
| 🟢 green | **Gig booked** | `Last played` is a future date — beats everything else |
| — none | **Not contacted** | Nothing has gone out yet |

Two things worth knowing:

- **It is not a measure of time or volume.** One unanswered email is already red;
  there is no "overdue" threshold. It keys off `Total emails`, not `Last emailed`.
- **A booked gig overrides everything**, so a date agreed by phone does not sit
  there looking ignored.

The same colours appear as the dot in the Reply column, as the badge in the venue
detail header (with the wording above, so the colour is never a guess), and in
"Reply health" in the advanced filter and sort.

A **red left border** is a different signal — that is the *Follow Up* status. And
a row with unsaved edits is tinted amber, which replaces the health tint until you
press Save.

## Email templates

**Settings → Templates.** One template per **band × language**.

A venue's **Country** picks the language through the map in *Settings →
Languages* (seeded with the German-speaking countries under both their English
and German names). Anything unlisted falls back to the default language. If a
band has no template in the resolved language, the app falls back to the default
language and tells you it did.

Placeholders — `{{venue}}`, `{{contact}}`, `{{city}}`, `{{country}}`,
`{{dates}}`, `{{text}}`, `{{band}}` — work in the subject and the body. A field
that is empty for a venue becomes nothing at all, and the app warns you before
you create the draft. Substitution runs on the document structure, not the
rendered text, so a placeholder still works when part of it is bold.

Bodies support bold, italic, underline, lists, links, inline images, and a
"video link" block — a thumbnail wrapped in a link, because no mail client will
play an embedded video.

## German articles

German needs a different word in front of the same venue depending on two things,
and only one of them is about the venue:

- **Gender** — *die* Fabrik, *das* Kulturzentrum, *der* Jazzkeller. A property of
  the name.
- **Case** — decided by the words *around* it. “in **der** Fabrik”, but “für
  **die** Fabrik”, and “wegen **der** Fabrik”. Same venue, same gender.

So write `{{article}}` where the article belongs and let the app do both:

| Template | Result |
| --- | --- |
| `Wir spielen in {{article}} {{venue}}` | Wir spielen **in der** Kulturfabrik |
| `Wir spielen in {{article}} {{venue}}` | Wir spielen **im** Kulturzentrum |
| `ein Konzert für {{article}} {{venue}}` | ein Konzert **für den** Hof |
| `Wir kommen gerne in {{article}} {{venue}}` | Wir kommen gerne **ins** Kulturzentrum |

Note the last two rows. The preposition sets the case, and `in dem` contracts to
`im` on its own — a verb of motion a few words earlier is what flips “im” to
“ins”. That half is ordinary rules, in `src/core/germanArticles.js`, and covered
by tests.

The gender is the part that needs judgement, and it comes from **Apple's
on-device model** (macOS 26+, Apple Silicon, Apple Intelligence switched on).
Nothing leaves your Mac, there is no API key, and each venue is only ever asked
about once — the answer is cached in `article_cache.json` forever. Genders are
fetched for the venues in the run you are about to send, never for the whole
table.

If Apple Intelligence is off or unavailable, drafting still works: `{{article}}`
is left out and flagged as missing, the same way an empty `{{contact}}` is.
Settings ▸ Mail templates shows the live status and how to turn it on.

## Mail accounts

One entry per mailbox you send from, in **Settings ▸ Mail settings**. Each has its
own IMAP and SMTP servers, its own username, its own password in the keychain, and
its own Drafts and Sent folders — so they can be entirely separate accounts at
different providers, not just aliases.

Bands pick one in **Settings ▸ Bands** ("Sends as"). The picker only appears once
there is more than one account, and any band that does not name one uses the
first. A venue's mail goes out from its band's account: the From address, the
Drafts folder it lands in, and the Sent folder the copy is filed to all follow.

Removing an account unassigns the bands pointing at it and deletes its keychain
entry.

**Your existing setup is migrated automatically.** The single mailbox the app used
to have becomes the first account, keeping its password exactly where it was — no
re-entering, and no fresh keychain prompt for an account that has not changed.

### Sending, and why it fails

Receiving and sending are different servers, and only receiving was ever testable
before. Each account now has both:

- **Test receiving (IMAP)** — connects and lists your mailboxes, filling in the
  Drafts folder if it is blank.
- **Test sending (SMTP)** — proves sending works **without sending anything**.

Leave the SMTP server blank and it is worked out from the IMAP one
(`imap.gmail.com` → `smtp.gmail.com`). The port picker is explicit about what each
one means, because getting that pair wrong is the single most common failure:

| Port | Encryption |
| --- | --- |
| 587 | STARTTLS — starts plain, upgrades |
| 465 | TLS — encrypted from the first byte |

> **"Connected, but the mail server never said hello."** The port and its
> encryption do not match: the server is waiting for a TLS handshake that never
> came, or the reverse. Try the other port. Earlier versions showed this as the
> raw *"Greeting never received"*, and could hang for minutes rather than failing;
> both are fixed.

## Keeping the date columns honest

Two columns describe things that happened in your mail account, so the app can
read them from there. **Settings ▸ Mail settings**:

- **`Last emailed`** — either stamped with today's date whenever you draft or
  send (no server access, but blind to anything you sent from Mail itself), or
  read from your **Sent** mailbox over IMAP, which catches everything.
- **Reply status** — read from your inbox over IMAP, telling a real answer apart
  from an out-of-office auto-responder (`Auto-Submitted`, `Precedence`, and the
  usual subject lines).

A sync **never writes to your CSV**. It stages the dates as pending edits, just
like typing them in, and you press Save. Dates already in the CSV are only ever
moved forward, never back, so a hand-typed date is never lost to a short scan
window. Only envelopes are fetched — never message bodies. It runs from the ↻
button, and optionally once when the app opens.

**Every account is scanned and the results merged.** A band's mail goes out from
its own mailbox and a venue replies to whichever address wrote to it, so looking
at only one account would miss both halves. An account that cannot be reached is
reported without sinking the sync — the others still produce their edits.

## Apple Mail drafts

Drafts land in your Drafts mailbox, and creating a draft never touches a venue's
`Last emailed` — a draft is not a sent email. Sending is a separate, explicit
choice; see *Sending, and scheduling a run* below.

### IMAP (recommended)

Exact formatting, no permission prompts, and it works in bulk.

1. **Create an app-specific password.** iCloud rejects your normal Apple ID
   password for IMAP. Go to <https://appleid.apple.com> → *Sign-In and Security*
   → *App-Specific Passwords* → generate one.
2. **Settings → Mail**:
   - Server `imap.mail.me.com`, port `993` (prefilled).
   - Username: your **full** iCloud address, e.g. `you@icloud.com`.
   - Paste the app-specific password (it goes to the keychain).
   - From name and address.
3. **Test connection.** The app lists your mailboxes and preselects the one your
   server marks as Drafts — which is how a German account's `Entwürfe` is found
   without guessing at names.
4. Save.

Then use **Draft in Mail** on any venue, or **✉ Drafts** in the toolbar for a
bulk run: pick a source (next batch, follow-ups due, Draft-flagged, or exactly
what your filters are showing), review the preflight list, and let it work
through them one at a time.

Drafts can take a few seconds to sync into Mail.app.

### Sending, and scheduling a run

The bulk window can also send. Three modes:

| Mode | What happens |
| --- | --- |
| **Drafts only** | The default. Everything lands in Drafts; `Last emailed` untouched. |
| **Auto column decides** | Venues with `Auto` = TRUE are sent, every other venue is drafted. |
| **Send now** | Every selected venue is emailed. |

Sending goes out over SMTP (**Settings → Mail** → SMTP server, prefilled
`smtp.mail.me.com:587`) using the same account and app-specific password as IMAP,
and files a copy in your Sent mailbox. The message is byte-for-byte the one the
draft would have been — the same MIME is built once and either APPENDed or sent.
A run that includes sends needs a second click on the red confirm button, and a
sent venue gets an **unsaved `Last emailed` edit** that reaches the CSV when you
press Save, like every other change.

**At a time…** schedules the run instead, and it can repeat — **every day** or
**every week** at that time. A repeating run re-picks its venues every time it
fires (today's next batch, today's follow-ups), so it stores the *source* rather
than a fixed list; "Current view" is therefore not offered for one, since a set
of filters cannot be reproduced next week. Repeating runs are executed by the
app window itself, which is also what keeps a `Last emailed` edit staged for you
to review before Save.

A one-off **At a time…** run works the other way round: every message is rendered
when you schedule it, so a template edit afterwards cannot change what goes out.
Either way the queue is stored in `schedule.json`, and pending runs are listed in
the same window and can be cancelled there.

> A scheduled run only fires **while Booking is running**. One whose time passed
> while the app was closed runs at the next launch rather than being skipped —
> this is an in-app scheduler, not a background agent. A daily run missed for a
> week fires once, then continues from the next slot; a run interrupted by
> quitting the app is never replayed.

A single venue can also be sent from the **⋯** menu next to *Draft in Mail*.

### AppleScript fallback

For a single draft with no server setup at all: the **⋯** menu next to *Draft in
Mail* → *Open in Mail.app instead*. It puts the styled message on the clipboard,
opens a compose window and pastes.

macOS will ask for two permissions the first time. If you decline, or the prompt
never appears:

- *System Settings → Privacy & Security → Automation* → enable **Mail** and
  **System Events** for Booking.
- *System Settings → Privacy & Security → Accessibility* → add Booking.
- Quit and reopen Booking.

Because it drives Mail's window by keystroke, it is offered for one draft only.
If the body text lands in the subject field, your compose window has a different
tab order — adjust `TABS_TO_BODY` in `src/main/jxa/createMailDraft.js`.

## Installing a shared build

`npm run dist` produces three files in **`~/Builds/booking_app_mac/`**. They are
built outside the repo on purpose: this project lives in iCloud Drive, and the
extended attributes iCloud stamps on every synced directory make `codesign`
refuse to sign the bundle at all.

| File | For |
| --- | --- |
| `Booking-<version>-arm64.dmg` | Apple Silicon — **hand people this one** |
| `Booking-<version>-x64.dmg` | Intel |
| `Booking-<version>-arm64.zip` | Apple Silicon, if a zip is easier to send |

The app is **ad-hoc signed and not notarised**, so the first launch on someone
else's Mac needs one deliberate override. `spctl -a` reporting *rejected* is the
expected state for such a build, not a fault:

- **macOS 15 (Sequoia) and later** — the only supported path: double-click, let
  it be blocked by *"Apple could not verify …"*, then go to *System Settings →
  Privacy & Security*, scroll to the bottom, and press **Open Anyway**.
- **macOS 14 and earlier:** right-click → Open, then *Open* in the dialog.
  Apple removed this bypass in macOS 15, so do not tell a Sequoia user to do it.
- To avoid the prompt altogether, clear the quarantine flag the download added:

  ```sh
  xattr -cr /Applications/Booking.app
  ```

Only **notarisation** removes the warning for everyone without these steps, and
that needs a paid Apple Developer Program membership — see below.

Prefer the DMG when sending a build: a DMG carries one quarantine flag on the
image, whereas an extracted zip flags every file inside it.

> **Why ad-hoc signing is not optional.** An app with *no* signature at all is
> reported by modern macOS as **"file is damaged and can't be opened"** as soon
> as it carries a quarantine flag from a download, with no override offered —
> which is exactly what a shared build used to do. `scripts/adhoc-sign.cjs`
> (an electron-builder `afterPack` hook) applies a `codesign --sign -` signature
> before the dmg/zip is built, which restores the ordinary "unidentified
> developer → Open Anyway" flow. Only notarisation removes the prompt entirely.
> The build fails rather than shipping an app that fails `codesign --verify`.

### Signing and notarising

For a build with no warning at all you need an Apple Developer Program
membership. Set these and run `npm run dist:signed`; the ad-hoc hook stands
aside and electron-builder signs and notarises properly:

```sh
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=...
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=....-....-....-....
export APPLE_TEAM_ID=XXXXXXXXXX
npm run dist:signed
```

Remember that changing the signing identity invalidates stored secrets (see
above) — the first launch afterwards asks for the GitHub token and mail password
again.

## Shipping an update

The app has no auto-updater; **Booking → Check for Updates…** compares the
running version against the latest GitHub release and, if there is a newer one,
opens the download page. See [docs/RELEASING.md](docs/RELEASING.md) for the
steps that publish one.

## Verifying by hand

- [docs/VERIFY.md](docs/VERIFY.md) — the general checklist: data, rules, map,
  templates, packaging.
- [docs/VERIFY-MAIL.md](docs/VERIFY-MAIL.md) — mail drafts, which need a real
  account and macOS permissions.

## How the code is arranged

```
src/
├── core/      pure JS domain logic — no DOM, no Electron, no localStorage
├── main/      Electron main process: settings, secrets, files, GitHub,
│              geocoding, templates, MIME, IMAP, AppleScript
├── preload/   the contextBridge — the renderer never sees ipcRenderer
└── renderer/  React UI
```

`src/core` is the single implementation of the domain: classification, the
rules, the next batch, the CSV contract, template resolution, email rendering.
It has no platform imports and is covered by unit tests.

Anything privileged runs in main and is reached over a fixed list of IPC
channels. Secrets never cross that bridge; geocoding lives there because
Nominatim requires a `User-Agent` header the renderer is not allowed to set.

### Notes for whoever builds this next

- `productName` in `package.json` is what Electron uses for `app.getName()`,
  and therefore for the `Application Support/Booking/` directory. It is not
  redundant with the one in `electron-builder.yml` — remove it and the app
  silently starts storing its data under `booking_app_mac`.
- `resources/icon.icns` was generated from the web app's 192px PNG with
  `sips` + `iconutil`, so the larger sizes are upscaled. Replace it with a
  proper 1024px source when there is one.
- Only `date-fns`, `papaparse`, `imapflow` and `nodemailer` are runtime
  `dependencies` — everything the renderer uses is bundled by Vite, and
  listing it as a dependency would only copy it into the .app for nothing.

### Where this is heading

`src/core` is intended to become a package shared with the original web app,
which would then move into this repository as a second build target: a small
Vite web entry consuming the same `src/core`, swapping the Electron IPC adapters
for the browser ones. The layout — core / main / renderer, a `@core` alias, no
cross-imports — was chosen to make that merge mechanical.

Until then the two are separate copies, so `npm run check:drift` diffs them and
labels the divergences we introduced on purpose (the rules refactor, the removed
server sync) so a genuine one stands out. `npm run verify:csv` round-trips a
fixture through both implementations to prove the file format has not moved.
