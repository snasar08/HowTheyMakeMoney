"""Voice leveling test (no Gemini requests): splits the three processed .voice.wav takes into lines with Whisper,
runs pipeline.tts.level_pieces (Short median -> CHANNEL_HZ, outlier lines nudged), prints before/after, saves wavs.
  python bench/test_voice_level.py            exit 1 if a median is >1 st from CHANNEL_HZ or a line >2.2 st from its median
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import prosody, tts, voice_prepass as vp  # noqa: E402

D = Path(r"C:/Users/rsn/AppData/Local/Temp/voice_cmp")
OUT = D / "leveled"
SHORTS = {"119": "119-plan-nike", "083": "083-famous-ninja", "128": "128-famous-shaq"}


def stats(pieces, texts, sr):
    med = prosody.short_median(pieces, sr)
    ln = []
    for p, t in zip(pieces, texts):
        m = prosody.measure(p, sr)
        ok = m["voiced_frames"] >= 20 and len(t.split()) >= prosody.MIN_WORDS
        ln.append(12 * np.log2(m["median_hz"] / med) if ok and med else None)
    v = [abs(x) for x in ln if x is not None]
    return med, (max(v) if v else 0.0), ln


def main():
    import whisper
    asr = whisper.load_model("base.en", device="cpu")
    OUT.mkdir(exist_ok=True)
    fails = 0
    print(f"{'short':>5} | {'before Hz':>9} {'maxline st':>10} | {'after Hz':>8} {'maxline st':>10} | vs {prosody.CHANNEL_HZ:.0f} Hz")
    for sid, name in SHORTS.items():
        script = json.loads(next((ROOT / "content/scripts").glob(f"{sid}*.json")).read_text(encoding="utf-8"))
        lines = list(dict.fromkeys(tts.speakable(x) for x in vp.lines_for(script) if x.strip()))
        a, sr = sf.read(D / f"{name}.voice.wav", dtype="float32")
        a = a.mean(1) if a.ndim > 1 else a
        a16 = np.interp(np.linspace(0, len(a) - 1, int(len(a) * 16000 / sr)), np.arange(len(a)), a).astype(np.float32)
        heard = [x for s in asr.transcribe(a16, language="en", word_timestamps=True, fp16=False)["segments"] for x in s.get("words", [])]
        segs = vp.split_lines(lines, heard, len(a) / sr)
        if not segs:
            print(sid, "could not split lines"); fails += 1; continue
        pieces = [a[int(t0 * sr):int(t1 * sr)] for t0, t1 in segs]
        # these files already carry the +1.5 st, so the listener total is GEMINI_PITCH_ST and the pieces hold all of it
        new, info = tts.level_pieces(pieces, lines, sr, shift_total=tts.GEMINI_PITCH_ST, in_pieces=tts.GEMINI_PITCH_ST)
        m0, x0, l0 = stats(pieces, lines, sr)
        m1, x1, l1 = stats(new, lines, sr)
        off = 12 * np.log2(m1 / prosody.CHANNEL_HZ)
        gap = [min(0.4, max(0.0, segs[i + 1][0] - segs[i][1])) for i in range(len(segs) - 1)]
        sf.write(OUT / f"{name}.leveled.wav", np.concatenate(new), sr)
        print(f"{sid:>5} | {m0:9.1f} {x0:10.2f} | {m1:8.1f} {x1:10.2f} | {off:+.2f} st  delta {info['delta_st']:+.2f} nudged {sum(1 for n in info['nudges'] if n)} lines")
        for i, (u, v, n) in enumerate(zip(l0, l1, info["nudges"])):
            if n or (v is not None and abs(v) > 2.0):
                print(f"        line {i}: {u:+.1f} -> {v:+.1f} st (nudge {n:+.1f})  {lines[i][:40]}")
        if abs(off) > 1.0 or x1 > 2.2:
            fails += 1
    print("PASS" if not fails else f"{fails} short(s) outside target (clamp 0..+3 st or max line nudge 2 st)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
