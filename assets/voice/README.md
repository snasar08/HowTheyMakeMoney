# Channel voice
**Since Nov 13 2026: `narrator2.wav` + `narrator2.txt`** (deeper; viewers found the Nov 3 voice irritating and
"out of tune"). Designed with Qwen3-TTS VoiceDesign as "adult American man in his late thirties, deep low-pitched
baritone, warm and rich, calm and friendly like a favorite teacher explaining something clearly, steady even
pitch" and picked from five candidates by measurement (median pitch 89 Hz vs 239 Hz before, pitch movement 3.6 st
vs 5.0, UTMOS 4.48 vs 4.51, same-voice 0.855 vs 0.823). Played 10% faster at the same pitch (`QWEN_SPEED`).
Candidates and scores: `bench/voice_deep.py`, branch `voice-deep`.

## Before (Nov 3 2026)
`narrator.wav` + `narrator.txt` = the reference the nightly run clones with Qwen3-TTS (Apache-2.0)
for every Short (`pipeline/voice_prepass.py`, `QWEN_VOICE=narrator`). It was designed once with
Qwen3-TTS VoiceDesign ("young American male YouTube narrator, energetic, clear, confident, warm")
and picked over Kokoro / Chatterbox / VoxCPM2 / per-line Qwen designs on measured scores
(UTMOS 4.50, same-voice 0.86, pitch movement 5.3 st vs Kokoro 4.43 / 0.81 / 3.6) after Sam called
the old voices robotic. Replace both files to change the channel voice; the cache key includes it.
