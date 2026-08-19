# Self-hosted visitor tracker

A visitor tracker and dashboard with no third-party analytics service. Your data
lives in your own Cloudflare D1 database and is read by your own dashboard.

- `src/index.js` — the Worker: collector, password auth, stats API
- `src/dashboard.js` — the login page and dashboard, served by the Worker
- `schema.sql` — the D1 table
- `../tracker.js` — the ~1KB script the site loads

The site stays on GitHub Pages. Only the collector and dashboard run on
Cloudflare, because a static host cannot receive or store anything.

## Deploy

You need a free Cloudflare account and Node installed.

```bash
cd _worker
npx wrangler login
```

**1. Create the database**

```bash
npx wrangler d1 create neeshad_analytics
```

Copy the `database_id` it prints into `wrangler.toml`, replacing
`REPLACE_WITH_YOUR_D1_DATABASE_ID`.

**2. Create the table**

```bash
npx wrangler d1 execute neeshad_analytics --remote --file=./schema.sql
```

**3. Set the two secrets**

These are stored by Cloudflare, never in this repo.

```bash
npx wrangler secret put DASH_PASSWORD   # the dashboard password you'll type
npx wrangler secret put HASH_SALT       # any long random string, then forget it
```

Generate a salt with `openssl rand -hex 32`.

**4. Deploy**

```bash
npx wrangler deploy
```

It prints a URL like `https://neeshad-analytics.<your-subdomain>.workers.dev`.

**5. Point the site at it**

In `../tracker.js`, replace `REPLACE_WITH_YOUR_WORKER_SUBDOMAIN` in the
`ENDPOINT` constant with your real subdomain, then commit and push. Until you do,
`tracker.js` deliberately does nothing.

Your dashboard is the Worker URL itself. Sign in with `DASH_PASSWORD`.

## Tracked share links

Any URL of the form `https://www.neeshad.space/r/<slug>` is recorded under that
slug and then forwards to the homepage, so you can tell which link a visit came
from:

| Give out | Appears in the dashboard as |
|---|---|
| `www.neeshad.space/r/acme-recruiter` | `acme-recruiter` |
| `www.neeshad.space/r/linkedin-bio` | `linkedin-bio` |

No setup per link — invent a slug and use it. `404.html` handles them all, and
real broken links still show a proper "page not found".

## What gets recorded

Time, page, share-link slug, referrer, country, region, city, timezone, network
operator (ASN), IP, device, browser, OS, screen size, language.

Country, city, network and IP are read **server-side** from the connection by
Cloudflare — the browser never sends them, and no GeoIP database is involved.

`visitor_id` is a SHA-256 hash of salt + IP + user agent + the date, so the same
person is recognisable across one day's pageviews but not across days.

Bots are detected by user agent, stored, flagged, and hidden from the dashboard
unless you tick **Include bots**.

The tracker skips visitors who send `Do Not Track`, and skips localhost.

## Privacy note

The `ip` column stores full IP addresses. In the EU and UK an IP is personal
data, so if you expect visitors from there, the defensible options are to add a
short privacy note to the site, or to stop storing it — drop the `ip` binding
from the `INSERT` in `src/index.js` and the column from `schema.sql`. Everything
else in the dashboard keeps working without it, since `visitor_id` is already a
hash and geolocation comes from Cloudflare rather than from the stored IP.

## Cost

Cloudflare's free tier covers 100,000 Worker requests/day and 5GB of D1 storage.
A portfolio site will not come close.

## Housekeeping

Trim old rows whenever you like:

```bash
npx wrangler d1 execute neeshad_analytics --remote \
  --command "DELETE FROM hits WHERE ts < strftime('%s','now','-365 days')*1000"
```

## Local development

```bash
npx wrangler d1 execute neeshad_analytics --local --file=./schema.sql
echo -e "DASH_PASSWORD=test\nHASH_SALT=dev" > .dev.vars
npx wrangler dev --local
```

`.dev.vars` is gitignored. Note that `tracker.js` ignores localhost by design,
so post test hits with `curl` instead:

```bash
curl -X POST http://127.0.0.1:8787/collect \
  -H "Origin: https://www.neeshad.space" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0" \
  -d '{"path":"/","referrer":"https://www.google.com/"}'
```
