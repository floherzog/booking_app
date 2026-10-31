# Manual verification checklist

`npm run test` covers the domain logic (classification, rules, CSV, templates,
email HTML, MIME, draft preparation). This file covers everything that needs a
real file, a real account, a window, or macOS permissions.

Mail drafts have their own, longer checklist: **[VERIFY-MAIL.md](VERIFY-MAIL.md)**.

## Data

- [ ] **First run** — with no settings yet, the app opens the storage picker.
      *Choose CSV…* accepts an existing file; *Create a new one…* writes a file
      containing only the 22 column headers.
- [ ] **Real CSV via iCloud Drive** — point the app at a copy of the real list.
      Venue count matches. For the same date, the status badges match what the
      web app shows for the same venues.
- [ ] **Edit → Save → inspect** — change a few fields, press Save, confirm the
      diff table lists exactly those changes, then open the file in a text
      editor: still semicolon-delimited, same header row, no `_`-prefixed
      columns, `\n` line endings, umlauts intact.
- [ ] **Reload** — press ↻; the edits are still there, read back from the file.
- [ ] **Conflict guard** — with the app open, edit the CSV in another editor and
      save it. Then make an edit in the app and press Save: it should refuse
      with "the file changed on disk" and offer *Overwrite anyway*.
- [ ] **GitHub adapter** — Settings ▸ Data & storage ▸ GitHub, on a throwaway repo with
      a test CSV and a token. Load, edit, Save, then confirm the commit landed
      with the right content. Restart: the token is still stored (keychain) and
      no token appears anywhere in `settings.json`.
- [ ] **Export** — Settings ▸ Data & storage ▸ Export CSV writes a copy to the chosen
      location, byte-identical in format to the source.
- [ ] **Import wizard** — feed it a **comma**-delimited CSV with differently
      named headers. The wizard should auto-map most columns via its aliases;
      fix the rest by hand, import as *add*, and confirm the new rows appear as
      unsaved additions that only reach the file on Save.

## Rules

- [ ] Settings ▸ Rules ▸ set **Next batch size** to 3. The Next-batch chip count
      drops to 3 immediately, without a reload.
- [ ] Add a hold keyword that appears in one venue's Note. That venue flips to
      **On Hold**, and the keyword shows up in the ⓘ Logic modal's keyword list.
- [ ] Enter something invalid (batch size 0). Save is blocked, the Rules entry
      in the sidebar gets a red dot, and the reason is shown inline.
- [ ] *Reset rules to defaults* restores the original values and only those —
      bands, storage and languages are untouched.
- [ ] Relaunch: the customised rules are still in effect.

## Map and geocoding

- [ ] Switch to Map view: pins appear immediately from the bundled seed cache,
      with no network delay.
- [ ] Add a venue in a city not in the cache. Its pin appears within a second or
      two, and after relaunching the app it appears instantly (it was cached).

## Appearance

- [ ] Settings ▸ General ▸ Light / Dark / System. The whole window follows,
      including the table, modals and the map controls.
- [ ] The theme survives a relaunch, and is not written into `settings.json`
      (it is deliberately a per-Mac preference).

## Templates

- [ ] Settings ▸ Mail templates ▸ *Manage email templates…* → create a `de` and an
      `en` template for one band, each with `{{venue}}` in the subject and
      `{{contact}}` in the body.
- [ ] Insert an image; it renders in the editor and in the preview.
- [ ] The preview's venue picker: choosing a **German** venue resolves to `de`,
      a **UK** venue to `en`, and the fields substitute correctly. A venue with
      an empty field shows the "Empty for this venue" warning.
- [ ] Duplicate a template, change its language, save; both appear grouped under
      the band with their language chips.
- [ ] Relaunch: templates and their images are still there.

## Mail drafts

See **[VERIFY-MAIL.md](VERIFY-MAIL.md)** — connection test, single draft, bulk
run, the AppleScript fallback, and the error messages. The one thing to check
above all others:

- [ ] Creating a draft leaves **`Last emailed` unchanged** and stages no edits.

## Window and menu bar

- [ ] Drag the window by its title bar; resize it from every edge and corner.
- [ ] Do both again with **Settings** open — a full-screen modal must not make
      the window feel stuck.
- [ ] ⌘Q quits, ⌘W closes the window, ⌘M minimises, ⌘, opens Settings,
      ⌘T opens the templates manager.
- [ ] The in-app ⚙ button still opens the same Settings panel.
- [ ] **Booking → Check for Updates…** reports either "up to date" or an
      available version with a working Download button. With Wi-Fi off it says
      it could not reach GitHub rather than hanging.
- [ ] Settings ▸ General shows the running version and its own update button.

## Venue types

- [ ] The Type column is a dropdown. Pick `festival`, and after saving the row
      classifies as *Festival (not now)* or *Send* depending on the window.
