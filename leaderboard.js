// Shared leaderboard (Let Grandma Sleep, Squirrel Run). Needs lb-names.js loaded first.
// Each phone gets a random player id in localStorage and a name made from it (e.g. "Sleepy Hadeda 42"),
// so there is no account. Scores go to api/scores. Where that is not there (served from a plain folder,
// offline, storage not connected yet) the board just stays hidden and the games work as before.
// Self-contained: brings its own styles and uses the page's colour tokens, like shema-egg.js.
(() => {
  'use strict';
  const N = window.ShemaNames;
  if (!N) return;
  const API = 'api/scores';

  const css = `
  .lb[hidden], .lb-mini[hidden] { display: none !important; }
  .lb { border: 1px solid var(--line); border-radius: 10px; background: var(--bg-2); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .lb-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; font-family: var(--mono); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--amber); }
  .lb-head svg { vertical-align: -2px; margin-right: 5px; }
  .lb-you { text-transform: none; letter-spacing: 0; color: var(--text-2); }
  .lb-you b { color: var(--text-1); font-weight: 600; }
  .lb ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .lb li { display: grid; grid-template-columns: 2.4em minmax(0, 1fr) auto; gap: 8px; align-items: baseline; padding: 3px 6px; border-radius: 6px; font-size: 14px; color: var(--text-1); }
  .lb li .r { font-family: var(--mono); font-size: 12px; color: var(--text-3); text-align: right; }
  .lb li .n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lb li .s { font-family: var(--mono); font-size: 13px; font-variant-numeric: tabular-nums; color: var(--text-0); }
  .lb li.me { background: var(--amber-glow); color: var(--text-0); font-weight: 600; }
  .lb li.me .r, .lb li.me .s { color: var(--amber); }
  .lb li.gap { display: block; text-align: center; color: var(--text-3); padding: 0; line-height: 1; }
  .lb-note { font-size: 12px; color: var(--text-2); }
  .lb-loading { font-size: 13px; color: var(--text-2); }
  .lb-mini { font-family: var(--mono); font-size: 12px; color: var(--text-2); }
  .lb-mini b { color: var(--amber); font-weight: 600; }
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  let id = null;
  try { id = localStorage.getItem('shema.player'); } catch (e) { }
  if (!N.ID_RE.test(id || '')) { id = N.newId(); try { localStorage.setItem('shema.player', id); } catch (e) { } }
  const me = { id, name: N.nameFor(id) };

  const fmt = n => Number(n).toLocaleString('en-ZA');
  const TROPHY = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>';

  async function call(board, score) {
    const opts = score == null
      ? { cache: 'no-store' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board, id, score }) };
    const url = score == null ? `${API}?board=${encodeURIComponent(board)}&id=${id}` : API;
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(url, { ...opts, signal: ctl.signal });
      if (!r.ok) return null;
      const d = await r.json();
      return d && Array.isArray(d.top) ? d : null;
    } catch (e) { return null; } finally { clearTimeout(t); }
  }

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function row(rank, name, score, mine) {
    const li = el('li', mine ? 'me' : '');
    li.append(el('span', 'r', rank ? `${rank}.` : '–'), el('span', 'n', mine ? `${name} (you)` : name), el('span', 's', fmt(score)));
    return li;
  }

  // Full board: top 5, plus your own line under a gap if you are further down.
  let seq = 0;
  async function board(box, key, label, score) {
    if (!box) return;
    const mine = ++seq; box._seq = mine;
    box.className = 'lb'; box.setAttribute('aria-live', 'polite');
    box.replaceChildren(el('div', 'lb-loading', score == null ? 'Loading the leaderboard…' : 'Sending your score…'));
    box.hidden = !box.dataset.shown;   // stay hidden until the first good answer, so a missing server never flashes
    const d = await call(key, score);
    if (box._seq !== mine) return;
    if (!d) { box.hidden = true; return; }
    box.dataset.shown = '1'; box.hidden = false;
    const head = el('div', 'lb-head'); const h = el('span'); h.innerHTML = TROPHY; h.append(`Leaderboard${label ? ' · ' + label : ''}`);
    const you = el('span', 'lb-you'); you.append('you are '); you.append(el('b', '', me.name)); head.append(h, you);
    const ol = el('ol');
    const shown = d.top.slice(0, 5);
    for (const p of shown) ol.append(row(p.rank, p.name, p.score, p.me));
    if (d.you && d.you.rank && d.you.rank > shown.length) { ol.append(el('li', 'gap', '⋯')); ol.append(row(d.you.rank, me.name, d.you.score, true)); }
    const parts = [head];
    if (shown.length) parts.push(ol); else parts.push(el('div', 'lb-note', 'No scores yet. Be the first!'));
    if (d.players > 1) parts.push(el('div', 'lb-note', `${fmt(d.players)} players so far${d.you && d.you.rank === 1 ? ' · you are number one!' : ''}`));
    box.replaceChildren(...parts);
  }

  // One line for the start card: who is on top. If this phone has a better score than the board has for it
  // (set before the leaderboard existed, or while offline), it is sent now so the board catches up.
  async function mini(box, key, localBest) {
    if (!box) return;
    const mine = ++seq; box._seq = mine;
    box.className = 'lb-mini';
    let d = await call(key, null);
    const lb = Math.round(+localBest || 0);
    if (d && lb > 0 && (!d.you || d.you.score == null || d.you.score < lb)) d = (await call(key, lb)) || d;
    if (box._seq !== mine) return;
    const p = d && d.top[0];
    if (!p) { box.hidden = true; return; }
    box.replaceChildren(); box.innerHTML = TROPHY + ' ';
    box.append(p.me ? 'You are top of the leaderboard with ' : `Top score: ${p.name} with `, el('b', '', fmt(p.score)));
    box.hidden = false;
  }

  window.ShemaBoard = {
    me,
    show: (box, key, label) => board(box, key, label, null),
    // score is this game; best is this phone's best so far, sent too in case an earlier one never arrived
    submit: (box, key, label, score, best) => { const s = Math.max(+score || 0, +best || 0); return s > 0 ? board(box, key, label, Math.round(s)) : board(box, key, label, null); },
    mini,
  };
})();
