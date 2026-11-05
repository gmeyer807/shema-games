// Sandbox: adding, dragging and removing noises, the 8-noise limit, Shema's detection (opens at
// ambient + 7, 2 s post-roll, one record per disturbance), locating, the SANS 10103 verdicts, rain and
// day/night, and a soak with every noise on the street at once.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, skipIntro, noHorizontalScroll, badNumbers } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

async function sandbox(opts = {}) {
  const h = await openPage(browser, server.url, '/sandbox.html#test', opts);
  await skipIntro(h.page);
  await h.page.waitForFunction(() => window.__s);
  return h;
}
async function openStreet(page) {
  await page.locator('#btnNext').click(); await page.locator('#btnNext').click();
  assert.equal(await page.locator('#btnNext').textContent(), 'Open the street');
  await page.locator('#btnNext').click();
  await page.locator('#startCard').waitFor({ state: 'hidden' });
}
/** Empties the street, pauses the real-time loop, and lets the meter settle at the ambient. */
const quiet = page => page.evaluate(() => {
  __shemaPause(true);
  for (const s of [...__s.state.sources]) __s.removeSource(s);
  for (let i = 0; i < 30 * 8; i++) __s.step(1 / 30);
  __s.state.events.length = 0;
});
const run = (page, s) => page.evaluate(s => { for (let i = 0; i < s * 30; i++) __s.step(1 / 30); }, s);

