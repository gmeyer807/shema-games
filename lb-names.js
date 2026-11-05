// Leaderboard player names. Each phone gets a random id (kept in localStorage) and its display name
// is worked out from that id, the same way here in the browser and in api/scores.js on the server.
// Nobody types a name, so nobody can post a rude one, and there is no account to make.
(function (root) {
  'use strict';
  const ADJ = ['Sleepy', 'Quiet', 'Sneaky', 'Brave', 'Swift', 'Grumpy', 'Jolly', 'Midnight', 'Dusty', 'Lucky',
    'Tiny', 'Mighty', 'Zippy', 'Calm', 'Cheeky', 'Rainy', 'Sunny', 'Purple', 'Hushed', 'Nimble',
    'Fuzzy', 'Bold', 'Gentle', 'Speedy', 'Silent', 'Clever', 'Happy', 'Shy', 'Wild', 'Golden'];
  const NOUN = ['Hadeda', 'Squirrel', 'Gecko', 'Owl', 'Meerkat', 'Dassie', 'Hornbill', 'Mongoose', 'Tortoise', 'Weaver',
    'Sunbird', 'Jackal', 'Bushbaby', 'Pangolin', 'Hoopoe', 'Lourie', 'Mousebird', 'Starling', 'Bulbul', 'Guineafowl',
    'Kudu', 'Springbok', 'Chameleon', 'Robin', 'Thrush', 'Wagtail', 'Barbet', 'Duiker', 'Nightjar', 'Firefly'];
  const ID_RE = /^[a-z0-9]{16,32}$/;
  function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
  function nameFor(id) {
    const h = hash(String(id));
    return `${ADJ[h % ADJ.length]} ${NOUN[Math.floor(h / ADJ.length) % NOUN.length]} ${10 + Math.floor(h / (ADJ.length * NOUN.length)) % 90}`;
  }
  function newId() {
    const a = new Uint8Array(12);
    (root.crypto || globalThis.crypto).getRandomValues(a);
    return Array.from(a, b => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-6);
  }
  const api = { nameFor, newId, ID_RE };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ShemaNames = api;
})(typeof window !== 'undefined' ? window : globalThis);
