// Every game on a spread of phone screens, upright and sideways, from the smallest iPhone SE to big
// Androids, a folded Galaxy Fold, and iPhones with Safari's bars showing. On every screen of every game
// (explainer cards, playing, end card) each button must be reachable, uncovered and big enough to tap,
// nothing may scroll sideways, and tapping must actually play the game.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// CSS pixels, held upright. Each one is also tested sideways.
const PHONES = [
  { name: 'Galaxy Fold folded', w: 280, h: 653 },
  { name: 'iPhone SE (1st gen)', w: 320, h: 568 },
  { name: 'small Android', w: 360, h: 640 },
  { name: 'iPhone SE', w: 375, h: 667 },
  { name: 'Galaxy S20', w: 360, h: 800 },
  { name: 'Galaxy Z Fold cover', w: 344, h: 882 },
  { name: 'iPhone 14 with Safari bars', w: 390, h: 664 },
  { name: 'iPhone 14', w: 390, h: 844 },
  { name: 'Pixel 7', w: 412, h: 915 },
  { name: 'iPhone 15 Pro Max', w: 430, h: 932 },
];
const SCREENS = PHONES.flatMap(p => [
  { name: `${p.name} upright (${p.w}×${p.h})`, width: p.w, height: p.h, upright: true },
  { name: `${p.name} sideways (${p.h}×${p.w})`, width: p.h, height: p.w, upright: false },
]);
// a finger needs at least this much (WCAG 2.2 asks for 24 CSS px); a little slack for borders
const MIN_TAP = 24;

const phone = (s, route, storage) => openPage(browser, server.url, route, {
  viewport: { width: s.width, height: s.height }, mobile: true, touch: true, storage,
});

/**
 * Checks every visible control inside `scope` (a selector; the whole page if empty): after scrolling it
 * into view its middle is on screen and nothing covers it, and it is at least MIN_TAP on each side.
 * Returns a list of problems (empty = all good).
 */
function checkControls(target, scope = '') {
  return target.evaluate(([scope, MIN]) => {
    const root = scope ? document.querySelector(scope) : document.body;
    if (!root) return [`${scope} is missing`];
    const sel = 'button, a[href], input, select, textarea, [role="button"], [role="radio"], .src';
    // the noise chips drawn in an explainer picture are illustration, not buttons
    const els = [...root.querySelectorAll(sel)].filter(e => !e.disabled && !e.closest('.xart') && e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      && getComputedStyle(e).pointerEvents !== 'none');
    const name = e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.dataset.type ? `[${e.dataset.type}]` : e.dataset.d ? `[${e.dataset.d}]` : '')) + ` "${(e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`;
    const out = [];
    for (const e of els) {
      e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const r = e.getBoundingClientRect();
      if (r.width < MIN - 0.5 || r.height < MIN - 0.5) out.push(`${name(e)} is only ${Math.round(r.width)}×${Math.round(r.height)}`);
      // the visible part of the control (a list that scrolls sideways can still clip it)
      const vw = window.visualViewport ? visualViewport.width : innerWidth, vh = window.visualViewport ? visualViewport.height : innerHeight;
      const x = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1), y = Math.min(Math.max(r.top + r.height / 2, 1), vh - 1);
      if (r.right < 4 || r.left > vw - 4 || r.bottom < 4 || r.top > vh - 4) { out.push(`${name(e)} can't be scrolled onto the screen`); continue; }
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(e === hit || e.contains(hit))) out.push(`${name(e)} is covered by ${hit ? (hit.id ? '#' + hit.id : hit.tagName.toLowerCase() + '.' + [...hit.classList].join('.')) : 'nothing (off screen)'}`);
    }
    window.scrollTo(0, 0);
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`the page scrolls sideways (${document.documentElement.scrollWidth} > ${innerWidth})`);
    return out;
  }, [scope, MIN_TAP]);
}

/** Checks the controls on each explainer card, pressing Next until the last one (which it leaves showing). */
async function walkCards(p, problems, label) {
  for (let i = 0; i < 6; i++) {
    for (const x of await checkControls(p, '#startCard')) problems.push(`${label} card ${i + 1}: ${x}`);
    const next = p.locator('#btnNext');
    const txt = (await next.textContent()).trim();
    if (txt !== 'Next') return;
    await next.tap();
  }
}

