# The web app

The web app is the same UI as the Mac app, built for a browser
(`vite.web.config.mjs`) and served from the webspace behind a password. It
reads and writes one CSV in a GitHub repository, and leaves drafting and sending
to OpenClaw (the Draft/Auto flags). What it does not have, and why, is listed in
`caps` in `src/renderer/src/platform/web.js`.

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
| `VITE_GITHUB_TOKEN` | PAT with read/write access to the CSV repository (and read access to the OpenClaw repository, for the drift warning). Baked into the bundle, which is only served behind the login. |
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
  duplicates), written by `settings.php`, shared by every browser.
- `geo_cache_live.json` — cities geocoded since the last deploy.
- `dismissed_dupes.json` — left by the old web app; read once, when its
  settings are migrated.
- `auth_secret.php` — written by every deploy.

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
