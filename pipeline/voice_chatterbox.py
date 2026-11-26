"""Chatterbox (Resemble AI, MIT code + weights, 0.5B, runs on CPU) as an OPTIONAL narrator: VOICE_SOURCE=chatterbox.

Like the Edge flow, the narration goes in whole (groups of up to GROUP_WORDS words at sentence ends, because one Chatterbox
pass tops out near 40 s of speech) and comes back as ONE clip. Word timings for captions and cuts come from Whisper on that
clip. Its built-in voice is used unless CHATTERBOX_REF points at a reference clip you are allowed to use.
Only imported by pipeline/voice_prepass.py, never by a render. Needs: pip install chatterbox-tts
"""
from __future__ import annotations

import re

import numpy as np

from . import tts

GROUP_WORDS = 75
GAP_S = 0.12      # silence between two groups (the groups end at sentence ends)
_model = None


def groups(text: str, limit: int = GROUP_WORDS) -> list[str]:
    """Split the narration at sentence ends into groups of at most `limit` words (a longer sentence stays whole)."""
    out: list[list[str]] = [[]]
    for sent in re.split(r"(?<=[.?!])\s+", text.strip()):
        if out[-1] and sum(len(x.split()) for x in out[-1]) + len(sent.split()) > limit:
            out.append([])
        out[-1].append(sent)
    return [" ".join(g) for g in out if g]


_ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def _below_100(n: int) -> str:
    return _ONES[n] if n < 20 else _TENS[n // 10] + (f" {_ONES[n % 10]}" if n % 10 else "")


def prepare(text: str) -> str:
    """What Chatterbox is actually given. Whole numbers of 100-999 are spelled out ("114 billion" was read as "eleven-fourteen"),
    and a dangling colon at the very end becomes an ellipsis (a plain period dropped the final word or invented a tail)."""
    def spell(m):
        n = int(m.group(0))
        return f"{_ONES[n // 100]} hundred" + (f" {_below_100(n % 100)}" if n % 100 else "")
    t = re.sub(r"(?<![\d.,$])\b[1-9]\d{2}\b(?![.,]?\d)", spell, text)
    return re.sub(r":\s*$", "...", t.strip())


def _load():
    global _model
    if _model is None:
        import torch
        from chatterbox.tts import ChatterboxTTS
        torch.set_num_threads(int(__import__("os").environ.get("CHATTERBOX_THREADS", 0)) or max(1, __import__("os").cpu_count() or 4))
        local = __import__("os").environ.get("CHATTERBOX_DIR")   # a folder that already holds the checkpoint files
        _model = ChatterboxTTS.from_local(local, "cpu") if local else ChatterboxTTS.from_pretrained("cpu")
    return _model


def words_from_audio(a, sr: int):
    """Whisper word timings [(word, start_s, end_s)] of a clip (captions and cuts follow the real audio)."""
    import whisper
    a16 = np.interp(np.linspace(0, len(a) - 1, int(len(a) * 16000 / sr)), np.arange(len(a)), a).astype(np.float32)
    res = whisper.load_model("base.en").transcribe(a16, language="en", word_timestamps=True, fp16=False)
    return [(x["word"].strip(), float(x["start"]), float(x["end"])) for seg in res["segments"] for x in seg.get("words", [])]


def align_words(text: str, heard):
    """Whisper's words rarely spell a line the way the script does ("3.69" -> "3" "69"). Give every SCRIPT word a timing:
    words Whisper heard keep theirs, the rest are spread evenly between their timed neighbours. Same word count as
    text.split(), so voice_prepass.cut_lines can cut the one-call read back into lines."""
    import difflib
    norm = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())  # noqa: E731
    script = text.split()
    sk = [norm(w) for w in script]
    hk = [norm(w[0]) for w in heard]
    t = [None] * len(script)
    for blk in difflib.SequenceMatcher(None, sk, hk, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            if sk[blk.a + k]:
                t[blk.a + k] = (heard[blk.b + k][1], heard[blk.b + k][2])
    end = heard[-1][2] if heard else 0.0
    i = 0
    while i < len(t):
        if t[i] is None:
            j = i
            while j < len(t) and t[j] is None:
                j += 1
            lo = t[i - 1][1] if i else 0.0
            hi = t[j][0] if j < len(t) else end
            hi = max(hi, lo)
            for k in range(i, j):
                t[k] = (lo + (hi - lo) * (k - i) / (j - i), lo + (hi - lo) * (k - i + 1) / (j - i))
            i = j
        else:
            i += 1
    return [(w, st, en) for w, (st, en) in zip(script, t)]


def fit(spoken: str, heard) -> float:
    """0..1: how well what Whisper heard matches what was meant (extra invented words count against it)."""
    import difflib
    norm = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())  # noqa: E731
    a = [norm(w) for w in spoken.split() if norm(w)]
    b = [norm(w[0]) for w in heard if norm(w[0])]
    if not a or not b:
        return 0.0
    blocks = difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks()
    hit = sum(m.size for m in blocks)
    last = max((m.b + m.size for m in blocks if m.size >= 2), default=len(b))
    tail = len(b) - last                      # words said after the script's last words: the model kept talking
    cut = len(a) - max((m.a + m.size for m in blocks if m.size >= 2), default=0)   # script words never reached: it stopped early
    return max(0.0, hit / max(len(a), len(b)) - (0.5 if tail > 3 or cut > 3 else 0.0))


TAKES = 3          # a read that drops or invents words is redone (best of TAKES is kept)
FIT_OK = 0.8


def synthesize(text: str):
    """`text` -> (float32 mono, sample rate, [(word, start_s, end_s)]), the same shape as voice_prepass.edge_stream."""
    m = _load()
    spoken = prepare(text)
    best = None
    for take in range(TAKES):
        parts = []
        for g in groups(spoken):
            kw = dict(exaggeration=float(tts.CHATTERBOX_EXAG), cfg_weight=float(tts.CHATTERBOX_CFG), temperature=0.8)
            if tts.CHATTERBOX_REF:
                kw["audio_prompt_path"] = tts.CHATTERBOX_REF
            w = m.generate(g, **kw).squeeze().cpu().numpy().astype(np.float32)
            parts += [w, np.zeros(int(GAP_S * m.sr), np.float32)]
        a = np.concatenate(parts[:-1])
        if len(a) < m.sr // 2:
            raise RuntimeError("chatterbox returned no audio")
        heard = words_from_audio(a, m.sr)
        f = fit(text, heard)
        if best is None or f > best[0]:
            best = (f, a, heard)
        if f >= FIT_OK:
            break
        print(f"[chatterbox] take {take + 1}: heard fit {f:.2f}, redoing", flush=True)
    return best[1], m.sr, align_words(text, best[2])
