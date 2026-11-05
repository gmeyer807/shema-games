# Shema Games

Three small browser games for the Shema noise monitor (EPR400/402, H.J.G. Meyer), all on Jacaranda Street. Built phone-first.

`index.html` plays the Shema intro, then shows a card to pick a game. Each game opens in the same page and has a switch button at the top to go back to the picker (it works on the explainer cards too), and the end card of each finished game has an "All games" button. Every game starts with its own explainer cards.

- **Let Grandma Sleep** (`grandma.html`): tap noises on the street so Shema catches them before they wake Grandma. Easy / Normal / Hard.
- **Squirrel Run** (`squirrel.html`): a side-view runner, best with the phone sideways. Jump across roofs, trees and power lines without making enough noise for Shema to lock on. Falling or getting caught ends the run.
- **Sandbox** (`sandbox.html`): drag noises onto the street and watch Shema measure, locate, classify and judge them (simplified SANS 10103 rules).

Tap the Shema logo (on the home screen or in any game's top bar) to find a hidden page about what the word Shema means (`shema-egg.js`).

Sound is on by default (it starts on the first tap). No build step, no sign-in, nothing stored online. Best scores, difficulty and the sound setting are kept in the player's own browser (`localStorage`).

## Run locally

Serve the folder (sounds need http, not `file://`):

```
python3 -m http.server 8000
```

then open http://localhost:8000.

## Tests

`tests/` holds browser tests for the home screen and all three games (76 of them: flows, end cards, phone layouts,
fairness checks with bots that play whole nights and runs, and soak tests). They need Node 18+ and Google Chrome:

```
cd tests
npm install
npm test
```

The games expose their internals to the tests only when the page is opened with `#test` (e.g. `grandma.html#test`).
Set `CHROME_PATH` if Chrome is somewhere unusual. The `tests/` folder is left out of the Vercel deploy.

## Deploy

Vercel: import this repository, framework preset "Other", no build command, output directory = repository root.

## Sprites and sounds

All files live in `assets/`. Sprites are horizontal strips of 6 square frames, facing right, on a transparent background (WebP or PNG). Sounds are short mp3/ogg/wav files.

| What | Where | Notes |
|---|---|---|
| Noise sprites and sounds | `NOISE_ART`, `NOISE_SOUNDS` in `grandma.html` and `sandbox.html` | sounds in `CALLS` play once each time the noise starts; the others loop |
| Grandma pictures | `GRANDMA_ART` in `grandma.html` (`sleep`, `stir`, `awake`) | 4 frames per state, 4:3 (800 × 600), shown in turn; speed in `GRANDMA_FRAME_S` |
| Squirrel Run | `assets/squirrel_run.webp`, `assets/squirrel_jump.webp` | jump frames: crouch, take-off, rising, top, falling, landing |

Every sound file is levelled to the same loudness (-16 LUFS, mono 44.1 kHz) with no silence at the start, so each noise is equally loud and is heard the moment it appears. Do the same for any new sound (for example with ffmpeg's `loudnorm` and `silenceremove`).

