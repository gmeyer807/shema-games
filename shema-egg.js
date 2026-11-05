// Easter egg: tap the Shema logo (the Hebrew word שמע) on the home screen or in any game's top bar
// to find out what the name means. Self-contained: brings its own styles and uses the page's colour
// tokens (--bg-1, --amber, --text-0 ...), so it matches light and dark mode in every game.
(() => {
  'use strict';
  const logo = document.querySelector('.picker .shema-logo, .topbar .shema-logo');
  if (!logo) return;

  const css = `
  .topbar .shema-logo.egg-hot { position: relative; z-index: 510; }   /* above the game's cards, like the switch button */
  .shema-logo.egg-hot { cursor: pointer; border-radius: 6px; transition: transform .15s ease; }
  .shema-logo.egg-hot:hover { transform: scale(1.04); }
  .shema-logo.egg-hot:active { transform: scale(.97); }
  /* every 8 s a soft amber glow pulses through the logo to invite a tap */
  .shema-logo.egg-hot.egg-tease { animation: eggTease 8s ease-in-out 2s infinite; }
  .shema-logo.egg-hot.egg-tease:hover { animation: none; filter: drop-shadow(0 0 6px var(--amber)); }
  @keyframes eggTease {
    0%, 82%, 100% { filter: drop-shadow(0 0 0 transparent); }
    87% { filter: drop-shadow(0 0 7px var(--amber)) drop-shadow(0 0 14px var(--amber-glow)) brightness(1.15); }
    91% { filter: drop-shadow(0 0 2px var(--amber)); }
    95% { filter: drop-shadow(0 0 7px var(--amber)) drop-shadow(0 0 14px var(--amber-glow)) brightness(1.15); }
  }
  .shema-logo.egg-hot:focus-visible { outline: 2px solid var(--amber); outline-offset: 4px; }
  .egg { position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; overflow-y: auto;
    padding: calc(16px + env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) calc(16px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
    background: color-mix(in srgb, var(--bg-0) 72%, transparent); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    animation: eggFade .25s ease; font-family: var(--sans, Inter, system-ui, sans-serif); }
  .egg[hidden] { display: none !important; }
  @keyframes eggFade { from { opacity: 0; } to { opacity: 1; } }
  .egg-card { position: relative; width: min(560px, 100%); background: var(--bg-1); color: var(--text-0); border: 1px solid var(--line);
    border-radius: 16px; box-shadow: 0 18px 54px var(--shadow); padding: 26px 24px 22px; display: flex; flex-direction: column; gap: 14px;
    animation: eggRise .4s cubic-bezier(.2, .8, .3, 1); background-image: radial-gradient(ellipse 420px 200px at 50% 0%, var(--amber-glow), transparent 70%); }
  @keyframes eggRise { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: none; } }
  .egg-x { position: absolute; top: 10px; right: 10px; width: 34px; height: 34px; border: 0; border-radius: 8px; background: none; color: var(--text-2); cursor: pointer; font: inherit; font-size: 20px; line-height: 1; }
  .egg-x:hover { background: var(--bg-2); color: var(--text-0); }
  .egg-kick { font-family: var(--mono, ui-monospace, monospace); font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: var(--amber); text-align: center; }
  .egg-heb { font-family: "SBL Hebrew", "Taamey Frank CLM", "Ezra SIL", "Times New Roman", serif; font-size: clamp(54px, 15vw, 76px); line-height: 1; color: var(--amber); text-align: center; direction: rtl; margin: 2px 0 -2px; }
  .egg-say { text-align: center; font-family: var(--mono, ui-monospace, monospace); font-size: 12px; color: var(--text-2); margin-top: -6px; }
  .egg h2 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -.01em; text-align: center; text-wrap: balance; }
  .egg p { margin: 0; line-height: 1.55; color: var(--text-1); font-size: 15px; }
  .egg blockquote { margin: 0; padding: 10px 14px; border-left: 3px solid var(--amber); background: var(--bg-2); border-radius: 0 8px 8px 0; color: var(--text-0); line-height: 1.55; font-size: 15px; font-style: italic; }
  .egg blockquote cite { display: block; margin-top: 6px; font-style: normal; font-family: var(--mono, ui-monospace, monospace); font-size: 11px; color: var(--text-2); }
  .egg-rule { height: 1px; background: var(--line); margin: 4px 0; }
  .egg h3 { margin: 0; font-size: 13px; font-family: var(--mono, ui-monospace, monospace); letter-spacing: .12em; text-transform: uppercase; color: var(--amber); }
  .egg .egg-gospel { color: var(--text-0); font-size: 16px; }
  .egg-foot { font-size: 13px !important; color: var(--text-2) !important; text-align: center; }
  .egg-go { align-self: center; margin-top: 4px; border: 0; border-radius: 10px; background: var(--amber); color: var(--bg-1); font: inherit; font-weight: 700; font-size: 15px; padding: 10px 22px; cursor: pointer; }
  .egg-go:hover { background: var(--amber-hi); }
  @media (prefers-reduced-motion: reduce) { .egg, .egg-card { animation: none; } .shema-logo.egg-hot { transition: none; } }
  @media (max-width: 420px) { .egg-card { padding: 22px 18px 18px; gap: 12px; } .egg h2 { font-size: 20px; } }`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const box = document.createElement('div');
  box.className = 'egg'; box.id = 'shemaEgg'; box.hidden = true;
  box.innerHTML = `
  <div class="egg-card" role="dialog" aria-modal="true" aria-labelledby="eggTitle">
    <button class="egg-x" type="button" aria-label="Close">×</button>
    <div class="egg-kick">You found the hidden page</div>
    <div class="egg-heb" lang="he" aria-hidden="true">שְׁמַע</div>
    <div class="egg-say">Shema · “sh’MAH”</div>
    <h2 id="eggTitle">Shema means “Hear”</h2>
    <p>Shema is Hebrew for <b>hear</b> or <b>listen</b>. Not just letting a sound reach your ears, but hearing in a way that takes it to heart and acts on it. A good name for a little device whose whole job is to listen.</p>
    <p>It is also the first word of the prayer at the heart of the Bible, the one Jesus called the greatest commandment:</p>
    <blockquote>Hear, O Israel: The LORD our God, the LORD is One. And you shall love the LORD your God with all your heart and with all your soul and with all your strength.<cite>Deuteronomy 6:4–5 · Mark 12:29–30</cite></blockquote>
    <div class="egg-rule"></div>
    <h3>So here is something worth hearing</h3>
    <p class="egg-gospel">The Gospel is the good news of Jesus. That He came and lived the life I should have lived (free from sin) and died the death I should have died (because of sin). So that through Him and His sacrifice I can enter God’s presence — blameless, made new and transformed.</p>
    <p class="egg-foot">“Faith comes by hearing, and hearing by the word of Christ.” · Romans 10:17</p>
    <button class="egg-go" type="button">Amen</button>
  </div>`;
  document.body.appendChild(box);

  let back = null;
  const pause = p => { try { window.__shemaPause && window.__shemaPause(p); } catch (e) { } };
  function onKey(e) {
    if (box.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {   // keep focus inside the card
      const f = [...box.querySelectorAll('button')], i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
    e.stopPropagation();     // the game underneath must not jump or start on Space/Enter
  }
  function open() {
    if (!box.hidden || document.body.classList.contains('intro-on')) return;
    back = document.activeElement;
    pause(true);
    box.hidden = false; box.scrollTop = 0;
    window.addEventListener('keydown', onKey, true);
    box.querySelector('.egg-go').focus({ preventScroll: true });
  }
  function close() {
    if (box.hidden) return;
    box.hidden = true;
    window.removeEventListener('keydown', onKey, true);
    pause(false);
    try { back && back.focus({ preventScroll: true }); } catch (e) { }
  }
  box.querySelector('.egg-x').addEventListener('click', close);
  box.querySelector('.egg-go').addEventListener('click', close);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  // taps on the card must not fall through to the game
  for (const t of ['pointerdown', 'pointerup', 'touchstart']) box.addEventListener(t, e => e.stopPropagation());

  logo.classList.add('egg-hot', 'egg-tease');
  logo.setAttribute('tabindex', '0');
  logo.setAttribute('role', 'button');
  logo.setAttribute('aria-label', 'SHEMA — what does it mean?');
  logo.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); open(); });
  logo.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open(); } });

  window.ShemaEgg = { open, close };
})();