- [ ] Pick **+ Add new type…**, enter a name: it is written into the cell,
      appears in Settings ▸ Venue types, and survives a relaunch.
- [ ] A venue whose Type is something not in the managed list still shows that
      value, and it stays selectable in the dropdown.
- [ ] Removing a type in Settings changes no venue's data.
- [ ] Type is also a dropdown in the venue detail modal and the bulk-edit bar.

## Template editor

- [ ] Type three lines in the body: the spacing in the editor matches the
      preview pane and is single-spaced, not doubled. Pressing Enter twice makes
      one blank line, and that blank line survives into the draft.
- [ ] The bullet-list button is gone; a template that already had a bullet list
      still renders one.
- [ ] Select some text → 🔗 (or ⌘K) → enter a URL: the link is applied, shows in
      the preview, and clicking 🔗 again pre-fills it. Submitting an empty field
      removes it; Cancel changes nothing. Typing `example.com` produces
      `https://example.com`.
- [ ] With nothing selected the 🔗 button is disabled rather than silently doing
      nothing.
- [ ] ▶ asks for a YouTube URL, fetches the thumbnail, and inserts it at roughly
      the size Apple Mail gives its own link previews. A Vimeo URL is refused
      with a readable message.
- [ ] Settings ▸ Mail templates ▸ Video links — with both options on, an inserted
      video shows a centred play button on the thumbnail *and* the "▶ Title"
      line under it.
- [ ] Turn off **Text link under the thumbnail**, insert another video: bare
      thumbnail, no text line — and the video inserted before it still has its
      line (the choice is stored per video, not applied at render time).
- [ ] Turn off **Play button**, insert a third: no badge drawn into the image.
- [ ] The badge is baked into the saved asset, so it must still be there when
      the draft is opened in Mail, even with remote images blocked.
- [ ] The thumbnail arrives in the actual draft as an inline image (not a broken
      remote one) — see VERIFY-MAIL.md.

## Settings panel

- [ ] Press **Save**: the panel stays open, the footer shows *Saved*, and the
      change is in effect (e.g. a rules change re-badges the table behind it).
- [ ] Click the dimmed area outside the panel — nothing closes.
- [ ] With unsaved edits the left button reads *Discard & close*; with none it
      reads *Close*.
- [ ] Settings ▸ Mail templates ▸ *Manage email templates…* → the manager shows
      **← Settings**, which returns to the panel. Editing a template shows
      **← Templates**. Opening the manager from the toolbar shows neither.
- [ ] Settings ▸ Data ▸ *Import CSV* → same **← Settings**, and the wizard's own
      Back still steps through its pages first.

## Sending and scheduling

- [ ] Settings ▸ Mail settings: SMTP server/port are prefilled; *Test connection* still
      only tests IMAP.
- [ ] ✉ Drafts ▸ **Auto column decides**: rows flagged `Auto` show a red *send*
      badge, the rest *draft*, and the button reads "Send n, draft m".
- [ ] The send button needs a second, red click before anything goes out.
- [ ] Run it on **one** test venue with your own address as the Email: the mail
      arrives, formatting and inline images intact, a copy is in Sent, and the
      row now has an unsaved `Last emailed` = today which Save writes to the CSV.
- [ ] **At a time…** two minutes out → the run appears in the pending list;
      cancelling it removes it and nothing is sent.
- [ ] Schedule another two minutes out, leave the app open: it fires on its own,
      and the results land on the rows (draft log / `Last emailed`).
- [ ] Schedule one, quit the app before it fires, reopen after the time has
      passed: it runs once at launch and is not repeated on the next launch.
- [ ] A venue detail's ⋯ menu ▸ *Send now instead* asks for confirmation first.

### Repeating runs

- [ ] Pick **At a time…** ▸ *Every day*: the "Current view" source greys out, and
      picking it beforehand switches back to Next batch.
- [ ] Schedule a daily run for a time that has already passed today — the queue
      shows tomorrow, not "immediately".
- [ ] Schedule a daily *Drafts only* run two minutes out and leave the app open:
      it fires, drafts appear, and the queue rolls forward to the same time
      tomorrow (not to two minutes from now).
- [ ] Change a template between the scheduling and the firing of a repeating run:
      the drafts use the **new** template (a one-off run uses the old one).
- [ ] Add a venue to the next batch after scheduling: the repeating run picks it
      up. That is the difference from a one-off run.
- [ ] Quit the app while a repeating run is mid-flight, reopen: it does not
      re-run, and the queue shows the next slot.
- [ ] Cancel a repeating run — it disappears from the queue and never fires again.

## Import as the source of truth

- [ ] Import a CSV as *Replace the table* with **Use this file as my CSV from now
      on** ticked → Settings ▸ Data & storage now points at that file, Save writes to
      it, and relaunching loads from it.
