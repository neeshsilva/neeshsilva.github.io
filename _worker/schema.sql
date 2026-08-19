-- Schema for the self-hosted visitor tracker.
-- Apply with:  wrangler d1 execute neeshad_analytics --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS hits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,          -- unix milliseconds, UTC
  visitor_id    TEXT    NOT NULL,          -- salted daily hash; rotates every UTC day
  session_id    TEXT,
  path          TEXT    NOT NULL,
  campaign      TEXT,                      -- slug from a /r/<slug> share link
  referrer_host TEXT,
  referrer_url  TEXT,
  country       TEXT,
  region        TEXT,
  city          TEXT,
  timezone      TEXT,
  asn           INTEGER,
  as_org        TEXT,                      -- e.g. "Comcast", "Deutsche Telekom"
  ip            TEXT,                      -- see the privacy note in README
  device        TEXT,                      -- desktop | mobile | tablet
  browser       TEXT,
  os            TEXT,
  screen        TEXT,
  language      TEXT,
  is_bot        INTEGER NOT NULL DEFAULT 0,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS idx_hits_ts        ON hits (ts);
CREATE INDEX IF NOT EXISTS idx_hits_visitor   ON hits (visitor_id);
CREATE INDEX IF NOT EXISTS idx_hits_campaign  ON hits (campaign);
CREATE INDEX IF NOT EXISTS idx_hits_bot_ts    ON hits (is_bot, ts);
