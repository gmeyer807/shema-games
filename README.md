# Shema Games

Two small browser games for the Shema noise monitor (EPR400/402, H.J.G. Meyer), in one page:

- **Let Grandma Sleep** (`#grandma`, the default): tap noises on Jacaranda Street so Shema catches them before they wake Grandma. Easy / Normal / Hard.
- **Shema Street** (`#street`): a sandbox. Drag noise sources onto the street and watch Shema measure, locate, classify and judge them (simplified SANS 10103 rules).

No build step, no sign-in, nothing stored online. The best score and chosen difficulty are kept in the player's own browser (`localStorage`).

## Run locally

Serve the folder (sounds need http, not `file://`):

```
python3 -m http.server 8000
```

then open http://localhost:8000.

## Deploy

Vercel: import this repository, framework preset "Other", no build command, output directory = repository root.

## Adding sprites and sounds

All files live in `assets/`. In `index.html`, search for these and fill in a file name:

| What | Where in `index.html` | Format |
|---|---|---|
| Noise sprites | `NOISE_ART` | horizontal strip of 6 square frames, facing right, transparent (WebP or PNG) |
| Noise sounds | `NOISE_SOUNDS` | mp3/ogg/wav, short (1–6 s) |
| Grandma | `GRANDMA_ART` (`sleep`, `stir`, `awake`) | 4:3 picture, e.g. 1600 × 1200 |

Sounds listed in `CALLS` (dog, cat, squirrel, owl, taxi, rooster, hadeda) play once each time the noise starts; the others loop while it is on.

Still missing: sprites for the bass car, drill and car alarm; sounds for the bass car, vuvuzela and hadeda; the three Grandma pictures. Until then the game uses emoji and built-in synth sounds.
