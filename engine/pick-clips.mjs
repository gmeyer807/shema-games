// Picks the dataset clips the Sandbox's "Real firmware" mode feeds to Shema's mics (assets/dataset/).
//
// For each Sandbox noise it takes up to 10 candidate clips from the training dataset (one per source recording,
// the loudest 2 s of it), runs each through shema-engine.wasm exactly as the mics would deliver it (16 kHz
// upsampled to 48 kHz, 4 identical channels), once clean and once over real street background 10 dB below it,
// and keeps the 3 the network gets right with at least 70 % both times. The street background is the SONYC
// "background" clips the network itself calls background.
//
// Usage (from the repo root, after a rebuild of shema-engine.wasm or a retrain):
//   node engine/pick-clips.mjs /path/to/new_dataset
// It rewrites assets/dataset/*.wav and assets/dataset/clips.json.
import fs from 'node:fs';
import path from 'node:path';

const DATA = process.argv[2];
if (!DATA) { console.error('usage: node engine/pick-clips.mjs /path/to/new_dataset'); process.exit(1); }
const OUT = 'assets/dataset';

// Sandbox noise -> [dataset class, labels to look for]
const WANT = {
  dog: ['dog', ['Bark', 'dog_bark', 'dog']],
  squirrel: ['background', ['Chirp_and_tweet']],
  owl: ['background', ['Owl', 'Bird_vocalization']],
  taxi: ['alarm', ['Vehicle_horn', 'car_horn']],               // horns are "alarm" in the dataset
  boombox: ['music', ['street_music', 'Bass_guitar']],
  vuvuzela: ['music', ['Trumpet', 'Brass_instrument', 'Wind_instrument']],
  drill: ['power_tools', ['Drill', 'drilling']],
  alarm: ['alarm', ['Siren', 'siren', 'alarm']],
  frog: ['background', ['Frog']],
  mosquito: ['background', ['Insect', 'Cricket', 'crickets']],
  hadeda: ['background', ['Crow', 'Gull']],
  rooster: ['background', ['Chicken_and_rooster', 'rooster']],
  rain: ['weather', ['Rain', 'rain']],
};
const SOURCES = {
  fsd50k: ['FSD50K', id => `https://freesound.org/s/${id}/`, 'its Freesound licence (CC0, CC BY or CC BY-NC)'],
  us8k: ['UrbanSound8K', id => `https://freesound.org/s/${id}/`, 'CC BY-NC 3.0'],
  esc50: ['ESC-50', id => `https://freesound.org/s/${id}/`, 'CC BY-NC 3.0'],
  sonyc: ['SONYC-UST', () => 'https://zenodo.org/records/3966543', 'CC BY 4.0'],
};

