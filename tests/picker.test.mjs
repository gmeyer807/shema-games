// The home screen (index.html): opening sequence, the game picker card and switching between games.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, noHorizontalScroll } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const GAMES = [
  { key: 'grandma', tile: '#tileGrandma', src: 'grandma.html', name: 'Let Grandma Sleep' },
  { key: 'squirrel', tile: '#tileSquirrel', src: 'squirrel.html', name: 'Squirrel Run' },
  { key: 'sandbox', tile: '#tileSandbox', src: 'sandbox.html', name: 'Sandbox' },
];

async function home(opts) {
  const h = await openPage(browser, server.url, '/', opts);
  await h.page.locator('#intro').waitFor({ state: 'detached', timeout: 6000 });
  await h.page.locator('#picker').waitFor({ state: 'visible' });
  return h;
}
const gameFrame = page => page.frameLocator('#game');

test('the intro plays by itself and lands on the picker with three games', async () => {
  const h = await home({ reduced: false });
  try {
    assert.equal(await h.page.locator('#intro').count(), 0, 'intro is removed when it finishes');
    assert.equal(await h.page.locator('.tile').count(), 3);
    assert.deepEqual(await h.page.locator('.tname').allTextContents(), GAMES.map(g => g.name));
    assert.equal(await h.page.locator('#btnBack').isVisible(), false, 'no "back to the game" before a game is open');
    assert.equal(await h.page.locator('#game').count(), 0);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('clicking the intro skips it', async () => {
  const h = await openPage(browser, server.url, '/', { reduced: false });
  try {
    const t0 = Date.now();
    await h.page.locator('#intro').click();
    await h.page.locator('#intro').waitFor({ state: 'detached', timeout: 3200 });
    assert.ok(Date.now() - t0 < 3300, 'skipping beats waiting for the full intro (2.95 s + 0.8 s)');
    assert.equal(await h.page.locator('#picker').isVisible(), true);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

for (const g of GAMES) {
  test(`picking ${g.name} opens it in the frame, embedded, without its own intro`, async () => {
    const h = await home();
    try {
      await h.page.locator(g.tile).click();
      await h.page.locator('#picker').waitFor({ state: 'hidden' });
      const frame = h.page.locator('#game');
      assert.equal(await frame.getAttribute('src'), `${g.src}?embed=1`);
      assert.equal(await frame.getAttribute('title'), g.name);
      const f = gameFrame(h.page);
      await f.locator('#btnMode').waitFor({ state: 'visible' });
      assert.equal(await f.locator('#intro').count(), 0, 'embedded game skips its own intro');
      assert.equal(await f.locator('#startCard').isVisible(), true, 'explainer cards come first');
      assert.equal(await h.page.evaluate(() => localStorage.getItem('shema.lastGame')), g.key);
      assert.deepEqual(h.problems, []);
    } finally { await h.close(); }
  });
}

test('the switch button opens the picker over the game, and Back / Escape / Keep playing return to it', async () => {
  const h = await home();
  try {
    await h.page.locator('#tileGrandma').click();
    const f = gameFrame(h.page);
    await f.locator('#btnMode').click();
    await h.page.locator('#picker').waitFor({ state: 'visible' });
    assert.ok(await h.page.locator('#picker').evaluate(el => el.classList.contains('over')));
    assert.equal(await h.page.locator('#btnBack').textContent(), 'Back to Let Grandma Sleep');
    assert.equal(await h.page.locator('#tileGrandma .go').textContent(), 'Keep playing');
    assert.equal(await h.page.locator('#tileGrandma .now').isVisible(), true);
    assert.equal(await h.page.locator('#tileSquirrel .go').textContent(), 'Run');

    await h.page.locator('#btnBack').click();
    await h.page.locator('#picker').waitFor({ state: 'hidden' });

    await f.locator('#btnMode').click();
    await h.page.locator('#picker').waitFor({ state: 'visible' });
    await h.page.keyboard.press('Escape');
    await h.page.locator('#picker').waitFor({ state: 'hidden' });

    await f.locator('#btnMode').click();
    await h.page.locator('#tileGrandma').click();
    await h.page.locator('#picker').waitFor({ state: 'hidden' });
    assert.equal(await h.page.locator('#game').count(), 1, 'same game is kept, not reloaded');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('the picker pauses the game underneath and un-pauses it on return', async () => {
  const h = await home();
  try {
    await h.page.locator('#tileGrandma').click();
    const f = gameFrame(h.page);
    await f.locator('#btnMode').waitFor();
    for (let i = 0; i < 3; i++) await f.locator('#btnNext').click();
    await f.locator('#btnNext').click();      // "Start the night"
    await f.locator('#hud').waitFor({ state: 'visible' });
    const clock = () => f.locator('#hudClock').textContent();
    await f.locator('#btnMode').click();
    await h.page.locator('#picker').waitFor({ state: 'visible' });
    const a = await clock();
    await h.page.waitForTimeout(1500);       // 1.5 s real time is ~10 game minutes if not paused
    assert.equal(await clock(), a, 'clock does not move while the picker is open');
    await h.page.locator('#btnBack').click();
    await h.page.waitForTimeout(1500);
    assert.notEqual(await clock(), a, 'clock runs again after going back');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('switching to another game replaces the frame and stops the old one', async () => {
  const h = await home();
  try {
    await h.page.locator('#tileSandbox').click();
    await gameFrame(h.page).locator('#btnMode').click();
    await h.page.locator('#tileSquirrel').click();
    await h.page.locator('#picker').waitFor({ state: 'hidden' });
    assert.equal(await h.page.locator('iframe').count(), 1);
    assert.equal(await h.page.locator('#game').getAttribute('src'), 'squirrel.html?embed=1');
    await gameFrame(h.page).locator('#btnMode').waitFor();
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('the sound note follows the saved setting', async () => {
  const h = await home({ storage: { 'shema.sound': '0' } });
  try {
    assert.match(await h.page.locator('#sndNote').textContent(), /Sound is off/);
  } finally { await h.close(); }
  const h2 = await home();
  try {
    assert.match(await h2.page.locator('#sndNote').textContent(), /Sound is on/);
  } finally { await h2.close(); }
});

test('works on a phone held upright: one column, no sideways scroll', async () => {
  const h = await home({ viewport: { width: 375, height: 740 }, mobile: true, touch: true });
  try {
    const boxes = await h.page.locator('.tile').evaluateAll(els => els.map(e => e.getBoundingClientRect().left));
    assert.ok(boxes.every(x => Math.abs(x - boxes[0]) < 1), 'tiles are stacked');
    assert.ok(await noHorizontalScroll(h.page));
    await h.page.locator('#tileSquirrel').tap();
    await h.page.locator('#picker').waitFor({ state: 'hidden' });
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('works on a phone held sideways and in dark mode', async () => {
  const h = await home({ viewport: { width: 812, height: 375 }, mobile: true, touch: true, dark: true });
  try {
    assert.ok(await noHorizontalScroll(h.page));
    const bg = await h.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-0').trim());
    assert.equal(bg, '#0e1210');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('every picture and sound the games use exists', async () => {
  const h = await openPage(browser, server.url, '/');
  try {
    const missing = [];
    for (const file of ['grandma.html', 'squirrel.html', 'sandbox.html', 'index.html']) {
      const html = await (await fetch(`${server.url}/${file}`)).text();
      for (const m of html.matchAll(/assets\/[\w.-]+\.(webp|png|mp3|ogg|wav)/g)) {
        const r = await fetch(`${server.url}/${m[0]}`);
        if (!r.ok) missing.push(`${file} → ${m[0]}`);
      }
    }
    assert.deepEqual(missing, []);
  } finally { await h.close(); }
});

for (const g of [{ key: 'grandma', tile: '#tileGrandma', name: 'Let Grandma Sleep' }, { key: 'squirrel', tile: '#tileSquirrel', name: 'Squirrel Run' }]) {
  test(`when ${g.name} ends, "All games" on the end card brings up the picker, and another game can be chosen`, async () => {
    const h = await home();
    try {
      const p = h.page;
      await p.locator(g.tile).click();
      await gameFrame(p).locator('#btnMode').waitFor();
      // reload the game inside the frame with its test hooks switched on, then end it at once
      await p.locator('#game').evaluate(f => { f.src = f.src.split('#')[0] + '#test'; f.contentWindow.location.reload(); });
      await p.waitForFunction(() => { const w = document.getElementById('game').contentWindow; return w.__g || w.__r; });
      const frame = p.frames().find(f => f.url().includes(`${g.key}.html`));
      await frame.evaluate(key => {
        if (key === 'grandma') { __g.startGame(); __shemaPause(true); __g.endGame(false); }
        else { __r.start(); __shemaPause(true); __r.end(__r.W, 'fell'); }
        __shemaPause(false);
      }, g.key);
      await gameFrame(p).locator('#endCard').waitFor({ state: 'visible' });
      await gameFrame(p).locator('#btnHome').click();
      await p.locator('#picker').waitFor({ state: 'visible' });
      assert.equal(await p.locator('#btnBack').textContent(), `Back to ${g.name}`);
      await p.locator('#btnBack').click();
      await p.locator('#picker').waitFor({ state: 'hidden' });
      assert.equal(await gameFrame(p).locator('#endCard').isVisible(), true, 'going back shows the end card again');
      await gameFrame(p).locator('#btnHome').click();
      await p.locator('#tileSandbox').click();
      await p.locator('#picker').waitFor({ state: 'hidden' });
      assert.equal(await p.locator('#game').getAttribute('src'), 'sandbox.html?embed=1');
      assert.deepEqual(h.problems, []);
    } finally { await h.close(); }
  });
}

test('the new sprites (car alarm, bass car, drill) are 6-frame strips like the others and are used by both street games', async () => {
  const h = await openPage(browser, server.url, '/assets/dog.webp');
  try {
    for (const name of ['alarm', 'boombox', 'drill']) {
      await h.page.goto(`${server.url}/assets/${name}.webp`);
      const size = await h.page.evaluate(() => { const i = document.querySelector('img'); return [i.naturalWidth, i.naturalHeight]; });
      assert.deepEqual(size, [1152, 192], name);
      for (const file of ['grandma.html', 'sandbox.html']) {
        const html = await (await fetch(`${server.url}/${file}`)).text();
        assert.match(html.match(/const NOISE_ART = \{[^}]*\}/)[0], new RegExp(`${name}: 'assets/${name}\\.webp'`), `${file} uses ${name}.webp`);
      }
    }
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});
