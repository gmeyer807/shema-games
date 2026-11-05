// Let Grandma Sleep: explainer cards, difficulty, the night itself, winning, losing, the end card,
// fairness of the spawner, and a bot that plays whole nights on every difficulty.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, skipIntro, noHorizontalScroll, badNumbers } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

async function grandma(opts = {}) {
  const h = await openPage(browser, server.url, '/grandma.html#test', opts);
  await skipIntro(h.page);
  await h.page.waitForFunction(() => window.__g);
  return h;
}
/** Starts a night and stops the real-time loop so the test drives the clock itself. */
async function startFrozen(page) {
  await page.evaluate(() => { __g.startGame(); __shemaPause(true); });
}
/** Advances the simulation by `s` seconds in 1/30 s steps. */
const run = (page, s) => page.evaluate(([s]) => { for (let i = 0; i < s * 30 && __g.G.mode === 'play'; i++) __g.step(1 / 30); return __g.G.mode; }, [s]);

test('explainer cards: four slides, Back/Next, arrow keys, last button starts the night', async () => {
  const h = await grandma();
  try {
    const p = h.page;
    assert.equal(await p.locator('#startCard').isVisible(), true);
    assert.equal(await p.locator('#btnBack').evaluate(e => e.style.visibility), 'hidden');
    for (let i = 1; i < 4; i++) await p.locator('#btnNext').click();
    assert.equal(await p.locator('#btnNext').textContent(), 'Start the night');
    assert.equal(await p.locator('#diffPick').isVisible(), true);
    await p.keyboard.press('ArrowLeft');
    assert.equal(await p.locator('#btnNext').textContent(), 'Next');
    await p.keyboard.press('ArrowRight');
    await p.locator('#btnNext').click();
    await p.locator('#hud').waitFor({ state: 'visible' });
    assert.equal(await p.locator('#startCard').isVisible(), false);
    assert.equal(await p.evaluate(() => __g.G.mode), 'play');
    assert.equal(await p.evaluate(() => localStorage.getItem('shema.grandma.seen')), '1');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('difficulty choice is marked, saved, and survives a reload', async () => {
  const h = await grandma();
  try {
    const p = h.page;
    for (let i = 1; i < 4; i++) await p.locator('#btnNext').click();
    assert.equal(await p.locator('#diffPick [data-d="normal"]').getAttribute('aria-checked'), 'true', 'Normal by default');
    await p.locator('#diffPick [data-d="hard"]').click();
    assert.equal(await p.locator('#diffPick [data-d="hard"]').getAttribute('aria-checked'), 'true');
    assert.equal(await p.locator('#diffPick [data-d="normal"]').getAttribute('aria-checked'), 'false');
    assert.equal(await p.evaluate(() => localStorage.getItem('shema.grandma.diff')), 'hard');
    await p.reload(); await skipIntro(p); await p.waitForFunction(() => window.__g);
    assert.equal(await p.evaluate(() => __g.D.name), 'Hard');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('a broken saved difficulty falls back to Normal', async () => {
  const h = await grandma({ storage: { 'shema.grandma.diff': 'impossible' } });
  try {
    assert.equal(await h.page.evaluate(() => __g.D.name), 'Normal');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('the street behind the start card stays alive and sane for a while', async () => {
  const h = await grandma();
  try {
    await h.page.waitForTimeout(3000);
    assert.equal(await h.page.evaluate(() => __g.G.mode), 'start');
    assert.equal(await h.page.evaluate(() => __g.G.noises.length), 3);
    assert.deepEqual(await badNumbers(h.page, '__g.G'), []);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('a quiet night is won with three stars and a 150 bonus, and the end card says so', async () => {
  const h = await grandma();
  try {
    const p = h.page;
    await startFrozen(p);
    await p.evaluate(() => { Object.assign(__g.G, { noises: [], spawnIn: 1e9, nextRush: 1e9 }); });
    assert.equal(await run(p, 80), 'won');
    await p.locator('#endCard').waitFor({ state: 'visible' });
    assert.match(await p.locator('#endTitle').textContent(), /^Grandma slept until 06:00 · Normal$/);
    assert.equal(await p.locator('#endStars').textContent(), '★★★');
    assert.equal(await p.locator('#stScore').textContent(), '150');
    assert.equal(await p.locator('#stLoud').textContent(), '—');
    assert.equal(await p.locator('#hud').isVisible(), false);
    assert.equal(await p.evaluate(() => localStorage.getItem('shema.grandma.best.normal')), '150');
    assert.equal(await p.locator('#bestTxt2').textContent(), 'Best on Normal: 150');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('losing: end card, wake-up time, best score kept', async () => {
  const h = await grandma({ storage: { 'shema.grandma.best.normal': '999' } });
  try {
    const p = h.page;
    await startFrozen(p);
    await p.evaluate(() => {
      Object.assign(__g.G, { noises: [], spawnIn: 1e9, nextRush: 1e9 });
      const n = __g.spawn(); Object.assign(n, { type: 'alarm', x: 47, y: 54, vx: 0, vy: 0, life: 999 });
    });
    assert.equal(await run(p, 40), 'over');
    const t = await p.evaluate(() => __g.G.t);
    const cap = await p.evaluate(() => __g.D.cap);
    assert.ok(t >= 100 / cap - 0.05, `meter filled in ${t.toFixed(2)} s, faster than its top speed`);
    await p.locator('#endCard').waitFor({ state: 'visible' });
    assert.match(await p.locator('#endTitle').textContent(), /^Grandma woke up at 2\d:\d\d · Normal$/);
    assert.equal(await p.locator('#endStars').textContent(), '');
    assert.equal(await p.evaluate(() => localStorage.getItem('shema.grandma.best.normal')), '999');
    assert.equal(await p.locator('#bestTxt2').textContent(), 'Best on Normal: 999');
    // the street ignores taps once the night is over
    await p.evaluate(() => __g.tapAt(10, 10));
    assert.equal(await p.evaluate(() => __g.G.queue.length), 0);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('end card buttons: Play again, Change difficulty, All games', async () => {
  const h = await grandma();
  try {
    const p = h.page;
    const finish = async () => {
      await startFrozen(p);
      await p.evaluate(() => Object.assign(__g.G, { noises: [], spawnIn: 1e9, nextRush: 1e9 }));
      await run(p, 80);
      await p.locator('#endCard').waitFor({ state: 'visible' });
    };
    await finish();
    await p.evaluate(() => __shemaPause(false));
    await p.locator('#btnAgain').click();
    assert.equal(await p.locator('#endCard').isVisible(), false);
    assert.equal(await p.locator('#hud').isVisible(), true);
    assert.deepEqual(await p.evaluate(() => [__g.G.mode, __g.G.score, __g.G.caught, __g.G.log.length]), ['play', 0, 0, 0]);

    await finish();
    await p.evaluate(() => __shemaPause(false));
    await p.locator('#btnLevel').click();
    assert.equal(await p.locator('#startCard').isVisible(), true);
    assert.equal(await p.locator('#diffPick').isVisible(), true, 'jumps straight to the difficulty card');

    await p.locator('#btnNext').click();
    await finish();
    assert.equal(await p.locator('#btnHome').isVisible(), true);
    assert.equal(await p.locator('#btnHome').textContent(), 'All games');
    await Promise.all([p.waitForURL(/\/index\.html$/), p.locator('#btnHome').click()]);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('tapping a noise with the mouse queues it, Shema turns, locks on and catches it', async () => {
  const h = await grandma();
  try {
    const p = h.page;
    await startFrozen(p);
    const [x, y] = await p.evaluate(() => {
      Object.assign(__g.G, { noises: [], spawnIn: 1e9, nextRush: 1e9 });
      const n = __g.spawn(); Object.assign(n, { type: 'dog', x: 20, y: 30, vx: 0, vy: 0, life: 999 });
      const r = document.getElementById('scene').getBoundingClientRect();
      return [r.left + __g.sx(n.x), r.top + __g.sy(n.y)];
    });
    await p.mouse.click(x, y);
    assert.equal(await p.evaluate(() => __g.G.queue.length), 1);
    // freeze the dog in place (it would otherwise wander) and let Shema work
    await p.evaluate(() => { for (let i = 0; i < 90 && __g.G.caught === 0; i++) { const n = __g.G.noises[0]; n.vx = n.vy = 0; n.turn = 99; __g.step(1 / 30); } });
    const g = await p.evaluate(() => ({ caught: __g.G.caught, score: __g.G.score, log: __g.G.log[0] }));
    assert.equal(g.caught, 1, 'caught within 3 s');
    assert.ok(g.score >= 10);
    assert.equal(g.log.type, 'dog');
    assert.ok(g.log.bearing > 90 && g.log.bearing < 180, 'a dog to the left is logged at a bearing past 90°');
    await p.evaluate(() => __shemaPause(false));
    await p.waitForFunction(() => document.getElementById('logCount').textContent === '1 caught');
    assert.match(await p.locator('#logList').textContent(), /Dog/);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('tapping empty street only nudges the aim, it does not queue anything', async () => {
  const h = await grandma();
  try {
    const p = h.page;
    await startFrozen(p);
    await p.evaluate(() => Object.assign(__g.G, { noises: [], spawnIn: 1e9, nextRush: 1e9 }));
    const [x, y] = await p.evaluate(() => { const r = document.getElementById('scene').getBoundingClientRect(); return [r.left + __g.sx(100), r.top + __g.sy(20)]; });
    await p.mouse.click(x, y);
    assert.equal(await p.evaluate(() => __g.G.queue.length), 0);
    assert.ok(await p.evaluate(() => __g.G.aimHint < 90), 'aim hint points right');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('quick catches build a combo that tops out at ×4', async () => {
  const h = await grandma();
  try {
    const combos = await h.page.evaluate(() => {
      __g.startGame(); __shemaPause(true);
      const out = [];
      for (let i = 0; i < 7; i++) { const n = __g.spawn(); __g.G.queue.unshift(n); __g.catchNoise(n); out.push(__g.G.combo); __g.G.t += 0.5; }
      __g.G.t += 5; const n = __g.spawn(); __g.G.queue.unshift(n); __g.catchNoise(n); out.push(__g.G.combo);
      return out;
    });
    assert.deepEqual(combos, [1, 2, 3, 4, 4, 4, 4, 1]);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('noises unlock through the night: only early ones at 22:00, all of them by 04:30', async () => {
  const h = await grandma();
  try {
    const r = await h.page.evaluate(() => {
      __g.startGame(); __shemaPause(true);
      const at = t => { __g.G.t = t; return __g.available().sort(); };
      return { start: at(0), end: at(__g.NIGHT_S - 0.1), all: Object.keys(__g.NOISES).sort() };
    });
    assert.deepEqual(r.start, ['cat', 'dog', 'owl', 'taxi']);
    assert.deepEqual(r.end, r.all);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('FAIRNESS: every noise, of every type, at every hour, stays inside Shema\'s 50 m reach for its whole life', async () => {
  const h = await grandma();
  try {
    const bad = await h.page.evaluate(() => {
      __g.startGame(); __shemaPause(true);
      const out = [];
      for (let k = 0; k < 600; k++) {
        __g.G.noises = []; __g.G.t = (k % 60) / 60 * __g.NIGHT_S;
        const n = __g.spawn();
        for (let i = 0; !n.gone && i < 40 * 30; i++) {
          if (!__g.inReach(n)) { out.push(`${n.type} at (${n.x.toFixed(1)}, ${n.y.toFixed(1)}) after ${n.age.toFixed(1)} s`); break; }
          __g.move(n, 1 / 30);
        }
      }
      return out;
    });
    assert.deepEqual(bad.slice(0, 10), []);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('FAIRNESS: the street never holds more catching work than the budget allows', async () => {
  const h = await grandma();
  try {
    const worst = await h.page.evaluate(() => {
      __g.setDiff('hard'); __g.startGame(); __shemaPause(true);
      let worst = -1e9;
      for (let i = 0; i < __g.NIGHT_S * 30 && __g.G.mode === 'play'; i++) {
        __g.G.wake = 0;                                   // nobody plays: keep her asleep so spawning never stops
        __g.step(1 / 30);
        const prog = __g.G.t / __g.NIGHT_S, budget = (3.3 + prog * 2.8) * __g.D.budget;
        const work = __g.G.noises.reduce((w, n) => w + (n.gone ? 0 : __g.catchCost(n)), 0);
        worst = Math.max(worst, work - (budget + 1.5 + 1.3));
      }
      return worst;
    });
    assert.ok(worst <= 1e-9, `over budget by ${worst.toFixed(2)} s of work`);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

// Easy and Normal should be reliably winnable by a quick player; Hard only has to be winnable.
for (const [diff, nights, need] of [['easy', 4, 3], ['normal', 4, 3], ['hard', 8, 1]]) {
  test(`a quick bot (one tap every 0.4 s on the noise bothering her most) wins at least ${need} of ${nights} nights on ${diff}`, async () => {
    const h = await grandma();
    try {
      const results = await h.page.evaluate(([diff, nights]) => {
        const res = [];
        for (let night = 0; night < nights; night++) {
          __g.setDiff(diff); __g.startGame(); __shemaPause(true);
          let nextTap = 0;
          for (let i = 0; i < 90 * 30 && __g.G.mode === 'play'; i++) {
            if (__g.G.t >= nextTap) {
              nextTap = __g.G.t + 0.4;
              const live = __g.G.noises.filter(n => !n.gone && !__g.G.queue.includes(n));
              live.sort((a, b) => (b.hurt || 0) - (a.hurt || 0));
              if (live[0]) __g.G.queue.push(live[0]);
            }
            __g.step(1 / 30);
          }
          res.push({ mode: __g.G.mode, wakeMax: Math.round(__g.G.wakeMax), caught: __g.G.caught, score: __g.G.score });
        }
        return res;
      }, [diff, nights]);
      const won = results.filter(r => r.mode === 'won').length;
      assert.ok(won >= need, `${diff}: bot won only ${won} of ${nights} nights ${JSON.stringify(results)}`);
      assert.ok(results.every(r => r.caught > 10 && Number.isFinite(r.score)));
      assert.deepEqual(await badNumbers(h.page, '__g.G'), []);
      assert.deepEqual(h.problems, []);
    } finally { await h.close(); }
  });
}

test('real-time play for a few seconds with random clicks throws no errors', async () => {
  const h = await grandma();
  try {
    const p = h.page;
    for (let i = 1; i < 4; i++) await p.locator('#btnNext').click();
    await p.locator('#btnNext').click();
    const box = await p.locator('#scene').boundingBox();
    for (let i = 0; i < 40; i++) { await p.mouse.click(box.x + Math.random() * box.width, box.y + Math.random() * box.height); await p.waitForTimeout(60); }
    assert.notEqual(await p.locator('#hudClock').textContent(), '22:00');
    assert.deepEqual(await badNumbers(p, '__g.G'), []);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('pausing (as the picker does) freezes the night', async () => {
  const h = await grandma();
  try {
    const p = h.page;
    await p.evaluate(() => { __g.startGame(); __shemaPause(true); });
    const t = await p.evaluate(() => __g.G.t);
    await p.waitForTimeout(500);
    assert.equal(await p.evaluate(() => __g.G.t), t);
    await p.evaluate(() => __shemaPause(false));
    await p.waitForTimeout(500);
    assert.ok(await p.evaluate(() => __g.G.t) > t);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('the sound button turns sound off and remembers it', async () => {
  const h = await grandma();
  try {
    const p = h.page;
    assert.equal(await p.locator('#btnSound').getAttribute('aria-pressed'), 'true');
    await p.locator('#btnSound').click();
    assert.equal(await p.locator('#btnSound').getAttribute('aria-pressed'), 'false');
    assert.equal(await p.locator('#sndLabel').textContent(), 'Sound off');
    assert.equal(await p.evaluate(() => localStorage.getItem('shema.sound')), '0');
    await p.locator('#btnSound').click();
    assert.equal(await p.evaluate(() => localStorage.getItem('shema.sound')), '1');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('the switch button works while the explainer cards are open (standalone goes to index.html)', async () => {
  const h = await grandma();
  try {
    await Promise.all([h.page.waitForURL(/\/index\.html$/), h.page.locator('#btnMode').click({ timeout: 3000 })]);
  } finally { await h.close(); }
});

for (const vp of [{ width: 375, height: 740, name: 'phone upright' }, { width: 740, height: 360, name: 'phone sideways' }]) {
  test(`fits a ${vp.name}: no sideways scroll, cards clear of the top buttons, end card buttons on screen`, async () => {
    const h = await grandma({ viewport: vp, mobile: true, touch: true });
    try {
      const p = h.page;
      assert.ok(await noHorizontalScroll(p));
      const overlap = () => p.evaluate(sel => { const a = document.getElementById('btnMode').getBoundingClientRect(), b = document.querySelector(sel).getBoundingClientRect(); return a.bottom > b.top + 1 && a.top < b.bottom && a.right > b.left && a.left < b.right; }, '#startCard .ocard');
      assert.equal(await overlap(), false, 'switch button does not sit on top of the explainer card');
      await startFrozen(p);
      await p.evaluate(() => Object.assign(__g.G, { noises: [], spawnIn: 1e9, nextRush: 1e9 }));
      await run(p, 80);
      await p.locator('#endCard').waitFor({ state: 'visible' });
      for (const id of ['#btnAgain', '#btnLevel', '#btnHome']) {
        const b = await p.locator(id).boundingBox();
        assert.ok(b && b.y >= 0 && b.y + b.height <= vp.height + 1 && b.x >= 0 && b.x + b.width <= vp.width + 1, `${id} is on screen: ${JSON.stringify(b)}`);
      }
      await p.locator('#btnHome').tap();
      await p.waitForURL(/\/index\.html$/);
      assert.deepEqual(h.problems, []);
    } finally { await h.close(); }
  });
}

test('a tap stamped after the frame began does not crash the drawing (it used to draw a negative circle and stop the game)', async () => {
  const h = await grandma();
  try {
    const p = h.page;
    await p.evaluate(() => __g.startGame());
    await p.evaluate(() => { const t = performance.now() + 400; __g.G.taps.push({ x: 50, y: 50, t0: t }); __g.G.pops.push({ x: 50, y: 30, t0: t, c: 'dog' }); __g.G.floats.push({ x: 50, y: 30, text: '+1', color: 'amber', t0: t }); });
    const t0 = await p.evaluate(() => __g.G.t);
    await p.waitForTimeout(600);
    assert.ok(await p.evaluate(() => __g.G.t) > t0, 'the night keeps running');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});