test('explainer cards open onto a street with a barking dog already on it', async () => {
  const h = await sandbox();
  try {
    await openStreet(h.page);
    assert.deepEqual(await h.page.evaluate(() => __s.state.sources.map(s => s.type)), ['dog']);
    assert.equal(await h.page.locator('#tray .src').count(), 14);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('tapping a noise in the tray adds it; the tray locks at 8; Clear street empties it', async () => {
  const h = await sandbox();
  try {
    const p = h.page;
    await openStreet(p);
    for (const t of ['cat', 'owl', 'taxi', 'drill', 'alarm', 'boombox', 'frog']) await p.locator(`#tray .src[data-type="${t}"]`).click();
    assert.equal(await p.evaluate(() => __s.state.sources.length), 8);
    assert.equal(await p.locator('#tray .src[data-type="rooster"]').isDisabled(), true, 'tray is disabled when full');
    assert.equal(await p.evaluate(() => __s.addSource('rooster', 50, 30)), null, 'a 9th noise is refused');
    const spread = await p.evaluate(() => { const s = __s.state.sources; let min = 1e9; for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) min = Math.min(min, Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y)); return min; });
    assert.ok(spread > 3, 'tapped noises do not land on top of each other');
    await p.getByRole('button', { name: 'Clear street' }).click();
    assert.equal(await p.evaluate(() => __s.state.sources.length), 0);
    assert.equal(await p.locator('#tray .src[data-type="rooster"]').isDisabled(), false);
    assert.equal(await p.locator('#hint').isVisible(), false, 'the hint goes once you have used the tray');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('the keyboard can add noises from the tray (Enter and Space)', async () => {
  const h = await sandbox();
  try {
    const p = h.page;
    await openStreet(p);
    await p.locator('#tray .src[data-type="owl"]').focus();
    await p.keyboard.press('Enter');
    await p.keyboard.press(' ');
    assert.deepEqual(await p.evaluate(() => __s.state.sources.map(s => s.type)), ['dog', 'owl', 'owl']);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('dragging from the tray drops the noise where you let go', async () => {
  const h = await sandbox();
  try {
    const p = h.page;
    await openStreet(p);
    const from = await p.locator('#tray .src[data-type="vuvuzela"]').boundingBox();
    const [tx, ty] = await p.evaluate(() => { const r = document.getElementById('scene').getBoundingClientRect(); return [r.left + __s.sx(80), r.top + __s.sy(20)]; });
    await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await p.mouse.down();
    await p.mouse.move(from.x + 20, from.y - 30, { steps: 4 });
    assert.equal(await p.locator('.ghost').count(), 1, 'a ghost follows the pointer');
    await p.mouse.move(tx, ty, { steps: 8 });
    await p.mouse.up();
    assert.equal(await p.locator('.ghost').count(), 0);
    const s = await p.evaluate(() => __s.state.sources.find(s => s.type === 'vuvuzela'));
    assert.ok(s && Math.abs(s.x - 80) < 1.5 && Math.abs(s.y - 20) < 1.5, JSON.stringify(s));
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('a noise can be moved on the street, and dragging it off the street removes it', async () => {
  const h = await sandbox();
  try {
    const p = h.page;
    await openStreet(p);
    const at = (x, y) => p.evaluate(([x, y]) => { const r = document.getElementById('scene').getBoundingClientRect(); return [r.left + __s.sx(x), r.top + __s.sy(y)]; }, [x, y]);
    const [dx, dy] = await at(40, 30);
    const [mx, my] = await at(70, 15);
    await p.mouse.move(dx, dy); await p.mouse.down();
    assert.equal(await p.locator('#bin').isVisible(), true, 'the bin appears while dragging');
    await p.mouse.move(mx, my, { steps: 6 }); await p.mouse.up();
    const dog = await p.evaluate(() => __s.state.sources[0]);
    assert.ok(Math.abs(dog.x - 70) < 1.5 && Math.abs(dog.y - 15) < 1.5);
    assert.equal(await p.locator('#bin').isVisible(), false);
    await p.mouse.move(mx, my); await p.mouse.down();
    const bin = await p.locator('#bin').boundingBox();
    await p.mouse.move(bin.x + bin.width / 2, bin.y + bin.height / 2, { steps: 6 }); await p.mouse.up();
    assert.equal(await p.evaluate(() => __s.state.sources.length), 0, 'dropped in the bin');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('a dog over the road is recorded, classified as a dog, located at the right bearing, and closed 2 s after it stops', async () => {
  const h = await sandbox();
  try {
    const p = h.page;
    await openStreet(p);
    await quiet(p);
    await p.evaluate(() => __s.addSource('dog', 35, 38));
    await run(p, 4);
    const ev = await p.evaluate(() => __s.state.events[0]);
    assert.ok(ev, 'an event was opened');
    assert.equal(ev.cls, 'dog');
    const truth = await p.evaluate(() => __s.geom({ x: 35, y: 38 }).b);
    assert.ok(Math.abs(ev.bearing - truth) < 12, `bearing ${ev.bearing.toFixed(1)}° vs true ${truth.toFixed(1)}°`);
    await p.evaluate(() => __s.removeSource(__s.state.sources[0]));
    await run(p, 1);
    assert.equal(await p.evaluate(() => __s.state.det.open), true, 'post-roll keeps it open');
    await run(p, 6);
    assert.equal(await p.evaluate(() => __s.state.det.open), false);
    assert.equal(await p.evaluate(() => __s.state.events.length), 1, 'the barking is one disturbance, not one per bark');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('a dog that barks, stops for a bit, and starts again is the same record (within 30 s)', async () => {
  const h = await sandbox();
  try {
    const p = h.page;
    await openStreet(p);
    await quiet(p);
    await p.evaluate(() => __s.addSource('dog', 35, 38));
    await run(p, 4);
    await p.evaluate(() => __s.removeSource(__s.state.sources[0]));
    await run(p, 10);
    await p.evaluate(() => __s.addSource('dog', 35, 38));
    await run(p, 4);
    const evs = await p.evaluate(() => __s.state.events.map(e => [e.cls, e.detections]));
    assert.deepEqual(evs, [['dog', 2]]);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('Shema cannot locate a noise behind the house or further than 50 m', async () => {
  const h = await sandbox();
  try {
    const p = h.page;
    await openStreet(p);
    for (const [x, y, why] of [[55, 70, 'behind the wall'], [2, 3, 'further than 50 m']]) {
      await quiet(p);
      const r = await p.evaluate(([x, y]) => {
        const s = __s.addSource('alarm', x, y);
        for (let i = 0; i < 30 * 3; i++) __s.step(1 / 30);
        return { g: s.g, reading: __s.currentReading(), loud: __s.state.loud };
      }, [x, y]);
      assert.ok(r.g.behind || r.g.d > 50, why);
      assert.equal(r.reading, null, `${why}: no direction or class`);
    }
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('verdicts follow SANS 10103: 50 dB(A) by day, 40 at night, tonal penalty, nuisances', async () => {
  const h = await sandbox();
  try {
    const r = await h.page.evaluate(() => {
      __shemaPause(true);
      const out = {};
      __s.setNight(false); __s.state.ambient = 45;
      out.day = [__s.judge('dog', 49.9).disturbing, __s.judge('dog', 50.1).disturbing, __s.judge('dog', 50).acc];
      out.dayDrill = __s.judge('power_tools', 60).nuisance;
      __s.setNight(true); __s.state.ambient = 35;
      out.night = [__s.judge('dog', 39.9).disturbing, __s.judge('dog', 40.1).disturbing, __s.judge('dog', 40).acc];
      out.nightDrill = __s.judge('power_tools', 30).nuisance;
      out.nightMusic = [__s.judge('music', 39).nuisance, __s.judge('music', 45).nuisance];
      __s.state.ambient = 55;
      out.loudAmbient = __s.judge('dog', 50).acc;
      return out;
    });
    assert.deepEqual(r.day, [false, true, 50]);
    assert.equal(r.dayDrill, '');
    assert.deepEqual(r.night, [false, true, 40]);
    assert.equal(r.nightDrill, 'Power tools after 18:00');
    assert.deepEqual(r.nightMusic, ['', 'Loud music at night']);
    assert.equal(r.loudAmbient, 55, 'the ambient is the limit when it is louder');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('the tonal noises get +5 dB in the rating', async () => {
  const h = await sandbox();
  try {
    const p = h.page;
    await openStreet(p);
    await quiet(p);
    const r = await p.evaluate(() => { __s.addSource('alarm', 50, 30); for (let i = 0; i < 90; i++) __s.step(1 / 30); const r = __s.currentReading(); return r.rating - r.s.las; });
    assert.equal(Math.round(r * 10) / 10, 5);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('rain lifts the ambient and is never recorded as a disturbance', async () => {
  const h = await sandbox();
  try {
    const p = h.page;
    await openStreet(p);
    await quiet(p);
    await p.evaluate(() => __s.addSource('rain', 55, 30));
    await run(p, 10);
    const r = await p.evaluate(() => ({ amb: __s.state.ambient, events: __s.state.events.length, open: __s.state.det.open }));
    assert.ok(r.amb > 53 && r.amb < 54);
    assert.equal(r.events, 0);
    assert.equal(r.open, false);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('taking the rain away does not record a phantom "unknown" event', async () => {
  const h = await sandbox();
  try {
    const p = h.page;
    await openStreet(p);
    await quiet(p);
    await p.evaluate(() => __s.addSource('rain', 55, 30));
    await run(p, 10);
    await p.evaluate(() => __s.removeSource(__s.state.sources[0]));
    await run(p, 10);
    assert.deepEqual(await p.evaluate(() => __s.state.events.map(e => e.cls)), []);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('switching from day to night on a quiet street does not record a phantom event', async () => {
  const h = await sandbox();
  try {
    const p = h.page;
    await openStreet(p);
    await quiet(p);
    await p.locator('#btnNight').click();
    assert.equal(await p.locator('#btnNight').getAttribute('aria-pressed'), 'true');
    await run(p, 10);
    assert.deepEqual(await p.evaluate(() => __s.state.events.map(e => e.cls)), []);
    assert.equal(await p.evaluate(() => Math.round(__s.state.ambient)), 35);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('the event list never grows past 30 records', async () => {
  const h = await sandbox();
  try {
    const p = h.page;
    await openStreet(p);
    await quiet(p);
    const n = await p.evaluate(() => {
      const types = ['dog', 'alarm', 'drill', 'boombox', 'taxi'];
      for (let k = 0; k < 45; k++) {
        const s = __s.addSource(types[k % types.length], 15 + (k * 13) % 80, 15 + (k * 7) % 30);
        for (let i = 0; i < 30 * 3; i++) __s.step(1 / 30);
        __s.removeSource(s);
        for (let i = 0; i < 30 * 35; i++) __s.step(1 / 30);    // > 30 s apart, so each is its own record
      }
      return __s.state.events.length;
    });
    assert.equal(n, 30);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('soak: every noise type on the street, swapped around for 3 minutes of sim time, day and night', async () => {
  const h = await sandbox();
  try {
    const p = h.page;
    await openStreet(p);
    await quiet(p);
    await p.evaluate(() => {
      const types = Object.keys(__s.TYPES);
      for (let i = 0; i < 180 * 30; i++) {
        if (i % 45 === 0) {
          if (__s.state.sources.length >= __s.MAX_SOURCES) __s.removeSource(__s.state.sources[Math.floor(Math.random() * __s.state.sources.length)]);
          const sp = __s.freeSpot(); __s.addSource(types[(i / 45) % types.length], sp.x, sp.y);
        }
        if (i % 900 === 0) __s.setNight(!__s.state.night);
        __s.step(1 / 30);
        __s.currentReading();
      }
    });
    assert.deepEqual(await badNumbers(p, '__s.state'), []);
    await p.evaluate(() => __shemaPause(false));
    await p.waitForTimeout(500);
    assert.doesNotMatch(await p.locator('#lvl').textContent(), /NaN|Infinity/);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('real-time: the panel reads RECORDING with a direction and a verdict while the dog barks', async () => {
  const h = await sandbox();
  try {
    const p = h.page;
    await openStreet(p);
    await p.waitForFunction(() => document.getElementById('pillText').textContent === 'RECORDING', null, { timeout: 8000 });
    await p.waitForFunction(() => /°$/.test(document.getElementById('dirVal').textContent), null, { timeout: 8000 });
    assert.match(await p.locator('#vHead').textContent(), /Disturbing noise|Within the limit/);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('the switch button works while the explainer cards are open (standalone goes to index.html)', async () => {
  const h = await sandbox();
  try {
    await Promise.all([h.page.waitForURL(/\/index\.html$/), h.page.locator('#btnMode').click({ timeout: 3000 })]);
  } finally { await h.close(); }
});

for (const vp of [{ width: 375, height: 740, name: 'phone upright' }, { width: 740, height: 360, name: 'phone sideways' }]) {
  test(`fits a ${vp.name}: no sideways scroll, tapping the tray works`, async () => {
    const h = await sandbox({ viewport: vp, mobile: true, touch: true });
    try {
      const p = h.page;
      assert.ok(await noHorizontalScroll(p));
      await p.locator('#btnNext').tap(); await p.locator('#btnNext').tap(); await p.locator('#btnNext').tap();
      await p.locator('#tray .src[data-type="owl"]').tap();
      assert.equal(await p.evaluate(() => __s.state.sources.length), 2);
      assert.ok(await noHorizontalScroll(p));
      assert.deepEqual(h.problems, []);
    } finally { await h.close(); }
  });
}