// ---- the manifest ----
const lines = fs.readFileSync(path.join(DATA, 'manifest.csv'), 'utf8').trim().split(/\r?\n/);
const head = lines[0].split(',');
const rows = lines.slice(1).map(l => {   // the last column (source path) may hold commas, the labels column is quoted when it does
  const cells = []; let cur = '', q = false;
  for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { cells.push(cur); cur = ''; } else cur += ch; }
  cells.push(cur);
  return Object.fromEntries(head.map((h, i) => [h, cells[i] || '']));
});
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
function candidates(cls, labels, n, filter) {
  const pool = rows.filter(r => r.class === cls && (filter ? filter(r) : labels.some(l => r.labels.includes(l))));
  const groups = new Map();
  for (const r of pool) { const k = r.dataset + '/' + r.group; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const keys = [...groups.keys()].sort(() => rnd() - 0.5).slice(0, n);
  return keys.map(k => groups.get(k).reduce((a, b) => (+b.level_db > +a.level_db ? b : a)));
}

// ---- the firmware ----
const E = (await WebAssembly.instantiate(await WebAssembly.compile(fs.readFileSync('shema-engine.wasm')), {})).exports;
if (E.engine_init() !== 0) throw new Error('the firmware self-test failed');
const mem = () => E.memory.buffer;
const classes = [...Array(E.engine_classes())].map((_, i) => { const b = new Uint8Array(mem(), E.engine_class_name(i)); let s = ''; for (let k = 0; b[k]; k++) s += String.fromCharCode(b[k]); return s; });
function wav(file) {   // PCM 16-bit -> float at 48 kHz (linear)
  const b = fs.readFileSync(path.join(DATA, file.replace(/\\/g, '/')));
  let o = 12, fmt, data;
  while (o < b.length) { const id = b.toString('ascii', o, o + 4), n = b.readUInt32LE(o + 4); if (id === 'fmt ') fmt = { ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12) }; if (id === 'data') data = b.subarray(o + 8, o + 8 + n); o += 8 + n + (n & 1); }
  const n = data.length / 2 / fmt.ch, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = data.readInt16LE(i * 2 * fmt.ch) / 32768;
  const r = 48000 / fmt.sr, y = new Float32Array(Math.floor(n * r));
  for (let i = 0; i < y.length; i++) { const t = i / r, k = Math.floor(t), f = t - k; y[i] = x[k] + (x[Math.min(k + 1, n - 1)] - x[k]) * f; }
  return y;
}
function aLevel(x) {
  E.engine_measure_begin();
  for (let i = 0; i < x.length; i += 1536) { const n = Math.min(1536, x.length - i); new Float32Array(mem(), E.engine_scratch(), n).set(x.subarray(i, i + n)); E.engine_measure_add(n); }
  return E.engine_measure_end();
}
function classify(x, bg, bgRelDb) {   // mean probabilities of 2 windows
  E.engine_init();
  const g = 10 ** ((-30 - aLevel(x)) / 20), bgG = bg ? 10 ** ((-30 + bgRelDb - bg.db) / 20) : 0;
  const buf = new Int32Array(mem(), E.engine_buffer(), 1536 * 4), wins = [];
  for (let n = 0; wins.length < 3; n += 1536) {
    for (let i = 0; i < 1536; i++) { const k = n + i, v = Math.round((x[k % x.length] * g + (bg ? bg.y[k % bg.y.length] * bgG : 0)) * 2147483648); for (let m = 0; m < 4; m++) buf[i * 4 + m] = v; }
    if (E.engine_process(0)) wins.push([...new Float32Array(mem(), E.engine_probabilities(), classes.length)]);
  }
  wins.shift();   // the first window starts in silence
  return classes.map((_, i) => (wins[0][i] + wins[1][i]) / 2);
}
const top = p => { let b = 0; p.forEach((v, i) => { if (v > p[b]) b = i; }); return [classes[b], p[b]]; };

// ---- street background first ----
const ambient = candidates('background', null, 20, r => r.dataset === 'sonyc')
  .map(r => ({ r, y: wav(r.file) })).filter(a => { const [c, p] = top(classify(a.y, null)); return c === 'background' && p >= 0.7; }).slice(0, 8);
const bg = { y: Float32Array.from(ambient.flatMap(a => [...a.y])) }; bg.db = aLevel(bg.y);
console.log(`ambient: ${ambient.length} SONYC background clips`);

// ---- each noise ----
const keep = { ambient: ambient.map(a => a.r) };
for (const [noise, [cls, labels]] of Object.entries(WANT)) {
  const scored = candidates(cls, labels, 10).map(r => { const y = wav(r.file); const c = top(classify(y, null)), b = top(classify(y, bg, -10)); return { r, c, b }; });
  const ok = scored.filter(s => s.c[0] === cls && s.b[0] === cls && s.c[1] >= 0.7 && s.b[1] >= 0.7).sort((a, b) => (b.c[1] + b.b[1]) - (a.c[1] + a.b[1]));
  keep[noise] = ok.slice(0, 3).map(s => s.r);
  console.log(`${noise.padEnd(9)} ${cls.padEnd(11)} ${ok.length}/${scored.length} right both times`);
}

// ---- write ----
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.wav')) fs.unlinkSync(path.join(OUT, f));
const out = {};
for (const [name, list] of Object.entries(keep)) {
  out[name] = list.map((r, i) => {
    const dest = `${OUT}/${name}-${i + 1}.wav`;
    fs.copyFileSync(path.join(DATA, r.file.replace(/\\/g, '/')), dest);
    const [title, url, licence] = SOURCES[r.dataset];
    return { file: dest, class: r.class, dataset: title, id: r.group, labels: r.labels.split(',')[0], url: url(r.group), licence };
  });
}
fs.writeFileSync(`${OUT}/clips.json`, JSON.stringify(out, null, 1));
console.log('wrote', Object.values(out).flat().length, 'clips');