- [ ] The same import with the box unticked leaves Storage pointing where it was,
      and Save writes the imported rows into the old file.
- [ ] The option is hidden when adding to the existing table rather than
      replacing it.

## Contact fallback

- [ ] Settings ▸ Mail templates: set the German fallback to `{{venue}} Team`.
      Preview a German venue **with no Contact** — the greeting reads
      "Kulturzentrum Team", and the "Empty for this venue" warning no longer
      lists `{{contact}}`.
- [ ] Switch to *First name only* and preview a venue whose contact is
      "Anna Müller": the greeting says "Anna".
- [ ] Clear a language's fallback: that language goes back to the old behaviour
      (empty, and flagged in the preflight).

## Build hygiene

- [ ] `npm run clean:build -- --dry-run` lists only `Booking-*.dmg/.zip/.blockmap`,
      `mac*/`, `builder-debug.yml` — and lists anything else as *left alone*.
- [ ] Drop an unrelated file into `~/Builds/booking_app_mac/`, run the clean: the
      file survives and the directory is kept.
- [ ] With only artifacts present, `npm run clean:build` empties and removes the
      directory.

## Packaged build

Artifacts land in `~/Builds/booking_app_mac/`, not in the repo — see
`electron-builder.yml` for why. `export BUILD=~/Builds/booking_app_mac` first.

- [ ] `npm run dist` — the build log shows `adhoc-sign  ad-hoc signature applied`.
- [ ] `codesign -dv --verbose=4 "$BUILD/mac-arm64/Booking.app"` reports
      `Signature=adhoc`, and `codesign --verify --deep --strict` is silent.
- [ ] Fake a download locally and confirm it does **not** say "damaged":

      ```sh
      rm -rf /tmp/Booking.app && cp -R "$BUILD/mac-arm64/Booking.app" /tmp/
      xattr -w com.apple.quarantine "0081;00000000;Safari;" /tmp/Booking.app
      open /tmp/Booking.app
      ```

- [ ] Publish a release (docs/RELEASING.md), then **download the DMG from
      GitHub** — the download is what applies the real quarantine flag — and
      install it on a **different** account or Mac.
- [ ] First launch on a Mac that has never seen this build: it may bounce in the
      Dock for minutes while macOS scans the bundle. Time it; it must happen only
      once. `xattr -cr` on a second copy should skip the wait entirely.
- [ ] After an update, the keychain may ask once whether Booking can use the
      stored token/password (ad-hoc signature ⇒ new identity). *Always Allow*,
      and confirm GitHub/IMAP still work without re-entering them.
- [ ] `settings.json`, `templates/` and `schedule.json` survive replacing the app.
- [ ] First launch: blocked by "Apple could not verify…", then allowed via
      System Settings → Privacy & Security → Open Anyway (macOS 15+; right-click
      → Open no longer works). The
      storage picker appears.
- [ ] Data lands in `~/Library/Application Support/Booking/` —
      `settings.json`, `geo_cache.json`, `templates/`.
- [ ] The map has pins on first launch, proving the seeded `geo_cache.json` was
      found inside the packaged app.
- [ ] Secrets: after rebuilding with the *same* bundle identity, stored tokens
      still work. (Changing `appId` invalidates them — see the README.)

## A big CSV (0.4.0)

The app is used with lists an order of magnitude apart. `npm run bench:core` times
the pure part; these are the bits it cannot measure.

- [ ] Generate a 3000-row CSV and open it. The table scrolls smoothly and typing
      in a cell is instant. (Before virtualisation the table built ~22 cells per
      row for every row, twice — a card list and a table, one hidden by CSS.)
- [ ] With a filter active, **select all** still selects every *filtered* row, not
      just the ones on screen. This is the regression virtualising a table invites.
- [ ] Sorting by each column still works, and the row heights stay stable.
- [ ] Open the Map. It paints known cities immediately and shows
      *“N cities not located — locate (~M min)”* rather than freezing. Press it:
      a counter appears, **Stop** halts it, and reopening the map resumes from
      where it stopped rather than starting over.
- [ ] `npm run bench:core` — `computeDuplicates` at 3000 venues stays in the tens
      of milliseconds, not the hundreds.

## Logic, settings and sending (0.4.0)

- [ ] The **Logic** button opens the diagram; the **Rules** tab edits the numbers
      and the diagram redraws as you type. Save, reopen — the numbers stuck and
      venues reclassified.
- [ ] Settings ▸ Rules opens the same modal, and closing it returns to Settings.
- [ ] A dirty Rules tab does *not* close when you click the backdrop.
- [ ] Settings shows **Data & storage**, **Mail templates**, **Mail settings** —
      Import/Export now live under Data & storage.
