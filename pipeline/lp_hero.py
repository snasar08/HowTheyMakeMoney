"""The hero of a low-poly Short: a consistent, recognisable cartoon figure (stdlib only: Blender imports it too).

Sam, Nov 9: a famous person should be recognisable WITHOUT being a copy: hairstyle and hair color,
beard or clean-shaven, bald or not, height, and the kind of clothes they are known for in plain
colors. Never a logo, crest, sponsor, number or a real jersey design; never a photoreal face.

Script-level "hero" (every low-poly scene uses it, so the figure is the same person all Short long):
  {"skin": "light|tan|brown|dark" or hex, "hair": "short|buzz|bald|quiff|long|bangs|ponytail|bun|afro|curly|mohawk",
   "hair_color": hex, "beard": "none|stubble|full|goatee|mustache", "beard_color": hex,
   "shirt": hex, "pants": hex, "outfit": "tee|kit|suit|hoodie|dress", "shoes": hex, "socks": hex,
   "extras": ["glasses", "cap", "headband"], "extra_color": hex, "height": 1.0}

The body is the pack's one mesh with a 5-color palette texture (skin, hair, shirt, pants, dark), so
looks are (a) a recolored palette and (b) boxes/cylinders/spheres riding on bones. Accessories are
given in the figure's rest pose, in meters on a 1.75 m person: +x forward, +y up, +-z the sides.
"""
SKIN, HAIR, SHIRT, PANTS = (255, 209, 159), (124, 88, 35), (115, 167, 196), (21, 96, 189)
BASE = "LightSkin"
SKINS = {"light": "ffd19f", "tan": "e0ac7e", "brown": "a8744a", "dark": "6b4a32"}
DEFAULT = dict(skin="light", hair="short", hair_color="3a2a1c", beard="none", shirt="e63946", pants="263247",
               outfit="tee", shoes="f4f4f4")


# ---- modular people pack (pipeline/people.py, blender_lp.py): look strings both renderers read
PEOPLE_H = 1.80                                  # model height the pack is scaled by (1.75 m at scale 1)
HEAD_Y = {"m": 1.556, "w": 1.548}                # rest height of the Head bone, in meters (Blender scales by it)
RIG = {"m": "m_casual", "w": "w_adventurer"}     # the model whose bones and clips drive a family
SLOTS = ("head", "body", "legs", "feet")


def look_name(head, body, legs, feet, colors=None):
    """'P:head,body,legs,feet;slot.Material=rrggbb;Material=rrggbb;slot.Material=-' ('-' hides it)."""
    return "P:" + ",".join((head, body, legs, feet)) + "".join(f";{k}={v}" for k, v in sorted((colors or {}).items()))


def parse_look(name):
    parts, _, rest = name[2:].partition(";")
    over = dict(kv.split("=", 1) for kv in rest.split(";") if "=" in kv)
    return dict(zip(SLOTS, parts.split(","))), over


def look_color(over, slot, mat):
    """Override for a material: (r, g, b) 0..255, '-' = leave that piece out, None = the pack's color."""
    v = over.get(f"{slot}.{mat}", over.get(mat))
    if v is None or v == "-":
        return v
    return rgb(v, None)


def rgb(h, default=(128, 128, 128)):
    h = SKINS.get(h, h or "")
    try:
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) if len(h) == 6 else default
    except ValueError:
        return default


def _mix(a, b, k):
    return tuple(int(round(x + (y - x) * k)) for x, y in zip(a, b))


def spec(hero):
    s = dict(DEFAULT)
    s.update(hero or {})
    return s


def palette(hero):
    """{pack color: new color} for the body texture."""
    s = spec(hero)
    skin, hair = rgb(s["skin"], SKIN), rgb(s.get("hair_color"), HAIR)
    if s["hair"] == "bald":
        hair = skin
    elif s["hair"] == "buzz":
        hair = _mix(skin, hair, 0.55)
    legs = skin if s["outfit"] in ("kit", "dress") else rgb(s.get("pants"), PANTS)   # shorts/skirt: bare legs
    return {SKIN: skin, HAIR: hair, SHIRT: rgb(s.get("shirt"), SHIRT), PANTS: legs}