for (const s of SCREENS) {
  test(`${s.name}: Let Grandma Sleep`, async () => {
    const h = await phone(s, '/grandma.html?embed=1#test');
    try {
      const p = h.page, bad = [];
      await p.waitForFunction(() => window.__g);
      await walkCards(p, bad, 'start');
      // the difficulty buttons on the last card
      await p.locator('#diffPick button[data-d="easy"]').tap();
      assert.equal(await p.evaluate(() => localStorage.getItem('shema.grandma.diff')), 'easy');
      await p.locator('#btnNext').tap();
      await p.locator('#hud').waitFor({ state: 'visible' });
      await p.evaluate(() => __shemaPause(true));
      for (const x of await checkControls(p)) bad.push(`playing: ${x}`);
      // the street and Grandma's picture are both on screen
      for (const id of ['#scene', '#gmaCanvas, .gma canvas, #grandma']) {
        const box = await p.locator(id).first().boundingBox().catch(() => null);
        if (!box) continue;
        if (box.width < 120 || box.height < 80) bad.push(`${id} is only ${Math.round(box.width)}×${Math.round(box.height)}`);
        if (box.y + box.height / 2 > s.height || box.x + box.width / 2 > s.width) bad.push(`${id} is off screen`);
      }
      // a real tap on a noise is caught: put a dog on the street, then tap where it is drawn
      const pt = await p.evaluate(() => {
        Object.assign(__g.G, { noises: [], spawnIn: 1e9, nextRush: 1e9 });
        const n = __g.spawn(); Object.assign(n, { type: 'dog', x: 20, y: 30, vx: 0, vy: 0, life: 999 });
        const sc = document.getElementById('scene'); sc.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = sc.getBoundingClientRect();
        return [r.left + __g.sx(n.x), r.top + __g.sy(n.y)];
      });
      assert.ok(pt[0] > 0 && pt[0] < s.width && pt[1] > 0 && pt[1] < s.height, `the dog is drawn off screen at ${pt.map(Math.round)}`);
      await p.touchscreen.tap(pt[0], pt[1]);
      assert.equal(await p.evaluate(() => __g.G.queue.length), 1, 'tapping the dog queues it');
      // the end card
      await p.evaluate(() => { __g.endGame(false); });
      await p.locator('#endCard').waitFor({ state: 'visible' });
      for (const x of await checkControls(p, '#endCard')) bad.push(`end card: ${x}`);
      await p.locator('#btnAgain').tap();
      await p.waitForFunction(() => __g.G.mode === 'play');
      assert.deepEqual(bad, []);
      assert.deepEqual(h.problems, []);
    } finally { await h.close(); }
  });

  test(`${s.name}: Squirrel Run`, async () => {
    const h = await phone(s, '/squirrel.html?embed=1#test');
    try {
      const p = h.page, bad = [];
      await p.waitForFunction(() => window.__r);
      await walkCards(p, bad, 'start');
      await p.locator('#btnNext').tap();
      await p.waitForFunction(() => __r.mode === 'play');
      await p.evaluate(() => __shemaPause(true));
      for (const x of await checkControls(p)) bad.push(`playing: ${x}`);
      // the jump pad is big enough for a thumb and a tap on it jumps
      const pad = await p.locator('#pad').boundingBox();
      if (pad.height < 44) bad.push(`the jump pad is only ${Math.round(pad.height)} px tall`);
      await p.evaluate(() => { const q = __r.W.p; for (let i = 0; i < 600 && !q.ground; i++) __r.step(1 / 60); q.vy = 0; });   // let her land on a real roof first
      await p.locator('#pad').tap();
      assert.ok(await p.evaluate(() => __r.W.p.vy < 0), 'tapping the pad jumps');
      // tapping the street itself jumps too
      await p.evaluate(() => { __r.release(); const q = __r.W.p; for (let i = 0; i < 600 && !q.ground; i++) __r.step(1 / 60); q.vy = 0; q.airJumps = 0; q.buffer = 0; });
      const sc = await p.locator('#scene').boundingBox();
      if (sc.y + sc.height / 2 > s.height) bad.push('the street is below the bottom of the screen');
      await p.touchscreen.tap(sc.x + sc.width / 2, Math.min(sc.y + sc.height / 2, s.height - 2));
      assert.ok(await p.evaluate(() => __r.W.p.vy < 0), 'tapping the street jumps');
      await p.evaluate(() => { __r.release(); __r.end(__r.W, 'fell'); });
      await p.locator('#endCard').waitFor({ state: 'visible' });
      for (const x of await checkControls(p, '#endCard')) bad.push(`end card: ${x}`);
      await p.locator('#btnAgain').tap();
      await p.waitForFunction(() => __r.mode === 'play');
      assert.deepEqual(bad, []);
      assert.deepEqual(h.problems, []);
    } finally { await h.close(); }
  });

  test(`${s.name}: Sandbox`, async () => {
    const h = await phone(s, '/sandbox.html?embed=1#test');
    try {
      const p = h.page, bad = [];
      await p.waitForFunction(() => window.__s);
      await walkCards(p, bad, 'start');
      await p.locator('#btnNext').tap();
      await p.locator('#startCard').waitFor({ state: 'hidden' });
      for (const x of await checkControls(p)) bad.push(`playing: ${x}`);
      // every noise in the tray can be scrolled to and added with a tap
      const types = await p.locator('#tray .src').evaluateAll(es => es.map(e => e.dataset.type));
      let added = 0;
      for (const t of types.slice(0, 7)) {
        const before = await p.evaluate(() => __s.state.sources.length);
        await p.locator(`#tray .src[data-type="${t}"]`).tap();
        if (await p.evaluate(() => __s.state.sources.length) !== before + 1) bad.push(`tapping ${t} in the tray added nothing`); else added++;
      }
      assert.ok(added > 0);
      // a noise on the street can be dragged off it to remove it
      const n0 = await p.evaluate(() => __s.state.sources.length);
      const from = await p.evaluate(() => {
        const s = __s.state.sources[0], r = document.getElementById('scene').getBoundingClientRect();
        document.getElementById('scene').scrollIntoView({ block: 'center', behavior: 'instant' });
        const r2 = document.getElementById('scene').getBoundingClientRect();
        return [r2.left + __s.sx(s.x), r2.top + __s.sy(s.y), r2.bottom];
      });
      if (from[1] > s.height || from[1] < 0) bad.push('the first noise is drawn off screen');
      else {
        await p.mouse.move(from[0], from[1]); await p.mouse.down();
        await p.mouse.move(from[0], Math.min(s.height - 2, from[2] + 60), { steps: 8 }); await p.mouse.up();
        if (await p.evaluate(() => __s.state.sources.length) !== n0 - 1) bad.push('dragging a noise off the street did not remove it');
      }
      await p.locator('#btnNight').tap();
      assert.equal(await p.locator('#btnNight').getAttribute('aria-pressed'), 'true');
      assert.deepEqual(bad, []);
      assert.deepEqual(h.problems, []);
    } finally { await h.close(); }
  });

  test(`${s.name}: games menu, the hold-your-phone step and switching games`, async () => {
    const h = await phone(s, '/', { 'shema.intro': '1' });
    try {
      const p = h.page, bad = [];
      await p.locator('#picker').waitFor({ state: 'visible' });
      await p.waitForFunction(() => !document.getElementById('intro'), null, { timeout: 6000 }).catch(() => { });
      const intro = p.locator('#intro'); if (await intro.count()) { await intro.tap().catch(() => { }); await p.waitForFunction(() => !document.getElementById('intro')); }
      for (const x of await checkControls(p, '#picker')) bad.push(`menu: ${x}`);
      const want = { grandma: 'portrait', squirrel: 'landscape', sandbox: 'portrait' };
      for (const [game, tile] of [['grandma', '#tileGrandma'], ['squirrel', '#tileSquirrel'], ['sandbox', '#tileSandbox']]) {
        if (!(await p.locator('#picker').isVisible())) {
          await p.frameLocator('#game').locator('#btnMode').tap();
          await p.locator('#picker').waitFor({ state: 'visible' });
        }
        await p.locator(tile).tap();
        await p.locator('#picker').waitFor({ state: 'hidden' });
        const gate = p.locator('#gate');
        const wrongWay = (want[game] === 'portrait') !== s.upright;
        if (wrongWay) {
          await gate.waitFor({ state: 'visible' });
          for (const x of await checkControls(p, '#gate')) bad.push(`${game} hold-your-phone step: ${x}`);
          await p.locator('#gateGo').tap();
          await gate.waitFor({ state: 'hidden' });
        } else assert.equal(await gate.isVisible(), false, `${game}: no hold-your-phone step when it is already held the right way`);
        await p.frameLocator('#game').locator('#btnNext').waitFor();
        const f = p.frames().find(x => x.url().includes(`${game}.html`));
        for (const x of await checkControls(f, '#startCard')) bad.push(`${game} in the menu's frame: ${x}`);
      }
      assert.deepEqual(bad, []);
      assert.deepEqual(h.problems.filter(x => !/requestfailed/.test(x)), []);
    } finally { await h.close(); }
  });
}
