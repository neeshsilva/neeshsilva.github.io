/*
 * Self-hosted visitor tracker. Sends one small JSON payload to your own
 * Cloudflare Worker. No third-party service, no cookies, no fingerprinting.
 *
 * Country, city, network and IP are read server-side by the Worker from the
 * connection itself, so none of that is collected or sent from here.
 */
(function () {
  'use strict';

  // The Worker's URL. Printed by `wrangler deploy`.
  var ENDPOINT = 'https://neeshad-analytics.neesh.workers.dev/collect';

  if (ENDPOINT.indexOf('REPLACE_WITH_') !== -1) return;

  // Honour the browser's do-not-track signal.
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

  // Skip local development so it never pollutes real numbers.
  var host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '' || host.endsWith('.local')) return;

  // Groups a single browsing session. Cleared when the tab closes; never
  // readable by any other site.
  var session;
  try {
    session = sessionStorage.getItem('_s');
    if (!session) {
      session = Math.random().toString(36).slice(2, 12);
      sessionStorage.setItem('_s', session);
    }
  } catch (e) {
    session = null; // private mode with storage disabled
  }

  // Tracked share links look like /r/<slug>; record the slug as the campaign.
  var campaign = null;
  var match = location.pathname.match(/^\/r\/([A-Za-z0-9_-]{1,60})/);
  if (match) campaign = match[1];

  var payload = JSON.stringify({
    path: location.pathname,
    campaign: campaign,
    referrer: document.referrer || null,
    screen: window.screen ? screen.width + 'x' + screen.height : null,
    language: navigator.language || null,
    session: session,
  });

  // sendBeacon is queued by the browser and survives the page being closed or
  // navigated away from, which matters for the /r/ redirect pages.
  // text/plain keeps it a simple request, so there is no CORS preflight.
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'text/plain;charset=UTF-8' }));
      return;
    }
  } catch (e) { /* fall through */ }

  fetch(ENDPOINT, {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    keepalive: true,
    mode: 'cors',
    credentials: 'omit',
  }).catch(function () { /* tracking must never break the page */ });
})();