- [ ] The venue detail view has a **Send now** button that needs two clicks and
      sends exactly once.

## Mail sync (0.4.0)

Needs a real account — see `VERIFY-MAIL.md`.

- [ ] Settings ▸ Mail settings: pick *Read the real date from my Sent mailbox* and
      tick the reply option. Press ↻.
- [ ] Dates arrive as **pending edits**, not written to the CSV. Discard them and
      the file is untouched.
- [ ] A venue whose CSV date is newer than the mailbox is left alone (never
      rewound).
- [ ] An out-of-office reply lands as `auto-reply: …`, a real reply as `reply: …`.
- [ ] A recorded `auto-reply` is upgraded when a genuine reply exists, but a
      recorded real reply is never downgraded.
- [ ] Turn both off: ↻ reloads the CSV and touches nothing else.

## German articles (0.4.0)

- [ ] Settings ▸ Mail templates reports **Ready** (or explains exactly why not).
- [ ] Draft to venues called *Kulturfabrik*, *Kulturzentrum* and *Jazzkeller* from
      a German template containing `in {{article}} {{venue}}`: *in der
      Kulturfabrik*, *im Kulturzentrum*, *im Jazzkeller*.
- [ ] `für {{article}} {{venue}}` gives *für die Kulturfabrik*.
- [ ] Drafting the same venue twice is instant the second time (cached).
- [ ] Switch Apple Intelligence off in System Settings: drafting still works,
      `{{article}}` is dropped, and the draft reports an empty field.
- [ ] An English template is unaffected either way.

## First run with someone else's CSV (0.4.0)

- [ ] Point a fresh install at a CSV whose headers are *not* the app's (e.g.
      `Name;Ort;E-Mail`). The import wizard's mapping step opens instead of a
      table of blank columns.
- [ ] Mapping and importing configures storage to that file, so Save writes back
      to it.
- [ ] Pointing it at a CSV the app itself wrote skips the wizard, as before.

## Updates (0.4.0)

- [ ] Settings ▸ General has *Check automatically when the app starts*.
- [ ] With it on and no newer release: launching says nothing at all.
- [ ] With it on and offline: launching says nothing at all.

## Reply-health colours (0.4.1)

- [ ] A venue emailed at least once with no reply → **red** row.
- [ ] Set its Status to `auto-reply: <today>` → row turns **orange**, dot orange,
      Last Reply badge orange.
- [ ] Change it to `reply: <today>` → row turns **yellow**, badge yellow.
- [ ] Set `Last played` to a future date → row turns **green** regardless of the
      reply status.
- [ ] Clear `Total emails` on an unanswered venue → tint disappears.
- [ ] Open each of those in the venue detail view: the header shows a matching
      coloured badge next to the ✉ counters, reading *Never replied* /
      *Auto-reply only* / *Replied* / *Gig booked* / *Not contacted*, with the
      explanation on hover.
- [ ] A row with unsaved edits shows amber instead, and returns to its health
      colour after Save.

## Mail accounts (0.5.0)

The migration is the risky part: an existing single-mailbox setup must keep
working with no action at all.

- [ ] Upgrade with an existing configured mailbox. Settings ▸ Mail settings shows
      exactly one account, pre-filled, marked *default*. Drafting still works
      **without re-entering the password** and **without a new keychain prompt**.
- [ ] Settings ▸ Bands shows no "Sends as" picker while there is only one account.
- [ ] Add a second account with a different provider. Test receiving and Test
      sending both pass on each account independently.
- [ ] The "Sends as" picker now appears. Assign one band to the second account.
- [ ] Draft for a venue of that band: it lands in the **second** account's Drafts
      folder, with that account's From address.
- [ ] Draft for a venue of an unassigned band: it lands in the first account's.
- [ ] Send for real from each: the copy is filed in the right account's Sent.
- [ ] Run a mail sync: dates from **both** accounts are staged.
- [ ] Break one account's password and sync again: the working account still
      produces its edits, and the broken one is named in the message.
- [ ] Remove the second account: the band that used it falls back to the default,
      and its keychain entry is gone.

## SMTP diagnosis (0.5.0)

- [ ] Clear the SMTP server field: the placeholder shows what it derives to, and
      Test sending reports "server worked out from the IMAP host".
- [ ] Set the port to 465 on an account whose provider wants 587 (or the reverse).
      Test sending fails within ~15 seconds — not minutes — with the explanation
      about the port and its encryption, not a raw error string.
- [ ] Fix the port: Test sending passes and names the host, port and encryption.

## Template preview images (0.5.0)

- [ ] Put an inline image and a video thumbnail in a template. Both appear in the
      **preview pane**, not as broken images. (They were `cid:` references, which
      only mean something inside an email.)
- [ ] Create a draft from that template and open it in Mail: both still appear.