def skin_name(hero):
    """Texture name both renderers understand: 'LightSkin#<skin>-<hair>-<shirt>-<pants>' (hex)."""
    p = palette(hero)
    return BASE + "#" + "-".join("%02x%02x%02x" % p[k] for k in (SKIN, HAIR, SHIRT, PANTS))


def recolor_map(name):
    """{pack color: new color} for a '#'-style name, else None."""
    base, _, cols = name.partition("#")
    if not cols:
        return base, None
    parts = cols.split("-")
    return base, {k: rgb(h, k) for k, h in zip((SKIN, HAIR, SHIRT, PANTS), parts)}


def _hex(c):
    return "%02x%02x%02x" % tuple(int(v) for v in c)


WOMEN_HAIR = ("long", "bangs", "ponytail", "bun")
_HEADS = {"short": "m_suit", "quiff": "m_beach", "curly": "m_hoodie", "afro": "m_hoodie", "long": "m_adventurer",
          "ponytail": "m_casual", "bun": "m_casual", "mohawk": "m_punk", "bald": "m_suit", "buzz": "m_suit",
          "bangs": "m_suit"}


def family(hero):
    s = spec(hero)
    if s.get("family") in ("m", "w"):
        return s["family"]
    return "w" if (s["outfit"] == "dress" or (s["hair"] in WOMEN_HAIR and s.get("beard", "none") == "none")) else "m"


def _modelled_beard(s):
    """True when the chosen head already carries the beard (the bearded head's hair and beard are one piece)."""
    return family(s) == "m" and s.get("beard") == "full" and s["hair"] in ("short", "long", "curly", "quiff", "afro", "bangs")


def look(hero):
    """The look string for a hero spec: which modelled head / body / legs / feet, and their colors."""
    s = spec(hero)
    skin, hair = rgb(s["skin"], SKIN), rgb(s.get("hair_color"), HAIR)
    shirt, pants, shoes = rgb(s.get("shirt"), SHIRT), rgb(s.get("pants"), PANTS), rgb(s.get("shoes"), (244, 244, 244))
    outfit = s["outfit"]
    col = {"Skin": _hex(skin), "Hair": _hex(hair), "Hair_Brown": _hex(hair), "Eyebrows": _hex(_mix(hair, (20, 16, 14), 0.5)),
           "head.Skin_Darker": _hex(_mix(skin, rgb(s.get("beard_color"), hair), 0.3) if s.get("beard") == "stubble" else skin),
           "head.Earrings": "-"}
    if family(s) == "w":
        head = "w_punk" if s["hair"] == "mohawk" else "w_adventurer"
        col.update({"head.Pink": _hex(hair), "head.Black": _hex(_mix(hair, (0, 0, 0), 0.4))})
        body = "w_adventurer"
        dark = _hex(_mix(shirt, (0, 0, 0), 0.25))
        col.update({"body.LightGreen": _hex(shirt), "body.Green": dark, "body.White": _hex(shirt), "body.Brown2": dark, "body.Gold": dark})
        if outfit == "dress":             # shorts in the dress color read as a short dress
            legs = feet = "w_adventurer"
            col.update({k: _hex(shirt) for k in ("legs.LightGreen", "legs.Brown2", "legs.Gold", "legs.White", "legs.Brown_02")})
            col.update({"feet.Brown2": _hex(shoes), "feet.Brown_02": _hex(shoes)})
        else:
            legs = feet = "w_punk"
            col.update({"legs.Black": _hex(pants), "legs.Skin": _hex(pants), "feet.Black": _hex(shoes), "feet.Grey": _hex(_mix(shoes, (255, 255, 255), 0.5))})
        return look_name(head, body, legs, feet, col)
    head = "m_adventurer" if _modelled_beard(s) else _HEADS.get(s["hair"], "m_suit")
    if s["hair"] in ("bald", "buzz") or ("cap" in (s.get("extras") or []) and head in ("m_suit", "m_beach", "m_hoodie")):
        col["head.Hair"] = "-"
    if head == "m_punk":
        col.update({"head.Red": _hex(hair), "head.Red_Dark": _hex(_mix(hair, (0, 0, 0), 0.3))})
    feet = "m_casual"
    col.update({"feet.Red_Dark": _hex(shoes), "feet.White": _hex(_mix(shoes, (255, 255, 255), 0.6))})
    if outfit == "suit":
        body = legs = feet = "m_suit"
        col.update({"body.Suit": _hex(shirt), "legs.Suit": _hex(pants), "body.Tie": s.get("tie") or "c81e28", "feet.Black": _hex(shoes)})
    elif outfit == "hoodie":
        body, legs = "m_hoodie", "m_casual"
        col.update({"body.Purple": _hex(shirt), "legs.LightBlue": _hex(pants)})
    elif outfit in ("kit", "dress"):      # plain shirt and shorts: never a crest, number or real jersey design
        body, legs = "m_casual", "m_beach"
        col.update({"body.LightBrown": _hex(shirt), "legs.Red_Dark": _hex(pants), "legs.White": _hex(pants)})
    else:
        body = legs = "m_casual"
        col.update({"body.LightBrown": _hex(shirt), "legs.LightBlue": _hex(pants)})
    return look_name(head, body, legs, feet, col)


