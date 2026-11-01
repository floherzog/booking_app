# The web app

The web app is the same UI as the Mac app, built for a browser
(`vite.web.config.mjs`) and served from the webspace behind a password. It
reads and writes one CSV in a GitHub repository, and leaves drafting and sending
to OpenClaw (the Draft/Auto flags). What it does not have, and why, is listed in
`caps` in `src/renderer/src/platform/web.js`.

## Run your own copy

Anyone can run the web app for their own list: nothing in the source names
anyone's repository, server or password — all of that comes from your fork's
secrets and variables. You need:

- **A GitHub account.** The CSV lives in a repository, and the deploy runs as a
  GitHub Action.
- **A webspace with PHP and SSH.** Apache with `.htaccess` and `mod_rewrite`
  (the login gate), PHP 7.4 or later (`login.php`, `settings.php`), SSH access
  (the deploy copies the files over it), and HTTPS (the login cookie is marked
  `Secure`). Most shared hosting plans have all four.

GitHub Pages won't do: it runs no PHP, so there would be no login and no place
for settings — and the GitHub token baked into the bundle would be public.

Step by step:

1. **Fork this repository** on GitHub.
2. **Make a private repository for your list**, e.g. `you/booking_list`, with
   your CSV in it — e.g. `data/booking.csv`. *Export* in the Mac app writes one
   with the right columns; a file with just the header row is enough to start.
3. **Create a fine-grained personal access token** (GitHub ▸ Settings ▸
   Developer settings) with access to *only that repository* and **Contents:
   Read and write**. It ends up in the bundle, which only signed-in browsers can
   load — so keep it limited to the list.
4. **In your fork, add the secrets and variables** from the tables below
   (Settings ▸ Secrets and variables ▸ Actions): the token, the SSH details, a
   password of your choosing (`APP_PASSWORD`) and a long random
   `APP_COOKIE_SECRET` (letters and digits, e.g. `openssl rand -hex 24`), plus
   `CSV_REPO` and `CSV_PATH`. The OpenClaw ones are optional.
5. **Set `WEB_BASE`** to the folder the app should live in, e.g. `/booking/`.
   That turns deploys on.
6. **Run the workflow** once: Actions ▸ *Deploy web app* ▸ *Run workflow*. From
   then on every push to `main` that touches the app deploys it. To pick up this
   repository's improvements, sync your fork (GitHub's *Sync fork* button).
7. **Open `https://your-domain/booking/`** and sign in with `APP_PASSWORD`.
   Settings you change there are stored on your webspace, for every browser
   you sign in with.

### Syncing a Mac with it

In the Mac app, *Settings ▸ General ▸ Sync with your web app*: enter the web
app's address and `APP_PASSWORD` as the access code. The Mac signs in once and
keeps only the login cookie, in its keychain. After that the rules, bands, venue
types, chips, dismissed duplicates, mail languages and template options stay the
same on both sides (and on any other Mac connected to the same web app). With
*Also use the web app's CSV*, the Mac switches to the same GitHub CSV and takes
the web app's GitHub token along (from `token.php`, behind the same login), so
there is nothing to type and a rotated token reaches the Mac at its next sync. A
token you enter yourself under Data & storage is never replaced, and
disconnecting removes one that came from the web app. Mail accounts, passwords
and local file paths stay on the Mac.

How it decides: every save stamps the sections it changed (`syncStamps`, see
`src/core/settingsSync.js`), and a sync takes each section from whichever side
changed it last. The Mac syncs when it starts, when its window comes back to the
front, and shortly after a settings change (once Settings is closed). The web
app merges the same way when it saves, so a browser tab left open doesn't
overwrite what a Mac changed in the meantime. Changing `APP_COOKIE_SECRET` signs
every Mac out as well; they ask for the access code again.

## Running it locally

```sh
VITE_GITHUB_TOKEN=… VITE_CSV_REPO=owner/repo VITE_CSV_PATH=data/list.csv npm run dev:web
```

Opens on <http://localhost:5173/booking_app/>. The dev server runs no PHP, so
settings stay in the browser's localStorage instead of on the server. Without
`VITE_GITHUB_TOKEN` the first-run screen asks for a token and keeps it in the
browser.

## Deploying

`.github/workflows/deploy-web.yml` builds and deploys on every push to `main`
that touches the shared code. It stays off until the repository variable
`WEB_BASE` is set.

### Repository secrets

| Secret | What it is |
|---|---|
| `VITE_GITHUB_TOKEN` | PAT with read/write access to the CSV repository (and read access to the OpenClaw repository, for the drift warning). Baked into the bundle, which is only served behind the login, and handed to Macs that sync with the web app (`token.php`). |
| `SFTP_HOST`, `SFTP_PORT`, `SFTP_USER`, `SFTP_PASSWORD` | SSH access to the webspace |
| `SFTP_WEBROOT` | The webspace's document root on the server, without a trailing slash; the app goes into `$SFTP_WEBROOT$WEB_BASE` |
| `APP_PASSWORD` | The login password |
| `APP_COOKIE_SECRET` | The login cookie's value (alphanumeric). Changing it logs every browser out. |

### Repository variables

| Variable | Example |
|---|---|
| `WEB_BASE` | `/booking_app/` — the folder on the webspace, and the app's URL path. Unset = no deploys. |
| `CSV_REPO`, `CSV_PATH` | Where a browser with no settings yet looks for the CSV |
| `OPENCLAW_REPO`, `OPENCLAW_PATH` | OpenClaw's batch script, for the hold-logic drift warning |

The folder and its login cookie belong together (`login.php` scopes the cookie
to its own folder), so a staging copy at `/booking_app_next/` has a login of its
own and never disturbs the real one.

### What lives on the server

Beside the built app, in the same folder and behind the same login:

- `app_settings.json` — the settings (rules, bands, venue types, dismissed
  duplicates, …), written by `settings.php`, shared by every browser and by
  any Mac syncing with it.
- `geo_cache_live.json` — cities geocoded since the last deploy.
- `dismissed_dupes.json` — left by the old web app; read once, when its
  settings are migrated.
- `auth_secret.php` — the login password and cookie secret, written by every
  deploy.
- `github_token.php` — the GitHub token (the same one the bundle carries), for
  `token.php`; written by every deploy.

A deploy unpacks over the folder and never deletes these.

## Moving over from the old web app

The first time the new build opens in a browser that used the old one, it
builds its settings from what the old one left behind: the CSV and OpenClaw
locations and the bands (with their Dates and filler flag) from
localStorage, and the dismissed duplicate pairs from the server and
localStorage. From then on the settings live on the server.

One behaviour is new: a venue of Type `filler` counts as an outreach target only
for the bands that book filler venues (Settings ▸ Venue types ▸ filler ▸ Booked
by, or the checkbox on each band in Settings ▸ Bands). For any other band the
venue shows as *Not for this band*.
