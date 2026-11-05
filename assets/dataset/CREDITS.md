# Dataset clips

The Sandbox's "Real firmware" mode feeds these clips to Shema's microphones instead of the game's sounds, so the network hears its own kind of audio. They come from the datasets the network was trained on and were picked by `engine/pick-clips.mjs` as clips it classifies correctly (at least 70 %, clean and over street background).

Each clip is a 2 s excerpt, 16 kHz mono, used under its original licence:

- **FSD50K** (Fonseca et al., 2022): Freesound clips, each under its own Freesound licence (CC0, CC BY or CC BY-NC). The link goes to the original sound and its author.
- **UrbanSound8K** (Salamon et al., 2014) and **ESC-50** (Piczak, 2015): Freesound clips, CC BY-NC 3.0.
- **SONYC-UST** (Cartwright et al., 2020): street recordings from New York, CC BY 4.0.

| File | Used for | Dataset | Label | Source |
| --- | --- | --- | --- | --- |
| `ambient-1.wav` | ambient | SONYC-UST | background | [05_012805.wav](https://zenodo.org/records/3966543) |
| `ambient-2.wav` | ambient | SONYC-UST | background | [38_003232.wav](https://zenodo.org/records/3966543) |
| `ambient-3.wav` | ambient | SONYC-UST | background | [20_007071.wav](https://zenodo.org/records/3966543) |
| `ambient-4.wav` | ambient | SONYC-UST | background | [19_003840.wav](https://zenodo.org/records/3966543) |
| `ambient-5.wav` | ambient | SONYC-UST | background | [11_007992.wav](https://zenodo.org/records/3966543) |
| `ambient-6.wav` | ambient | SONYC-UST | background | [27_003459.wav](https://zenodo.org/records/3966543) |
| `ambient-7.wav` | ambient | SONYC-UST | background | [18_010513.wav](https://zenodo.org/records/3966543) |
| `ambient-8.wav` | ambient | SONYC-UST | background | [18_000134.wav](https://zenodo.org/records/3966543) |
| `dog-1.wav` | dog | SONYC-UST | dog | [01_003445.wav](https://zenodo.org/records/3966543) |
| `dog-2.wav` | dog | FSD50K | Bark | [365053](https://freesound.org/s/365053/) |
| `dog-3.wav` | dog | FSD50K | Bark | [193394](https://freesound.org/s/193394/) |
| `squirrel-1.wav` | squirrel | FSD50K | Chirp and tweet | [416125](https://freesound.org/s/416125/) |
| `squirrel-2.wav` | squirrel | FSD50K | Chirp and tweet | [353226](https://freesound.org/s/353226/) |
| `squirrel-3.wav` | squirrel | FSD50K | Chirp and tweet | [395831](https://freesound.org/s/395831/) |
| `owl-1.wav` | owl | FSD50K | Chirp and tweet | [244458](https://freesound.org/s/244458/) |
| `owl-2.wav` | owl | FSD50K | Chirp and tweet | [427434](https://freesound.org/s/427434/) |
| `owl-3.wav` | owl | FSD50K | Bird vocalization and bird call and bird song | [242708](https://freesound.org/s/242708/) |
| `taxi-1.wav` | taxi | FSD50K | Vehicle horn and car horn and honking | [184355](https://freesound.org/s/184355/) |
| `taxi-2.wav` | taxi | UrbanSound8K | car horn | [174841](https://freesound.org/s/174841/) |
| `taxi-3.wav` | taxi | FSD50K | Vehicle horn and car horn and honking | [425848](https://freesound.org/s/425848/) |
| `boombox-1.wav` | boombox | FSD50K | Bass guitar | [69735](https://freesound.org/s/69735/) |
| `boombox-2.wav` | boombox | FSD50K | Bass guitar | [239658](https://freesound.org/s/239658/) |
| `vuvuzela-1.wav` | vuvuzela | FSD50K | Wind instrument and woodwind instrument | [25894](https://freesound.org/s/25894/) |
| `vuvuzela-2.wav` | vuvuzela | FSD50K | Accordion | [172860](https://freesound.org/s/172860/) |
| `vuvuzela-3.wav` | vuvuzela | FSD50K | Wind instrument and woodwind instrument | [359775](https://freesound.org/s/359775/) |
| `drill-1.wav` | drill | FSD50K | Drill | [274853](https://freesound.org/s/274853/) |
| `drill-2.wav` | drill | UrbanSound8K | drilling | [195063](https://freesound.org/s/195063/) |
| `drill-3.wav` | drill | UrbanSound8K | drilling | [14111](https://freesound.org/s/14111/) |
| `alarm-1.wav` | alarm | SONYC-UST | alarm | [16_001564.wav](https://zenodo.org/records/3966543) |
| `alarm-2.wav` | alarm | SONYC-UST | alarm | [16_017178.wav](https://zenodo.org/records/3966543) |
| `alarm-3.wav` | alarm | SONYC-UST | alarm | [38_019522.wav](https://zenodo.org/records/3966543) |
| `frog-1.wav` | frog | FSD50K | Frog | [32511](https://freesound.org/s/32511/) |
| `frog-2.wav` | frog | FSD50K | Frog | [56765](https://freesound.org/s/56765/) |
| `frog-3.wav` | frog | FSD50K | Frog | [268960](https://freesound.org/s/268960/) |
| `mosquito-1.wav` | mosquito | FSD50K | Insect | [20062](https://freesound.org/s/20062/) |
| `mosquito-2.wav` | mosquito | FSD50K | Insect | [62202](https://freesound.org/s/62202/) |
| `mosquito-3.wav` | mosquito | ESC-50 | crickets | [172143](https://freesound.org/s/172143/) |
| `hadeda-1.wav` | hadeda | FSD50K | Gull and seagull | [60938](https://freesound.org/s/60938/) |
| `hadeda-2.wav` | hadeda | FSD50K | Chirp and tweet | [194948](https://freesound.org/s/194948/) |
| `hadeda-3.wav` | hadeda | FSD50K | Gull and seagull | [379087](https://freesound.org/s/379087/) |
| `rooster-1.wav` | rooster | FSD50K | Chicken and rooster | [233160](https://freesound.org/s/233160/) |
| `rooster-2.wav` | rooster | FSD50K | Chicken and rooster | [249724](https://freesound.org/s/249724/) |
| `rooster-3.wav` | rooster | FSD50K | Chicken and rooster | [378098](https://freesound.org/s/378098/) |
| `rain-1.wav` | rain | FSD50K | Thunder | [22926](https://freesound.org/s/22926/) |
| `rain-2.wav` | rain | FSD50K | Thunder | [2535](https://freesound.org/s/2535/) |
| `rain-3.wav` | rain | FSD50K | Thunder | [352823](https://freesound.org/s/352823/) |
