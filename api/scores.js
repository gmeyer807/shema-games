// Shared leaderboard for Let Grandma Sleep and Squirrel Run.
//   GET  /api/scores?board=squirrel[&id=<player id>]   -> top 10 (+ where that player stands)
//   POST /api/scores  {board, id, score}                -> keeps the player's best, returns the same
// Stored in Redis (Upstash, added from the Vercel dashboard: Storage -> Upstash for Redis). Each board is
// one sorted set of player id -> best score. Names are never stored or accepted: they are worked out from
// the id (lb-names.js), and ids are never sent back, so nobody can post as someone else from the board.
const { nameFor, ID_RE } = require('../lb-names.js');

const BOARDS = new Set(['grandma-easy', 'grandma-normal', 'grandma-hard', 'squirrel']);
const MAX_SCORE = 1000000;
const TOP = 10;

const conf = () => ({ url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL, token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN });

async function redis(commands) {
  const { url, token } = conf();
  const r = await fetch(url.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  const out = await r.json();
  return out.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

async function standings(key, id) {
  const cmds = [['ZREVRANGE', key, 0, TOP - 1, 'WITHSCORES'], ['ZCARD', key]];
  if (id) cmds.push(['ZREVRANK', key, id], ['ZSCORE', key, id]);
  const [flat, count, rank, best] = await redis(cmds);
  const top = [];
  for (let i = 0; i < flat.length; i += 2) top.push({ rank: i / 2 + 1, name: nameFor(flat[i]), score: +flat[i + 1], me: flat[i] === id });
  const you = id ? { name: nameFor(id), rank: rank == null ? null : rank + 1, score: best == null ? null : +best } : null;
  return { top, players: count, you };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!conf().url || !conf().token) return res.status(503).json({ error: 'leaderboard storage is not connected yet' });
  try {
    if (req.method === 'GET') {
      const board = String(req.query.board || '');
      const id = ID_RE.test(String(req.query.id || '')) ? String(req.query.id) : null;
      if (!BOARDS.has(board)) return res.status(400).json({ error: 'unknown board' });
      return res.status(200).json(await standings('lb:' + board, id));
    }
    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
      const board = String((b && b.board) || ''), id = String((b && b.id) || ''), score = Number(b && b.score);
      if (!BOARDS.has(board)) return res.status(400).json({ error: 'unknown board' });
      if (!ID_RE.test(id)) return res.status(400).json({ error: 'bad player id' });
      if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) return res.status(400).json({ error: 'bad score' });
      // one finished game every few seconds per phone is plenty; ignore anything faster
      const [fresh] = await redis([['SET', 'rl:' + board + ':' + id, '1', 'NX', 'EX', 3]]);
      if (fresh === 'OK') await redis([['ZADD', 'lb:' + board, 'GT', score, id]]);
      return res.status(200).json(await standings('lb:' + board, id));
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(502).json({ error: 'leaderboard is unavailable right now' });
  }
};
