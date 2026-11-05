# Shema engine (the Sandbox's "Real firmware" mode)

`shema-engine.wasm` (in the repo root) is the Shema firmware's own algorithm modules, compiled unchanged for the browser:

| Firmware file | What the Sandbox gets from it |
| --- | --- |
| `a_weighting.c` | LAeq, LAS, LAF and LAI of every 32 ms buffer (CH1) |
| `doa_srp.c` | SRP-PHAT over the 6 mic pairs, a track point every 0.5 s, the detection's direction |
| `classifier_mel.c` | CH1 decimated to 16 kHz, one 64-band mel column per buffer |
| `classifier_net.c`, `mel_cnn_int8_*.c` | the int8 mel-CNN on every 2 s window (63 columns), 8 classes |

`engine_init()` runs the firmware's own self-test (2 windows, every layer against the Python reference) and returns 0 when it passes. The Sandbox refuses to run the mode otherwise.

## Files here

- `shema_engine.c`: the glue. It takes one buffer of the 4 mics (48 kHz, int32, interleaved CH1..CH4, as the SAI DMA buffer) and drives the modules the way `doa.c` and `classifier.c` do: the 1 s pre-roll, the DOA weight from the detection's quietest buffer (`DOA_WEIGHT_MARGIN_dB`), and windows without overlap. It also stands in for the settings (4 mics in a line 50 mm apart, calibration 0 dBFS = 120 dB(A)) and the clock.
- `shim/`: stands in for the HAL (`main.h`), CMSIS-DSP's real FFT (`arm_rfft_fast_f32`, same packed format and 1/N inverse scaling), the ARM DSP instructions the int8 kernels use (`__ssat`, `__smlad`, `__smlabb`, `__smlatt`) and the debug cycle counter.
- `build.sh`: compiles it all with zig (`pip install ziglang`).

```sh
FIRMWARE=/path/to/shema_v0.2/Core ./engine/build.sh
```

Rebuild whenever those firmware modules or the model change.

## What the mics hear

By default the mics hear clips from the network's own training sources instead of the game's sounds (the player still hears the game's sounds). `engine/pick-clips.mjs` picks them from the training dataset: per Sandbox noise, 10 candidates from different source recordings, run through this engine clean and over real street background 10 dB below, keeping the 3 it gets right with at least 70 % both times. The street background is SONYC street recordings the network calls background. Rerun it after a retrain:

```sh
node engine/pick-clips.mjs C:/Users/gunte/Documents/SHEMA/new_dataset
```

The clips and their credits are in `assets/dataset/` (`CREDITS.md`). The Tomcat has no clip (there are no cats in the dataset), so the mics hear the game's meow. A link in the card switches the mics to the game's sounds, to compare.

What the network made of the street in testing, with dataset clips: dog, hooting taxi (alarm: horns are "alarm" in the dataset), bass car and vuvuzela (music), drill (power tools), car alarm, and the birds, frog and insects (background) all came out right. The rooster leaned to voices, and rain over street background gives the odd "engine" window. With the game's own sounds instead, the drill reads as weather, the hadeda and mosquito as music, and the network calls any steady hiss weather.

## What the Sandbox does around it

The page makes what the four mics would hear: each noise's sound (its dataset clips, or the game's recording), delayed to each mic (fractional samples, 343 m/s, sources 1.5 m below the board), scaled so their A-weighted level matches the Sandbox's level for that noise and distance, over real street background (a different stretch of it at each mic, so it has no direction), and rain from rain clips. It then hands the buffers over at real time.

The page still decides when a detection opens and closes, with the threshold detector's rules: ambient + 7 dB opens, + 4 dB holds, 2 s post-roll, and a background close after 5 windows of background or weather with the level steady within 6 dB. The ambient is learnt in seconds rather than minutes. The verdict stays the Sandbox's simple SANS 10103 rules, with the tonal +5 dB by class (music, alarm, engine).

On a desktop the engine takes about 0.2 ms per 32 ms buffer while listening and 0.5 ms during a detection.
