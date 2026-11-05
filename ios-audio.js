// Sound on iPhone and iPad.
// 1. iOS plays web audio through the ringer channel by default, so the silent switch mutes the games.
//    Asking for the "playback" session (iOS 17+) makes them play like a video does. On older iOS a
//    silent looping <audio> element, started inside a tap, switches the page to playback the same way.
// 2. iOS only lets audio start inside a real tap (touchend / click), not on pointerdown, and after a
//    call, Siri or a trip to the home screen the context sits in "interrupted" rather than "suspended".
//    ShemaAudio.wake(ac) resumes from either state, and ShemaAudio.unlock(fn) calls fn on every tap
//    until the context is running.
(function () {
  if (window.ShemaAudio) return;
  // 0.05 s of silence as a WAV (8 kHz mono)
  const SILENT = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
  let el = null;
  function playback() {
    try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch (e) { }
    if (navigator.audioSession) return;
    try {
      if (!el) { el = document.createElement('audio'); el.src = SILENT; el.loop = true; el.setAttribute('playsinline', ''); el.setAttribute('x-webkit-airplay', 'deny'); el.preload = 'auto'; }
      if (el.paused) { const p = el.play(); if (p && p.catch) p.catch(() => { }); }
    } catch (e) { }
  }
  function wake(ac) {
    playback();
    if (ac && ac.state !== 'running' && ac.state !== 'closed') { try { const p = ac.resume(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
  }
  function unlock(fn) {
    const evs = ['touchend', 'pointerup', 'click', 'keydown'];
    const go = () => { const ac = fn(); if (ac && ac.state === 'running') evs.forEach(e => window.removeEventListener(e, go, true)); };
    evs.forEach(e => window.addEventListener(e, go, true));
  }
  window.ShemaAudio = { playback, wake, unlock };
})();
