#!/bin/sh
# Builds shema-engine.wasm from the Shema firmware's algorithm modules, unchanged, plus shim/ and shema_engine.c.
# Usage: FIRMWARE=/path/to/shema_v0.2/Core ./build.sh     (needs zig: pip install ziglang)
set -e
F=${FIRMWARE:?set FIRMWARE to the firmware Core folder}
cd "$(dirname "$0")"
python3 -m ziglang cc -target wasm32-wasi -mexec-model=reactor -O2 -flto \
  -Ishim -I"$F/Inc" -I"$F/Inc/Modules" -I"$F/Inc/Debug" \
  -DCLASSIFIER_NET_SELFTEST=1 -Wno-unused-function -Wno-incompatible-pointer-types-discards-qualifiers \
  -Wl,--no-entry -Wl,--strip-all -Wl,-z,stack-size=262144 \
  shema_engine.c shim/rfft.c \
  "$F/Src/Modules/a_weighting.c" "$F/Src/Modules/doa_srp.c" "$F/Src/Modules/classifier_mel.c" \
  "$F/Src/Modules/classifier_net.c" "$F/Src/Modules/mel_cnn_int8_kernels.c" "$F/Src/Modules/mel_cnn_int8_model.c" \
  "$F/Src/Modules/mel_cnn_int8_selftest.c" "$F/Src/Modules/noise_level_standard.c" \
  -o ../shema-engine.wasm
ls -l ../shema-engine.wasm