def accessories(hero):
    """[(bone, mesh, (x, y, z), (sx, sy, sz), (r, g, b) 0..1)] for what the modelled heads do not have:
    beards on other heads, a buzz cut, glasses, cap, headband. Meters in the standing pose (idle clip,
    t = 0): +z forward, +y up. Boxes sit on their base, spheres are centered, cylinders stand on
    their base with radius sx."""
    s = spec(hero)
    c = lambda h, d=(128, 128, 128): tuple(v / 255 for v in rgb(h, d))   # noqa: E731
    skin = tuple(v / 255 for v in rgb(s["skin"], SKIN))
    hair = c(s.get("hair_color"), HAIR)
    out = []
    add = lambda mesh, pos, size, col: out.append(("Head", mesh, pos, size, col))   # noqa: E731
    if family(s) == "w":
        if s["hair"] in ("long", "bangs"):
            add("box", (0.0, 1.36, -0.075), (0.2, 0.4, 0.06), hair)
            for x in (-0.098, 0.098):
                add("box", (x, 1.45, 0.0), (0.03, 0.3, 0.12), hair)
        if s["hair"] == "bangs":
            add("box", (0.0, 1.725, 0.165), (0.17, 0.05, 0.02), hair)
        if s["hair"] == "ponytail":
            add("box", (0.0, 1.45, -0.11), (0.06, 0.28, 0.05), hair)
        if s["hair"] == "bun":
            add("sphere", (0.0, 1.84, -0.03), (0.06, 0.06, 0.06), hair)
    if s["hair"] == "buzz":
        add("sphere", (0.0, 1.762, 0.052), (0.103, 0.062, 0.117), tuple(a * 0.45 + b * 0.55 for a, b in zip(skin, hair)))
    beard = s.get("beard", "none")
    bc = c(s.get("beard_color"), tuple(int(v * 255) for v in hair))
    if beard == "stubble":
        bc = tuple(a * 0.62 + b * 0.38 for a, b in zip(skin, bc))
    if beard != "none" and not _modelled_beard(s) and family(s) == "m" and not (beard == "stubble" and s["hair"] in ("ponytail", "bun")):
        if beard in ("full", "stubble"):
            add("box", (0.0, 1.512, 0.075), (0.11, 0.075, 0.1), bc)
            for x in (-0.083, 0.083):
                add("box", (x, 1.535, 0.0), (0.026, 0.1, 0.125), bc)
                add("box", (x * 1.2, 1.63, -0.005), (0.016, 0.07, 0.05), bc)
        elif beard == "goatee":
            add("box", (0.0, 1.522, 0.115), (0.062, 0.058, 0.05), bc)
        add("box", (0.0, 1.617, 0.158), (0.078, 0.015, 0.016), bc)
    ex, ec = s.get("extras") or [], c(s.get("extra_color"), (30, 30, 34))
    if "glasses" in ex:
        for x in (-0.034, 0.034):
            add("box", (x, 1.674, 0.168), (0.052, 0.034, 0.01), ec)
        add("box", (0.0, 1.69, 0.17), (0.02, 0.008, 0.008), ec)
    if "cap" in ex:
        add("sphere", (0.0, 1.772, 0.05), (0.12, 0.078, 0.13), ec)
        add("box", (0.0, 1.758, 0.2), (0.15, 0.014, 0.12), ec)
    if "headband" in ex:
        add("cyl", (0.0, 1.735, 0.055), (0.112, 0.03, 0.125), ec)
    return out


