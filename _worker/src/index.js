import { renderDashboard, renderLogin } from './dashboard.js';

const SESSION_COOKIE = 'nsa_sess';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Matches the common crawlers and preview fetchers. These still get stored so
// the numbers stay auditable, but they are flagged and hidden by default.
const BOT_RE = /bot|crawler|spider|crawling|slurp|bingpreview|headlesschrome|phantomjs|curl|wget|python-requests|axios|okhttp|facebookexternalhit|whatsapp|telegram|slackbot|discord|linkedinbot|embedly|preview|monitor|uptime|pingdom|lighthouse|gtmetrix/i;

/* ---------------------------------------------------------------- helpers */

const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

// Comparison that does not leak how many leading characters matched.
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Everything written to the database goes through here: strings only, always
// length-capped, so a malformed or hostile payload cannot bloat a row.
function clean(value, maxLength = 255) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!allowedOrigins(env).includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });
}

function html(markup, init = {}) {
  return new Response(markup, {
    ...init,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      ...(init.headers || {}),
    },
  });
}

/* -------------------------------------------------------------- user agent */

function parseUserAgent(ua) {
  if (!ua) return { device: 'unknown', browser: 'unknown', os: 'unknown' };

  const isTablet = /ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua);
  const isMobile = !isTablet && /mobi|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua);

  // Order matters: Edge and Opera both advertise Chrome, Chrome advertises Safari.
  let browser = 'Other';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/samsungbrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/firefox\/|fxios/i.test(ua)) browser = 'Firefox';
  else if (/chrome\/|crios/i.test(ua)) browser = 'Chrome';
  else if (/safari\//i.test(ua)) browser = 'Safari';

  let os = 'Other';
  if (/windows nt/i.test(ua)) os = 'Windows';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/mac os x/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/cros/i.test(ua)) os = 'ChromeOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  return { device: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop', browser, os };
}

/* -------------------------------------------------------------- collecting */

async function handleCollect(request, env, ctx) {
  const cors = corsHeaders(request, env);
  if (!cors) return new Response('Forbidden origin', { status: 403 });

  // sendBeacon posts text/plain, so read as text and parse by hand.
  const raw = await request.text();
  if (raw.length > 4000) return new Response('Payload too large', { status: 413, headers: cors });

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400, headers: cors });
  }

  const ua = request.headers.get('User-Agent') || '';
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const cf = request.cf || {};
  const { device, browser, os } = parseUserAgent(ua);

  // The visitor id is a hash, salted and re-keyed daily, so the same person is
  // recognisable across a day's pageviews without the hash being a stable
  // long-term identifier.
  const day = new Date().toISOString().slice(0, 10);
  const visitorId = (await sha256Hex(`${env.HASH_SALT || 'unsalted'}|${ip}|${ua}|${day}`)).slice(0, 16);

  let referrerHost = null;
  const referrerUrl = clean(body.referrer, 500);
  if (referrerUrl) {
    try {
      referrerHost = new URL(referrerUrl).hostname.replace(/^www\./, '');
    } catch {
      referrerHost = null;
    }
  }

  const stmt = env.DB.prepare(
    `INSERT INTO hits (ts, visitor_id, session_id, path, campaign, referrer_host, referrer_url,
                       country, region, city, timezone, asn, as_org, ip,
                       device, browser, os, screen, language, is_bot, user_agent)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)`,
  ).bind(
    Date.now(),
    visitorId,
    clean(body.session, 40),
    clean(body.path, 300) || '/',
    clean(body.campaign, 80),
    referrerHost,
    referrerUrl,
    clean(cf.country, 4),
    clean(cf.region, 80),
    clean(cf.city, 80),
    clean(cf.timezone, 60),
    typeof cf.asn === 'number' ? cf.asn : null,
    clean(cf.asOrganization, 120),
    clean(ip, 60),
    device,
    browser,
    os,
    clean(body.screen, 20),
    clean(body.language, 20),
    BOT_RE.test(ua) ? 1 : 0,
    clean(ua, 400),
  );

  // Respond immediately; the insert finishes after the response is sent so the
  // visitor never waits on the database.
  ctx.waitUntil(stmt.run());
  return new Response(null, { status: 204, headers: cors });
}

/* -------------------------------------------------------------------- auth */

async function isAuthenticated(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return false;

  const [expires, signature] = decodeURIComponent(match[1]).split('.');
  if (!expires || !signature) return false;
  if (Date.now() > Number(expires)) return false;

  return timingSafeEqual(signature, await hmacHex(env.DASH_PASSWORD, `v1|${expires}`));
}

