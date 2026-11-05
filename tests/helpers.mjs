// Shared set-up for the browser tests: a tiny static server for the repo, one Chrome per test file,
// and a page wrapper that records every console error and uncaught exception so each test can
// assert the game ran cleanly.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };

// The leaderboard API (api/scores.js) runs for real in the test server, talking to a small in-memory
// stand-in for Upstash Redis's /pipeline endpoint (only the commands the API uses).
const scoresApi = createRequire(import.meta.url)('../api/scores.js');
function fakeRedis() {
  const Z = new Map(), K = new Map();
  return function run([cmd, key, ...a]) {
    cmd = String(cmd).toUpperCase();
    if (cmd === 'SET') {
      const until = K.get(key); if (a.includes('NX') && until && until > Date.now()) return null;
      K.set(key, Date.now() + 1000 * (+a[a.indexOf('EX') + 1] || 1e6)); return 'OK';
    }
    if (!Z.has(key)) Z.set(key, new Map());
    const z = Z.get(key), sorted = () => [...z].sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1));
    if (cmd === 'ZADD') { const [, s, m] = a; if (!z.has(m) || +s > z.get(m)) z.set(m, +s); return 1; }
    if (cmd === 'ZCARD') return z.size;
    if (cmd === 'ZREVRANGE') return sorted().slice(+a[0], +a[1] + 1).flatMap(([m, s]) => [m, String(s)]);
    if (cmd === 'ZREVRANK') { const i = sorted().findIndex(x => x[0] === a[0]); return i < 0 ? null : i; }
    if (cmd === 'ZSCORE') return z.has(a[0]) ? String(z.get(a[0])) : null;
    return { error: `ERR unknown command ${cmd}` };
  };
}

async function readBody(req) { let b = ''; for await (const c of req) b += c; return b; }

/** Static server for the repo, plus the leaderboard API. `opts.leaderboard: false` leaves the API out (404). */
export async function startServer(opts = {}) {
  const redis = fakeRedis();
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/redis/pipeline') {
      const out = JSON.parse(await readBody(req)).map(c => { const r = redis(c); return r && r.error ? r : { result: r }; });
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); return;
    }
    if (u.pathname === '/api/scores' && opts.leaderboard !== false) {
      const body = await readBody(req);
      req.query = Object.fromEntries(u.searchParams);
      try { req.body = body ? JSON.parse(body) : undefined; } catch (e) { req.body = body; }
      process.env.KV_REST_API_URL = `http://127.0.0.1:${server.address().port}/redis`; process.env.KV_REST_API_TOKEN = 'test';
      const r = { status(c) { res.statusCode = c; return r; }, setHeader: (k, v) => res.setHeader(k, v),
        json(o) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); } };
      await scoresApi(req, r); return;
    }
    let p = decodeURIComponent(u.pathname);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) };
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']) if (fs.existsSync(p)) return p;
  return undefined;   // let Playwright look for an installed Chrome channel
}

export async function launch() {
  const exe = chromePath();
  return chromium.launch({
    headless: true,
    ...(exe ? { executablePath: exe } : { channel: 'chrome' }),
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
}

// Errors that come from the test sandbox rather than the games (Google Fonts are blocked offline).
const IGNORE = [/fonts\.(googleapis|gstatic)\.com/, /ERR_BLOCKED_BY_CLIENT/, /net::ERR_FAILED/];

/**
 * Opens a page and records problems. `opts.reduced` (default true) asks for reduced motion so the
 * intros finish quickly; `opts.viewport` sets the window size.
 */
export async function openPage(browser, base, route, opts = {}) {
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 800 },
    reducedMotion: opts.reduced === false ? 'no-preference' : 'reduce',
    hasTouch: !!opts.touch, isMobile: !!opts.mobile,
    colorScheme: opts.dark ? 'dark' : 'light',
  });
  if (opts.storage) await context.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, opts.storage);
  // keep the tests offline: only the local server is reachable
  await context.route(u => !u.href.startsWith(base), r => r.abort('blockedbyclient'));
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !IGNORE.some(r => r.test(m.text() + ' ' + (m.location()?.url || '')))) problems.push(`console: ${m.text()}`); });
  page.on('requestfailed', r => { if (r.url().startsWith(base)) problems.push(`requestfailed: ${r.url()}`); });
  page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.goto(base + route);
  return { page, context, problems, close: () => context.close() };
}

/** Waits until a game's own opening sequence (standalone pages only) has gone. */
export async function skipIntro(page) {
  const intro = page.locator('#intro');
  if (await intro.count()) { await intro.click({ timeout: 2000 }).catch(() => { }); }
  await page.waitForFunction(() => !document.getElementById('intro') && !document.body.classList.contains('intro-on'), null, { timeout: 5000 });
}

/** True when nothing on the page is wider than the window (no sideways scrolling on a phone). */
export function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

/** Every number in an object tree, so a test can check none of them went NaN or Infinity. */
export function badNumbers(page, expr) {
  return page.evaluate(expr => {
    const out = [], seen = new Set();
    (function walk(o, at, depth) {
      if (o == null || depth > 4 || seen.has(o)) return;
      if (typeof o === 'number') { if (!Number.isFinite(o) && o !== Infinity) out.push(at); return; }
      if (typeof o !== 'object' || o instanceof Node || o instanceof AudioNode) return;
      seen.add(o);
      for (const k of Object.keys(o)) if (k !== 'voice') walk(o[k], at + '.' + k, depth + 1);
    })(eval(expr), expr, 0);
    return out;
  }, expr);
}
