# Manual verification — Apple Mail drafts (Phase 6)

Everything below needs a real iCloud account or macOS permission prompts, so it
cannot be checked automatically. The automated side (MIME structure, cid wiring,
mailbox resolution, error mapping, JXA compilation, placeholder substitution) is
covered by `npm run test`.

Nothing in this feature ever sends mail, and nothing writes to the venue's
**Last emailed** column — a draft is not a sent email. Confirm that as you go.

## 1. Configure the mail account (once)

1. Create an app-specific password at <https://appleid.apple.com> → *Sign-In and
   Security* → *App-Specific Passwords*. Your normal Apple ID password will not
   work; iCloud rejects it outright.
2. **Settings ▸ Mail settings**:
   - IMAP server `imap.mail.me.com`, port `993` (prefilled).
   - Username: your **full** iCloud address, e.g. `you@icloud.com`.
   - App-specific password: paste it. It goes to the macOS keychain, never into
     `settings.json`.
   - From name / from address (the address defaults to the username).
3. Press **Test connection**.
   - ✅ Expect: "Connected — N mailboxes", and the Drafts picker appears with
     your server's Drafts mailbox preselected (on a German account this is
     `Entwürfe`, which is exactly why the app reads the SPECIAL-USE flag rather
     than matching on the name).
   - ❌ If you see the app-specific-password message, the password was wrong or
     you used your Apple ID password. The message links to the right page.
4. Press **Save**.

## 2. A single draft

1. Open any venue with an email address and a template for its band + language.
2. The footer shows the resolved language (e.g. `de`), a *(fallback)* marker if
   the default language was used instead, and a count of empty placeholders.
3. Click **Draft in Mail**.
   - ✅ Expect "Draft created in Mail" within a second or two.
   - Open Mail.app → Drafts. **Sync can lag several seconds**; if it is not there
     immediately, wait or select another mailbox and back.
   - ✅ The draft is *editable* (not shown as received mail) — that is the
     `\Draft` flag doing its job.
   - ✅ Check: recipient correct, subject substituted, bold/italic/links intact,
     inline image visible **in place** (not as a separate attachment), and
     umlauts correct (`Grüße`, `Köln`).
4. Reopen the venue: it now shows "Drafted <n> minutes ago".
5. ✅ **Confirm `Last emailed` is unchanged** on that row, and that the app shows
   no unsaved edits from having created the draft.

## 3. Bulk drafts

1. Click **✉ Drafts** in the toolbar.
2. Try each source: *Next batch*, *Follow-ups due*, *Flagged "Draft"*, *Current
   view*. The count and the list should change accordingly.
3. The preflight list shows, per venue: email, resolved language, fallback
   marker, empty placeholders — and greys out anything that cannot be drafted
   with the reason (no email / no template for that band).
4. Untick one venue, then press **Create N drafts**.
   - ✅ Expect sequential progress with ✓/✗ per venue.
   - ✅ Deliberately include one venue with **no template** — it should be listed
     as blocked beforehand and never attempted.
   - ✅ Three venues → exactly three personalised drafts in Mail, each addressed
     to the right venue with its own substituted fields.
5. If any of the succeeded rows were flagged `Draft`, the summary offers
   **Clear "Draft" flag on N**. Press it.
   - ✅ Expect the main Save button's count to rise — the change is staged as a
     normal edit and appears in the Save dialog's diff. Nothing was written to
     the CSV until you press Save.

## 4. The AppleScript fallback (single draft only)

This path needs no server settings but drives Mail's window by keystroke.

1. On a venue, open the **⋯** menu next to *Draft in Mail* → **Open in Mail.app
   instead**.
2. macOS will prompt for permissions the first time. If you decline or the
   prompt does not appear, the app returns instructions; grant them under:
   - *System Settings → Privacy & Security → Automation* → enable **Mail** and
     **System Events** for Booking.
   - *System Settings → Privacy & Security → Accessibility* → add Booking.
   - Quit and reopen Booking afterwards.
3. ✅ Expect a compose window with the recipient and subject filled in, and the
   styled body pasted into it.
4. ⚠️ If the body text lands in the **subject** field instead, your Mail compose
   layout has a different tab order (a visible Bcc field does this). Adjust
   `TABS_TO_BODY` in `src/main/jxa/createMailDraft.js` — it is a single constant.
5. This path is intentionally unavailable for bulk runs.

## 5. Error handling worth confirming

- Wrong password → the app-specific-password message with the appleid.apple.com
  link, not a raw `NO [AUTHENTICATIONFAILED]`.
- Wrong host → "Could not find that mail server".
- Mail configured but no password stored → "No mail password stored."
- Venue with no email → the draft button is disabled and says why on hover.