async function handleLogin(request, env) {
  if (!env.DASH_PASSWORD) {
    return json({ error: 'DASH_PASSWORD secret is not set on the Worker.' }, { status: 500 });
  }

  const { password } = await request.json().catch(() => ({}));
  if (typeof password !== 'string' || !timingSafeEqual(password, env.DASH_PASSWORD)) {
    // Blunt the speed of an online guessing loop.
    await new Promise((r) => setTimeout(r, 700));
    return json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const expires = Date.now() + SESSION_TTL_MS;
  const token = `${expires}.${await hmacHex(env.DASH_PASSWORD, `v1|${expires}`)}`;

  return json({ ok: true }, {
    headers: {
      'Set-Cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
    },
  });
}

/* ------------------------------------------------------------------- stats */

async function handleStats(request, env) {
  const url = new URL(request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '7', 10) || 7, 1), 365);
  const includeBots = url.searchParams.get('bots') === '1';
  const since = Date.now() - days * 86400000;

  const botClause = includeBots ? '' : ' AND is_bot = 0';
  const where = `WHERE ts >= ?1${botClause}`;

  // One breakdown query, reused for every dimension.
  const breakdown = (column, limit = 8) => env.DB.prepare(
    `SELECT COALESCE(${column}, 'Unknown') AS label, COUNT(*) AS views,
            COUNT(DISTINCT visitor_id) AS visitors
     FROM hits ${where} GROUP BY label ORDER BY views DESC LIMIT ${limit}`,
  ).bind(since);

  const [totals, botCount, series, paths, countries, cities, referrers, campaigns, devices, browsers, recent] =
    await env.DB.batch([
      // Totals honour the same bot filter as every panel below, so the tiles
      // and the chart can never disagree.
      env.DB.prepare(
        `SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors,
                COUNT(DISTINCT country) AS countries
         FROM hits ${where}`,
      ).bind(since),

      // Reported separately and always unfiltered: this tile exists to show
      // how much traffic the filter is removing.
      env.DB.prepare(
        `SELECT COUNT(*) AS bots FROM hits WHERE ts >= ?1 AND is_bot = 1`,
      ).bind(since),

      env.DB.prepare(
        `SELECT date(ts / 1000, 'unixepoch') AS day, COUNT(*) AS views,
                COUNT(DISTINCT visitor_id) AS visitors
         FROM hits ${where} GROUP BY day ORDER BY day ASC`,
      ).bind(since),

      breakdown('path'),
      breakdown('country'),
      breakdown('city'),
      breakdown("NULLIF(referrer_host, '')"),
      breakdown('campaign'),
      breakdown('device', 5),
      breakdown('browser', 6),

      env.DB.prepare(
        `SELECT ts, city, region, country, as_org, ip, path, campaign, referrer_host,
                device, browser, os, is_bot
         FROM hits ${where} ORDER BY ts DESC LIMIT 60`,
      ).bind(since),
    ]);

  return json({
    days,
    includeBots,
    totals: { ...(totals.results[0] || {}), bots: botCount.results[0]?.bots ?? 0 },
    series: series.results,
    paths: paths.results,
    countries: countries.results,
    cities: cities.results,
    referrers: referrers.results,
    campaigns: campaigns.results.filter((r) => r.label !== 'Unknown'),
    devices: devices.results,
    browsers: browsers.results,
    recent: recent.results,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

/* ------------------------------------------------------------------ router */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/collect') {
      if (request.method === 'OPTIONS') {
        const cors = corsHeaders(request, env);
        return cors
          ? new Response(null, { status: 204, headers: cors })
          : new Response('Forbidden origin', { status: 403 });
      }
      if (request.method === 'POST') return handleCollect(request, env, ctx);
      return new Response('Method not allowed', { status: 405 });
    }

    if (pathname === '/api/login' && request.method === 'POST') return handleLogin(request, env);

    if (pathname === '/api/logout') {
      return json({ ok: true }, {
        headers: { 'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0` },
      });
    }

    // Everything past this point is private.
    const authed = await isAuthenticated(request, env);

    if (pathname === '/api/stats') {
      if (!authed) return json({ error: 'Unauthorized' }, { status: 401 });
      return handleStats(request, env);
    }

    if (pathname === '/' || pathname === '/dash') {
      return html(authed ? renderDashboard() : renderLogin());
    }

    return new Response('Not found', { status: 404 });
  },
};
