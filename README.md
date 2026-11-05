# Shema Games

Three small browser games for the Shema noise monitor (EPR400/402, H.J.G. Meyer), all on Jacaranda Street. Built phone-first.

`index.html` plays the Shema intro, then shows a card to pick a game. Each game opens in the same page and has a switch button at the top to go back to the picker. Every game starts with its own explainer cards.

- **Let Grandma Sleep** (`grandma.html`): tap noises on the street so Shema catches them before they wake Grandma. Easy / Normal / Hard.
- **Squirrel Run** (`squirrel.html`): a side-view runner, best with the phone sideways. Jump across roofs, trees and power lines without making enough noise for Shema to lock on. Falling or getting caught ends the run.
- **Sandbox** (`sandbox.html`): drag noises onto the street and watch Shema measure, locate, classify and judge them (simplified SANS 10103 rules).

Sound is on by default (it starts on the first tap). No build step, no sign-in, nothing stored online. Best scores, difficulty and the sound setting are kept in the player's own browser (`localStorage`).

## Run locally

Serve the folder (sounds need http, not `file://`):

```
python3 -m http.server 8000
```

then open http://localhost:8000.

## Deploy

Vercel: import this repository, framework preset "Other", no build command, output directory = repository root.

## Sprites and sounds

All files live in `assets/`. Sprites are horizontal strips of 6 square frames, facing right, on a transparent background (WebP or PNG). Sounds are short mp3/ogg/wav files.

| What | Where | Notes |
|---|---|---|
| Noise sprites and sounds | `NOISE_ART`, `NOISE_SOUNDS` in `grandma.html` and `sandbox.html` | sounds in `CALLS` play once each time the noise starts; the others loop |
| Grandma pictures | `GRANDMA_ART` in `grandma.html` (`sleep`, `stir`, `awake`) | 4 frames per state, 4:3 (800 × 600), shown in turn; speed in `GRANDMA_FRAME_S` |
| Squirrel Run | `assets/squirrel_run.webp`, `assets/squirrel_jump.webp` | jump frames: crouch, take-off, rising, top, falling, landing |

Still missing: sprites for the bass car, drill and car alarm; sounds for the bass car, vuvuzela and hadeda. Until then the games use emoji and built-in synth sounds.
