// The dashboard is served straight from the Worker as two self-contained pages.
// No build step, no external requests — the strict CSP below blocks them anyway.

const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'";

const BASE_CSS = /* css */ `
  :root {
    --bg: #0a0b0f;
    --surface: #14161d;
    --surface-2: #1a1d26;
    --border: #242733;
    --text: #eef0f4;
    --text-dim: #9aa0ae;
    --text-faint: #666c7a;
    --accent: #6ee7b7;
    /* Chart series. Validated against the #14161d surface for the dark
       lightness band, chroma, CVD separation and 3:1 contrast. Do not
       substitute the brighter brand mint here: it fails the band. */
    --series-views: #199e70;
    --series-visitors: #3987e5;
    --grid: #2c2c2a;
    --axis: #383835;
    --radius: 14px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent); text-decoration: none; }
`;

/* ------------------------------------------------------------------ login */

export function renderLogin() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="${CSP}" />
<meta name="robots" content="noindex, nofollow" />
<title>Analytics</title>
<style>
${BASE_CSS}
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  form {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 32px; width: 100%; max-width: 360px;
  }
  h1 { font-size: 1.1rem; font-weight: 600; margin-bottom: 6px; }
  p.hint { color: var(--text-dim); font-size: .875rem; margin-bottom: 22px; }
  input {
    width: 100%; padding: 11px 13px; border-radius: 9px; font-size: .95rem;
    background: var(--bg); border: 1px solid var(--border); color: var(--text);
  }
  input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  button {
    width: 100%; margin-top: 14px; padding: 11px; border: 0; border-radius: 9px;
    background: var(--accent); color: #08110d; font-weight: 600; font-size: .95rem; cursor: pointer;
  }
  button:disabled { opacity: .6; cursor: default; }
  .error { color: #e66767; font-size: .85rem; margin-top: 12px; min-height: 1.2em; }
</style>
</head>
<body>
  <form id="login">
    <h1>Analytics</h1>
    <p class="hint">This dashboard is private.</p>
    <input type="password" id="password" placeholder="Password" autocomplete="current-password" required autofocus />
    <button type="submit" id="submit">Sign in</button>
    <div class="error" id="error" role="alert"></div>
  </form>
<script>
document.getElementById('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = document.getElementById('submit');
  const error = document.getElementById('error');
  button.disabled = true;
  error.textContent = '';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: document.getElementById('password').value }),
    });
    if (res.ok) { location.reload(); return; }
    const data = await res.json().catch(() => ({}));
    error.textContent = data.error || 'Sign in failed.';
  } catch {
    error.textContent = 'Network error.';
  }
  button.disabled = false;
});
</script>
</body>
</html>`;
}

/* -------------------------------------------------------------- dashboard */

export function renderDashboard() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="${CSP}" />
<meta name="robots" content="noindex, nofollow" />
<title>Analytics</title>
<style>
${BASE_CSS}
  .wrap { max-width: 1160px; margin: 0 auto; padding: 32px 24px 80px; }

  header.top { display: flex; flex-wrap: wrap; gap: 16px; align-items: baseline; justify-content: space-between; margin-bottom: 26px; }
  h1 { font-size: 1.25rem; font-weight: 700; letter-spacing: -.01em; }
  .muted { color: var(--text-dim); font-size: .85rem; }

  /* Filters sit in one row above the charts. */
  .filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 24px; }
  .seg { display: inline-flex; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 3px; }
  .seg button {
    border: 0; background: none; color: var(--text-dim); cursor: pointer;
    padding: 6px 14px; border-radius: 999px; font-size: .82rem; font-family: inherit;
  }
  .seg button[aria-pressed="true"] { background: var(--surface-2); color: var(--text); font-weight: 600; }
  .toggle { display: inline-flex; align-items: center; gap: 7px; color: var(--text-dim); font-size: .82rem; cursor: pointer; }
  .spacer { flex: 1; }
  .linkbtn { background: none; border: 0; color: var(--text-faint); font-size: .82rem; cursor: pointer; font-family: inherit; }
  .linkbtn:hover { color: var(--text); }

  /* Stat tiles: hero numbers, no plot, so no hover layer. */
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--border);
           border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-bottom: 24px; }
  .tile { background: var(--surface); padding: 18px 20px; }
  .tile .num { font-size: 1.75rem; font-weight: 800; letter-spacing: -.02em; }
  .tile .label { font-size: .78rem; color: var(--text-dim); margin-top: 2px; }
  @media (max-width: 720px) { .tiles { grid-template-columns: repeat(2, 1fr); } }

  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 20px; }
  .card h2 { font-size: .95rem; font-weight: 600; margin-bottom: 4px; }
  .card .sub { font-size: .8rem; color: var(--text-dim); margin-bottom: 16px; }

  .legend { display: flex; gap: 16px; font-size: .8rem; color: var(--text-dim); margin-bottom: 12px; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .swatch { width: 10px; height: 10px; border-radius: 3px; }

  .chart-scroll { overflow-x: auto; }
  svg { display: block; }
  svg text { fill: #898781; font-size: 11px; font-family: inherit; }

  .grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
  @media (max-width: 860px) { .grid2 { grid-template-columns: 1fr; } }

  /* Breakdown rows: a magnitude bar behind the label, one hue. */
  .row { position: relative; display: flex; justify-content: space-between; gap: 12px;
         padding: 7px 10px; border-radius: 7px; font-size: .86rem; overflow: hidden; }
  .row .fill { position: absolute; inset: 0 auto 0 0; background: rgba(25, 158, 112, .16); border-radius: 7px; }
  .row .name, .row .val { position: relative; }
  .row .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row .val { color: var(--text-dim); font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .empty { color: var(--text-faint); font-size: .85rem; padding: 8px 10px; }
  .grouplabel { font-size: .72rem; text-transform: uppercase; letter-spacing: .06em;
                color: var(--text-faint); margin: 12px 0 4px 10px; }
  .grouplabel:first-of-type { margin-top: 0; }

  .table-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: .82rem; white-space: nowrap; }
  th { text-align: left; color: var(--text-faint); font-weight: 500; padding: 8px 12px 8px 0;
       border-bottom: 1px solid var(--border); font-size: .76rem; text-transform: uppercase; letter-spacing: .05em; }
  td { padding: 9px 12px 9px 0; border-bottom: 1px solid rgba(36, 39, 51, .5); color: var(--text-dim); }
  td.strong { color: var(--text); }
  td.num { font-variant-numeric: tabular-nums; }
  .tag { display: inline-block; background: var(--surface-2); border: 1px solid var(--border);
         border-radius: 5px; padding: 1px 7px; font-size: .74rem; color: var(--accent); }
  .bot { color: var(--text-faint); font-size: .72rem; }

  #tooltip {
    position: fixed; pointer-events: none; opacity: 0; transition: opacity .12s;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px;
    padding: 8px 11px; font-size: .78rem; z-index: 10; box-shadow: 0 12px 30px -12px rgba(0,0,0,.8);
  }
  #tooltip .tt-day { color: var(--text); font-weight: 600; margin-bottom: 4px; }
  #tooltip .tt-row { display: flex; align-items: center; gap: 7px; color: var(--text-dim); }
  #tooltip b { color: var(--text); font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div>
      <h1>Site analytics</h1>
      <div class="muted" id="subtitle">Loading&hellip;</div>
    </div>
  </header>

  <div class="filters">
    <div class="seg" id="ranges" role="group" aria-label="Time range">
      <button data-days="1" aria-pressed="false">24h</button>
      <button data-days="7" aria-pressed="true">7 days</button>
      <button data-days="30" aria-pressed="false">30 days</button>
      <button data-days="90" aria-pressed="false">90 days</button>
    </div>
    <label class="toggle"><input type="checkbox" id="bots" /> Include bots</label>
    <span class="spacer"></span>
    <button class="linkbtn" id="signout">Sign out</button>
  </div>

  <div class="tiles">
    <div class="tile"><div class="num" id="t-views">&mdash;</div><div class="label">Page views</div></div>
    <div class="tile"><div class="num" id="t-visitors">&mdash;</div><div class="label">Unique visitors</div></div>
    <div class="tile"><div class="num" id="t-countries">&mdash;</div><div class="label">Countries</div></div>
    <div class="tile"><div class="num" id="t-bots">&mdash;</div><div class="label">Bot hits (filtered)</div></div>
  </div>

  <div class="card">
    <h2>Traffic over time</h2>
    <div class="sub" id="chart-sub">Page views and unique visitors per day</div>
    <div class="legend">
      <span><i class="swatch" style="background: var(--series-views)"></i> Page views</span>
      <span><i class="swatch" style="background: var(--series-visitors)"></i> Unique visitors</span>
    </div>
    <div class="chart-scroll"><svg id="chart" role="img" aria-label="Page views and unique visitors per day"></svg></div>
  </div>

  <div class="grid2">
    <div class="card"><h2>Countries</h2><div class="sub">Where visitors connected from</div><div id="b-countries"></div></div>
    <div class="card"><h2>Cities</h2><div class="sub">Approximate, from the network edge</div><div id="b-cities"></div></div>
    <div class="card"><h2>Referrers</h2><div class="sub">Sites that linked here</div><div id="b-referrers"></div></div>
    <div class="card"><h2>Share links</h2><div class="sub">Your /r/&lt;slug&gt; tracked links</div><div id="b-campaigns"></div></div>
    <div class="card"><h2>Pages</h2><div class="sub">Most visited paths</div><div id="b-paths"></div></div>
    <div class="card"><h2>Devices &amp; browsers</h2><div class="sub">What they viewed it on</div>
      <div class="grouplabel">Device</div><div id="b-devices"></div>
      <div class="grouplabel">Browser</div><div id="b-browsers"></div>
    </div>
  </div>

  <div class="card">
    <h2>Recent visits</h2>
    <div class="sub">Newest first, up to 60</div>
    <div class="table-scroll">
      <table>
        <thead><tr><th>When</th><th>Location</th><th>Network</th><th>Page</th><th>Source</th><th>Device</th><th>IP</th></tr></thead>
        <tbody id="recent"></tbody>
      </table>
    </div>
  </div>
</div>
<div id="tooltip" role="status"></div>

<script>
const state = { days: 7, bots: false };
const tooltip = document.getElementById('tooltip');
let lastSeries = [];

const fmt = (n) => (n == null ? '0' : Number(n).toLocaleString());

// Turns an ISO country code into a readable name using the browser's own
// locale data, so no country lookup table has to ship with the page.
let regionNames = null;
try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { /* older browser */ }
function countryName(code) {
  if (!code || code.length !== 2) return code || 'Unknown';
  try { return (regionNames && regionNames.of(code)) || code; } catch (e) { return code; }
}

// Picks a rounded axis maximum divisible into 4 whole-number ticks, so the
// scale never shows fractional page views or a repeated label.
function niceTop(max, ticks) {
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, max / ticks))));
  const normalised = Math.max(1, max / ticks) / magnitude;
  const step = Math.max(1, Math.round((normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude));
  return { top: step * ticks, step };
}

// Text goes in via textContent everywhere below, so values from the database
// are never parsed as markup.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderBreakdown(containerId, rows, emptyText, labelFn) {
  const box = document.getElementById(containerId);
  box.replaceChildren();
  if (!rows || !rows.length) {
    box.append(el('div', 'empty', emptyText || 'Nothing yet.'));
    return;
  }
  const max = Math.max(...rows.map((r) => r.views));
  for (const row of rows) {
    const line = el('div', 'row');
    const fill = el('div', 'fill');
    fill.style.width = (max ? (row.views / max) * 100 : 0) + '%';
    line.append(fill, el('div', 'name', labelFn ? labelFn(row.label) : row.label), el('div', 'val', fmt(row.views)));
    box.append(line);
  }
}

/* Grouped bar chart: two series, thin marks, 2px gap between adjacent bars,
   4px rounded tops anchored to the baseline, recessive grid. */
function renderChart(series) {
  const svg = document.getElementById('chart');
  svg.replaceChildren();

  if (!series.length) {
    svg.setAttribute('viewBox', '0 0 600 80');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '80');
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', 12); t.setAttribute('y', 44);
    t.textContent = 'No visits recorded in this range yet.';
    svg.append(t);
    return;
  }

  const NS = 'http://www.w3.org/2000/svg';
  const padL = 44, padR = 12, padT = 10, padB = 28;
  const height = 240;
  const plotH = height - padT - padB;

  // Draw at the container's real pixel width so the plot always fills the card,
  // and grow past it (into the scroll container) only when there are enough
  // days that the bars would otherwise be unreadably thin.
  const available = svg.parentElement.clientWidth || 760;
  const width = Math.max(available, padL + padR + 26 * series.length);
  const groupW = (width - padL - padR) / series.length;

  svg.setAttribute('viewBox', \`0 0 \${width} \${height}\`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const TICKS = 4;
  const { top } = niceTop(Math.max(1, ...series.map((d) => d.views)), TICKS);
  const y = (v) => padT + plotH - (v / top) * plotH;

  const add = (tag, attrs, text) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    svg.append(node);
    return node;
  };

  // Gridlines and value axis.
  for (let i = 0; i <= TICKS; i++) {
    const value = (top / TICKS) * i;
    add('line', { x1: padL, x2: width - padR, y1: y(value), y2: y(value), stroke: 'var(--grid)', 'stroke-width': 1 });
    add('text', { x: padL - 8, y: y(value) + 4, 'text-anchor': 'end' }, fmt(value));
  }
  add('line', { x1: padL, x2: width - padR, y1: y(0), y2: y(0), stroke: 'var(--axis)', 'stroke-width': 1 });

  // Two bars per day, 2px of surface between them, capped so a single-day
  // range doesn't render one enormous slab.
  const barW = Math.max(4, Math.min(26, (groupW * 0.62) / 2 - 1));
  const inset = (groupW - (barW * 2 + 2)) / 2;
  const labelEvery = Math.ceil(series.length / 12);

  series.forEach((d, i) => {
    const gx = padL + i * groupW + inset;

    // Rounded top, square base, so the mark stays anchored to the baseline.
    const drawBar = (value, x, color) => {
      const h = Math.max(value > 0 ? 2 : 0, (value / top) * plotH);
      if (!h) return;
      const base = y(0), r = Math.min(4, barW / 2, h);
      const path = \`M \${x} \${base} L \${x} \${base - h + r} Q \${x} \${base - h} \${x + r} \${base - h} L \${x + barW - r} \${base - h} Q \${x + barW} \${base - h} \${x + barW} \${base - h + r} L \${x + barW} \${base} Z\`;
      add('path', { d: path, fill: color });
    };

    drawBar(d.views, gx, 'var(--series-views)');
    drawBar(d.visitors, gx + barW + 2, 'var(--series-visitors)');

    if (i % labelEvery === 0) {
      add('text', { x: gx + barW + 1, y: height - 9, 'text-anchor': 'middle' }, d.day.slice(5));
    }

    // Hover target spans the whole group and is larger than the marks.
    const hit = add('rect', {
      x: padL + i * groupW, y: padT, width: groupW, height: plotH, fill: 'transparent',
    });
    hit.addEventListener('mouseenter', (e) => {
      tooltip.replaceChildren();
      tooltip.append(el('div', 'tt-day', d.day));
      for (const [label, value, color] of [['Page views', d.views, 'var(--series-views)'], ['Unique visitors', d.visitors, 'var(--series-visitors)']]) {
        const row = el('div', 'tt-row');
        const sw = el('i', 'swatch');
        sw.style.background = color;
        const strong = document.createElement('b');
        strong.textContent = fmt(value);
        row.append(sw, document.createTextNode(label + ' '), strong);
        tooltip.append(row);
      }
      tooltip.style.opacity = '1';
      tooltip.style.left = Math.min(e.clientX + 14, innerWidth - 190) + 'px';
      tooltip.style.top = e.clientY + 14 + 'px';
    });
    hit.addEventListener('mousemove', (e) => {
      tooltip.style.left = Math.min(e.clientX + 14, innerWidth - 190) + 'px';
      tooltip.style.top = e.clientY + 14 + 'px';
    });
    hit.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });
  });
}

function renderRecent(rows) {
  const body = document.getElementById('recent');
  body.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = el('td', 'empty', 'No visits yet.');
    td.colSpan = 7;
    tr.append(td);
    body.append(tr);
    return;
  }
  for (const r of rows) {
    const tr = document.createElement('tr');
    const place = [r.city, r.region, countryName(r.country)].filter(Boolean).join(', ') || 'Unknown';
    const when = new Date(r.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const source = el('td');
    if (r.campaign) source.append(el('span', 'tag', r.campaign));
    else source.textContent = r.referrer_host || 'direct';

    const page = el('td', 'strong', r.path);
    if (r.is_bot) page.append(' ', el('span', 'bot', '(bot)'));

    tr.append(
      el('td', 'num', when),
      el('td', 'strong', place),
      el('td', null, r.as_org || '—'),
      page,
      source,
      el('td', null, [r.device, r.browser, r.os].filter(Boolean).join(' · ')),
      el('td', 'num', r.ip || '—'),
    );
    body.append(tr);
  }
}

async function load() {
  const res = await fetch(\`/api/stats?days=\${state.days}&bots=\${state.bots ? 1 : 0}\`);
  if (res.status === 401) { location.reload(); return; }
  const data = await res.json();

  document.getElementById('t-views').textContent = fmt(data.totals.views);
  document.getElementById('t-visitors').textContent = fmt(data.totals.visitors);
  document.getElementById('t-countries').textContent = fmt(data.totals.countries);
  document.getElementById('t-bots').textContent = fmt(data.totals.bots);
  document.getElementById('subtitle').textContent =
    \`Last \${data.days} day\${data.days === 1 ? '' : 's'}\` + (data.includeBots ? ' · bots included' : ' · bots excluded');

  lastSeries = data.series;
  renderChart(data.series);
  renderBreakdown('b-countries', data.countries, null, countryName);
  renderBreakdown('b-cities', data.cities);
  // A null referrer means the visitor typed the URL or came from a link with no
  // referrer header — that is "direct", not an unknown site.
  renderBreakdown('b-referrers', data.referrers, 'Nothing yet.', (l) => (l === 'Unknown' ? 'Direct' : l));
  renderBreakdown('b-campaigns', data.campaigns, 'No share links used yet.');
  renderBreakdown('b-paths', data.paths);
  renderBreakdown('b-devices', data.devices);
  renderBreakdown('b-browsers', data.browsers);
  renderRecent(data.recent);
}

document.getElementById('ranges').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-days]');
  if (!button) return;
  state.days = Number(button.dataset.days);
  for (const b of document.querySelectorAll('#ranges button')) {
    b.setAttribute('aria-pressed', String(b === button));
  }
  load();
});

document.getElementById('bots').addEventListener('change', (e) => {
  state.bots = e.target.checked;
  load();
});

document.getElementById('signout').addEventListener('click', async () => {
  await fetch('/api/logout');
  location.reload();
});

// The chart is drawn at real pixel width, so it has to be redrawn on resize.
let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderChart(lastSeries), 150);
});

load();
</script>
</body>
</html>`;
}
