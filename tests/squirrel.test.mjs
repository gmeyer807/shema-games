// Squirrel Run: explainer cards, jumping physics, falling, getting caught, the end card, the
// level generator's fairness (a bot that only ever does plain jumps), and phone layouts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, skipIntro, noHorizontalScroll, badNumbers } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

async function squirrel(opts = {}) {
  const h = await openPage(browser, server.url, '/squirrel.html#test', opts);
  await skipIntro(h.page);
  await h.page.waitForFunction(() => window.__r);
  return h;
}
/** Starts a run with the real-time loop paused, so the test drives the clock. */
const startFrozen = page => page.evaluate(() => { __r.start(); __shemaPause(true); });
/** Steps the run up to `s` seconds (stops early when it ends). */
const run = (page, s) => page.evaluate(s => { for (let i = 0; i < s * 60 && !__r.W.over; i++) __r.step(1 / 60); return __r.W.over; }, s);
/** A world with just the first roof and nothing after it. */
const noMoreRoofs = page => page.evaluate(() => { const w = __r.W; w.plats = [w.plats[0]]; w.plats[0].w = 400; w.genX = Infinity; w.items = []; w.nextBird = w.nextTaxi = w.nextRain = 1e9; });

test('explainer cards: three slides ending in "Start running"', async () => {
  const h = await squirrel();
  try {
    const p = h.page;
    assert.equal(await p.locator('#startCard').isVisible(), true);
    await p.locator('#btnNext').click();
    await p.locator('#btnNext').click();
    assert.equal(await p.locator('#btnNext').textContent(), 'Start running');
    await p.locator('#btnBack').click();
    assert.equal(await p.locator('#btnNext').textContent(), 'Next');
    await p.locator('#btnNext').click();
    await p.locator('#btnNext').click();
    assert.equal(await p.evaluate(() => __r.mode), 'play');
    assert.equal(await p.locator('#startCard').isVisible(), false);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('the idle street behind the cards keeps running without ending or going NaN', async () => {
  const h = await squirrel();
  try {
    const x0 = await h.page.evaluate(() => __r.attract.p.x);
    await h.page.waitForTimeout(3000);
    assert.equal(await h.page.evaluate(() => __r.mode), 'start');
    assert.notEqual(await h.page.evaluate(() => __r.attract.p.x), x0, 'the demo squirrel keeps running');
    assert.deepEqual(await badNumbers(h.page, '__r.attract'), []);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('jumping: tap = plain jump, one extra hop in the air, a third tap is buffered for the landing', async () => {
  const h = await squirrel();
  try {
    const r = await h.page.evaluate(() => {
      __r.start(); __shemaPause(true);
      const p = __r.W.p, out = {};
      __r.press(); out.v1 = p.vy; __r.release();
      __r.step(1 / 60);
      __r.press(); out.v2 = p.vy; out.air2 = p.airJumps; __r.release();
      __r.step(1 / 60);
      __r.press(); out.buffer = p.buffer; out.v3 = p.vy;
      return out;
    });
    assert.equal(r.v1, -620);
    assert.equal(r.v2, -500);
    assert.equal(r.air2, 0);
    assert.ok(r.buffer > 0, 'third press is buffered');
    assert.ok(r.v3 > -500, 'third press does not jump');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('holding the jump goes higher than a tap', async () => {
  const h = await squirrel();
  try {
    const [tap, hold] = await h.page.evaluate(() => {
      const apex = holdFor => {
        __r.start(); __shemaPause(true);
        const p = __r.W.p, y0 = p.y; let top = y0, t = 0;
        __r.press();
        while (t < 1.2) { if (t >= holdFor) __r.release(); __r.step(1 / 120); t += 1 / 120; top = Math.min(top, p.y); if (p.ground) break; }
        return y0 - top;
      };
      return [apex(0), apex(0.5)];
    });
    assert.ok(tap > 70 && tap < 95, `plain jump ≈ 84 units, got ${tap.toFixed(1)}`);
    assert.ok(hold > tap + 30, `held jump (${hold.toFixed(1)}) clearly higher than a tap (${tap.toFixed(1)})`);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('the buffered tap jumps again on landing', async () => {
  const h = await squirrel();
  try {
    const r = await h.page.evaluate(() => {
      __r.start(); __shemaPause(true);
      const p = __r.W.p;
      __r.press(); __r.release(); __r.step(1 / 60); __r.press(); __r.release();
      let jumpedAgain = false;
      for (let i = 0; i < 200; i++) {
        if (p.vy > 0 && p.y > 240 && p.buffer <= 0) __r.press();    // tap just before landing
        const wasAir = !p.ground; __r.step(1 / 120);
        if (wasAir && p.vy === -620) { jumpedAgain = true; break; }
      }
      return jumpedAgain;
    });
    assert.ok(r);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('running off the last roof is a fall: run ends, end card says where', async () => {
  const h = await squirrel();
  try {
    const p = h.page;
    await startFrozen(p);
    await noMoreRoofs(p);
    assert.equal(await run(p, 5), 'fell');
    assert.equal(await p.evaluate(() => __r.mode), 'over');
    await p.locator('#endCard').waitFor({ state: 'visible' });
    assert.match(await p.locator('#endTitle').textContent(), /^You fell at \d+ m$/);
    assert.match(await p.locator('#endText').textContent(), /Missed the jump/);
    const m = +(await p.locator('#endTitle').textContent()).match(/(\d+) m/)[1];
    assert.equal(await p.locator('#endArt').textContent(), `${m} m`);
    assert.equal(await p.locator('#stScore').textContent(), String(m + 5 * (await p.evaluate(() => __r.W.acorns))));
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('a loud crash in plain view gets you caught: "Shema caught you"', async () => {
  const h = await squirrel();
  try {
    const p = h.page;
    await startFrozen(p);
    const why = await p.evaluate(() => {
      const w = __r.W; w.nextBird = w.nextTaxi = w.nextRain = 1e9;
      w.plats[0].w = 1e6; w.genX = Infinity; w.items = [];
      for (let i = 0; i < 60 * 8 && !w.over; i++) { w.noise = 80; __r.step(1 / 60); }
      return w.over;
    });
    assert.equal(why, 'caught');
    await p.locator('#endCard').waitFor({ state: 'visible' });
    assert.match(await p.locator('#endTitle').textContent(), /^Shema caught you at \d+ m$/);
    assert.match(await p.locator('#endText').textContent(), /Shema locked on/);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('hiding in a tree lets the lock-on ring drain', async () => {
  const h = await squirrel();
  try {
    const r = await h.page.evaluate(() => {
      __r.start(); __shemaPause(true);
      const w = __r.W; w.nextBird = w.nextTaxi = w.nextRain = 1e9;
      w.plats[0].kind = 'tree'; w.lock = 0.8; w.noise = 80;
      for (let i = 0; i < 60; i++) __r.step(1 / 60);
      return { hidden: w.hidden, heard: w.heard, lock: w.lock, over: w.over };
    });
    assert.equal(r.hidden, true);
    assert.equal(r.heard, false);
    assert.ok(r.lock < 0.8, 'ring drains');
    assert.equal(r.over, null);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('landings: tin roofs are louder than tiles, trees the quietest; rain raises the masking ambient', async () => {
  const h = await squirrel();
  try {
    const r = await h.page.evaluate(() => {
      const land = kind => { __r.start(); __shemaPause(true); const w = __r.W; w.plats[0].kind = kind; w.noise = 0; __r.press(); __r.release(); for (let i = 0; i < 120 && !w.p.ground; i++) __r.step(1 / 60); return w.loudest; };
      const tin = land('tin'), roof = land('roof'), tree = land('tree');
      __r.start(); __shemaPause(true); const a0 = __r.ambient(__r.W); __r.W.rain = 1; const a1 = __r.ambient(__r.W);
      return { tin, roof, tree, a0, a1 };
    });
    assert.ok(r.tin > r.roof && r.roof > r.tree, JSON.stringify(r));
    assert.equal(r.a0, 40);
    assert.equal(r.a1, 54);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('best score: "New best!" the first time, kept when a later run is worse', async () => {
  const h = await squirrel();
  try {
    const p = h.page;
    await startFrozen(p);
    await p.evaluate(() => { const w = __r.W; w.p.x = 120 + 40 * 30; });   // 30 m in
    await noMoreRoofs(p);
    await p.evaluate(() => { const w = __r.W; w.plats[0].x = w.p.x - 100; w.plats[0].w = 150; });
    await run(p, 5);
    await p.locator('#endCard').waitFor({ state: 'visible' });
    assert.equal(await p.locator('#bestTxt').textContent(), 'New best!');
    const best = +(await p.evaluate(() => localStorage.getItem('shema.squirrel.best')));
    assert.ok(best >= 30);
    await p.evaluate(() => __shemaPause(false));
    await p.locator('#btnAgain').click();
    await startFrozen(p);
    await noMoreRoofs(p);
    await p.evaluate(() => { __r.W.plats[0].w = 60; });
    await run(p, 5);
    await p.locator('#endCard').waitFor({ state: 'visible' });
    assert.equal(await p.locator('#bestTxt').textContent(), `Best: ${best}`);
    assert.equal(+(await p.evaluate(() => localStorage.getItem('shema.squirrel.best'))), best);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('end card buttons: Run again, How to play, All games; Space also restarts (once)', async () => {
  const h = await squirrel();
  try {
    const p = h.page;
    const fall = async () => { await startFrozen(p); await noMoreRoofs(p); await run(p, 5); await p.locator('#endCard').waitFor({ state: 'visible' }); await p.evaluate(() => __shemaPause(false)); };
    await fall();
    assert.equal(await p.evaluate(() => document.activeElement.id), 'btnAgain', 'Run again has focus');
    await p.locator('#btnAgain').click();
    assert.equal(await p.evaluate(() => __r.mode), 'play');
    assert.equal(await p.locator('#endCard').isVisible(), false);
    assert.ok(await p.evaluate(() => __r.W.t < 1), 'a fresh world');

    await fall();
    await p.keyboard.press('Space');
    assert.equal(await p.evaluate(() => __r.mode), 'play');
    assert.equal(await p.locator('#endCard').isVisible(), false);
    assert.equal(await p.evaluate(() => __r.W.p.vy), 0, 'the restart press is not also a jump');

    await fall();
    await p.locator('#btnHow').click();
    assert.equal(await p.locator('#startCard').isVisible(), true);
    assert.equal(await p.locator('#btnBack').evaluate(e => e.style.visibility), 'hidden', 'back on the first card');
    await p.locator('#btnNext').click(); await p.locator('#btnNext').click(); await p.locator('#btnNext').click();

    await fall();
    assert.equal(await p.locator('#btnHome').textContent(), 'All games');
    await Promise.all([p.waitForURL(/\/index\.html$/), p.locator('#btnHome').click()]);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('input: Space, ArrowUp, W, and pressing the panel all jump during a run', async () => {
  const h = await squirrel();
  try {
    const p = h.page;
    for (const key of ['Space', 'ArrowUp', 'KeyW']) {
      await startFrozen(p);
      await p.keyboard.press(key);
      assert.equal(await p.evaluate(() => __r.W.p.vy), -620, key);
    }
    await startFrozen(p);
    const pad = await p.locator('#pad').boundingBox();
    await p.mouse.move(pad.x + pad.width / 2, pad.y + pad.height / 2);
    await p.mouse.down();
    assert.equal(await p.evaluate(() => [__r.W.p.vy, __r.W.p.holding].join()), '-620,true');
    await p.mouse.up();
    assert.equal(await p.evaluate(() => __r.W.p.holding), false);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

for (const [label, early] of [['last-moment', 0], ['slightly early (20 units before the edge)', 20]]) {
  test(`FAIRNESS: a bot that only does plain, ${label} jumps never falls in 20 seeded runs of 2½ minutes`, async () => {
  const h = await squirrel();
  try {
    const falls = await h.page.evaluate((early) => {
      const out = [];
      const realRandom = Math.random;
      for (let k = 0; k < 20; k++) {
        let x = (k + 1 + early * 1000) * 2654435761 % 4294967296;
        Math.random = () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
        __r.start(); __shemaPause(true);
        const w = __r.W, p = w.p;
        let holdUntil = -1;
        for (let i = 0; i < 155 * 60 && !w.over; i++) {
          w.lock = 0;                                   // only falling is being tested here
          const g = p.ground, S = __r.speedAt(w.t);
          if (g) {
            const next = w.plats.filter(q => q.x > g.x + g.w - 1).sort((a, b) => a.x - b.x)[0];
            const lower = next && next.y > g.y + 20;
            if (!lower && p.x - __r.HALF + S * 2 / 60 + early > g.x + g.w) { __r.press(); holdUntil = w.t; }
          }
          if (w.t > holdUntil) __r.release();
          const before = { g: p.ground && { x: p.ground.x, w: p.ground.w, y: p.ground.y } };
          __r.step(1 / 60);
          if (w.over === 'fell') {
            const prev = w.plats.filter(q => q.x + q.w < p.x).sort((a, b) => b.x - a.x)[0];
            const nxt = w.plats.filter(q => q.x > (prev ? prev.x + prev.w : 0)).sort((a, b) => a.x - b.x)[0];
            out.push({ seed: k + 1 + early * 1000, t: +w.t.toFixed(1), gap: prev && nxt ? Math.round(nxt.x - prev.x - prev.w) : null, dh: prev && nxt ? Math.round(prev.y - nxt.y) : null, next: nxt && nxt.kind, blocked: p.blocked });
          }
        }
      }
      Math.random = realRandom;
      return out;
    }, early);
    assert.deepEqual(falls, [], `plain jumps should always be enough: ${JSON.stringify(falls)}`);
    assert.deepEqual(await badNumbers(h.page, '__r.W'), []);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});
}

test('FAIRNESS: cats never sit near a roof edge, and nothing is generated out of reach above the view', async () => {
  const h = await squirrel();
  try {
    const r = await h.page.evaluate(() => {
      const bad = [];
      for (let k = 0; k < 20; k++) {
        const w = __r.newWorld(); w.t = 200;               // late game: the most cats and the widest gaps
        __r.generate(w, 40000);
        for (const it of w.items.filter(i => i.type === 'cat')) {
          const q = w.plats.find(q => it.x >= q.x && it.x <= q.x + q.w && q.y === it.y);
          if (!q || it.x - q.x < q.w * 0.4 || q.x + q.w - it.x < q.w * 0.3) bad.push({ cat: it.x, plat: q && [q.x, q.w] });
        }
        for (const q of w.plats) if (q.y < 190 || q.y > 300 || !Number.isFinite(q.x) || !Number.isFinite(q.w)) bad.push({ plat: [q.x, q.w, q.y] });
      }
      return bad;
    });
    assert.deepEqual(r, []);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('real-time run with random tapping throws no errors', async () => {
  const h = await squirrel();
  try {
    const p = h.page;
    await p.evaluate(() => __r.start());
    for (let i = 0; i < 40; i++) {
      if (await p.evaluate(() => __r.mode) !== 'play') { await p.waitForTimeout(800); await p.evaluate(() => __r.start()); }
      await p.keyboard.down('Space'); await p.waitForTimeout(40 + Math.random() * 120); await p.keyboard.up('Space');
      await p.waitForTimeout(80);
    }
    assert.deepEqual(await badNumbers(p, '__r.W'), []);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('the switch button works while the explainer cards are open (standalone goes to index.html)', async () => {
  const h = await squirrel();
  try {
    await Promise.all([h.page.waitForURL(/\/index\.html$/), h.page.locator('#btnMode').click({ timeout: 3000 })]);
  } finally { await h.close(); }
});

for (const vp of [{ width: 375, height: 740, name: 'phone upright' }, { width: 740, height: 360, name: 'phone sideways' }]) {
  test(`fits a ${vp.name}: no sideways scroll, cards clear of the top buttons, end card buttons on screen`, async () => {
    const h = await squirrel({ viewport: vp, mobile: true, touch: true });
    try {
      const p = h.page;
      assert.ok(await noHorizontalScroll(p));
      const overlap = await p.evaluate(() => { const a = document.getElementById('btnMode').getBoundingClientRect(), b = document.querySelector('#startCard .ocard').getBoundingClientRect(); return a.bottom > b.top + 1; });
      assert.equal(overlap, false);
      await startFrozen(p); await noMoreRoofs(p); await run(p, 5);
      await p.locator('#endCard').waitFor({ state: 'visible' });
      for (const id of ['#btnAgain', '#btnHow', '#btnHome']) {
        const b = await p.locator(id).boundingBox();
        assert.ok(b && b.y >= 0 && b.y + b.height <= vp.height + 1 && b.x >= 0 && b.x + b.width <= vp.width + 1, `${id} is on screen: ${JSON.stringify(b)}`);
      }
      await p.locator('#btnHome').tap();
      await p.waitForURL(/\/index\.html$/);
      assert.deepEqual(h.problems, []);
    } finally { await h.close(); }
  });
}

test('iPhone sideways: the street keeps its size as the status line changes and Safari\'s toolbar comes and goes', async () => {
  for (const vp of [{ width: 844, height: 390 }, { width: 568, height: 320 }, { width: 390, height: 844 }]) {
    const h = await squirrel({ viewport: vp, touch: true, mobile: true });
    try {
      const p = h.page;
      await startFrozen(p);
      const size = () => p.evaluate(() => { const r = document.getElementById('scene').getBoundingClientRect(); return { h: Math.round(r.height), K: +__r.view.K.toFixed(4), pad: Math.round(document.getElementById('pad').getBoundingClientRect().height) }; });
      const first = await size();
      // every message the panel can show, including the longest ones
      for (const set of ['w.lock = 0.5; w.heard = true', 'w.hidden = true', 'w.rain = 1', 'w.quiet = 3', 'w.lock = 0.5', 'w.p.ground = null']) {
        await p.evaluate(s => { const w = __r.W; w.lock = 0; w.heard = false; w.hidden = false; w.rain = 0; w.quiet = 0; new Function('w', s)(w); }, set);
        await p.waitForTimeout(150);
        assert.deepEqual(await size(), first, `${vp.width}×${vp.height} after ${set}`);
      }
      if (vp.width > vp.height) {
        // the toolbar takes ~50 px away, then gives it back: the zoom must not change
        await p.setViewportSize({ width: vp.width, height: vp.height - 50 }); await p.waitForTimeout(150);
        assert.equal((await size()).K, first.K, `${vp.width}×${vp.height} toolbar in`);
        await p.setViewportSize(vp); await p.waitForTimeout(150);
        assert.deepEqual(await size(), first, `${vp.width}×${vp.height} toolbar out`);
      }
      assert.deepEqual(h.problems, []);
    } finally { await h.close(); }
  }
});