def crowd_looks():
    """A fixed mix of modelled people for background crowds (plain clothes; work and costume pieces rare)."""
    tones = ("ffd19f", "e0ac7e", "a8744a", "6b4a32", "f0c8a0", "c99a6e")
    hairs = ("2b2118", "1c1c1c", "141414", "5a3a20", "c9a45a", "8a3a1c", "3a2a1c", "101010")
    tops = ("e8554e", "f2c230", "f4f4f4", "8e5bd0", "35b0a0", "f08a3c", "5aa2f0", "e63946", "3a86ff", "ff6b9d", "2a9d8f", "ffca3a")
    pants = ("2f3b52", "3a3a3a", "1d3f8f", "24262e", "5a4636", "2c4a3a", "e8e2d4", "8a2c2c")
    men = (("short", "tee"), ("quiff", "hoodie"), ("curly", "tee"), ("short", "hoodie"), ("ponytail", "tee"), ("quiff", "kit"),
           ("curly", "hoodie"), ("short", "suit"), ("bald", "tee"), ("long", "tee"), ("short", "kit"))
    out = []
    for i, (hair, outfit) in enumerate(men):
        out.append(look(dict(skin=tones[i % 6], hair=hair, hair_color=hairs[(i * 3) % 8], outfit=outfit, beard="full" if hair == "long" else "none",
                             shirt=tops[i % 12] if outfit != "suit" else "2b2f3a", pants=pants[(i * 5) % 8],
                             shoes=("f4f4f4", "2a2a2a", "c8442e")[i % 3])))
    for i in range(5):
        out.append(look(dict(family="w", skin=tones[(i * 2 + 1) % 6], hair="short", hair_color=hairs[(i * 3 + 1) % 8],
                             outfit="dress" if i % 2 else "tee", shirt=tops[(i * 5 + 3) % 12], pants=pants[(i * 3 + 1) % 8],
                             shoes=("f4f4f4", "3a3a3a")[i % 2])))
    return out


def auto(slug):
    """A stable everyman look for a Short with no named hero (what-if format): the same figure all
    Short long, a different one from Short to Short, always in a bright top that stands out of a crowd."""
    import zlib
    h = zlib.crc32((slug or "").encode())
    shirts = ("e63946", "f4a261", "2a9d8f", "ffca3a", "8e5bd0", "ff6b9d", "3a86ff")
    hairs = (("short", "3a2a1c"), ("quiff", "1c1612"), ("curly", "2a1a10"), ("ponytail", "5a3a20"),
             ("short", "c9a45a"), ("buzz", "141210"), ("bun", "3a2a1c"))
    hair, hair_color = hairs[(h >> 3) % len(hairs)]
    return dict(skin=("light", "tan", "brown", "dark")[(h >> 7) % 4], hair=hair, hair_color=hair_color,
                beard="stubble" if (h >> 11) % 5 == 0 and hair not in ("ponytail", "bun") else "none",
                outfit="hoodie" if (h >> 13) % 3 == 0 else "tee", shirt=shirts[h % len(shirts)],
                pants=("263247", "3a3a3a", "2c4a3a")[(h >> 17) % 3], shoes="f4f4f4")

