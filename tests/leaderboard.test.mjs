// Shared leaderboard: the API on its own (boards, validation, keeping each player's best, names made from
// the id), and both games posting their score and showing the board on the end card and the leader on the
// start card. The test server runs the real api/scores.js against an in-memory Redis (helpers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, launch, openPage, skipIntro } from './helpers.mjs';

const { nameFor, ID_RE } = createRequire(import.meta.url)('../lb-names.js');
let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const post = (board, id, score) => fetch(server.url + '/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board, id, score }) });
const pid = n => `testplayer${String(n).padStart(8, '0')}`;

test('API: keeps each player\'s best, ranks them, and never sends ids back', async () => {
  for (let i = 1; i <= 7; i++) assert.equal((await post('grandma-hard', pid(i), i * 100)).status, 200);
  let r = await (await post('grandma-hard', pid(3), 50)).json();       // a worse score does not replace the best
  assert.equal(r.you.score, 300); assert.equal(r.you.rank, 5); assert.equal(r.you.name, nameFor(pid(3)));
  r = await (await post('grandma-hard', pid(3), 950)).json();          // a new best straight after is kept
  assert.equal(r.you.rank, 1); assert.equal(r.top[0].name, nameFor(pid(3))); assert.equal(r.top[0].me, true);
  assert.equal(r.players, 7);
  assert.ok(!JSON.stringify(r).includes('testplayer'), 'ids stay private');
  const g = await (await fetch(server.url + '/api/scores?board=grandma-hard')).json();
  assert.deepEqual(g.top.map(x => x.score), [950, 700, 600, 500, 400, 200, 100]);
  assert.equal(g.you, null);
});

test('API: rejects unknown boards, bad ids and impossible scores', async () => {
  assert.equal((await post('pacman', pid(1), 10)).status, 400);
  assert.equal((await post('squirrel', 'Robert"); DROP', 10)).status, 400);
  assert.equal((await post('squirrel', pid(90), -5)).status, 400);
  assert.equal((await post('squirrel', pid(90), 1.5)).status, 400);
  assert.equal((await post('squirrel', pid(90), 5e9)).status, 400);
  assert.equal((await fetch(server.url + '/api/scores', { method: 'DELETE' })).status, 405);
});

test('names: made from the id, the same every time, and friendly', () => {
  assert.equal(nameFor('abcdefghijklmnop'), nameFor('abcdefghijklmnop'));
  const names = new Set(Array.from({ length: 200 }, (_, i) => nameFor(pid(i))));
  assert.ok(names.size > 190, 'names rarely clash');
  for (const n of names) assert.match(n, /^[A-Z][a-z]+ [A-Z][a-z]+ [1-9]\d$/);
  assert.ok(ID_RE.test(pid(5)));
});

test('Squirrel Run: a finished run goes on the board, and the phone keeps its name', async () => {
  for (let i = 1; i <= 6; i++) await post('squirrel', pid(100 + i), 1000 + i);
  const h = await openPage(browser, server.url, '/squirrel.html#test', { viewport: { width: 844, height: 390 }, mobile: true, touch: true });
  try {
    const p = h.page;
    await skipIntro(p); await p.waitForFunction(() => window.__r && window.ShemaBoard);
    await p.locator('#lbStart:not([hidden])').waitFor({ state: 'attached' });
    assert.match(await p.locator('#lbStart').textContent(), /Top score: .+ with 1\s006/);
    const me = await p.evaluate(() => ShemaBoard.me);
    assert.ok(ID_RE.test(me.id)); assert.equal(me.name, nameFor(me.id));
    await p.evaluate(() => { __r.start(); __r.W.acorns = 4; __r.end(__r.W, 'fell'); });
    await p.locator('#lbEnd li.me').waitFor();
    const mine = await p.locator('#lbEnd li.me').textContent();
    assert.ok(mine.includes(`${me.name} (you)`), mine); assert.ok(mine.includes('7.'), 'shown under the top five with its rank');
    assert.equal(await p.locator('#lbEnd li:not(.gap)').count(), 6);
    assert.equal(await p.locator('#btnAgain').isVisible(), true);
    await p.reload(); await skipIntro(p); await p.waitForFunction(() => window.ShemaBoard);
    assert.equal(await p.evaluate(() => ShemaBoard.me.id), me.id, 'same player after a reload');
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('Let Grandma Sleep: one board per difficulty, and the start card names the leader', async () => {
  const h = await openPage(browser, server.url, '/grandma.html#test', { viewport: { width: 390, height: 844 }, mobile: true, touch: true });
  try {
    const p = h.page;
    await skipIntro(p); await p.waitForFunction(() => window.__g && window.ShemaBoard);
    await p.evaluate(() => { __g.setDiff('easy'); __g.startGame(); __g.G.score = 420; __g.endGame(true); });
    await p.locator('#lbEnd li.me').waitFor();
    assert.match(await p.locator('#lbEnd .lb-head').textContent(), /Easy/);
    assert.match(await p.locator('#lbEnd li.me').textContent(), /1\..*\(you\).*570/);   // 420 + 3 stars × 50
    const easy = await (await fetch(server.url + '/api/scores?board=grandma-easy')).json();
    assert.equal(easy.top[0].score, 570);
    const normal = await (await fetch(server.url + '/api/scores?board=grandma-normal')).json();
    assert.equal(normal.top.length, 0, 'Easy scores stay on the Easy board');
    await p.evaluate(() => __g.setDiff('easy'));
    await p.locator('#lbStart:not([hidden])').waitFor({ state: 'attached' });
    assert.match(await p.locator('#lbStart').textContent(), /You are top of the leaderboard with 570/);
    assert.deepEqual(h.problems, []);
  } finally { await h.close(); }
});

test('no leaderboard server: the board stays hidden and the games still work', async () => {
  const bare = await startServer({ leaderboard: false });
  const h = await openPage(browser, bare.url, '/squirrel.html#test');
  try {
    const p = h.page;
    await skipIntro(p); await p.waitForFunction(() => window.__r);
    await p.evaluate(() => { __r.start(); __r.W.acorns = 2; __r.end(__r.W, 'fell'); });
    await p.locator('#endCard').waitFor({ state: 'visible' });
    await p.waitForTimeout(500);
    assert.equal(await p.locator('#lbEnd').isVisible(), false);
    assert.equal(await p.locator('#lbStart').getAttribute('hidden'), '');
    assert.equal(await p.locator('#btnAgain').isVisible(), true);
    assert.deepEqual(h.problems.filter(x => !/\/api\/scores|status of 404/.test(x)), []);
  } finally { await h.close(); await bare.close(); }
});

test('A best that only this phone knows about reaches the board', async () => {
  const h = await openPage(browser, server.url, '/squirrel.html#test', { viewport: { width: 844, height: 390 }, mobile: true, touch: true });
  try {
    const p = h.page;
    await skipIntro(p); await p.waitForFunction(() => window.__r && window.ShemaBoard);
    const me = await p.evaluate(() => ShemaBoard.me);
    // the start card tops up the board from the phone's best
    await p.evaluate(() => ShemaBoard.mini(document.getElementById('lbStart'), 'squirrel', 4321));
    let g = await (await fetch(`${server.url}/api/scores?board=squirrel&id=${me.id}`)).json();
    assert.equal(g.you.score, 4321);
    // a short run still sends the best, and never lowers it
    await p.evaluate(() => { __r.start(); __r.W.acorns = 1; __r.end(__r.W, 'fell'); });
    await p.locator('#lbEnd li.me').waitFor();
    g = await (await fetch(`${server.url}/api/scores?board=squirrel&id=${me.id}`)).json();
    assert.equal(g.you.score, 4321);
  } finally { await h.close(); }
});
