# Channel voice (Nov 3 2026)
`narrator.wav` + `narrator.txt` = the reference the nightly run clones with Qwen3-TTS (Apache-2.0)
for every Short (`pipeline/voice_prepass.py`, `QWEN_VOICE=narrator`). It was designed once with
Qwen3-TTS VoiceDesign ("young American male YouTube narrator, energetic, clear, confident, warm")
and picked over Kokoro / Chatterbox / VoxCPM2 / per-line Qwen designs on measured scores
(UTMOS 4.50, same-voice 0.86, pitch movement 5.3 st vs Kokoro 4.43 / 0.81 / 3.6) after Sam called
the old voices robotic. Replace both files to change the channel voice; the cache key includes it.
